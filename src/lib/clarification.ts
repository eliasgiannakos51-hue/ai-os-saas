import "server-only";
import { modelForTier } from "@/lib/ai/models";
import Anthropic from "@anthropic-ai/sdk";
import type { CostAccumulator } from "@/lib/billing/cost-accumulator";
import {
  parseClarificationResult,
  type ClarificationCheckResult,
  type ClarificationKind,
} from "@/lib/clarification-client";

export type { ClarificationCheckResult, ClarificationKind } from "@/lib/clarification-client";
export { parseClarificationResult, appendClarificationAnswers } from "@/lib/clarification-client";

// FAST tier: a clarifying-questions pre-check is a closed-set decision
// (V3 model tiers, lib/ai/models.ts).
const MODEL = modelForTier("fast");
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

// Appended to every kind below — a request can otherwise read as
// perfectly clear (a real subject, a real goal) while still logically
// requiring specific real-world FACTS that were never given: exact
// prices, a real address/phone number, business hours, or the name of a
// specific product/service. Without this, the downstream generation step
// would have to either invent plausible-looking fake data (bad — the
// user might publish/act on it without noticing) or silently omit it.
// This check exists specifically to catch that case and ask directly,
// even when the request is otherwise unambiguous. If the user answers a
// question like this with something like "use whatever"/"I don't care",
// the generation step itself (not this check) is responsible for
// visibly marking whatever it invents as placeholder data — see
// lib/website-builder.ts's PLACEHOLDER_DATA_SECTION for the website
// case.
const CRITICAL_FACTS_INSTRUCTION = `

CRITICAL REAL FACTS: separately from the above, if actually fulfilling this request would obviously require specific real-world facts that are NOT given — exact prices, a real address, a phone number, exact opening/business hours, or the name of a specific product/service being described — treat that as needing clarification too, even if the request otherwise reads as clear. Ask directly for exactly the missing fact(s) (e.g. "What are your prices/menu items?", "What's the business address and phone number?"). Do NOT ask for facts that don't matter for a reasonable, generic-but-usable result (e.g. an exact tagline, a specific font, or minor content the request doesn't imply is essential) — this is only for facts a real person would need to know before the output could be considered accurate rather than made up.`;

const SYSTEM_PROMPTS: Record<ClarificationKind, string> = {
  website: `You review a description of a website someone wants built, before it's sent to generation. Ask clarifying questions ONLY if genuinely important details are missing — the kind that would produce a noticeably worse or generic-looking site without them: what the site/business actually is, what sections or content it needs, or a style/color direction if none is implied. Do NOT ask about things a reasonable default already covers (fonts, exact spacing, minor copy). A description naming a real subject with some concrete detail (e.g. a location, an industry, a stated purpose) is already good enough — do not ask anything.${CRITICAL_FACTS_INSTRUCTION}`,
  mission: `You review a goal for an AI-planned multi-step project plan, before it's sent to planning. Ask clarifying questions ONLY if the goal is so vague a useful step-by-step plan can't be built from it — missing what's actually being pursued, or a critical constraint (timeline, scope, or target outcome) that would materially change the plan. A goal that names a real, specific objective is already good enough — do not ask anything just to gather more nice-to-have detail.${CRITICAL_FACTS_INSTRUCTION}`,
  automation: `You review a description of a recurring automation someone wants set up, before it's sent to creation. Ask clarifying questions ONLY if the exact intended outcome is genuinely ambiguous — e.g. it's unclear what action should actually happen, or which module/record type it applies to. Do NOT ask about frequency/scheduling — that is a separate, already-required field the user fills in directly, never ask about it here. A description that says what should happen is already good enough.

SAFETY CHECK (this automation will run repeatedly, unsupervised, on whatever schedule the user picked): if the description is unclear or broad enough that it could plausibly do something harmful, destructive, or clearly unintended when run automatically and repeatedly without a human reviewing each run (e.g. it implies deleting/overwriting data with no clear scope, or contacting/messaging people with no clear limit on who or how often), treat that the same as needing clarification — ask what exactly it should do and how it should be scoped, rather than letting a vague-but-risky description through unchecked.${CRITICAL_FACTS_INSTRUCTION}`,
  agent: `You review a one-sentence description of an AUTONOMOUS AGENT someone wants Ionexa to build and then run on a schedule, unsupervised, indefinitely. Ask clarifying questions ONLY when a detail is missing that would make the agent produce the wrong thing every single time it runs — most commonly WHAT SUBJECT it should track when the request names none ("send me the news" — about what?), or WHICH of two clearly different tasks was meant. Do NOT ask about how often it should run, what time of day, or where the result should go: those are separate fields the user picks directly, and the builder fills them with sensible defaults — never ask about them here.

A request that names a real subject and a real action ("every morning send me the news about Nvidia") is already good enough — ask nothing.

SAFETY CHECK (this agent runs repeatedly, unsupervised, and emails the user its output): if the description is broad enough that it could plausibly produce something harmful or clearly unintended when run automatically and repeatedly with nobody reviewing each run, treat that the same as needing clarification and ask what exactly it should do and how it should be scoped.${CRITICAL_FACTS_INSTRUCTION}`,
  presentation: `You review a description of a PRESENTATION someone wants generated, before it is sent to generation. Ask clarifying questions ONLY when a missing detail would make the whole deck the wrong deck — most commonly WHO the audience is when the same subject would produce two completely different presentations for two different rooms (a board update vs a sales pitch vs a lecture), or WHAT the deck is meant to achieve when the subject alone does not imply it.

Do NOT ask about slide count, theme, colours or layout: those are separate controls the user sets directly, and asking about them here is asking a question the interface has already answered.

A brief that names a real subject and a recognisable purpose ("investor pitch for my coffee subscription startup") is already good enough — ask nothing.${CRITICAL_FACTS_INSTRUCTION}`,
  create: `You review a free-text entry for "Create Anything" (an AI classifier that routes plain-text descriptions into the right business-tracking module — an idea, a trade, a decision, feedback, etc.), before it's classified and saved. Ask clarifying questions ONLY if the entry is so vague or ambiguous that it's genuinely unclear what it is or which module it belongs in. Most entries, even short ones, are already clear enough (e.g. a single trade, a one-line idea, a short note) — do not ask anything for those.${CRITICAL_FACTS_INSTRUCTION}`,
};

export async function checkNeedsClarification(
  apiKey: string,
  kind: ClarificationKind,
  userText: string,
  costs?: CostAccumulator
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

  // Recorded before the parse: a call that came back in an unusable shape
  // still cost real tokens, and the action that triggered it has to carry
  // that cost.
  costs?.record("clarification", response.usage, response.model ?? MODEL);

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  // Fail open (treat as already clear) on a malformed response — same
  // "best-effort, don't block the real feature" tolerance as every other
  // classifier in this app.
  if (!toolUse) return { needsClarification: false };

  return parseClarificationResult(toolUse.input as { needsClarification?: unknown; questions?: unknown });
}
