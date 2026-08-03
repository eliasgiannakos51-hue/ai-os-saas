// Dynamic credit pricing for Website Builder edits — replaces the old
// flat CREDIT_COSTS.websiteEdit (50 credits regardless of real cost).
// Real cost genuinely bifurcates depending on which path
// lib/website-builder.ts's editWebsiteHtml took (see EditWebsiteResult):
//   - Cheap patch (tryApplySimpleEdit): a single small, forced-tool-use
//     classification call (PATCH_MAX_TOKENS = 4000) with NO output HTML
//     generation at all — the system prompt IS the current HTML (cached,
//     see cache_control), and the response is just a short find/replace
//     pair, not the page itself. Real cost is a small fraction of a full
//     regeneration.
//   - Full regeneration: the same shape (and real cost driver) as a
//     fresh generation's output — see lib/website-generation-cost.ts's
//     identical OUTPUT_UNIT_CHARS/CREDITS_PER_OUTPUT_UNIT weights, reused
//     here rather than duplicated with different numbers for no reason.
export const WEBSITE_EDIT_PATCH_COST = 5;

export const WEBSITE_EDIT_REGENERATE_BASE_COST = 20;
export const EDIT_OUTPUT_UNIT_CHARS = 2000;
export const CREDITS_PER_EDIT_OUTPUT_UNIT = 3;

function unitsOf(length: number, unitChars: number): number {
  if (length <= 0) return 0;
  return Math.ceil(length / unitChars);
}

// The REAL, final cost — computed server-side only after the edit has
// actually completed, using which path was taken and (for a full
// regeneration) the true output length. api/websites/edit/route.ts
// deducts exactly this amount, never the old flat rate.
export function computeWebsiteEditCost(params: {
  usedCheapPatch: boolean;
  outputHtmlLength: number;
}): number {
  if (params.usedCheapPatch) return WEBSITE_EDIT_PATCH_COST;
  return (
    WEBSITE_EDIT_REGENERATE_BASE_COST +
    unitsOf(params.outputHtmlLength, EDIT_OUTPUT_UNIT_CHARS) * CREDITS_PER_EDIT_OUTPUT_UNIT
  );
}

// A pre-edit ESTIMATE — used server-side to check the user has enough
// credits BEFORE starting the edit at all (api/websites/edit/route.ts).
// Whether the cheap-patch path will be used isn't known yet at this
// point (that's only decided inside editWebsiteHtml), so this
// conservatively estimates the more expensive full-regeneration case —
// the same "estimate high, charge the real lower amount after" approach
// lib/website-generation-cost.ts uses.
export function estimateWebsiteEditCost(currentHtmlLength: number): number {
  return computeWebsiteEditCost({ usedCheapPatch: false, outputHtmlLength: currentHtmlLength });
}
