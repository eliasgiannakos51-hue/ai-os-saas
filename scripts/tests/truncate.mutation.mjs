#!/usr/bin/env node
/*
 * CAN truncate.test.mjs SEE A CUT LAND IN THE MIDDLE OF A CHARACTER?
 *
 * WHY THIS ONE MATTERS MORE THAN IT LOOKS. Truncation runs on every list
 * in the product, in ten languages, and `String.prototype.slice` counts
 * UTF-16 code units rather than characters. Cutting an emoji, a flag or a
 * Devanagari cluster in half does not produce a shorter word — it
 * produces a replacement box, and it produces it only for the users whose
 * language uses those characters. This is the `\b`-is-ASCII shape
 * (docs/shapes.md) at the other end of the pipeline.
 *
 * Seven mutants, each a thing a person would plausibly write:
 *
 *   1. the length guard flips to `<`, so a string of exactly max is cut
 *   2. `max === 1` stops being the ellipsis alone and returns an empty
 *      string — a row that shows nothing where it should show "…"
 *   3. the ellipsis is not reserved, so the result is one over max
 *   4. `trimEnd` goes, so a cut lands on a space and the ellipsis floats
 *   5. Intl.Segmenter is skipped, which is the code-unit slice this file
 *      exists to forbid
 *   6. the segment loop uses `>=`, cutting one grapheme too many
 *   7. the code-unit fallback loop stops respecting the budget
 *
 * Run: node scripts/tests/truncate.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/truncate.test.mjs";
const LIB = "src/lib/text/truncate.ts";

// Top-level declaration, under the name the reader looks for — see the
// SHAPE note in scripts/tests/lib/mutation-runner.mjs.
const MUTANTS = [
  {
    name: "a string of exactly max starts being cut",
    file: LIB,
    from: "  if (trimmed.length <= max) return trimmed;",
    to: "  if (trimmed.length < max) return trimmed;",
    expect: "exactly max is not cut",
  },
  {
    name: "max=1 returns nothing instead of the ellipsis",
    file: LIB,
    from: "  if (max === 1) return ELLIPSIS;",
    to: '  if (max === 1) return "";',
    expect: "max=1 is the ellipsis alone",
  },
  {
    name: "the ellipsis stops being reserved, so the result runs one over max",
    file: LIB,
    from: "  return `${cutGraphemes(trimmed, max - 1).trimEnd()}${ELLIPSIS}`;",
    to: "  return `${cutGraphemes(trimmed, max).trimEnd()}${ELLIPSIS}`;",
    expect: "never longer than max",
  },
  {
    name: "the cut stops trimming, so the ellipsis floats after a space",
    file: LIB,
    from: "  return `${cutGraphemes(trimmed, max - 1).trimEnd()}${ELLIPSIS}`;",
    to: "  return `${cutGraphemes(trimmed, max - 1)}${ELLIPSIS}`;",
    expect: "a cut never lands on a space",
  },
  {
    name: "Intl.Segmenter is skipped, so the cut counts code units again",
    file: LIB,
    from: "  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;",
    to: "  const Segmenter = undefined as unknown as typeof Intl.Segmenter | undefined;",
    expect: "ZWJ family",
  },
  {
    name: "the segment budget goes off by one, cutting one grapheme too many",
    file: LIB,
    from: "      if (out.length + segment.length > max) break;",
    to: "      if (out.length + segment.length >= max) break;",
    expect: "never longer than max",
  },
  {
    name: "the code-unit fallback stops respecting the budget",
    file: LIB,
    from: "    if (out.length + ch.length > max) break;",
    to: "    if (out.length + ch.length > max + 1) break;",
    expect: "never longer than max",
  },
];

runMutations({
  name: "truncate",
  gate: GATE,
  targets: [LIB],
  mutants: MUTANTS,
});
