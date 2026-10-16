import "server-only";
import { runCompletion } from "@/lib/ai/providers/complete";
import type { AiToolSpec } from "@/lib/ai/providers/types";
import type { CostAccumulator } from "@/lib/billing/cost-accumulator";

// "Lead intelligence" — one small, cheap, forced-tool-use classification
// call run on every published-website contact-form submission (see
// api/websites/[id]/submit-form/route.ts) BEFORE the notification email
// is sent to the site owner, so the email itself can show a priority tag
// instead of making the owner read every submission cold. Same
// small-classifier pattern as lib/website-builder.ts's off-topic
// classifier and lib/clarification.ts — forced tool_choice, tiny
// max_tokens, best-effort (a failure here never blocks the actual
// submission from being saved/emailed, see the route's own try/catch).
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 200;

export type LeadClassification = "genuine_interest" | "question" | "spam" | "unclear";

const CLASSIFY_TOOL: AiToolSpec = {
  name: "classify_lead",
  description: "Classify a website contact-form submission for the site owner.",
  inputSchema: {
    type: "object",
    properties: {
      classification: {
        type: "string",
        enum: ["genuine_interest", "question", "spam", "unclear"],
        description: "The single best-fitting category for this submission.",
      },
    },
    required: ["classification"],
  },
};

const SYSTEM_PROMPT = `You review a single contact-form submission from a real, published website and classify it, so the site owner knows what to prioritize first among their incoming messages.

Classifications:
- genuine_interest: reads like a real prospective customer/client with real intent (wants to book, buy, hire, or get pricing/availability for a real need described in their own words).
- question: a real visitor asking a general question, not obviously ready to buy/book yet.
- spam: promotional/scam/irrelevant content, gibberish, SEO/marketing pitches ("I can get you more traffic"), or an obvious bot submission.
- unclear: too short or ambiguous to confidently tell.

Example: "Hi, do you have a table for 4 this Saturday at 8pm?" -> genuine_interest.
Example: "What are your opening hours on Sundays?" -> question.
Example: "I noticed your website could rank higher on Google, contact me for SEO services" -> spam.
Example: "hey" -> unclear.`;

const VALID_CLASSIFICATIONS: LeadClassification[] = ["genuine_interest", "question", "spam", "unclear"];

function formatFields(fields: Record<string, string>): string {
  return Object.entries(fields)
    .filter(([key]) => key !== "_hp")
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

// Returns null (no badge shown) rather than throwing on any failure —
// classification is a nice-to-have on top of a submission that must
// always be saved/emailed regardless of whether this succeeds.
export async function classifyLeadMessage(
  fields: Record<string, string>,
  // Every other AI call in this app records what it cost. This one did
  // not, so a submission to a published website spent real money that
  // appeared in no cost log and was charged to no account — see
  // CREDITS.md. The caller settles it against the site OWNER, who is the
  // party the classification is for.
  //
  // REQUIRED, NOT OPTIONAL, since 2026-10-15. An accumulator a caller
  // may omit is how the original loss happened: there is exactly one
  // caller and it always passes one, so the `?` bought nothing and left
  // the door it came through open. billing-coverage.test.mjs §1b ranges
  // over every runCompletion caller and requires the usage to reach an
  // accumulator; an optional one cannot satisfy that honestly.
  costs: CostAccumulator
): Promise<LeadClassification | null> {
  const text = formatFields(fields);
  if (!text.trim()) return null;

  // THROUGH THE ROUTER, NOT THE SDK (ΛΘ-2, step 1.4). The key is no
  // longer a parameter: which provider serves this is a configuration
  // question (lib/ai/providers/registry.ts), and a provider with no key
  // is simply not in the chain. With only ANTHROPIC_API_KEY set, as
  // production has today, the chain is Anthropic alone and this call is
  // served exactly as it was.
  //
  // `toolChoice` IS THE WHOLE POINT HERE. The parse below reads the
  // tool's input and nothing else, so a model left to decide could
  // answer "this looks like spam" in prose and leave this function with
  // nothing to return — after the tokens were spent.
  const outcome = await runCompletion({
    purpose: "classification",
    model: MODEL,
    maxTokens: MAX_TOKENS,
    system: [{ type: "text", text: SYSTEM_PROMPT }],
    messages: [{ role: "user", content: text }],
    tools: [CLASSIFY_TOOL],
    toolChoice: { type: "tool", name: "classify_lead" },
  });
  // A call that never completed has no usage to record and nothing to
  // settle — the caller's `costs.callCount > 0` is what decides whether
  // a settlement happens at all.
  if (!outcome.ok) return null;
  // Recorded before the parse below can bail out: the tokens are spent
  // whether or not the tool call came back usable.
  costs.record("classification", outcome.usage, outcome.reportedModel || outcome.model);

  const toolUse = outcome.toolCalls.find((call) => call.name === "classify_lead");
  if (!toolUse) return null;

  const input = toolUse.input as { classification?: unknown };
  return VALID_CLASSIFICATIONS.includes(input.classification as LeadClassification)
    ? (input.classification as LeadClassification)
    : null;
}
