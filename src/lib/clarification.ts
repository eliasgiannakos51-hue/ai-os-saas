import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  parseClarificationResult,
  type ClarificationCheckResult,
  type ClarificationKind,
} from "@/lib/clarification-client";

export type { ClarificationCheckResult, ClarificationKind } from "@/lib/clarification-client";
export { parseClarificationResult, appendClarificationAnswers } from "@/lib/clarification-client";

const MODEL = "claude-sonnet-4-6";
const CLARIFICATION_MAX_TOKENS = 500;

// Every AI-generation entry point in the app (Website Builder, Mission
// Control, Automations, Create Anything) runs this as a small, cheap,
// forced-tool-use call BEFORE the real (expensive) generation call — same
// "classify first, generate second" shape as lib/website-builder.ts's
// off-topic classifier. If the request is genuinely missing important
// detail, the caller shows the returned questions instead of generating a
// mediocre result from a vague brief; the user answers, and the ORIGINAL
// request is resubmitted with the answers appended (see each route's
// skipClarification flag) — this function is never called twice for the
// same submission.
//
// Deliberately biased toward NOT asking: the system prompts below are
// explicit that this is only for requests genuinely missing something
// that would change the outcome, not a completeness checklist. A request
// that already reads like a real brief (a specific business, a concrete
// style direction, a real audience) should never trigger this, however
// short it is.
const CLARIFICATION_TOOL: Anthropic.Tool = {
  name: "evaluate_request_clarity",
  description:
    "Decide whether the given request is missing information important enough that asking 1-3 quick questions first would meaningfully improve the result.",
  input_schema: {
    type: "object",
    properties: {
      needsClarification: {
        type: "boolean",
        description:
          "True ONLY if genuinely important details are missing that would materially change the output. False for anything that already reads like a real, usable request — even if brief or imperfectly worded. Default to false when in doubt.",
      },
      questions: {
        type: "array",
        items: { type: "string" },
        description:
          "1-3 short, specific, high-value questions — only the ones that would actually change the result. Empty array if needsClarification is false.",
      },
    },
    required: ["needsClarification", "questions"],
  },
};

const SYSTEM_PROMPTS: Record<ClarificationKind, string> = {
  website: `You review a description of a website someone wants built, before it's sent to generation. Ask clarifying questions ONLY if genuinely important details are missing — the kind that would produce a noticeably worse or generic-looking site without them: what the site/business actually is, what sections or content it needs, or a style/color direction if none is implied. Do NOT ask about things a reasonable default already covers (fonts, exact spacing, minor copy). A description naming a real subject with some concrete detail (e.g. a location, an industry, a stated purpose) is already good enough — do not ask anything.`,
  mission: `You review a goal for an AI-planned multi-step project plan, before it's sent to planning. Ask clarifying questions ONLY if the goal is so vague a useful step-by-step plan can't be built from it — missing what's actually being pursued, or a critical constraint (timeline, scope, or target outcome) that would materially change the plan. A goal that names a real, specific objective is already good enough — do not ask anything just to gather more nice-to-have detail.`,
  automation: `You review a description of a recurring automation someone wants set up, before it's sent to creation. Ask clarifying questions ONLY if the exact intended outcome is genuinely ambiguous — e.g. it's unclear what action should actually happen, or which module/record type it applies to. Do NOT ask about frequency/scheduling — that is a separate, already-required field the user fills in directly, never ask about it here. A description that says what should happen is already good enough.`,
  create: `You review a free-text entry for "Create Anything" (an AI classifier that routes plain-text descriptions into the right business-tracking module — an idea, a trade, a decision, feedback, etc.), before it's classified and saved. Ask clarifying questions ONLY if the entry is so vague or ambiguous that it's genuinely unclear what it is or which module it belongs in. Most entries, even short ones, are already clear enough (e.g. a single trade, a one-line idea, a short note) — do not ask anything for those.`,
};

export async function checkNeedsClarification(
  apiKey: string,
  kind: ClarificationKind,
  userText: string
): Promise<ClarificationCheckResult> {
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: CLARIFICATION_MAX_TOKENS,
    system: SYSTEM_PROMPTS[kind],
    messages: [{ role: "user", content: userText }],
    tools: [CLARIFICATION_TOOL],
    tool_choice: { type: "tool", name: "evaluate_request_clarity" },
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  // Fail open (treat as already clear) on a malformed response — same
  // "best-effort, don't block the real feature" tolerance as every other
  // classifier in this app.
  if (!toolUse) return { needsClarification: false };

  return parseClarificationResult(toolUse.input as { needsClarification?: unknown; questions?: unknown });
}
