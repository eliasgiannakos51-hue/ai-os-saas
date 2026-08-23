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

/**
 * The design decisions the page committed to, read back off the page.
 *
 * The prompt requires a DESIGN DECISIONS comment as the first thing in the
 * document — archetype, hero, section order, palette, type, density —
 * decided from the subject and written BEFORE the markup.
 *
 * Two things come from that, and the second is why it is worth the tokens.
 * Committing in writing before building is what stops a model drifting
 * back to the shape it knows best. And it turns "the sites still look the
 * same" from an argument into a measurement: if two briefs as different as
 * a taverna and a tax accountant declare the same archetype and the same
 * hero, that is a fact about the output, not an impression of it.
 *
 * Returns null when the block is absent, which is itself the finding —
 * never a made-up default that would score as compliance.
 */
export function designDecisions(html) {
  const block = html.match(/<!--\s*DESIGN DECISIONS\s*([\s\S]*?)-->/i);
  if (!block) return null;
  const out = {};
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*([a-z]+)\s*:\s*(.+?)\s*$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    out[key] = key === "sections" ? m[2].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : m[2];
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Does the page do what its own comment said it would?
 *
 * A declaration nobody checks is a declaration a model can write and then
 * ignore, which would make the whole mechanism worse than nothing — it
 * would look like evidence. So the declared section count is compared with
 * the landmarks actually built, and the declared fonts with the fonts
 * actually loaded.
 */
export function decisionsHonoured(html) {
  const declared = designDecisions(html);
  if (!declared) return { declared: false };
  const built = structureFingerprint(html).filter((t) => t === "section" || t === "article");
  const fonts = fontsUsed(html).map((f) => f.toLowerCase());
  const declaredFonts = (declared.type ?? "")
    .split("/")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return {
    declared: true,
    declaredSections: declared.sections?.length ?? 0,
    builtSections: built.length,
    // Exact equality would fail on a perfectly good page that wrapped two
    // declared sections in one <section>; the check is that the commitment
    // is roughly kept, not that it is transcribed.
    sectionCountPlausible:
      (declared.sections?.length ?? 0) > 0 && Math.abs((declared.sections?.length ?? 0) - built.length) <= 2,
    fontsMatch:
      declaredFonts.length > 0 && declaredFonts.every((d) => fonts.some((f) => f.includes(d) || d.includes(f))),
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

// =====================================================================
// THE VISUAL AXES (V4 #32, sixth report)
// =====================================================================
//
// Everything above measures STRUCTURE — the landmark sequence, the
// section vocabulary, the declared archetype. Those gates were green,
// pairwise structural similarity was under target, and the report came
// back a sixth time anyway.
//
// The brief's own hypothesis was that the sameness is VISUAL, and it was
// right: colour, typeface, spacing and motion timing were not drawn per
// site at all, so their variance was zero by construction. These four
// functions are the instrument for the axes a person actually perceives
// in the first second, so "they still look the same" can be a number
// instead of an argument.
//
// EVERY ONE READS THE PRODUCED HTML, never the prompt. A prompt that
// asks for variety and output that has none is precisely the failure
// mode being measured.

/** Which two families the page actually LOADS, in the order the Google
 *  Fonts link requests them. Two pages set in the same pairing are the
 *  same page to a visitor whatever their section order is. */
export function typePairing(html) {
  const families = [];
  for (const m of html.matchAll(/family=([A-Za-z+]+)/g)) {
    const name = m[1].replace(/\+/g, " ");
    if (!families.includes(name)) families.push(name);
  }
  return families;
}

/**
 * The distinct vertical padding values the page uses on its sections, in
 * px, ascending.
 *
 * DENSITY IS READ BEFORE ANYTHING ELSE. A tight page and a cavernous one
 * are visibly different products; two pages at the same padding read as
 * the same template even with different content. rem is converted at the
 * browser default of 16px so a page written in rem and one written in px
 * are comparable — the point is the rendered gap, not the unit.
 */
export function spacingScale(html) {
  const values = new Set();
  for (const m of html.matchAll(/padding(?:-top|-bottom|-block)?\s*:\s*([^;}]+)/gi)) {
    for (const token of m[1].match(/(\d+(?:\.\d+)?)(px|rem|em)/g) ?? []) {
      const n = parseFloat(token);
      const px = /rem|em/.test(token) ? n * 16 : n;
      // Below 24px is component padding (buttons, cells), not section
      // rhythm; including it would drown the signal in noise every page
      // shares.
      if (px >= 24) values.add(Math.round(px));
    }
  }
  return [...values].sort((a, b) => a - b);
}

/**
 * The page's motion signature: every transition/animation duration and
 * every translate distance, deduplicated.
 *
 * THIS IS THE ONE THAT WAS INVISIBLE. The cached prompt handed the model
 * copy-pasteable CSS with fixed literals — 0.7s and 24px for the reveal,
 * 0.3s and -6px for the lift, 12s for the gradient, 0.6s and 0.1s for the
 * stagger — while the drawn MOTION VOCABULARY promised 400-600ms and
 * 60-90ms. A concrete snippet beats a prose range, so every animated site
 * ever generated moved at exactly the same speed. Nothing measured it.
 */
export function motionSignature(html) {
  const durations = new Set();
  for (const m of html.matchAll(/(\d+(?:\.\d+)?)(m?s)\b/g)) {
    const ms = m[2] === "s" ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
    if (ms > 0) durations.add(Math.round(ms));
  }
  const distances = new Set();
  for (const m of html.matchAll(/translate[XY]?\(\s*(-?\d+(?:\.\d+)?)px/g)) {
    const px = Math.abs(parseFloat(m[1]));
    if (px > 0) distances.add(px);
  }
  return {
    durationsMs: [...durations].sort((a, b) => a - b),
    distancesPx: [...distances].sort((a, b) => a - b),
  };
}

/**
 * Where the page's colours sit on the wheel, as coarse hue buckets plus a
 * lightness verdict.
 *
 * BUCKETS, NOT HEXES. Two pages at #b45309 and #c2610a are the same
 * orange to a visitor, and comparing raw hexes would score them as
 * completely different — an instrument that says "varied" about two
 * indistinguishable pages is worse than no instrument. Six 60-degree
 * buckets is the resolution at which people actually name a colour.
 */
export function paletteCharacter(html) {
  const hues = new Set();
  let chromatic = 0;
  // THE GROUND IS THE MOST-USED COLOUR, NOT A VOTE.
  //
  // Counting one hex per colour and taking the majority called a page
  // with a near-black background and one bright accent "light", because
  // the two colours each got one vote. A background is the colour that
  // appears most; an accent is used sparingly by definition. Caught by
  // site-fingerprint.test.mjs asserting a dark page reads as dark.
  const counts = paletteCounts(html);
  const dominant = counts[0];
  const ground = dominant && lightnessOf(dominant) > 0.5 ? "light" : dominant ? "dark" : "light";
  for (const hex of palette(html)) {
    const full = hex.length === 4 ? "#" + [...hex.slice(1)].map((c) => c + c).join("") : hex;
    const r = parseInt(full.slice(1, 3), 16) / 255;
    const g = parseInt(full.slice(3, 5), 16) / 255;
    const b = parseInt(full.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 0.08) continue; // near-grey carries no hue
    chromatic++;
    let h;
    if (max === r) h = ((g - b) / (max - min)) % 6;
    else if (max === g) h = (b - r) / (max - min) + 2;
    else h = (r - g) / (max - min) + 4;
    h = ((h * 60) + 360) % 360;
    hues.add(["red", "yellow", "green", "cyan", "blue", "magenta"][Math.floor(h / 60) % 6]);
  }
  return {
    hues: [...hues].sort(),
    // A dark-ground page and a light-ground page are never the same
    // template, and this is the cheapest possible way to say so.
    ground,
    achromatic: chromatic === 0,
  };
}

/**
 * Hex values ranked by how much they behave like the page's GROUND.
 *
 * Raw frequency alone is not enough and ties on it are decided by
 * document order, which is not a fact about the design. A colour used in
 * a `background` declaration IS the ground; a colour used anywhere else
 * is ink or accent. So background occurrences are weighted heavily and
 * everything else counts once — a page whose accent appears in twenty
 * places and whose background appears in one still reads as its
 * background's ground, which is what a visitor sees.
 *
 * Shared neutrals are NOT dropped here, unlike palette(): a page whose
 * background is #ffffff has a white ground, and that is exactly the hex
 * palette() throws away.
 */
function paletteCounts(html) {
  const weights = new Map();
  const add = (hex, weight) => {
    const key = hex.toLowerCase();
    weights.set(key, (weights.get(key) ?? 0) + weight);
  };
  for (const m of html.matchAll(/background(?:-color)?\s*:\s*([^;"'}]+)/gi)) {
    for (const hex of m[1].match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi) ?? []) add(hex, 10);
  }
  for (const m of html.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) add(m[0], 1);
  return [...weights.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
}

function lightnessOf(hex) {
  const full = hex.length === 4 ? "#" + [...hex.slice(1)].map((c) => c + c).join("") : hex;
  const r = parseInt(full.slice(1, 3), 16) / 255;
  const g = parseInt(full.slice(3, 5), 16) / 255;
  const b = parseInt(full.slice(5, 7), 16) / 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

/**
 * ONE NUMBER FOR THE VISUAL AXES, comparable to sequenceSimilarity.
 *
 * The four axes weighted equally: two pages sharing fonts, hues, density
 * and motion score 1 whatever their structure does. Reported next to the
 * structural score rather than folded into it — a single blended figure
 * would let a good structural score hide a bad visual one, which is the
 * exact way five previous rounds passed while the complaint stood.
 */
export function visualSimilarity(a, b) {
  const fontScore = jaccard(typePairing(a), typePairing(b));
  const ca = paletteCharacter(a);
  const cb = paletteCharacter(b);
  const hueScore =
    ca.achromatic && cb.achromatic ? 1 : jaccard(ca.hues, cb.hues);
  const groundScore = ca.ground === cb.ground ? 1 : 0;
  const spaceScore = jaccard(spacingScale(a), spacingScale(b));
  const ma = motionSignature(a);
  const mb = motionSignature(b);
  const motionScore =
    ma.durationsMs.length === 0 && mb.durationsMs.length === 0
      ? 1 // both static: identical, and honestly so
      : (jaccard(ma.durationsMs, mb.durationsMs) + jaccard(ma.distancesPx, mb.distancesPx)) / 2;
  return {
    fonts: round2(fontScore),
    colour: round2((hueScore + groundScore) / 2),
    spacing: round2(spaceScore),
    motion: round2(motionScore),
    overall: round2((fontScore + (hueScore + groundScore) / 2 + spaceScore + motionScore) / 4),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
