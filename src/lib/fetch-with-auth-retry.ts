"use client";

import { createClient } from "@/lib/supabase/client";
import { reportNetworkFailure, reportNetworkSuccess } from "@/lib/network/network-status";

// Root cause of the repeated "Not authenticated" report on the
// clarifying-questions flows (Website Builder, Create Anything,
// Automations): those are the only multi-step flows in this app where a
// user is expected to STOP and compose real answers (prices, hours, an
// address) between the first request (which returns the questions) and
// the second (the resubmission with answers, skipClarification: true) —
// a natural several-minute pause every other single-click AI call in the
// app doesn't have. If the Supabase access token happens to expire during
// that pause, the resubmission's own middleware-triggered refresh can
// still legitimately fail to have landed yet (client-side cookies vs. the
// exact request timing), and the API route's `if (!user) return 401` is
// then simply correct given what the request actually carried — but it
// reads to the user as an unrecoverable, confusing error for something
// that was never really "not authenticated" so much as "authenticated,
// but the token needs a refresh".

type RefreshResult = { error: unknown; session: unknown } | null;

// Pure retry logic, separated from the real fetch/refresh calls below so
// it's directly unit-testable with injected mocks (same split used
// elsewhere in this app, e.g. lib/mission-agents.ts's
// parsePlanMissionToolInput vs. planMission).
export async function fetchWithAuthRetryImpl(
  doFetch: (input: string, init?: RequestInit) => Promise<Response>,
  refreshSession: () => Promise<RefreshResult>,
  input: string,
  init?: RequestInit
): Promise<Response> {
  const res = await doFetch(input, init);
  if (res.status !== 401) return res;

  try {
    const result = await refreshSession();
    if (!result || result.error || !result.session) return res;
  } catch {
    return res;
  }

  return doFetch(input, init);
}

// Wraps fetch() so a 401 gets exactly ONE silent client-side session
// refresh + retry before ever surfacing as an error — turning a session-
// timing hiccup into an invisible retry. If the refresh itself fails (the
// user really is logged out / the refresh token is gone), the ORIGINAL
// 401 response is returned unchanged, so a genuinely logged-out user
// still sees the real "please log in again" path instead of this masking
// it.
export async function fetchWithAuthRetry(input: string, init?: RequestInit): Promise<Response> {
  return fetchWithAuthRetryImpl(
    // The offline banner is told what happened here as well: these are
    // the long, multi-step flows where a user composes answers for
    // minutes at a time, which is exactly long enough for a connection
    // to go away between one request and the next.
    async (i, o) => {
      try {
        const response = await fetch(i, o);
        reportNetworkSuccess();
        return response;
      } catch (error) {
        reportNetworkFailure(error);
        throw error;
      }
    },
    async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.refreshSession();
      return { error, session: data.session };
    },
    input,
    init
  );
}
