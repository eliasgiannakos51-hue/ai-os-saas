#!/usr/bin/env node
/*
 * CAN A USER FIND A PAGE BY THE NAME THEY CAN SEE?
 *
 * WHERE THIS CAME FROM. The owner's question after the vocabulary scan:
 * the module vocabulary was built from NOUNS because that is how an
 * interface is named — so where ELSE does this product draw on text
 * written for READING and use it for MATCHING?
 *
 * The command palette is the worst instance, and it is worse than
 * nouns-versus-verbs. It RENDERS a translated label and MATCHED the
 * untranslated one:
 *
 *     const label = normalizeForSearch(item.label);   // "Finance"
 *     ...
 *     translatedLabel(item.label)                     // «Οικονομικά»
 *
 * A Greek user sees «Οικονομικά», types «οικο», and the matcher compares
 * it against "Finance". Nine of the ten languages this app ships could
 * not reach a single page by the name on the screen.
 *
 * AND IT WAS WRITTEN DOWN. lib/sidebar-label-keys.ts says "the underlying
 * strings stay English (state keys, search matching) — only the rendered
 * label goes through messages/*.json". That is an accurate description of
 * a bug, phrased as a design note, which is why it survived review: it
 * reads like somebody thought about it.
 *
 * WHAT THIS MEASURES. The cross-product, not a sample: every navigable
 * sidebar item x all ten locales. For each pair, take the label the
 * palette would DISPLAY in that locale and ask the real matcher whether
 * it finds that item. Nothing here is a proxy — `filterAndRankCandidates`
 * is the function the palette calls.
 *
 * Run: node scripts/tests/command-palette-language.test.mjs
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const match = await loadTs("src/lib/command-palette-match.ts");
const keys = await loadTs("src/lib/sidebar-label-keys.ts");

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);

const lookup = (catalogue, path) => {
  let node = catalogue;
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object") return "";
    node = node[part];
  }
  return typeof node === "string" ? node : "";
};

// THE ITEMS, READ OUT OF THE SIDEBAR REGISTRY. lib/sidebar-nav.ts imports
// icon components from lucide-react, which the loader cannot follow, so
// the labels are parsed from its source rather than imported. The parse
// is checked below against ITEM_LABEL_KEYS, so a label this misses is a
// label that shows up as an unmapped key rather than as a silent zero.
const navSource = readFileSync("src/lib/sidebar-nav.ts", "utf8");
const LABELS = [...navSource.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);

console.log("== 1. the corpus is the real sidebar, and it is not empty ==");
{
  ok("labels were parsed out of sidebar-nav.ts", LABELS.length >= 15, `${LABELS.length} labels`);
  // EVERY LABEL MUST HAVE A TRANSLATION KEY, or the item is untranslated
  // and this file would be measuring English against English and calling
  // it a pass. sidebar-naming.test.mjs owns that claim; this asserts the
  // subset this file depends on, so a gap cannot make these numbers
  // look better than they are.
  const unmapped = LABELS.filter((l) => !keys.ITEM_LABEL_KEYS[l]);
  ok("every parsed label has a translation key", unmapped.length === 0, unmapped.join(", "));
}

const ITEMS = LABELS.filter((l) => keys.ITEM_LABEL_KEYS[l]).map((label) => ({
  label,
  key: `sidebar.items.${keys.ITEM_LABEL_KEYS[label]}`,
}));

/** What the palette DISPLAYS for this item in this locale. */
const displayed = (item, locale) => lookup(messages[locale], item.key);

// ---------------------------------------------------------------------
console.log("\n== 2. the cross-product: every item x every locale ==");

/**
 * The candidates the palette offers the matcher for this item, in this
 * locale. This mirrors what command-palette.tsx passes; the gate in
 * section 4 checks that it really does.
 */
const candidatesFor = (item, locale) => [displayed(item, locale), item.label];

const results = [];
for (const item of ITEMS) {
  for (const locale of LOCALES) {
    const label = displayed(item, locale);
    if (!label) {
      results.push({ item, locale, label: "", found: false, why: "no translation" });
      continue;
    }
    // THE QUERY IS WHAT SOMEBODY TYPES: the first word of the label they
    // can see, which is how a palette is actually used — nobody types
    // the whole name. For Chinese and Japanese, which have no spaces,
    // that is the first two characters.
    const hasSpaces = /\s/.test(label.trim());
    const query = hasSpaces ? label.trim().split(/\s+/)[0] : label.trim().slice(0, 2);
    const found =
      match.filterAndRankCandidates(
        ITEMS.map((i) => ({ item: i, candidates: candidatesFor(i, locale) })),
        query
      )[0]?.label === item.label ||
      match.filterAndRankCandidates(
        ITEMS.map((i) => ({ item: i, candidates: candidatesFor(i, locale) })),
        query
      ).some((i) => i.label === item.label);
    results.push({ item, locale, label, query, found });
  }
}

const byLocale = new Map(LOCALES.map((l) => [l, { hit: 0, total: 0 }]));
for (const r of results) {
  const b = byLocale.get(r.locale);
  b.total++;
  if (r.found) b.hit++;
}

console.log("\n  locale   reachable by the name on screen   of");
for (const l of LOCALES) {
  const b = byLocale.get(l);
  console.log(`  ${l.padEnd(8)} ${String(b.hit).padStart(10)}                  ${b.total}`);
}
const misses = results.filter((r) => !r.found);
console.log(
  `\n  ${results.length - misses.length} of ${results.length} (item x locale) pairs are reachable by their own displayed name.`
);
if (misses.length && misses.length <= 30) {
  for (const m of misses) console.log(`    ${m.locale}  ${m.item.label.padEnd(20)} "${m.label}"`);
}

// ---------------------------------------------------------------------
console.log("\n== 3. every language, not just a healthy total ==");
{
  const dead = LOCALES.filter((l) => byLocale.get(l).hit === 0);
  ok("no language is completely unable to reach any page by name",
    dead.length === 0, dead.join(", "));

  const perfect = LOCALES.filter((l) => byLocale.get(l).hit === byLocale.get(l).total);
  ok("every language reaches every one of its own pages",
    perfect.length === LOCALES.length,
    LOCALES.filter((l) => !perfect.includes(l))
      .map((l) => `${l}=${byLocale.get(l).hit}/${byLocale.get(l).total}`)
      .join(", "));
}

// ---------------------------------------------------------------------
console.log("\n== 4. the palette actually uses this seam ==");
{
  const palette = readFileSync("src/components/dashboard/command-palette.tsx", "utf8");
  ok("the palette imports the shared matcher",
    /from "@\/lib\/command-palette-match"/.test(palette),
    "a private copy in the component is how this drifts back");
  ok("...and no longer carries its own filterAndRankItems",
    !/function filterAndRankItems/.test(palette),
    "two matchers means the one this file measures is not the one that runs");

  // THE CANDIDATES MUST INCLUDE THE TRANSLATED LABEL. Without this
  // clause every number above is measurable while the component quietly
  // passes only item.label and the whole change is decorative.
  ok("...and passes the TRANSLATED label to it",
    /candidates:\s*\[\s*translatedLabel\(/.test(palette),
    "the component still matches on the raw English label");
  ok("...as well as the English one",
    /translatedLabel\(item\.label\)\s*,\s*item\.label/.test(palette),
    "dropping English swaps one language's blindness for another's");
}

// ---------------------------------------------------------------------
console.log("\n== 5. behaviour, not just wiring ==");
{
  const entries = [
    { item: "finance", candidates: ["Οικονομικά", "Finance"] },
    { item: "chat", candidates: ["Συνομιλία Ionexa", "Ionexa Chat"] },
  ];
  const find = (q) => match.filterAndRankCandidates(entries, q);

  ok("a Greek query reaches the Greek label", find("οικο")[0] === "finance");
  ok("an English query still reaches the same item", find("fin")[0] === "finance");
  // GREEKLISH, because a Greek user on an English keyboard is the case
  // lib/text/unicode-patterns.ts exists for, and a matcher that skips it
  // is the "wired at the one place somebody needed it" shape.
  ok("greeklish reaches it too", find("oikonomika").includes("finance"));
  ok("an accent-stripped Greek query still matches", find("οικονομικα")[0] === "finance");
  ok("a query matching nothing returns nothing", find("zzzz").length === 0);
  ok("an empty query returns everything", find("   ").length === entries.length);
  // RANKING: a substring hit must beat a subsequence hit, or the useful
  // answer sorts below the accidental one.
  const ranked = match.filterAndRankCandidates(
    [
      { item: "far", candidates: ["Form Submissions"] },
      { item: "near", candidates: ["Finance"] },
    ],
    "fin"
  );
  ok("a substring hit outranks a subsequence hit", ranked[0] === "near", ranked.join(" > "));
}

console.log(`\n${failures.length === 0 ? "PASSED" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
