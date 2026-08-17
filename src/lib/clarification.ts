import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { CostAccumulator } from "@/lib/billing/cost-accumulator";
import {
  parseClarificationResult,
  type ClarificationCheckResult,
  type ClarificationKind,
} from "@/lib/clarification-client";

export type { ClarificationCheckResult, ClarificationKind } from "@/lib/clarification-client";
export {
  parseClarificationResult,
  appendClarificationAnswers,
  alignSuggestions,
  MAX_CLARIFICATION_QUESTIONS,
} from "@/lib/clarification-client";

// Exported so routes that reserve/settle a clarification-only action can
// size their estimate against the model this check actually calls.
export const CLARIFICATION_MODEL = "claude-sonnet-4-6";
const MODEL = CLARIFICATION_MODEL;
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
        items: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "One short, specific question the user can answer in a few words.",
            },
            // SUGGESTED ANSWERS ARE PART OF THE QUESTION, not an
            // afterthought. A clarifying question that arrives as an empty
            // text box costs the user more effort than the vague request
            // did, so it gets skipped — and a question everybody skips is
            // a question that was never asked. Two or three tappable
            // answers turn "what format do you want?" into one press.
            suggestions: {
              type: "array",
              items: { type: "string" },
              description:
                "2-4 SHORT (1-5 word) answers the user can tap instead of typing — the genuinely likely ones for this specific question, ordered most likely first. Never generic filler like 'Other' or 'You decide'.",
            },
          },
          required: ["question", "suggestions"],
        },
        description:
          "1-3 short, specific, high-value questions — only the ones that would actually change the result. Empty array if needsClarification is false.",
      },
    },
    required: ["needsClarification", "questions"],
  },
};

/**
 * What the app already knows about this user, folded into the check so it
 * cannot ask for it.
 *
 * The rule is (δ) of the brief: never ask something the AI Life Context
 * already answers. Being asked "what does your business do?" by a product
 * that has been reading your Products, Ideas and CRM entries all month is
 * not a clarifying question — it is evidence that nothing was being read.
 */
function knownContextSection(knownContext: string | null | undefined): string {
  const trimmed = (knownContext ?? "").trim();
  if (!trimmed) return "";
  return `

ALREADY KNOWN ABOUT THIS USER — do NOT ask about anything this already answers. If a detail below makes a question unnecessary, drop that question; if it makes all of them unnecessary, return needsClarification: false.
${trimmed}`;
}

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
  // WHY THIS PROMPT WAS REWRITTEN. The clarifying-questions step existed,
  // was wired end to end, and never fired for an agent. Not because of a
  // bug in the plumbing — because of what this text told the model.
  //
  // It permitted exactly one trigger ("the request names no subject"),
  // and it BANNED asking about how often the agent should run, on the
  // stated grounds that cadence is "a separate field the user picks
  // directly". That justification is true of Automations and false of
  // Agents: there is no schedule field in the agent create flow at all
  // (components/agents/agents-workspace.tsx is one textarea and a
  // button), the cron is INFERRED by the builder from this same sentence,
  // and the ScheduleEditor only appears when editing an agent that
  // already exists. So the one detail most likely to be missing was the
  // one detail the check was forbidden to ask about.
  //
  // Everything else that decides what a scheduled agent produces on every
  // run — the shape of the output, where the information comes from, and
  // what to do on a day when there is nothing — was not mentioned at all,
  // and the shared header says "default to false when in doubt". A check
  // with one permitted trigger and a bias toward silence is a check that
  // is silent.
  agent: `You review a one-sentence description of an AUTONOMOUS AGENT someone wants Ionexa to build and then run on a schedule, unsupervised, indefinitely. Nobody reviews each run, and whatever is unclear now will be wrong in every single run for months.

Ask about a detail ONLY when it is genuinely missing AND would change what the agent produces every time. These are the ones that qualify:

1. SUBJECT — what it should actually track or do, when the request names none ("send me the news" — about what?), or which of two clearly different tasks was meant.
2. HOW OFTEN — when the request implies no cadence at all ("keep me updated on X"). The schedule is DERIVED FROM THIS SENTENCE by the builder; the user is not asked for it anywhere else, so a request with no timing in it gets a guess. Do NOT ask when the request already implies one ("every morning", "weekly", "each Monday").
3. WHAT THE RESULT SHOULD LOOK LIKE — only when the request implies a use that different shapes would serve very differently (a quick glance vs something to forward vs numbers to compare). Do not ask this for a request that obviously just wants a short summary.
4. WHERE THE INFORMATION SHOULD COME FROM — when the subject is broad enough that two sensible agents would read completely different sources, or when the user plainly has specific ones in mind ("my competitors" — which ones?).
5. WHAT TO DO WHEN THERE IS NOTHING TO REPORT — only for an agent whose subject genuinely has quiet days. Silence and "nothing today" are different products, and the user finds out which one they bought a week later.

NEVER ask where the result is delivered: it always goes to the account's own email address, which the user is shown before they press the button. Never ask for a name for the agent.

A request that names a real subject, a real action and a real cadence ("every morning send me the news about Nvidia") is already good enough — ask nothing.

SAFETY CHECK (this agent runs repeatedly, unsupervised, and emails the user its output): if the description is broad enough that it could plausibly produce something harmful or clearly unintended when run automatically and repeatedly with nobody reviewing each run, treat that the same as needing clarification and ask what exactly it should do and how it should be scoped.${CRITICAL_FACTS_INSTRUCTION}`,
  create: `You review a free-text entry for "Create Anything" (an AI classifier that routes plain-text descriptions into the right business-tracking module — an idea, a trade, a decision, feedback, etc.), before it's classified and saved. Ask clarifying questions ONLY if the entry is so vague or ambiguous that it's genuinely unclear what it is or which module it belongs in. Most entries, even short ones, are already clear enough (e.g. a single trade, a one-line idea, a short note) — do not ask anything for those.${CRITICAL_FACTS_INSTRUCTION}`,
};

export async function checkNeedsClarification(
  apiKey: string,
  kind: ClarificationKind,
  userText: string,
  costs?: CostAccumulator,
  /** A rendering of the AI Life Context, so the check cannot ask for
   *  something the app already knows. Optional: every caller works
   *  without it, and a context lookup that failed must never be the
   *  reason a build does not happen. */
  knownContext?: string | null
): Promise<ClarificationCheckResult> {
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: CLARIFICATION_MAX_TOKENS,
    system: `${SYSTEM_PROMPTS[kind]}${knownContextSection(knownContext)}`,
    messages: [{ role: "user", content: userText }],
    tools: [CLARIFICATION_TOOL],
    tool_choice: { type: "tool", name: "evaluate_request_clarity" },
  });

  // Recorded before the parse: a call that came back in an unusable shape
  // still cost real tokens, and the action that triggered it has to carry
  // that cost.
  costs?.record("clarification", response.usage, response.model || MODEL);

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  // Fail open (treat as already clear) on a malformed response — same
  // "best-effort, don't block the real feature" tolerance as every other
  // classifier in this app.
  if (!toolUse) return { needsClarification: false };

  return parseClarificationResult(toolUse.input as { needsClarification?: unknown; questions?: unknown });
}
