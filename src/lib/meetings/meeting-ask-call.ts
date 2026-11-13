import { runCompletion } from "@/lib/ai/providers/complete";
import { logApiError } from "@/lib/log-error";
import type { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { modelTextFrom, truncationNotice } from "@/lib/verification/truncation";
import { buildMeetingAskPrompt } from "@/lib/meetings/meeting-ask";
import type { ProposedAction } from "@/lib/meetings/meeting-analysis";

type CostRecorder = Pick<CostAccumulator, "record">;

/** SAME MODEL AS meeting-analyse-call.ts, for the same reason named there:
 *  reading a transcript full of speech-recognition errors and answering
 *  honestly from it is not classification, and the failure mode of a
 *  weaker model here is a confidently wrong answer rather than a visibly
 *  bad one. */
const MODEL = "claude-sonnet-4-6";

/** A few sentences, not a report — bounded so a question about a two-hour
 *  meeting cannot turn into a long generation nobody asked for or
 *  budgeted, the same ceiling my-stuff/ask's own MAX_OUTPUT_TOKENS is for. */
const MAX_OUTPUT_TOKENS = 600;

export type AskOutcome =
  | { ok: true; answer: string }
  | { ok: false; code: "empty" | "too_long" | "ai_unavailable" };

/**
 * THE ONE MODEL CALL for Κομμάτι 6. The rules are in
 * lib/meetings/meeting-ask.ts, which imports nothing and is therefore
 * testable; this file is the wire — the same split meeting-analyse-call.ts
 * keeps from meeting-analysis.ts.
 */
export async function askAboutMeeting(
  question: string,
  transcript: string,
  summary: string | null,
  actions: readonly ProposedAction[],
  options: { costs: CostRecorder; userId?: string; locale: string }
): Promise<AskOutcome> {
  const prompt = buildMeetingAskPrompt(question, transcript, summary, actions);
  if (!prompt.ok) return { ok: false, code: prompt.reason };

  try {
    const outcome = await runCompletion(
      {
        purpose: "file_ask",
        model: MODEL,
        maxTokens: MAX_OUTPUT_TOKENS,
        system: [{ type: "text", text: prompt.system }],
        messages: [{ role: "user", content: prompt.user }],
      },
      { userId: options.userId }
    );
    if (!outcome.ok) {
      logApiError("meetings:ask", new Error(outcome.detail), { kind: outcome.kind });
      return { ok: false, code: "ai_unavailable" };
    }
    // THE TOKENS REACH THE ACCUMULATOR BEFORE THE REPLY IS JUDGED — same
    // rule meeting-analyse-call.ts states for itself: a reply this file
    // still returns still cost the owner money.
    options.costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
    const extracted = modelTextFrom({ text: outcome.text, stopReason: outcome.stopReason });
    const answer = extracted.truncated
      ? `${extracted.text}\n\n_${truncationNotice(options.locale)}_`
      : extracted.text;
    return { ok: true, answer };
  } catch (err) {
    logApiError("meetings:ask", err, { stage: "completion" });
    return { ok: false, code: "ai_unavailable" };
  }
}
