// When to show the add-to-home-screen prompt.
//
// Pure functions, no browser APIs, so the timing rule can be unit tested
// against hand-written state instead of by installing a PWA by hand.
//
// The rule exists because the WRONG timing is the common failure: a
// prompt on the very first visit interrupts someone who does not yet know
// what the app is, and a user who dismisses it is far less likely to
// install later. So: only after the visitor has come back a few times,
// only if they are not already installed, and never again for a while
// after they say no.

export const INSTALL_PROMPT_MIN_VISITS = 3;
/** How long a dismissal is respected before the prompt may return. */
export const INSTALL_PROMPT_SNOOZE_DAYS = 30;
/** Visits closer together than this count as the same session, not a new visit. */
export const INSTALL_PROMPT_VISIT_GAP_MS = 30 * 60 * 1000;

export type InstallPromptState = {
  /** Distinct visits recorded so far (see recordVisit). */
  visits: number;
  /** Epoch ms of the last recorded visit; 0 when none. */
  lastVisitAt: number;
  /** Epoch ms the user dismissed the prompt; 0 when never. */
  dismissedAt: number;
  /** Set once the app has been installed — the prompt never returns. */
  installed: boolean;
};

export const EMPTY_INSTALL_STATE: InstallPromptState = {
  visits: 0,
  lastVisitAt: 0,
  dismissedAt: 0,
  installed: false,
};

/**
 * Counts a visit, but only when it is genuinely a NEW one.
 *
 * Without the gap check, "visits" would count page loads: a user
 * navigating around the dashboard would hit three within a minute and get
 * prompted on their first ever session — exactly the behaviour this rule
 * exists to prevent.
 */
export function recordVisit(state: InstallPromptState, now: number): InstallPromptState {
  if (now - state.lastVisitAt < INSTALL_PROMPT_VISIT_GAP_MS) {
    return { ...state, lastVisitAt: now };
  }
  return { ...state, visits: state.visits + 1, lastVisitAt: now };
}

export function shouldShowInstallPrompt(
  state: InstallPromptState,
  now: number,
  opts: { alreadyInstalled: boolean; canPrompt: boolean }
): boolean {
  // Nothing to offer: either the browser gave us no install event, or the
  // app is already running as an installed PWA.
  if (!opts.canPrompt || opts.alreadyInstalled || state.installed) return false;
  if (state.visits < INSTALL_PROMPT_MIN_VISITS) return false;
  if (state.dismissedAt > 0) {
    const snoozeMs = INSTALL_PROMPT_SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    if (now - state.dismissedAt < snoozeMs) return false;
  }
  return true;
}

export const INSTALL_STATE_STORAGE_KEY = "ionexa-install-prompt";

/** Tolerant parse — a corrupted or absent value is "no history yet", never a crash. */
export function parseInstallState(raw: string | null): InstallPromptState {
  if (!raw) return EMPTY_INSTALL_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<InstallPromptState>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
    return {
      visits: num(parsed.visits),
      lastVisitAt: num(parsed.lastVisitAt),
      dismissedAt: num(parsed.dismissedAt),
      installed: parsed.installed === true,
    };
  } catch {
    return EMPTY_INSTALL_STATE;
  }
}
