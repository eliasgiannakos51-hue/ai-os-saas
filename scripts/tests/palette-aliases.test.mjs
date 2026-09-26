// THE WORDS PEOPLE TYPE, AND WHETHER THEY REACH ANYTHING.
//
// command-palette-language.test.mjs measures whether every item is
// reachable BY ITS OWN DISPLAYED NAME. That was the right question for
// the bug it was written for — the palette rendered a translated label
// and matched the English one — and it is the wrong question for the
// next one, because the query it forms is the first word of the label
// it is testing. The rule is "a person can find the page"; the check is
// "the page's name matches the page's name". docs/shapes.md calls that
// shape: the rule targets the shape, the check anchors on the example.
//
// THE REPORT IT MISSED, from production on 2026-09-19. «θέλω να δω τα
// έσοδά μου» and «οικο». «οικο» reached «Οικονομικά» and always did —
// the fix was real. «έσοδα» reached nothing in any language, because
// nothing is called that: the module is «Οικονομικά», its fields are
// Ποσό, Περιγραφή, Τύπος. And a third of the sidebar is a friendly
// phrase rather than a noun — «Δες τι λένε τα νούμερα» for analytics,
// «Ψάξ' το καλά» for deep research — so the label is the one word a
// person is least likely to have in mind.
//
// THE QUERIES HERE ARE NOT DERIVED FROM THE LABELS. They come from
// lib/palette-aliases.ts, which is a list of what people call these
// things, written by hand. That is the whole point: a gate whose
// queries come out of the thing it is testing can only prove the file
// equals itself.
//
// Run: node scripts/tests/palette-aliases.test.mjs
import { readFileSync } from "node:fs";
import { groupBlocks, itemChunks } from "./lib/sidebar-source.mjs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const keys = await loadTs("src/lib/sidebar-label-keys.ts");
const match = await loadTs("src/lib/command-palette-match.ts");
const aliases = await loadTs("src/lib/palette-aliases.ts");

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const lookup = (obj, path) => path.split(".").reduce((a, k) => (a ?? {})[k], obj);

// THE REAL REGISTRY, parsed out of the file the sidebar is built from —
// not a list written here, which would be one more thing equalling
// itself.
//
// AND PUT THROUGH THE PALETTE'S OWN FILTER, which it was not until
// 2026-09-26. `visibleGroups` is what components/dashboard/command-palette.tsx
// flattens, and it strips `notBuilt` and `retired`; this file took every
// `label:` in the config instead, so its registry was everything the
// file mentions. That cost nothing while four rows were held and broke
// the moment fifty-five were: "email" ranked the held Email row under
// Connect above Integrations, "slack" the same, "account" ranked a held
// Accounting above Settings — three failures naming rows the palette
// has never been able to offer. A gate that searches a larger registry
// than the product does reports collisions the product cannot have, and
// would equally MISS one that only appears once a row goes live.
const navSource = readFileSync("src/lib/sidebar-nav.ts", "utf8");
const { visibleGroups } = await loadTs("src/lib/sidebar-visibility.ts");
const offered = visibleGroups(
  groupBlocks(navSource).map((g) => ({
    heading: g.heading,
    items: itemChunks(g.body).map((i) => ({
      href: i.literalHref ?? i.constantHref ?? "?",
      label: i.head.match(/label:\s*"([^"]+)"/)?.[1] ?? null,
      ...(i.hidden ? { hidden: true } : {}),
      ...(i.notBuilt ? { notBuilt: true } : {}),
      ...(i.ownerOnly ? { ownerOnly: true } : {}),
      ...(i.retired ? { retired: "declared" } : {}),
    })),
  })),
  // The owner sees the most, so this is the widest registry the palette
  // can have — a collision that exists for anybody exists here.
  true
).flatMap((g) => g.items.map((i) => i.label));
const LABELS = offered.filter((l) => l && keys.ITEM_LABEL_KEYS[l]);
ok(`the palette registry is the palette's (${LABELS.length} of ${(navSource.match(/label:\s*"/g) ?? []).length} labels in the config)`,
  LABELS.length >= 20 && LABELS.length < (navSource.match(/label:\s*"/g) ?? []).length,
  "either the filter found nothing, or it stripped nothing and this is the whole config again");

const entriesFor = (locale) =>
  LABELS.map((label) => {
    const key = keys.ITEM_LABEL_KEYS[label];
    return {
      item: { label, key },
      candidates: [
        lookup(messages[locale], `sidebar.items.${key}`) ?? label,
        label,
        ...aliases.aliasesFor(key, locale),
      ],
    };
  });

// ---------------------------------------------------------------------
console.log("== 1. the table names real items, both ways ==");
const itemKeys = new Set(LABELS.map((l) => keys.ITEM_LABEL_KEYS[l]));
const aliasKeys = Object.keys(aliases.PALETTE_ALIASES);
ok(`the table is not empty (${aliasKeys.length} items carry aliases)`,
  aliasKeys.length >= 20,
  `${aliasKeys.length} — an empty table satisfies every check below`);
const orphans = aliasKeys.filter((k) => !itemKeys.has(k));
ok("every alias key is an item the sidebar actually renders",
  orphans.length === 0,
  `not in the sidebar: ${orphans.join(", ")}`);
ok("the covered locales are exactly the ones the file claims",
  aliases.aliasLocales().join(",") === "el,en",
  `covers ${aliases.aliasLocales().join(", ")} — update lib/palette-aliases.ts's own paragraph if this changed`);

// ---------------------------------------------------------------------
console.log("\n== 2. every alias reaches its own item, FIRST ==");
// FIRST, not "somewhere in the list". A word that reaches the right page
// on line nine has not reached it.
let tried = 0;
const wrong = [];
for (const locale of aliases.aliasLocales()) {
  const entries = entriesFor(locale);
  for (const [key, perLocale] of Object.entries(aliases.PALETTE_ALIASES)) {
    for (const word of perLocale[locale] ?? []) {
      tried += 1;
      const hits = match.filterAndRankCandidates(entries, word);
      if (hits[0]?.key !== key) {
        wrong.push(`${locale} "${word}" -> ${hits[0]?.key ?? "(nothing)"}, wanted ${key}`);
      }
    }
  }
}
ok(`aliases were actually tried (${tried})`, tried >= 150, `${tried} — nothing tried proves nothing`);
ok("every alias reaches the item it belongs to, ranked first",
  wrong.length === 0,
  wrong.slice(0, 12).join("\n        "));

// ---------------------------------------------------------------------
console.log("\n== 3. the two queries from production, by name ==");
// The literal text the owner typed on 2026-09-19. A regression here is
// the report coming back.
for (const [locale, query, wantKey] of [
  ["el", "θέλω να δω τα έσοδά μου", "finance"],
  ["el", "οικο", "finance"],
  ["el", "έσοδα", "finance"],
  ["en", "show me my revenue", "finance"],
]) {
  const hits = match.filterAndRankCandidates(entriesFor(locale), query);
  ok(`${locale}: "${query}" reaches ${wantKey}`,
    hits[0]?.key === wantKey,
    `reached ${hits[0]?.key ?? "(nothing)"}`);
}

// ---------------------------------------------------------------------
console.log("\n== 4. and a matcher that reaches everything fails here ==");
// THE HOLE THIS SECTION EXISTS FOR. Section 2 of
// command-palette-language.test.mjs printed 520 of 520 on 2026-09-19
// with the matcher replaced by `return entries.map((e) => e.item)` —
// every item reachable by its own name is trivially true when every
// item is reachable by anything. A ratio needs a negative control in
// the same loop that produces it.
for (const locale of LOCALES) {
  const entries = entriesFor(locale);
  const nonsense = match.filterAndRankCandidates(entries, "qzxvwkjhgf");
  ok(`${locale}: a query nothing is named after reaches nothing`,
    nonsense.length === 0,
    `${nonsense.length} item(s) matched "qzxvwkjhgf"`);
}

// ---------------------------------------------------------------------
console.log("\n== 5. the sentence fallback is bounded ==");
// One word, the longest, and only when the whole query found nothing.
// Unbounded, a sentence would union its way to half the sidebar.
ok("a short word is never tried alone", match.wordsByLength("τι να δω") .length === 0,
  JSON.stringify(match.wordsByLength("τι να δω")));
ok("a single word is not split into a fallback of itself",
  match.wordsByLength("έσοδα").length === 0);
ok("words come back longest first",
  match.wordsByLength("show me my revenue now")[0] === "revenue",
  JSON.stringify(match.wordsByLength("show me my revenue now")));
{
  const entries = entriesFor("el");
  // A SENTENCE NAMING THREE THINGS WANTS THREE ANSWERS. The first
  // version of the fallback returned the longest word's pages only, and
  // measured against the real catalogue that returns Products alone for
  // this sentence — the two other things the user named are dropped.
  const three = match.filterAndRankCandidates(
    entries,
    "θέλω να δω τα έσοδα και τα προϊόντα και τις πωλήσεις μου"
  );
  const labels = three.map((i) => i.key);
  ok("a sentence naming three things reaches all three",
    ["finance", "products", "sales"].every((k) => labels.includes(k)),
    labels.join(", "));
  ok("...longest word first, so the order is predictable",
    labels[0] === "products",
    labels.join(", "));
  // AND THE BOUND. Ordinary words reach nothing because the only things
  // a word can match are page names and the alias table — so a sentence
  // of ordinary words is still nothing, and a sentence about three
  // things is three, not the whole sidebar.
  ok("a sentence naming nothing reaches nothing",
    match.filterAndRankCandidates(entries, "τι ώρα είναι σήμερα").length === 0,
    match.filterAndRankCandidates(entries, "τι ώρα είναι σήμερα").map((i) => i.key).join(", "));
  ok(`at most ${match.MAX_FALLBACK_WORDS} words are ever tried`,
    match.MAX_FALLBACK_WORDS <= 8 &&
      match.wordsByLength("alpha bravo charlie delta echo foxtrot golf hotel india juliet").length > match.MAX_FALLBACK_WORDS);
}

// ---------------------------------------------------------------------
console.log("\n== 6. coverage, printed rather than assumed ==");
// English and Greek only. Eight locales have none, and an item with no
// alias is exactly as reachable as it was before — by its own name.
for (const locale of LOCALES) {
  const covered = Object.values(aliases.PALETTE_ALIASES).filter((e) => (e[locale] ?? []).length > 0).length;
  const words = Object.values(aliases.PALETTE_ALIASES).reduce((n, e) => n + (e[locale] ?? []).length, 0);
  console.log(`  ${locale}   ${String(covered).padStart(3)} of ${LABELS.length} items   ${String(words).padStart(4)} words`);
}
console.log(
  "\n  Hand-written 2026-09-19, English and Greek only. The other eight\n" +
  "  locales have none — an item with no alias in the reader's language\n" +
  "  is reachable exactly as before, by its own displayed name and by\n" +
  "  its English one. Inventing synonyms in six more languages to make\n" +
  "  this table look finished is how a catalogue starts lying."
);

// ---------------------------------------------------------------------
console.log("\n== 7. and the palette actually uses this seam ==");
// Everything above runs the matcher directly. If the component does not
// pass the aliases, all of it is true about a function nobody calls —
// the same reason command-palette-language.test.mjs has its own
// section 4.
{
  const palette = readFileSync("src/components/dashboard/command-palette.tsx", "utf8");
  ok("the palette imports the alias table", /from "@\/lib\/palette-aliases"/.test(palette));
  ok("...and passes the aliases as candidates alongside both labels",
    /candidates: \[[\s\S]{0,200}aliasesFor\(ITEM_LABEL_KEYS\[item\.label\][\s\S]{0,40}locale\)/.test(palette),
    palette.slice(palette.indexOf("candidates: ["), palette.indexOf("candidates: [") + 220));
  ok("...for the READER's locale, not a fixed one",
    /const locale = useLocale\(\);/.test(palette) && /\[query, isOwner, translatedLabel, locale\]/.test(palette));
}

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`ALL PASS: ${pass} passed, 0 failed`);
