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
    // `[a-z-]` and not `[a-z]`: the block gained a `why-motion` line, and
    // the narrower class silently dropped it — a parser that ignores a key
    // it does not recognise reports "the model did not declare that" when
    // the model did.
    const m = line.match(/^\s*([a-z][a-z-]*)\s*:\s*(.+?)\s*$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    out[key] = key === "sections" ? m[2].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : m[2];
  }
  if (!Object.keys(out).length) return null;
  // The declared values are single words followed, in practice, by a model's
  // parenthetical ("subtle — feedback only"). Normalise the two that are
  // compared for collisions so "subtle" and "subtle (hover only)" are not
  // counted as two different decisions.
  for (const key of ["archetype", "hero", "motion", "density"]) {
    if (typeof out[key] === "string") out[key] = firstToken(out[key]);
  }
  return out;
}

/** The leading bare word of a declared value, lowercased. */
function firstToken(value) {
  return (value.trim().toLowerCase().match(/^[a-z-]+/) ?? [""])[0];
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
export function decisionsHonoured(html, archetypeMotion) {
  const declared = designDecisions(html);
  if (!declared) return { declared: false };
  const built = structureFingerprint(html).filter((t) => t === "section" || t === "article");
  const fonts = fontsUsed(html).map((f) => f.toLowerCase());
  const declaredFonts = (declared.type ?? "")
    .split("/")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // The motion line is checked by the same rule as the sections line: a
  // commitment is only worth writing down if something reads it back.
  const motionProblems = motionContradictions(html, archetypeMotion);
  return {
    declared: true,
    declaredMotion: declared.motion ?? null,
    motionMatches: motionProblems.length === 0,
    motionProblems,
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

// ---------------------------------------------------------------------
// MOTION
//
// Structure was the half of "it is the same template" that got fixed. This
// is the other half, and it is the half the user was still describing:
// "ίδια animations, ίδια συμπεριφορά, ίδιο feel". Two pages with different
// section orders still feel like one page when they move identically, so
// motion is measured with the same seriousness as structure — declared,
// then read back off the CSS and compared with the declaration.
// ---------------------------------------------------------------------

/** The six vocabularies. Must equal MOTION_VOCABULARIES in
 *  src/lib/website-motion.ts — asserted by scripts/tests/motion-vocabulary.test.mjs,
 *  because a spec duplicated in two languages with nothing comparing them
 *  is a spec that will drift. */
export const MOTION_VOCABULARIES = ["still", "subtle", "editorial", "bold", "playful", "cinematic"];

/**
 * Removes the `@media (prefers-reduced-motion: reduce)` block and its
 * contents.
 *
 * Brace-counted rather than regexed: the block is a nested at-rule
 * (`@media { selector { ... } }`), and the obvious `\{[^}]*\}` stops at the
 * FIRST closing brace, leaving the tail of the override behind to be
 * counted as ordinary motion.
 */
function stripReducedMotionBlock(css) {
  let out = "";
  let index = 0;
  for (;;) {
    const start = css.slice(index).search(/@media[^{]*prefers-reduced-motion[^{]*\{/i);
    if (start === -1) {
      out += css.slice(index);
      return out;
    }
    const absolute = index + start;
    out += css.slice(index, absolute);
    let depth = 0;
    let cursor = css.indexOf("{", absolute);
    if (cursor === -1) return out;
    for (; cursor < css.length; cursor++) {
      if (css[cursor] === "{") depth++;
      else if (css[cursor] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    index = cursor + 1;
  }
}

/** Every CSS time value in the document, in milliseconds. */
function durationsMs(css) {
  const out = [];
  for (const m of css.matchAll(/(\d*\.?\d+)\s*(ms|s)\b/g)) {
    const value = Number(m[1]);
    if (!Number.isFinite(value)) continue;
    const ms = m[2] === "s" ? value * 1000 : value;
    // 0.01ms is the prefers-reduced-motion override, not a design duration.
    if (ms >= 1) out.push(ms);
  }
  return out;
}

/**
 * What this page ACTUALLY does, measured off its CSS rather than off its
 * claims. Every field is a count or a boolean so two pages can be compared
 * arithmetically instead of by opinion.
 */
export function motionSignals(html) {
  const style = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  // Inline style="" attributes and the odd <script> matter too: a page can
  // animate without a <style> block. Fall back to the whole document when
  // there is no style block, and always scan the document for the markers
  // that live in markup (class="reveal", IntersectionObserver).
  const rawCss = style || html;
  const reducedMotionGuard = /prefers-reduced-motion/i.test(rawCss);
  // Found by running this on a page that declared "still" correctly and was
  // reported as having a transition: the reduced-motion block CONTAINS
  // `animation-duration`, `transition-duration` and `scroll-behavior`
  // declarations, and counting them makes every accessible page look like a
  // moving one — i.e. it penalised exactly the pages that did the right
  // thing. It is an override of motion, not an instance of it, so it is
  // excised before anything is counted.
  const css = stripReducedMotionBlock(rawCss);
  const lower = html.toLowerCase();
  const times = durationsMs(css);
  return {
    keyframes: (css.match(/@keyframes\b/gi) ?? []).length,
    animations: (css.match(/\banimation(-name)?\s*:/gi) ?? []).length,
    transitions: (css.match(/\btransition(-property|-duration)?\s*:/gi) ?? []).length,
    transforms: (css.match(/\btransform\s*:/gi) ?? []).length,
    // The scroll-reveal pattern, by either of its two halves — the class on
    // its own is what the prompt's snippet emits, the observer is what
    // makes it work, and a page that has one without the other is still
    // using the pattern.
    scrollReveal: /class=["'][^"']*\breveal\b/i.test(html) || /IntersectionObserver/.test(html),
    parallax: /background-attachment\s*:\s*fixed/i.test(css),
    stagger: /animation-delay\s*:/i.test(css) || /\bstagger\b/i.test(lower),
    smoothScroll: /scroll-behavior\s*:\s*smooth/i.test(css),
    animatedGradient: /@keyframes[^{]*\{[\s\S]*?background-position/i.test(css) || /gradientshift/i.test(lower),
    // The one non-negotiable: without it, a visitor with a vestibular
    // disorder gets the full show. Read off the ORIGINAL css, since the
    // counted css has had this very block removed.
    reducedMotionGuard,
    // A curve that overshoots 1 on the y axis is the "bouncy" family — the
    // signature of `playful` and forbidden in `cinematic`.
    bouncyEasing: [...css.matchAll(/cubic-bezier\(([^)]*)\)/gi)].some((m) => {
      const parts = m[1].split(",").map((n) => Number(n.trim()));
      return parts.length === 4 && (parts[1] > 1.05 || parts[3] > 1.05);
    }),
    longestMs: times.length ? Math.max(...times) : 0,
    typicalMs: times.length ? times.slice().sort((a, b) => a - b)[Math.floor(times.length / 2)] : 0,
  };
}

/** True when the page does not move at all, by any measure. */
function isMotionless(s) {
  return s.keyframes === 0 && s.animations === 0 && !s.scrollReveal && !s.parallax && s.transforms === 0;
}

/**
 * A comparable descriptor of HOW a page moves — the motion equivalent of
 * structureFingerprint, so "the animations are the same" becomes a number
 * via jaccard() instead of an argument.
 *
 * Durations are bucketed rather than exact: 680ms and 700ms are the same
 * decision, and comparing them as distinct tokens would report two
 * identical pages as different.
 */
export function motionFingerprint(html) {
  const s = motionSignals(html);
  const tokens = [];
  if (s.scrollReveal) tokens.push("scroll-reveal");
  if (s.parallax) tokens.push("parallax");
  if (s.stagger) tokens.push("stagger");
  if (s.animatedGradient) tokens.push("animated-gradient");
  if (s.smoothScroll) tokens.push("smooth-scroll");
  if (s.bouncyEasing) tokens.push("bouncy-easing");
  if (s.transforms > 0) tokens.push("transform");
  if (s.transitions > 0) tokens.push("transition");
  if (s.keyframes > 0) tokens.push(`keyframes:${s.keyframes >= 4 ? "many" : s.keyframes}`);
  if (s.typicalMs > 0) {
    const bucket = s.typicalMs < 200 ? "fast" : s.typicalMs < 500 ? "medium" : s.typicalMs < 900 ? "slow" : "very-slow";
    tokens.push(`duration:${bucket}`);
  }
  if (tokens.length === 0) tokens.push("motionless");
  return tokens.sort();
}

/**
 * Where the page contradicts its own declaration.
 *
 * Deliberately conservative: it reports only what is contradictory BY
 * DEFINITION, never what merely looks like a lot or a little. A checker
 * that fires on judgement calls trains its reader to ignore it, and this
 * one has to be trusted when it says a "still" page is animating.
 *
 * `archetypeMotion` is the allowed-set map from src/lib/website-motion.ts,
 * passed in rather than duplicated here so there is one spec, not two.
 */
export function motionContradictions(html, archetypeMotion) {
  const declared = designDecisions(html);
  const s = motionSignals(html);
  const out = [];
  if (!declared) return ["no DESIGN DECISIONS block, so nothing was declared to check"];

  const motion = declared.motion;
  if (!motion) {
    out.push("no motion declared — the DESIGN DECISIONS block requires a motion line");
    return out;
  }
  if (!MOTION_VOCABULARIES.includes(motion)) {
    out.push(`declared motion "${motion}" is not one of the six vocabularies`);
    return out;
  }
  if (archetypeMotion && declared.archetype) {
    const allowed = archetypeMotion[declared.archetype];
    if (allowed && !allowed.includes(motion)) {
      out.push(`archetype "${declared.archetype}" does not permit motion "${motion}" (allowed: ${allowed.join(", ")})`);
    }
  }
  if (!declared["why-motion"]) {
    out.push("motion declared with no why-motion line saying what actually moves");
  }

  if (motion === "still") {
    if (s.keyframes > 0) out.push(`declared "still" but the page has ${s.keyframes} @keyframes rule(s)`);
    if (s.animations > 0) out.push(`declared "still" but the page has ${s.animations} animation declaration(s)`);
    if (s.transforms > 0) out.push(`declared "still" but the page has ${s.transforms} transform declaration(s)`);
    if (s.scrollReveal) out.push('declared "still" but the page uses the scroll-reveal pattern');
    if (s.parallax) out.push('declared "still" but the page uses a fixed-attachment parallax background');
  } else if (!s.reducedMotionGuard) {
    // Mandatory for every vocabulary except "still", where there is nothing
    // to reduce.
    out.push(`declared "${motion}" but there is no prefers-reduced-motion block`);
  }

  if (motion === "subtle") {
    if (s.keyframes > 0) out.push(`declared "subtle" (feedback only) but the page has ${s.keyframes} @keyframes rule(s)`);
    if (s.scrollReveal) out.push('declared "subtle" but the page reveals sections on scroll, which happens without the visitor doing anything');
    if (s.parallax) out.push('declared "subtle" but the page uses a parallax background');
  }
  if (motion === "editorial") {
    if (s.scrollReveal) out.push('declared "editorial" but body content animates in as the reader reaches it');
    if (s.stagger) out.push('declared "editorial" but the page staggers a list');
    if (s.parallax) out.push('declared "editorial" but the page uses a parallax background');
  }
  if (motion === "cinematic") {
    if (s.bouncyEasing) out.push('declared "cinematic" but uses a bouncy overshoot curve');
    if (s.stagger) out.push('declared "cinematic" but staggers a list');
    if (!s.parallax && s.longestMs < 800) {
      out.push(`declared "cinematic" but nothing on the page is slow or full-bleed (longest duration ${s.longestMs}ms, no parallax)`);
    }
  }
  if ((motion === "bold" || motion === "playful") && isMotionless(s)) {
    out.push(`declared "${motion}" but nothing on the page moves at all`);
  }
  return out;
}

/**
 * Two briefs that declared the same shape AND the same movement.
 *
 * This is the sameness complaint stated at its source. A structural
 * similarity score can only be argued with; "the taverna and the tax office
 * both chose local-place / full-bleed-photo / cinematic" cannot.
 *
 * `pages` is [{ slug, decisions }]. Returns one entry per colliding PAIR,
 * with the specific fields that matched, so a near-miss (same archetype,
 * different motion) is visible as a partial rather than hidden as a pass.
 */
export function declarationCollisions(pages) {
  const withDecisions = pages.filter((p) => p.decisions);
  const collisions = [];
  for (let i = 0; i < withDecisions.length; i++) {
    for (let j = i + 1; j < withDecisions.length; j++) {
      const a = withDecisions[i];
      const b = withDecisions[j];
      const same = ["archetype", "hero", "motion"].filter(
        (k) => a.decisions[k] && a.decisions[k] === b.decisions[k]
      );
      if (same.length === 0) continue;
      collisions.push({
        pair: [a.slug, b.slug],
        matched: same,
        // A full collision is the reported bug: same shape, same behaviour.
        // Anything less is worth printing but is not a failure — two cafés
        // SHOULD both be local-place.
        full: same.includes("archetype") && same.includes("hero") && same.includes("motion"),
        values: Object.fromEntries(same.map((k) => [k, a.decisions[k]])),
      });
    }
  }
  return collisions;
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
