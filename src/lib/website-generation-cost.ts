// Dynamic credit pricing for Website Builder generation — replaces the old
// flat CREDIT_COSTS.websiteGenerate (100 credits regardless of size). No
// "server-only" here: the client imports estimateWebsiteGenerationCost
// directly for the live pre-generate cost estimate (website-builder-
// workspace.tsx), and the server imports computeWebsiteGenerationCost for
// the real, final charge (api/websites/generate/process/route.ts), once
// the actual generated HTML length is known.
//
// Formula: base + description-length component + per-image component +
// output-length component, each in fixed-size "units" (round up).
//
// Where the numbers come from: this app calls Claude Sonnet 4.6
// ($3/1M input tokens, $15/1M output tokens — the model actually used,
// see lib/website-builder.ts's MODEL). ~4 characters per token as a rough
// estimate:
//   - Description: 500 chars ≈ 125 input tokens ≈ $0.000375 real cost.
//   - Reference image: a standard-resolution vision block is roughly
//     1500-1600 input tokens ≈ $0.0045-0.0048 real cost — meaningfully
//     more expensive per unit than an equivalent chunk of description
//     text, hence the much higher CREDITS_PER_REFERENCE_IMAGE weight.
//   - Output: 2000 chars ≈ 500 output tokens ≈ $0.0075 real cost (5x the
//     input rate — output is priced 5x higher than input on this model).
// At 1 credit ≈ $0.02 (the app's existing rough credit-to-cost anchor —
// e.g. the ~$0.06-real-cost/~3-credit reference point for a typical AI
// call elsewhere in this app), the weights below price every generation
// at roughly 16-45x its real API cost across the whole size range (small
// requests carry the largest margin since the flat base cost dominates;
// the largest, most expensive requests still clear ~16x) — see the
// worked examples in the chat response that shipped this file.
export const WEBSITE_GENERATE_BASE_COST = 40;

export const DESCRIPTION_UNIT_CHARS = 500;
export const CREDITS_PER_DESCRIPTION_UNIT = 4;

export const CREDITS_PER_REFERENCE_IMAGE = 12;

export const OUTPUT_UNIT_CHARS = 2000;
export const CREDITS_PER_OUTPUT_UNIT = 3;

function unitsOf(length: number, unitChars: number): number {
  if (length <= 0) return 0;
  return Math.ceil(length / unitChars);
}

// The REAL, final cost — computed server-side only after generation has
// actually completed, using the true generated HTML length. This is the
// amount that api/websites/generate/process/route.ts actually deducts.
export function computeWebsiteGenerationCost(params: {
  descriptionLength: number;
  imageCount: number;
  outputHtmlLength: number;
}): number {
  const { descriptionLength, imageCount, outputHtmlLength } = params;
  return (
    WEBSITE_GENERATE_BASE_COST +
    unitsOf(descriptionLength, DESCRIPTION_UNIT_CHARS) * CREDITS_PER_DESCRIPTION_UNIT +
    imageCount * CREDITS_PER_REFERENCE_IMAGE +
    unitsOf(outputHtmlLength, OUTPUT_UNIT_CHARS) * CREDITS_PER_OUTPUT_UNIT
  );
}

// A pre-generation ESTIMATE — shown live to the user before they click
// Generate (website-builder-workspace.tsx), and used server-side to check
// the user has enough credits BEFORE starting the (potentially long,
// costly) generation at all (api/websites/generate/route.ts). The real
// output length isn't known yet at this point, so it's approximated from
// description length — a longer, more detailed description tends to
// produce a larger site. Clamped to a plausible range so a very short or
// very long description doesn't produce a wildly wrong estimate.
export function estimateWebsiteGenerationCost(params: {
  descriptionLength: number;
  imageCount: number;
}): number {
  const { descriptionLength, imageCount } = params;
  const estimatedOutputLength = Math.max(8000, Math.min(60000, descriptionLength * 4));
  return computeWebsiteGenerationCost({
    descriptionLength,
    imageCount,
    outputHtmlLength: estimatedOutputLength,
  });
}
