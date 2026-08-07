// When it is fair to suggest an upgrade, and — mostly — when it is not.
//
// THE DEFAULT IS SILENCE. A product that asks for money on a schedule
// teaches people to dismiss the ask without reading it, and then the one
// moment the suggestion is genuinely useful is the moment it is ignored
// out of habit. So this returns "say nothing" for almost every state,
// and the exceptions are narrow and named.
//
// There are exactly two moments worth speaking at:
//
//   SUCCESS + CEILING. The user just did something well AND has now hit
//   the wall on their plan — used their last agent, published their last
//   allowed site, generated their last presentation of the month. This
//   is the only moment the pitch is a fact rather than a nag: "that
//   worked; you are out of them until next month; the next plan up has
//   more." They are holding the value in their hand and the limit at the
//   same time.
//
//   REPEATED REFUSAL. They tried to do something their plan does not
//   allow, more than once. Not the first time — the first refusal is
//   already answered by the feature's own upgrade wall, and pouncing on
//   it is the nag this file exists to avoid. The second time is
//   evidence, not an accident.
//
// Everything else — a success with headroom left, a single refusal, an
// idle dashboard, running low but not out — gets nothing.

export type UpgradeMoment =
  | { kind: "none" }
  | {
      kind: "success_ceiling";
      /** What they just used the last of, as an i18n key under
       *  upgradeTrigger.reasons.<reason>. */
      reason: string;
      nextPlan: string;
    }
  | { kind: "repeated_refusal"; feature: string; nextPlan: string };

export type UpgradeSignal = {
  /** True only on the turn something SUCCEEDED. A suggestion attached to
   *  a success is congratulation; the same words after a failure are a
   *  kick. */
  justSucceeded: boolean;
  /** Of the thing they just succeeded at, how many that plan still
   *  allows this period. 0 means they just used the last one. Null when
   *  the action is not one that has a countable ceiling (a chat message
   *  on a paid plan). */
  remainingOfThisAction: number | null;
  /** The plan above theirs, if any. Null on the top plan — where there
   *  is nothing to suggest and suggesting anyway is insulting. */
  nextPlanName: string | null;
  /** i18n reason key for the ceiling they hit. */
  reason: string;
  /** How many times this session they have been REFUSED an action their
   *  plan does not include. */
  refusalCount: number;
  /** The feature the refusals were for. */
  refusedFeature: string;
};

/**
 * The single decision. Pure, so the rule can be tested exhaustively
 * rather than trusted.
 *
 * Order matters: the success+ceiling moment is checked first, because it
 * is the stronger and kinder of the two — somebody who just succeeded is
 * in a better frame to consider an upgrade than somebody who was just
 * told no twice.
 */
export function resolveUpgradeMoment(signal: UpgradeSignal): UpgradeMoment {
  // No plan above theirs: nothing to sell, and pretending otherwise
  // insults the customer who already bought the most.
  if (!signal.nextPlanName) return { kind: "none" };

  // SUCCESS + CEILING. Both halves are required. A success with headroom
  // left is just a success — leave them to enjoy it — and a ceiling hit
  // WITHOUT a success is a failure, which the feature's own wall already
  // handled.
  if (signal.justSucceeded && signal.remainingOfThisAction === 0) {
    return { kind: "success_ceiling", reason: signal.reason, nextPlan: signal.nextPlanName };
  }

  // REPEATED REFUSAL. The second refusal, not the first. The first is
  // answered by the upgrade wall; jumping on it is the nag.
  if (signal.refusalCount >= 2) {
    return {
      kind: "repeated_refusal",
      feature: signal.refusedFeature,
      nextPlan: signal.nextPlanName,
    };
  }

  return { kind: "none" };
}

/**
 * A frequency cap on top of the moment logic, because "the right moment"
 * can recur — somebody who hits their ceiling three days running should
 * not be pitched three days running.
 *
 * Stored as a timestamp in the browser, not on the server: this is a
 * politeness setting, not a fact about the account, and the failure mode
 * of losing it (one extra prompt after clearing site data) is trivial.
 */
export const UPGRADE_PROMPT_COOLDOWN_DAYS = 7;
export const UPGRADE_PROMPT_STORAGE_KEY = "ionexa_upgrade_prompt_at";

export function promptAllowedNow(lastPromptAt: string | null, now: Date = new Date()): boolean {
  if (!lastPromptAt) return true;
  const last = new Date(lastPromptAt);
  if (Number.isNaN(last.getTime())) return true;
  const days = (now.getTime() - last.getTime()) / (24 * 60 * 60 * 1000);
  return days >= UPGRADE_PROMPT_COOLDOWN_DAYS;
}
