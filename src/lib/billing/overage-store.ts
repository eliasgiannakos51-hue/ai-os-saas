import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import {
  OVERAGE_OFF,
  OVERAGE_CONSENT_VERSION,
  billingMonth,
  decideOverage,
  round2,
  warningsDue,
  type OverageDecision,
  type OverageSettings,
} from "@/lib/billing/overage";

/**
 * READING AND WRITING OVERAGE, with the decisions left to overage.ts.
 *
 * The split is the same one every safety-critical module in this app
 * uses: the rules are pure and testable, and this file does the IO. What
 * is here that is NOT in overage.ts is the one thing that cannot be pure —
 * the ORDER of the writes.
 *
 * THE LEDGER ROW IS WRITTEN BEFORE THE CREDITS ARE SPENT. If the process
 * dies between the two, the customer has been billed for work that did
 * not happen — which is a refund and an apology, and recoverable. The
 * other order loses the charge for work that DID happen, silently, and
 * nothing anywhere would ever notice. Given a choice between a visible
 * error in the customer's favour and an invisible one in ours, the
 * visible one is the only defensible default.
 */

export type OverageState = OverageSettings & {
  /** Euros already charged this calendar month. */
  spentEur: number;
  month: string;
};

export const OVERAGE_STATE_OFF: OverageState = { ...OVERAGE_OFF, spentEur: 0, month: "" };

export async function loadOverageState(userId: string, now = new Date()): Promise<OverageState> {
  const month = billingMonth(now);
  try {
    const admin = createAdminClient();
    const [{ data: settings }, { data: ledger }] = await Promise.all([
      admin
        .from("usage_overage_settings")
        .select("enabled, monthly_cap_eur, price_per_credit_eur, consented_at, consent_version")
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("usage_overage_ledger")
        .select("amount_eur")
        .eq("user_id", userId)
        .eq("billing_month", month)
        .limit(5_000),
    ]);

    const spentEur = round2(
      (ledger ?? []).reduce((sum: number, row: { amount_eur: unknown }) => sum + (Number(row.amount_eur) || 0), 0)
    );

    if (!settings) return { ...OVERAGE_OFF, spentEur, month };

    return {
      enabled: settings.enabled === true,
      capEur: settings.monthly_cap_eur === null ? null : Number(settings.monthly_cap_eur),
      pricePerCreditEur:
        settings.price_per_credit_eur === null ? null : Number(settings.price_per_credit_eur),
      consentedAt: (settings.consented_at as string | null) ?? null,
      consentVersion: settings.consent_version === null ? null : Number(settings.consent_version),
      spentEur,
      month,
    };
  } catch (err) {
    logApiError("billing:overage", err, { stage: "load", userId });
    // FAILS TO OFF. An unreadable settings row means no overage, which
    // means the action is refused for lack of credits — the same outcome
    // the account had before overage existed. Failing to ON would charge
    // somebody because a query timed out.
    return { ...OVERAGE_OFF, spentEur: 0, month };
  }
}

/** The whole decision for one action, from the stored state. */
export async function checkOverage(params: {
  userId: string;
  shortfall: number;
  now?: Date;
}): Promise<{ decision: OverageDecision; state: OverageState }> {
  const now = params.now ?? new Date();
  const state = await loadOverageState(params.userId, now);
  return {
    decision: decideOverage({ settings: state, shortfall: params.shortfall, spentEur: state.spentEur }),
    state,
  };
}

/**
 * Records an overage charge.
 *
 * Returns the ledger row id, or null if it could not be written — and a
 * null MUST stop the action. Proceeding after a failed ledger write is
 * doing paid work with no record that it was paid for, which is the one
 * outcome from which there is no way back.
 */
export async function recordOverage(params: {
  userId: string;
  credits: number;
  pricePerCreditEur: number;
  amountEur: number;
  feature: string;
  reservationId?: string | null;
  now?: Date;
}): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("usage_overage_ledger")
      .insert({
        user_id: params.userId,
        billing_month: billingMonth(params.now ?? new Date()),
        credits: params.credits,
        price_per_credit_eur: params.pricePerCreditEur,
        amount_eur: params.amountEur,
        feature: params.feature.slice(0, 60),
        reservation_id: params.reservationId ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data ? String(data.id) : null;
  } catch (err) {
    logApiError("billing:overage", err, { stage: "record", userId: params.userId });
    return null;
  }
}

export type ConsentResult = { ok: true } | { ok: false; reason: string };

/**
 * Turning overage ON.
 *
 * THE ONLY PLACE `enabled` BECOMES TRUE, and it writes all four consent
 * fields together — the price snapshotted from today's list, the user's
 * own cap, the timestamp and the version. The database's CHECK refuses a
 * partial row, so a future caller that forgot one fails loudly here
 * rather than producing an account that can be charged at no agreed rate.
 */
export async function enableOverage(params: {
  userId: string;
  capEur: number;
  pricePerCreditEur: number;
}): Promise<ConsentResult> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("usage_overage_settings").upsert(
      {
        user_id: params.userId,
        enabled: true,
        monthly_cap_eur: params.capEur,
        price_per_credit_eur: params.pricePerCreditEur,
        consented_at: new Date().toISOString(),
        consent_version: OVERAGE_CONSENT_VERSION,
        // A fresh consent clears the warnings, so a user who raises their
        // cap hears about the new one rather than being told nothing
        // because they were warned about the old one this month.
        warned_80_month: null,
        warned_100_month: null,
      },
      { onConflict: "user_id" }
    );
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    logApiError("billing:overage", err, { stage: "enable", userId: params.userId });
    return { ok: false, reason: "could_not_save" };
  }
}

/**
 * Turning it off.
 *
 * DELETES THE ROW rather than setting enabled = false. A deleted row
 * cannot be half-off: there is no cap left to be compared against, no
 * price left to charge at, and no consent left to be read as current.
 * The customer may also do this themselves — the table grants them DELETE
 * for exactly this reason (see the migration), so cancelling does not
 * depend on this route being reachable.
 *
 * THE LEDGER IS NOT TOUCHED. Charges already incurred are still owed, and
 * deleting them would be deleting an invoice.
 */
export async function disableOverage(userId: string): Promise<ConsentResult> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("usage_overage_settings").delete().eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    logApiError("billing:overage", err, { stage: "disable", userId });
    return { ok: false, reason: "could_not_save" };
  }
}

/**
 * Sends the 80% and 100% warnings that are due, through the ONE
 * notification path (V4 #18), and records that they went — so a cron
 * running every ten minutes does not send them again.
 *
 * Called after a charge rather than on a schedule: the moment the number
 * moved is the moment the warning is true, and a nightly sweep would tell
 * somebody at 3am that they hit their cap at lunchtime.
 */
export async function sendOverageWarnings(params: { userId: string; state: OverageState }): Promise<void> {
  const { userId, state } = params;
  if (!state.enabled || !state.capEur) return;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("usage_overage_settings")
      .select("warned_80_month, warned_100_month")
      .eq("user_id", userId)
      .maybeSingle();

    const due = warningsDue({
      capEur: state.capEur,
      spentEur: state.spentEur,
      warned80Month: (data?.warned_80_month as string | null) ?? null,
      warned100Month: (data?.warned_100_month as string | null) ?? null,
      month: state.month,
    });
    if (due.length === 0) return;

    // MARKED BEFORE SENDING. A send that fails means one warning missed;
    // a mark that fails after a successful send means the warning repeats
    // on every action for the rest of the month, which is the thing that
    // makes somebody switch notifications off entirely.
    const patch: Record<string, string> = {};
    if (due.includes("80")) patch.warned_80_month = state.month;
    if (due.includes("100")) patch.warned_100_month = state.month;
    await admin.from("usage_overage_settings").update(patch).eq("user_id", userId);

    const { dispatchNotification } = await import("@/lib/notify/dispatch");
    for (const level of due) {
      const percent = level === "80" ? 80 : 100;
      await dispatchNotification({
        userId,
        // The type the user already chose channels for. A new type would
        // be one more thing to opt into before the message that costs
        // them money could reach them.
        type: "credits_low",
        title:
          level === "100"
            ? `You have reached your EUR${state.capEur} overage cap`
            : `You are at 80% of your EUR${state.capEur} overage cap`,
        body:
          level === "100"
            ? `EUR${state.spentEur.toFixed(2)} of extra usage this month. Nothing further will be charged until you raise the cap.`
            : `EUR${state.spentEur.toFixed(2)} of extra usage this month, out of EUR${state.capEur}.`,
        url: "/dashboard/settings#overage",
        facts: { percentUsed: percent },
      });
    }
  } catch (err) {
    logApiError("billing:overage", err, { stage: "warn", userId });
  }
}
