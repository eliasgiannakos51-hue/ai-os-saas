import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { startJob } from "@/lib/jobs/start-job";

export const dynamic = "force-dynamic";
// A run with web search plus a retry is the slowest thing this feature
// does. 300s is Vercel's ceiling for the Pro plan's function timeout and
// is what api/websites/generate/process already uses.
export const maxDuration = 300; // @function-limit 300

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

    // Read through the user-scoped client so RLS decides ownership BEFORE
    // a job exists. The worker re-reads the agent for itself (a prompt
    // edited between the press and the run must not be executed stale),
    // but the authorisation question is answered here, where there is a
    // session to answer it with.
    if (fetchError || !agentRow) {
      return NextResponse.json({ ok: false, error: "Agent not found." }, { status: 404 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "The AI service is not configured on the server." },
        { status: 500 }
      );
    }

    // FROM HERE THE ROUTE DOES NOT DO THE RUN.
    //
    // executeAgent is the slowest thing this feature does — a search-
    // enabled call plus a retry plus an email — and awaiting it meant
    // closing the tab aborted the fetch. The run itself often finished,
    // and the user was left with no result and no way to know.
    //
    // No reserve here: executeAgent owns the whole billing cycle for a
    // run, because a SCHEDULED run happens with no request at all. See
    // selfBilled in lib/jobs/run-job.ts for why settling twice would be
    // worse than not settling here.
    const started = await startJob({
      userId: user.id,
      kind: "agent_run",
      reserve: 0,
      input: { agentId },
    });

    if (!started.ok) {
      return NextResponse.json(
        { ok: false, error: started.reason === "insufficient" ? "Not enough credits." : started.message },
        { status: started.reason === "insufficient" ? 402 : 500 }
      );
    }

    return NextResponse.json({ ok: true, jobId: started.jobId, queued: true }, { status: 202 });
  } catch (err) {
    logApiError("/api/agents/[id]/run", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
