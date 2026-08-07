import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { executeAgent } from "@/lib/agents/execute-agent";
import type { UserAgent } from "@/lib/agents/agent-config";

export const dynamic = "force-dynamic";
// A run with web search plus a retry is the slowest thing this feature
// does. 300s is Vercel's ceiling for the Pro plan's function timeout and
// is what api/websites/generate/process already uses.
export const maxDuration = 300;

// "Run now" — a real execution of a real agent, on demand.
//
// It is NOT a dry run: it costs credits, it emails the result, and it
// writes a history row, because a test that does not exercise the real
// path proves nothing about whether the thing works. What it deliberately
// does NOT do (see executeAgent's triggerSource handling) is touch the
// agent's schedule or its failure streak — a user pressing "Run now" three
// times while tweaking a task must never be able to auto-disable their own
// agent, and must never shift when it next fires on its own.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const agentId = params.id;
    if (!agentId) {
      return NextResponse.json({ ok: false, error: "Missing agent id." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Tighter than the hourly execution cap in executeAgent, and checked
    // first: this is the one path a human can hammer.
    const limited = await checkRateLimit({
      scope: "agent_run_now",
      identifier: user.id,
      maxAttempts: 10,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many manual runs in the last hour. Try again shortly." },
        { status: 429 }
      );
    }

    // Ownership: read through the user-scoped client, so RLS decides.
    const { data: agentRow, error: fetchError } = await supabase
      .from("user_agents")
      .select("*")
      .eq("id", agentId)
      .maybeSingle();

    if (fetchError || !agentRow) {
      return NextResponse.json({ ok: false, error: "Agent not found." }, { status: 404 });
    }
    const agent = agentRow as UserAgent;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "The AI service is not configured on the server." },
        { status: 500 }
      );
    }

    // The admin client is used for the WRITES only (agent_runs has no
    // insert policy on purpose — a user who could write their own run
    // history could fabricate one). The row being executed was already
    // authorised above through RLS.
    const result = await executeAgent({
      admin: createAdminClient(),
      user,
      agent,
      triggerSource: "manual",
      apiKey,
    });

    if (!result.ok) {
      const status =
        result.reason === "rate_limited" || result.reason === "circuit_breaker"
          ? 429
          : result.reason === "insufficient_credits"
            ? 402
            : result.reason === "run_failed"
              ? 200
              : 500;
      // A run that legitimately failed is a 200 with ok:false — it is a
      // real, recorded outcome the user needs to read, not a transport
      // error the client should retry.
      return NextResponse.json(
        { ok: false, reason: result.reason, error: result.message, runId: result.runId },
        { status }
      );
    }

    return NextResponse.json({
      ok: true,
      runId: result.runId,
      output: result.output,
      creditsCharged: result.creditsCharged,
      delivered: result.delivered,
      deliveredVia: result.deliveredVia,
      deliveryIssue: result.deliveryIssue,
    });
  } catch (err) {
    logApiError("/api/agents/[id]/run", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
