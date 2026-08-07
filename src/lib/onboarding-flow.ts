/**
 * The first 60 seconds (V3).
 *
 * The first thing a new account sees is one question — "What do you want
 * to do first?" — with four answers that each go STRAIGHT to a working
 * screen with the input ready. Not a feature tour, not a plan picker: a
 * tester looked at the product and concluded it was "several LLMs in one,
 * cheaper", which is what happens when the first screen describes instead
 * of doing.
 *
 * This module is the part of that decision that is pure data: which
 * actions exist, where each one lands, and where a refresh resumes. It is
 * deliberately free of React so the flow's routing decisions can be
 * tested as functions rather than screenshots.
 */

export const FIRST_ACTIONS = ["website", "mission", "data", "chat"] as const;
export type FirstAction = (typeof FIRST_ACTIONS)[number];

export function isFirstAction(value: unknown): value is FirstAction {
  return typeof value === "string" && (FIRST_ACTIONS as readonly string[]).includes(value);
}

/**
 * Where a first action lands, or null for the one that stays inside the
 * flow (the data import continues on /onboarding itself).
 *
 * `?example=1` on the builder is what makes "with the input ready" true
 * there: the page pre-fills a complete, editable example brief, so the
 * first thing the user does is press Generate, not compose.
 */
export function firstActionDestination(action: FirstAction): string | null {
  switch (action) {
    case "website":
      return "/dashboard/website-builder?example=1";
    case "mission":
      return "/dashboard/mission";
    case "chat":
      return "/dashboard/chat";
    case "data":
      return null;
  }
}

/**
 * The three actions that leave /onboarding complete it in the same
 * write. A user who clicked through to the builder has had their first
 * 60 seconds; showing the question again on their next login would be
 * the double-show bug wearing a different hat.
 */
export function firstActionCompletes(action: FirstAction): boolean {
  return action !== "data";
}

export type OnboardingResumeState = {
  firstAction: string | null;
  goal: string | null;
};

export type OnboardingEntryStep = "action" | "goal" | "source";

/**
 * Where a refresh resumes.
 *
 * The flow's steps are client state, so a mid-import refresh used to
 * restart from the first question — the recorded progress row is what
 * makes F5 land back where the user was instead. Only the "data" branch
 * can be mid-flow at all: the other three actions complete the row in
 * the same request that records them, so a row carrying one of those
 * never reaches this function (the page redirects on completed_at
 * first).
 */
export function resolveInitialStep(state: OnboardingResumeState): OnboardingEntryStep {
  if (state.firstAction === "data") {
    return state.goal ? "source" : "goal";
  }
  return "action";
}
