import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { CostAccumulator } from "@/lib/billing/cost-accumulator";

const MODEL = "claude-sonnet-4-6";
// Small and cheap on purpose — this reviews already-generated HTML for
// semantic/content red flags the static regex scan (see
// lib/website-html-security-scan.ts) structurally cannot catch: fake
// login/payment forms designed to look like a real brand (phishing),
// deceptive claims, or anything that would be harmful if a real visitor
// landed on this page. 500 tokens is enough for a forced tool call
// returning a short verdict, not prose.
const REVIEW_MAX_TOKENS = 500;
// The model only needs to actually READ the page, not receive every
// repeated boilerplate byte — trimming keeps this review call cheap
// regardless of how large the generated site is.
const MAX_HTML_CHARS_FOR_REVIEW = 12000;

const SYSTEM_PROMPT = `You are a content-safety reviewer for a website generation tool. You will be shown the HTML of a website that was just generated for a paying user's legitimate business/personal use. Your ONLY job is to catch genuinely harmful or deceptive content — NOT to judge design quality, business legitimacy, or niche topics.

Flag isSafe: false ONLY if the page contains something like:
- A form styled to imitate a real, specific third-party brand's login/payment page (phishing)
- Content that impersonates a real person, company, or institution without disclosure
- Deceptive claims designed to defraud a visitor (fake urgency scams, fake giveaways collecting payment)
- Anything else a reasonable person would consider actively harmful if a real visitor encountered it

Do NOT flag: ordinary business sites, opinions you disagree with, aggressive-but-legal sales copy, or unfinished/placeholder content — those are normal, expected output, not safety issues.`;

const REVIEW_TOOL: Anthropic.Tool = {
  name: "review_content_safety",
  description: "Report whether this generated website's content is safe to publish, or flag specific harmful/deceptive content found.",
  input_schema: {
    type: "object",
    properties: {
      isSafe: {
        type: "boolean",
        description: "True unless the page contains genuinely harmful or deceptive content (phishing, impersonation, fraud).",
      },
      concerns: {
        type: "array",
        items: { type: "string" },
        description: "If isSafe is false: one short phrase per concern found. Empty array if isSafe is true.",
      },
    },
    required: ["isSafe", "concerns"],
  },
};

export type ContentSafetyReviewResult = {
  isSafe: boolean;
  concerns: string[];
};

// Pure interpretation of the tool_use input — unit-testable without a
// live Anthropic call, same split used throughout this codebase (e.g.
// lib/mission-agents.ts's parsePlanMissionToolInput).
export function parseContentSafetyReviewInput(input: {
  isSafe?: unknown;
  concerns?: unknown;
}): ContentSafetyReviewResult {
  const concerns = Array.isArray(input.concerns)
    ? input.concerns.filter((c): c is string => typeof c === "string" && c.trim().length > 0).slice(0, 5)
    : [];
  // A false verdict with no actual concerns listed isn't actionable —
  // treat it as safe rather than flagging a website with no visible
  // reason why, which the user would have no way to act on.
  if (input.isSafe === false && concerns.length > 0) {
    return { isSafe: false, concerns };
  }
  return { isSafe: true, concerns: [] };
}

// Folded into the SAME already-charged generation/edit request — this is
// deliberately not a separate credit-gated call. A review failure
// (network error, timeout, malformed response) must never block a
// legitimate generation, so this defaults to "safe" on any error rather
// than throwing — the static scan (lib/website-html-security-scan.ts)
// is the hard, deterministic backstop; this is a best-effort second
// opinion on top of it, not a single point of failure.
export async function reviewWebsiteContentSafety(
  apiKey: string,
  html: string,
  costs?: CostAccumulator
): Promise<ContentSafetyReviewResult> {
  try {
    const anthropic = new Anthropic({ apiKey });
    const trimmed = html.length > MAX_HTML_CHARS_FOR_REVIEW ? html.slice(0, MAX_HTML_CHARS_FOR_REVIEW) : html;
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: REVIEW_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: trimmed }],
      tools: [REVIEW_TOOL],
      tool_choice: { type: "tool", name: "review_content_safety" },
    });

    // Recorded before the parse: this review is a real billed call whose
    // cost the user's action incurred whether or not the response came
    // back in a shape we could use.
    costs?.record("security_review", response.usage, response.model || MODEL);

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (!toolUse) return { isSafe: true, concerns: [] };

    return parseContentSafetyReviewInput(
      toolUse.input as { isSafe?: unknown; concerns?: unknown }
    );
  } catch {
    return { isSafe: true, concerns: [] };
  }
}
