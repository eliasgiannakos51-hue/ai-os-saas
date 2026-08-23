/**
 * USAGE OVERAGE — AND THE ONE RULE THAT MATTERS.
 *
 * "You're out of credits. Continue at EUR0.03/credit?" is a QUESTION, and
 * the only safe answer to a question nobody was asked is no. Everything
 * in this file exists to make that structural rather than careful:
 *
 *   THE DEFAULT IS OFF. No row means no overage. A row that says `enabled`
 *   without a cap, a price and a consent timestamp cannot exist — the
 *   database's own CHECK refuses it (see the 20260903 migration), so a
 *   future writer that forgot one of the three fails loudly instead of
 *   charging somebody at an unagreed rate.
 *
 *   THE PRICE IS SNAPSHOTTED AT CONSENT. If the list price rises, an
 *   account that agreed to EUR0.03 keeps paying EUR0.03 until it agrees
 *   again. A price rise applied to standing consent is a charge nobody
 *   agreed to.
 *
 *   THE CAP IS THE USER'S OWN, and it is not optional. Consent to "keep
 *   going" with no limit is consent to an unbounded bill, which nobody
 *   means.
 *
 *   CONSENT EXPIRES WHEN THE TERMS CHANGE. `consent_version` is compared,
 *   not merely stored: an old version means asking again.
 *
 * Pure — no SDK, no database — so the build gate exercises every refusal
 * without a connection. lib/billing/overage-store.ts does the reading and
 * writing.
 */

/** Bumped when the terms of the overage agreement change. An account
 *  consented under an older version is treated as not having consented,
 *  and is asked again. */
export const OVERAGE_CONSENT_VERSION = 1;

/** The list price, in euros per credit. What a NEW consent is taken at;
 *  an existing one keeps whatever it agreed to. */
export const OVERAGE_PRICE_EUR_PER_CREDIT = 0.03;

/** Below this a cap is not a cap, it is a typo. */
export const MIN_CAP_EUR = 1;
/** The database refuses more than this too. A four-figure overage bill
 *  is not something somebody set on purpose. */
export const MAX_CAP_EUR = 10_000;

/** The two points a warning is sent at, as a share of the user's cap. */
export const WARN_AT = [0.8, 1] as const;

export type OverageSettings = {
  enabled: boolean;
  capEur: number | null;
  pricePerCreditEur: number | null;
  consentedAt: string | null;
  consentVersion: number | null;
};

export const OVERAGE_OFF: OverageSettings = {
  enabled: false,
  capEur: null,
  pricePerCreditEur: null,
  consentedAt: null,
  consentVersion: null,
};

export type OverageDecision =
  | { allowed: true; credits: number; pricePerCreditEur: number; amountEur: number }
  | {
      allowed: false;
      /** Which rule said no. Reported so the UI can offer the right next
       *  step — "turn it on" and "raise your cap" are different screens. */
      reason:
        | "not_enabled"
        | "consent_out_of_date"
        | "cap_reached"
        | "would_exceed_cap"
        | "nothing_to_charge";
      /** How much of the cap is already used, for the message. */
      spentEur: number;
      capEur: number | null;
    };

/**
 * May this action overflow into paid overage, and for how much?
 *
 * `shortfall` is the credits the balance could not cover — never the
 * whole cost. An action that is half covered by the remaining balance
 * charges overage on the other half only, which is the difference between
 * a fair bill and a double charge.
 */
export function decideOverage(params: {
  settings: OverageSettings;
  /** Credits the balance could NOT cover. */
  shortfall: number;
  /** Euros of overage already charged this calendar month. */
  spentEur: number;
  /** Injectable for tests; the current consent version otherwise. */
  currentConsentVersion?: number;
}): OverageDecision {
  const { settings, shortfall, spentEur } = params;
  const version = params.currentConsentVersion ?? OVERAGE_CONSENT_VERSION;

  const refuse = (reason: Extract<OverageDecision, { allowed: false }>["reason"]): OverageDecision => ({
    allowed: false,
    reason,
    spentEur,
    capEur: settings.capEur,
  });

  // THE FIRST GATE, AND THE ONLY ONE THAT MATTERS ON ITS OWN. Everything
  // below assumes consent; this is the branch that says there is none.
  if (!settings.enabled) return refuse("not_enabled");

  // Consent under superseded terms is not consent to these ones.
  if (settings.consentVersion === null || settings.consentVersion < version) {
    return refuse("consent_out_of_date");
  }

  // Belt and braces against the database's own CHECK: if either is
  // somehow missing, nothing is charged rather than something being
  // guessed at.
  if (!settings.capEur || settings.capEur <= 0) return refuse("cap_reached");
  if (!settings.pricePerCreditEur || settings.pricePerCreditEur <= 0) return refuse("not_enabled");

  if (shortfall <= 0) return refuse("nothing_to_charge");

  const remainingEur = round2(settings.capEur - spentEur);
  if (remainingEur <= 0) return refuse("cap_reached");

  const amountEur = round2(shortfall * settings.pricePerCreditEur);

  // THE CAP IS A CEILING, NOT A GUIDELINE. An action that would cross it
  // is refused WHOLE rather than part-charged: charging for four of five
  // credits leaves a half-done action the user paid for, and "we did most
  // of it" is not what a cap is for.
  if (amountEur > remainingEur) {
    return { allowed: false, reason: "would_exceed_cap", spentEur, capEur: settings.capEur };
  }

  return { allowed: true, credits: shortfall, pricePerCreditEur: settings.pricePerCreditEur, amountEur };
}

/**
 * Which warnings are due, given what has been spent and what has already
 * been sent this month.
 *
 * RETURNS AT MOST WHAT IS NEW. A user who crosses 80% and 100% in the
 * same action gets both, once each; a cron that runs every ten minutes
 * gets nothing on the second pass.
 */
export function warningsDue(params: {
  capEur: number;
  spentEur: number;
  /** First-of-month dates of the warnings already sent, or null. */
  warned80Month: string | null;
  warned100Month: string | null;
  /** The current month, first-of-month, as YYYY-MM-DD. */
  month: string;
}): ("80" | "100")[] {
  if (params.capEur <= 0) return [];
  const share = params.spentEur / params.capEur;
  const due: ("80" | "100")[] = [];
  // A SHARE, NOT AN AMOUNT. The cap is the user's own number, so "you are
  // at 80%" means 80% of what THEY set — not of some figure we chose.
  if (share >= WARN_AT[0] && params.warned80Month !== params.month) due.push("80");
  if (share >= WARN_AT[1] && params.warned100Month !== params.month) due.push("100");
  return due;
}

/** First of the month containing `at`, as YYYY-MM-DD. The one place the
 *  billing month is derived, so a ledger row and an invoice query cannot
 *  round it differently. */
export function billingMonth(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export type CapVerdict = { ok: true; capEur: number } | { ok: false; reason: string };

/** What the consent dialog is allowed to accept. */
export function checkCap(raw: unknown): CapVerdict {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return { ok: false, reason: "not a number" };
  const capEur = round2(value);
  if (capEur < MIN_CAP_EUR) return { ok: false, reason: `the smallest cap is EUR${MIN_CAP_EUR}` };
  if (capEur > MAX_CAP_EUR) return { ok: false, reason: `the largest cap is EUR${MAX_CAP_EUR}` };
  return { ok: true, capEur };
}

/**
 * What the dialog shows BEFORE anything is agreed to.
 *
 * The brief's "ορατό κόστος ΠΡΙΝ" as a function: the price, what the cap
 * buys at that price, and what this one action would cost. A dialog that
 * says "continue?" without the third is asking somebody to agree to a
 * number they cannot see.
 */
export function consentPreview(params: {
  shortfall: number;
  capEur: number;
  pricePerCreditEur?: number;
}): { pricePerCreditEur: number; thisActionEur: number; creditsAtCap: number } {
  const price = params.pricePerCreditEur ?? OVERAGE_PRICE_EUR_PER_CREDIT;
  return {
    pricePerCreditEur: price,
    thisActionEur: round2(Math.max(0, params.shortfall) * price),
    creditsAtCap: price > 0 ? Math.floor(params.capEur / price) : 0,
  };
}
