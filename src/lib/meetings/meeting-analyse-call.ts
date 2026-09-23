import { runCompletion } from "@/lib/ai/providers/complete";
import { logApiError } from "@/lib/log-error";
import type { CostAccumulator } from "@/lib/billing/cost-accumulator";
import {
  languageNameFor,
  parseAnalysis,
  systemPrompt,
  type MeetingAnalysis,
} from "@/lib/meetings/meeting-analysis";

type CostRecorder = Pick<CostAccumulator, "record">;

/**
 * THE ONE MODEL CALL. The rules are in lib/meetings/meeting-analysis.ts,
 * which imports nothing and is therefore testable; this file is the wire.
 *
 * MODEL NAMED, NOT DEFAULTED. lib/websites-greek-spelling-check.ts
 * documents what happens when a runCompletion caller omits it: no model
 * means `originTier = "mid"` and substituteModel returns the cheapest
 * anthropic model at mid tier OR ABOVE, which is sonnet — so the call
 * reads as cheap and is not. Written down here so the choice is a
 * decision rather than a fallback.
 *
 * WHY SONNET AND NOT HAIKU, and the answer is measurable rather than
 * assumed. The job is not classification: it is reading a transcript
 * full of speech-recognition errors in one of ten languages and deciding
 * which sentences were commitments. Whether haiku holds that in Greek is
 * a MEASUREMENT nobody here has made — about half a cent per meeting to
 * make it (`--model claude-haiku-4-5` against the same transcript). It is
 * worth naming, not worth guessing at, and the safe direction for a
 * feature whose failure is a confidently wrong action list is the
 * stronger model.
 */
const MODEL = "claude-sonnet-4-6";

/**
 * Output ceiling. A summary plus twenty-five actions is comfortably under
 * this; the ceiling is here so a model that decides to restate the whole
 * transcript stops costing money at a known point rather than at the
 * context window.
 */
const MAX_TOKENS = 2000;

export type AnalyseOutcome =
  | { ok: true; analysis: MeetingAnalysis }
  | { ok: false; code: "ai_unavailable" | "unusable" };

/**
 * A FAILURE HERE IS REPORTED, NOT ABSORBED.
 *
 * The transcript is already made and already paid for at this point, so
 * the tempting shape is `catch { return { summary: "", actions: [] } }` —
 * and that renders as "this meeting contained no actions", which is a
 * sentence about the meeting that the code has no basis for. It is the
 * shape docs/shapes.md calls "the fallback that reported nothing". So the
 * failure comes back as a code, the transcript is still shown, and the
 * screen offers to try the analysis again.
 */
export async function analyseMeeting(
  transcript: string,
  detectedLanguage: string | null | undefined,
  options: { costs: CostRecorder; userId?: string; signal?: AbortSignal }
): Promise<AnalyseOutcome> {
  try {
    const outcome = await runCompletion(
      {
        purpose: "summarisation",
        model: MODEL,
        system: [{ type: "text", text: systemPrompt(languageNameFor(detectedLanguage)) }],
        messages: [{ role: "user", content: transcript }],
        maxTokens: MAX_TOKENS,
        temperature: 0,
      },
      { userId: options.userId, signal: options.signal }
    );
    if (!outcome.ok) return { ok: false, code: "ai_unavailable" };
    // THE TOKENS REACH THE ACCUMULATOR BEFORE THE REPLY IS JUDGED. A
    // reply that does not parse still cost the owner money, and
    // scripts/tests/billing-coverage.test.mjs exists to refuse a call
    // whose usage reaches no accumulator.
    options.costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
    const analysis = parseAnalysis(outcome.text ?? "");
    if (!analysis) return { ok: false, code: "unusable" };
    return { ok: true, analysis };
  } catch (err) {
    logApiError("meetings:analyse", err, { stage: "completion" });
    return { ok: false, code: "ai_unavailable" };
  }
}
