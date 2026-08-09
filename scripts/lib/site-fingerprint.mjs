// The measuring stick for scripts/website-variety-check.mjs.
//
// Split out of the script so it can be UNIT TESTED without an API key.
// Handing someone an unverified instrument and asking them to trust its
// verdict is worse than handing them nothing: if sequenceSimilarity were
// subtly wrong, "0.42 — genuinely different shapes" would be a confident
// lie. scripts/tests/site-fingerprint.test.mjs exercises every function
// here against hand-built HTML with known answers.
//
// Plain .mjs, in scripts/, not src/: this is tooling, and it must not end
// up in the application bundle.

/** The page's structural fingerprint: the ordered sequence of block-level
 *  landmarks. Two pages built from the same template produce the same
 *  sequence whatever the words in them are. */
export function structureFingerprint(html) {
  const body = html.slice(html.search(/<body[\s>]/i));
  return (body.match(/<(header|nav|main|section|article|aside|footer|figure|form|table)\b/gi) ?? []).map((t) =>
    t.slice(1).toLowerCase()
  );
}

export function fontsUsed(html) {
  return [...html.matchAll(/family=([A-Za-z+]+)/g)].map((m) => m[1].replace(/\+/g, " "));
}

/** The colours the page actually leans on, most-used first. Shared
 *  neutrals are dropped — every page has white and near-black. */
export function palette(html) {
  const counts = new Map();
  for (const m of html.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = m[0].toLowerCase();
    if (/^#(fff|ffffff|000|000000)$/.test(hex)) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([hex]) => hex);
}

/** Did the banned generic shape come back anyway? */
export function genericShapeSignals(html) {
  const lower = html.toLowerCase();
  return {
    centredHero: /text-align:\s*center/.test(lower) && /<(header|section)[^>]*>[\s\S]{0,600}<h1/i.test(html),
    threeCardGrid: /grid-template-columns:\s*repeat\(3/.test(lower),
    testimonial: /testimonial|μαρτυρ|τι λένε|reviews?\b/i.test(html),
    ctaBand: /\bcta\b/i.test(html),
    gradientHero: /linear-gradient/.test(lower) && /<(header|section)[^>]*hero/i.test(html),
  };
}

export function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

/** Longest-common-subsequence ratio over the landmark sequences — this is
 *  the one that catches "same template, different words". */
export function sequenceSimilarity(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return (2 * dp[m][n]) / (m + n);
}
