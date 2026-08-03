import "server-only";
import Anthropic from "@anthropic-ai/sdk";

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

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_lead",
  description: "Classify a website contact-form submission for the site owner.",
  input_schema: {
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
  apiKey: string,
  fields: Record<string, string>
): Promise<LeadClassification | null> {
  const text = formatFields(fields);
  if (!text.trim()) return null;

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_lead" },
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) return null;

  const input = toolUse.input as { classification?: unknown };
  return VALID_CLASSIFICATIONS.includes(input.classification as LeadClassification)
    ? (input.classification as LeadClassification)
    : null;
}
