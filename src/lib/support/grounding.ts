// The rule the support widget cannot be talked out of.
//
// A support assistant that invents a price is worse than no support
// assistant: the person acts on it, and the company either honours a
// number it never set or tells a customer they were misinformed by the
// company's own website. Same for a capability — "yes, Ionexa has an
// iPhone app" is a refund request with a delay on it.
//
// A system prompt saying "never invent" is a request, not a guarantee.
// This is the guarantee: every answer is checked, in code, against the
// text it was supposed to be answering from. A claim the grounding
// material does not contain does not reach the user at all — the widget
// says it does not know and offers a human instead.
//
// DELIBERATELY BLUNT. This will sometimes reject an answer that happened
// to be correct (a number the model got right by reasoning rather than by
// reading). That is the right direction to be wrong in: the cost of a
// false rejection is one escalation email, and the cost of a false
// acceptance is a customer quoting a price at us that we never charged.

/** Words whose presence in an answer is a claim about the product. */
const HIGH_RISK_CLAIMS = [
  // Things people ask about that this product does not have. If the
  // grounding material does not mention one, the answer must not either.
  "mobile app",
  "ios app",
  "android app",
  "api key",
  "public api",
  "rest api",
  "webhook",
  "sso",
  "single sign-on",
  "saml",
  "on-premise",
  "self-hosted",
  "soc 2",
  "iso 27001",
  "hipaa",
  "money-back",
  "refund",
  "free trial",
  "discount",
  "coupon",
  "phone support",
  "live chat",
  "24/7",
  "sla",
  "uptime guarantee",
  "white label",
  "reseller",
  "affiliate",
];

/**
 * The marker the model is told to emit when the material does not answer
 * the question. Checked before anything else — an answer that says "I
 * don't know" must never be dressed up as one that does.
 */
export const NO_ANSWER_MARKER = "NO_ANSWER";

export type GroundingVerdict =
  | { grounded: true }
  | { grounded: false; reason: "no_answer" }
  | { grounded: false; reason: "ungrounded_number"; offenders: string[] }
  | { grounded: false; reason: "ungrounded_claim"; offenders: string[] }
  | { grounded: false; reason: "empty" };

/**
 * Normalises text so a number written one way in an article matches the
 * same number written another way in an answer.
 *
 * Digits are the thing that matters, so grouping separators go: "1,000",
 * "1.000" and "1 000" all become "1000". Decimals survive because the
 * separator is only dropped when it groups three digits — €19.99 must not
 * silently match €1999.
 */
export function normaliseNumeric(text: string): string {
  return text
    .toLowerCase()
    .replace(/(\d)[.,   ](\d{3})\b/g, "$1$2")
    .replace(/(\d)[.,   ](\d{3})\b/g, "$1$2")
    .replace(/\s+/g, " ");
}

/**
 * Every number a piece of text asserts, as whole tokens.
 *
 * TOKENS, NOT SUBSTRINGS, and this is the difference between a check that
 * works and one that looks like it does. A naive `context.includes("250")`
 * passes for a fabricated "250 files" the moment the context happens to
 * mention 25000 credits somewhere. Both sides are tokenised the same way
 * and compared by set membership instead.
 *
 * A trailing % is part of the token: "20% off" is a different claim from
 * "€20 per month", and a context containing the second must not license
 * the first.
 *
 * List markers are stripped first — "1. Open Settings" is formatting, not
 * a fact about the product.
 */
export function extractNumbers(text: string): string[] {
  const withoutListMarkers = text
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]?\s*\d{1,2}[.)]\s+/, ""))
    .join("\n");
  const normalised = normaliseNumeric(withoutListMarkers);
  const matches = normalised.match(/\d+(?:[.,]\d+)?\s*%?/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/\s+/g, "")))];
}

/**
 * Checks an answer against the material it was given.
 *
 * `context` is the concatenation of every help article and generated fact
 * sheet the model was shown. `question` is included because a number the
 * USER supplied ("I'm on the 20 euro plan, can I...") is not the model
 * inventing anything by repeating it back.
 */
export function checkGrounding(params: {
  answer: string;
  context: string;
  question: string;
}): GroundingVerdict {
  const answer = params.answer.trim();
  if (!answer) return { grounded: false, reason: "empty" };
  if (answer.includes(NO_ANSWER_MARKER)) return { grounded: false, reason: "no_answer" };

  const source = `${params.context}\n${params.question}`;
  const haystack = normaliseNumeric(source);

  // Set membership on identically-tokenised numbers. See extractNumbers
  // for why a substring test is not good enough.
  const sourceNumbers = new Set(extractNumbers(source));
  const ungroundedNumbers = extractNumbers(answer).filter((n) => !sourceNumbers.has(n));
  if (ungroundedNumbers.length > 0) {
    return { grounded: false, reason: "ungrounded_number", offenders: ungroundedNumbers };
  }

  const lowerAnswer = answer.toLowerCase();
  const ungroundedClaims = HIGH_RISK_CLAIMS.filter(
    (claim) => lowerAnswer.includes(claim) && !haystack.includes(claim)
  );
  if (ungroundedClaims.length > 0) {
    return { grounded: false, reason: "ungrounded_claim", offenders: ungroundedClaims };
  }

  return { grounded: true };
}

/** Exposed for the test suite and for anyone extending the list. */
export const HIGH_RISK_CLAIM_TERMS = HIGH_RISK_CLAIMS;
