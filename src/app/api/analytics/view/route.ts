import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { normalizePath, normalizeSource } from "@/lib/analytics/normalize";

export const dynamic = "force-dynamic";

// The first-party page counter's only door (supabase/migrations/
// 20261108010000_page_view_counts.sql). One call = one view of one page.
//
// WHAT IT NEVER DOES: store an IP, a user agent, an account id or a cookie.
// It reads the signed-in user only to ask the switch whether this person is
// staff, and throws the answer away. The rate limit below is therefore ONE
// shared bucket for everybody, not one per address: a per-address bucket
// would write each visitor's IP into the rate-limit table, which is exactly
// what this counter promises not to keep. The price is stated, not hidden:
// under a flood the counter drops views (an undercount), it cannot be made
// to count wrongly, and nothing else depends on it.
//
// EVERY ANSWER IS 204 with an empty body, including "switch off", "refused"
// and "dropped", so the response teaches a caller nothing about which.
const MAX_BODY = 1000;
const RATE_PER_MINUTE = 1200;
const NO_CONTENT = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request) {
  try {
    // A browser sends Origin on a cross-origin POST; a page on another site
    // must not be able to add views here.
    const origin = request.headers.get("origin");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        return NO_CONTENT();
      }
      if (originHost !== request.headers.get("host")) return NO_CONTENT();
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!(await isFeatureOn("first-party-analytics", user))) return NO_CONTENT();

    const text = await request.text();
    if (text.length === 0 || text.length > MAX_BODY) return NO_CONTENT();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return NO_CONTENT();
    }

    const path = normalizePath(body.path);
    if (path === null) return NO_CONTENT();
    const source = normalizeSource(body.first, body.ref, body.utm);

    const limit = await checkRateLimit({ scope: "analytics_view", identifier: "all", maxAttempts: RATE_PER_MINUTE, windowMinutes: 1 });
    if (!limit.allowed) return NO_CONTENT();

    const { error } = await createAdminClient().rpc("record_page_view", { p_path: path, p_source: source });
    if (error) logApiError("/api/analytics/view", error, { stage: "rpc record_page_view" });
    return NO_CONTENT();
  } catch (err) {
    logApiError("/api/analytics/view", err);
    return NO_CONTENT();
  }
}
