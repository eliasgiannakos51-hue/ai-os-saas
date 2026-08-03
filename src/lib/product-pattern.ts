// Pure, deterministic pattern check over the user's own products — no AI
// call, same "cheap, honest signal" spirit as lib/trading-pattern.ts.
// Product Workflow's flagship insight: do MORE THOROUGHLY PLANNED products
// (more written detail across their MVP features/roadmap/launch
// plan/target audience) end up with MORE linked Knowledge Graph entries
// (Content/Sales/Decisions) than briefly-described ones? A real,
// computable proxy for "planning depth correlates with downstream
// execution activity" — not a claim of causation, just a real count
// comparison over the user's own data.

export type ProductForPattern = {
  id: string;
  mvp_features: string | null;
  roadmap: string | null;
  launch_plan: string | null;
  target_audience: string | null;
  // Count of entity_links (Knowledge Graph) touching this product, in
  // either direction — see loadLinkedEntities in lib/entity-links.ts,
  // already computed by the caller (product-workflow/page.tsx) for
  // rendering the products list, reused here rather than re-queried.
  linkedCount: number;
};

// Below this combined character count across the four planning fields, a
// product is "brief"; at or above, it's "detailed". Deliberately coarse —
// this is a binary split for a two-group average comparison, not a
// precision measurement.
const DETAIL_LENGTH_THRESHOLD = 200;

// Same reasoning as lib/trading-pattern.ts's MIN_BUCKET_SAMPLES: below
// this many products in EITHER group, an average is just noise (a single
// product with 3 links would claim a misleading "3.0 average").
const MIN_GROUP_SAMPLES = 3;

function planningDetailLength(product: ProductForPattern): number {
  return [product.mvp_features, product.roadmap, product.launch_plan, product.target_audience]
    .map((field) => (field ?? "").trim().length)
    .reduce((sum, len) => sum + len, 0);
}

export type ProductDetailInsight = {
  detailedCount: number;
  briefCount: number;
  detailedAvgLinks: number;
  briefAvgLinks: number;
};

// Returns null when either group doesn't have enough samples yet to say
// anything real — same honest "not enough data" contract as every
// pattern-detection function in lib/trading-pattern.ts.
export function detectProductDetailInsight(products: ProductForPattern[]): ProductDetailInsight | null {
  const detailedLinks: number[] = [];
  const briefLinks: number[] = [];

  for (const product of products) {
    const bucket = planningDetailLength(product) >= DETAIL_LENGTH_THRESHOLD ? detailedLinks : briefLinks;
    bucket.push(product.linkedCount);
  }

  if (detailedLinks.length < MIN_GROUP_SAMPLES || briefLinks.length < MIN_GROUP_SAMPLES) {
    return null;
  }

  const average = (values: number[]) =>
    Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;

  return {
    detailedCount: detailedLinks.length,
    briefCount: briefLinks.length,
    detailedAvgLinks: average(detailedLinks),
    briefAvgLinks: average(briefLinks),
  };
}
