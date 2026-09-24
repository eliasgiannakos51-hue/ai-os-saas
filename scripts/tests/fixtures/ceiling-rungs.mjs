/*
 * ONE FIXTURE PER RUNG of scripts/scan-ceiling-vs-outcome.mjs.
 *
 * THEY LIVE IN A DIRECTORY THE SCAN DOES NOT WALK, and that is the whole
 * reason this file exists rather than four template literals inside the
 * gate. The first version kept them in ceiling-vs-outcome.test.mjs and
 * the scan found its own DECLARED vs DECLARED fixture there — correctly,
 * since a template literal in a gate is still text in a gate. A fixture
 * has to be somewhere that is neither product code nor a gate, or every
 * detector eventually reports the thing that proves it works.
 *
 * DECLARED_VS_DECLARED is a reconstruction of the assertion
 * scan-estimate-realism.mjs actually carried: a billing profile's
 * declared expected output against a declared token ceiling, concluding
 * that the credit hold is short. It flagged seven profiles that way and
 * zero were real. If the classifier ever stops catching THIS, the scan's
 * report of zero findings across the tree means nothing at all.
 */

/** The shape. Two declared values, a conclusion about what a user is charged. */
export const DECLARED_VS_DECLARED = `
const PRESENTATION_MAX_TOKENS = 8000;
const expected = 400;
check(
  "the profile expects a fraction of what the call may write",
  expected < PRESENTATION_MAX_TOKENS / 8
);
`;

/** The constant IS the rule. Comparing to it is the feature. */
export const ENFORCEMENT = `
export function checkUpload(bytes) {
  if (bytes > MAX_MEETING_BYTES) {
    return { ok: false, reason: "too_big" };
  }
  return { ok: true };
}
`;

/** Something was RUN, and its result checked against the limit. */
export const MEASURED = `
const deck = parseDeckToolInput(payload, ctx);
check("the parser drops the extra slides", deck.slides.length === MAX_SLIDES);
`;

/**
 * The declared value is the SUBJECT — a bare number, or another declared
 * bound. MIN_* is outside the scan's pattern on purpose (a floor here is a
 * business rule settlement applies, not a vendor limit nothing aims for),
 * so the second line is in scope through MAX_QUERY_LENGTH alone.
 */
export const DECLARATION = `
check("the ceiling is ten", MARGIN_MULTIPLIER_MAX === 10);
check("the query bound is above the minimum", MAX_QUERY_LENGTH > MIN_QUERY_LENGTH);
`;
