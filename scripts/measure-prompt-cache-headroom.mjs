#!/usr/bin/env node
/**
 * WHICH CALL SITES WOULD ACTUALLY GAIN FROM PROMPT CACHING.
 *
 * Run: node scripts/measure-prompt-cache-headroom.mjs
 *
 * The tempting number is "8 of 26 call sites use prompt caching, so 18 are
 * losses". That is a CEILING wearing the clothes of an outcome, which
 * docs/shapes.md keeps a whole entry about: Anthropic will not cache a
 * prefix below 1,024 tokens, and it does NOT error when you ask — it
 * returns `cache_creation_input_tokens: 0` and the marker reads like an
 * optimisation that works. A call site with a 200-token system prompt
 * gains nothing from being "fixed", and counting it as a miss inflates the
 * opportunity by however many of those there are.
 *
 * So this measures the STATIC PREFIX of each uncached call site and sorts
 * it into three buckets by the only threshold that matters.
 *
 * THE ESTIMATE IS DELIBERATELY CRUDE AND SAYS SO. Tokens are counted as
 * characters divided by a per-script divisor — 3.6 for Latin text, 2.2
 * where the prompt carries Greek, because Greek costs roughly 1.6x the
 * tokens of the same text in English. Nothing here calls the token-counting
 * endpoint; this is a triage that says WHERE to look, not a bill. A site
 * near the line is reported as near the line rather than decided.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const MIN_CACHEABLE_TOKENS = 1024; // claude-sonnet-4-6; see lib/ai/cached-system.ts

const callSites = execFileSync(
  "grep",
  ["-rl", "-e", "messages.create", "-e", "anthropic\\.messages", "-e", "/v1/messages", "src", "--include=*.ts"],
  { encoding: "utf8" }
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .sort();

const hasGreek = (s) => /[Ͱ-Ͽἀ-῿]/.test(s);

/**
 * THE STATIC PART, and only the static part. A template literal with a
 * `${}` in it is not a prefix — it changes per call, so everything after
 * the first interpolation is uncacheable whatever its length. Taking the
 * whole literal would over-state every site that builds its prompt from
 * the user's data, which is most of them.
 */
function staticPrefixChars(source) {
  let best = 0;
  // Backtick and quoted string literals assigned to something that reads
  // like a prompt, plus bare literals passed as `system:`.
  const literals = [
    ...source.matchAll(/`([^`]*)`/g),
    ...source.matchAll(/"((?:[^"\\]|\\.){40,})"/g),
  ];
  for (const m of literals) {
    const raw = m[1];
    const cut = raw.indexOf("${");
    const stat = cut === -1 ? raw : raw.slice(0, cut);
    if (stat.length > best) best = stat.length;
  }
  return best;
}

const rows = [];
for (const file of callSites) {
  if (!existsSync(file)) continue;
  const src = readFileSync(file, "utf8");
  const cached = /cache_control|buildCachedSystem/.test(src);
  const chars = staticPrefixChars(src);
  const divisor = hasGreek(src) ? 2.2 : 3.6;
  const tokens = Math.round(chars / divisor);
  rows.push({ file: file.replace(/^src\//, ""), cached, chars, tokens, greek: hasGreek(src) });
}

const uncached = rows.filter((r) => !r.cached);
const worth = uncached.filter((r) => r.tokens >= MIN_CACHEABLE_TOKENS);
const near = uncached.filter((r) => r.tokens >= MIN_CACHEABLE_TOKENS / 2 && r.tokens < MIN_CACHEABLE_TOKENS);
const pointless = uncached.filter((r) => r.tokens < MIN_CACHEABLE_TOKENS / 2);

const line = (r) => `    ${String(r.tokens).padStart(5)} tok  ${r.greek ? "gr" : "  "}  ${r.file}`;

console.log(`prompt-cache headroom, threshold ${MIN_CACHEABLE_TOKENS} tokens\n`);
console.log(`${rows.length} Anthropic call site(s); ${rows.length - uncached.length} already cache.\n`);

console.log(`WOULD CACHE — static prefix over the threshold (${worth.length}):`);
console.log(worth.length ? worth.sort((a, b) => b.tokens - a.tokens).map(line).join("\n") : "    none");

console.log(`\nNEAR THE LINE — half the threshold or more, estimate too crude to decide (${near.length}):`);
console.log(near.length ? near.sort((a, b) => b.tokens - a.tokens).map(line).join("\n") : "    none");

console.log(`\nWOULD NOT CACHE — prefix too short, and Anthropic would not say so (${pointless.length}):`);
console.log(pointless.length ? pointless.sort((a, b) => b.tokens - a.tokens).map(line).join("\n") : "    none");

console.log(
  `\n${worth.length} of ${uncached.length} uncached call site(s) are worth changing on this estimate.`
);
console.log("The estimate is chars/3.6 (chars/2.2 where the prompt carries Greek),");
console.log("measured from the STATIC part of the longest literal only — everything");
console.log("from the first ${} onward is per-call and cannot be a prefix.");
