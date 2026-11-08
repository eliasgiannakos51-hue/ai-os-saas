import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { logApiError } from "@/lib/log-error";
import { generateDraft } from "@/lib/company-agents/generate";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
// A model call with up to five web searches. Same ceiling as the other
// routes that wait on one.
export const maxDuration = 120; // @function-limit 120

/**
 * WRITE ONE DRAFT FOR THE OWNER. POST { agentId, brief }.
 *
 * Owner only: the signed-in user's email must pass isAdminEmail(), and
 * anybody else gets 404 as if the route did not exist, the same as the
 * System Health page. The draft is saved as `pending` and nothing is sent.
 * The model call, the daily limit and the save are in
 * lib/company-agents/generate.ts.
 *
 * WHAT STOPS A LOOP: six drafts an hour (checkRateLimit, below), and
 * generateDraft refuses past DAILY_DRAFT_LIMIT drafts a day counted from the
 * table; each draft is capped at MAX_DRAFT_TOKENS.
 * The per-customer circuit breaker is not used: it exists for accounts that
 * pay by credits, and this caller is the owner. Its calls still count toward
 * the platform's daily counter (recordAiCallForDailySpend in generate.ts),
 * but a platform cap that was reached would not stop the owner's draft.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in." }, { status: 401 });
    if (!isAdminEmail(user.email)) return new NextResponse(null, { status: 404 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "The request body is not JSON." }, { status: 400 });
    }
    // Six an hour for the owner, on top of the daily count in generateDraft:
    // a stuck button or a loop in the page cannot spend the day in a minute.
    const limit = await checkRateLimit({ scope: "company_agent_draft", identifier: user.id, maxAttempts: 6, windowMinutes: 60 });
    if (!limit.allowed) return NextResponse.json({ error: "Six drafts an hour is the limit; try again within the hour." }, { status: 429 });

    const { agentId, brief } = (body ?? {}) as Record<string, unknown>;
    const result = await generateDraft({ agentId, brief, userId: user.id });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, id: result.id, truncated: result.truncated, sources: result.sources });
  } catch (err) {
    logApiError("/api/company-agents/drafts", err, { stage: "post" });
    return NextResponse.json({ error: "Draft failed." }, { status: 500 });
  }
}
