import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import { buildSystemPrompt } from "@/lib/chat/system-prompt";
import { RED_TEAM_PROBES, evaluateProbe, summarise, type ProbeResult } from "@/lib/security/red-team";
import { sendRedTeamReportEmail } from "@/lib/email/send-red-team-report-email";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The scheduled red team.
//
// Once a week it sends every probe in lib/security/red-team.ts at the REAL
// Ionexa Chat system prompt — the same module api/chat imports, not a copy
// — and records what got through. If anything did, the owner is emailed.
//
// WHY IT IS A CRON AND NOT A TEST. Three reasons, and the first two are
// the ones that matter:
//
//   1. It costs money and needs a network. A build gate that calls
//      Anthropic 14 times is a build that fails when the API has a bad
//      minute, which teaches people to ignore it. scripts/tests can prove
//      the DETECTORS work — and do — but they cannot prove the model
//      still refuses today.
//   2. The thing being tested is not deterministic. A model's behaviour on
//      an adversarial prompt drifts with model versions, with a changed
//      system prompt, and with nothing at all. That is a monitoring
//      problem, not a pass/fail gate: what matters is noticing the week it
//      changes.
//   3. A red team that only runs when someone edits the prompt never runs
//      after the prompt stops being edited, which is exactly when it is
//      needed.
//
// COST. 14 probes x (~1,500 input + <=400 output) tokens on Sonnet is
// roughly EUR 0.10 per run, once a week. The probes are sent WITHOUT the
// web_search tool: a red-team probe must not be able to make a real search
// request, and the guardrails being tested are all in the prompt.
const MAX_OUTPUT_TOKENS = 400;
const MODEL = "claude-sonnet-4-6";
// The persona name the default (non-custom) prompt uses, so the probe hits
// the configuration almost every account is on.
const DEFAULT_PERSONA = "Ionexa";

export async function GET(request: Request) {
  try {
    const auth = checkCronAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "No model configured — the red team cannot run." },
        { status: 503 }
      );
    }

    const anthropic = new Anthropic({ apiKey });
    const systemPrompt = buildSystemPrompt(DEFAULT_PERSONA);
    const results: ProbeResult[] = [];
    const errors: string[] = [];

    // Sequential. Fourteen requests is nothing, and running them one at a
    // time keeps the whole run inside one rate-limit budget and makes the
    // log readable when one of them is the interesting one.
    for (const probe of RED_TEAM_PROBES) {
      try {
        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: systemPrompt,
          messages: [{ role: "user", content: probe.prompt }],
        });
        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");
        results.push(evaluateProbe(probe, text));
      } catch (err) {
        // A probe that could not be SENT is not a probe that passed.
        // Recording it as an error rather than a pass is the difference
        // between "we checked and it held" and "we did not check".
        errors.push(probe.id);
        results.push({
          id: probe.id,
          category: probe.category,
          what: probe.what,
          passed: false,
          failure: "probe could not be run",
          excerpt: err instanceof Error ? err.message.slice(0, 200) : "unknown error",
        });
      }
    }

    const summary = summarise(results);

    const admin = createAdminClient();
    const { error: insertError } = await admin.from("red_team_runs").insert({
      model: MODEL,
      total: summary.total,
      failed: summary.failed,
      results,
    });
    if (insertError) {
      logApiError("/api/cron/red-team", insertError, { stage: "store_results" });
    }

    // Only on a failure. A weekly "all clear" email is an email people
    // filter, and a filtered alert is not an alert.
    if (summary.failed > 0) {
      await sendRedTeamReportEmail({
        total: summary.total,
        failures: results.filter((r) => !r.passed),
      });
    }

    return NextResponse.json({
      ok: true,
      total: summary.total,
      failed: summary.failed,
      couldNotRun: errors.length,
      byCategory: summary.byCategory,
    });
  } catch (err) {
    logApiError("/api/cron/red-team", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
