// Does search find "Καφές" when you type "καφε"?
//
// WHAT WAS WRONG. Nine list components all did
// `haystack.toLowerCase().includes(query.toLowerCase())`, and the server did
// `.ilike(column, "%q%")`. Both fold case and nothing else. Greek writes
// accents in lower case ("καφές") and drops them in upper case ("ΚΑΦΕΣ"), so
// one word typed two ordinary ways did not match itself, and neither matched
// an unaccented query.
//
// This file covers the CLIENT half and the wiring. The SERVER half runs
// against a real PostgreSQL in accent-search.itest.mjs — `ilike` semantics
// are the database's, not something to assert from memory.
//
// Run: node scripts/tests/accent-search.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

const search = await loadTs("src/lib/text/search-match.ts");

console.log("accent-search");

// ---------------------------------------------------------------------
console.log("\n== 1. the brief's own case: \"καφε\" ==");
// ---------------------------------------------------------------------
const HAYSTACKS = ["Καφές", "ΚΑΦΕΣ", "καφές", "Καφε Bar", "ΚΑΦΈΣ"];

// BEFORE: the exact expression the components used.
const beforeHits = HAYSTACKS.filter((h) => h.toLowerCase().includes("καφε".toLowerCase()));
check("BEFORE — toLowerCase().includes() found only the unaccented ones", beforeHits, ["ΚΑΦΕΣ", "Καφε Bar"]);

const afterHits = HAYSTACKS.filter((h) => search.matchesSearch(h, "καφε"));
check("AFTER — every form is found", afterHits, HAYSTACKS);

// And from the other direction: an accented query finding unaccented text.
check('"καφές" finds "ΚΑΦΕΣ"', search.matchesSearch("ΚΑΦΕΣ", "καφές"), true);
check('"ΚΑΦΕΣ" finds "καφές"', search.matchesSearch("καφές", "ΚΑΦΕΣ"), true);
check('final sigma: "καφές" finds "Καφές"', search.matchesSearch("Καφές", "καφές"), true);

// ---------------------------------------------------------------------
console.log("\n== 2. the same defect in other languages ==");
// ---------------------------------------------------------------------
for (const [haystack, query] of [
  ["Müller GmbH", "muller"],
  ["Crème brûlée", "creme brulee"],
  ["Señor Álvarez", "senor alvarez"],
  ["Français, déjà", "francais, deja"],
  ["ΑΘΉΝΑ", "αθηνα"],
]) {
  check(`"${query}" finds "${haystack}"`, search.matchesSearch(haystack, query), true);
}

// It still has to be a search, not a match-everything.
check("unrelated text is not matched", search.matchesSearch("Τσάι", "καφε"), false);
check("an empty query matches everything", search.matchesSearch("anything", "   "), true);

// ---------------------------------------------------------------------
console.log("\n== 3. ordering uses the reader's locale ==");
// ---------------------------------------------------------------------
{
  // Greek alphabetical order is α β γ δ ε ζ η θ … so this should read
  // αύριο, έξι, ζωή, ήλιος. The precomposed accented vowels live in a
  // different Unicode block from their plain forms (ή is U+03AE, ζ is
  // U+03B6), so comparing code units shuffles them arbitrarily.
  const words = ["ζωή", "ήλιος", "έξι", "αύριο"];
  const correct = ["αύριο", "έξι", "ζωή", "ήλιος"];

  const naive = [...words].sort();
  check("BEFORE — default sort gets Greek order wrong", naive, ["έξι", "ήλιος", "αύριο", "ζωή"]);
  check("BEFORE — …and that is not the alphabet", naive.join() === correct.join(), false);

  const cmp = search.textComparator("el");
  check("AFTER — the collator gets it right", [...words].sort(cmp), correct);

  // Capitals too: Άλφα must follow Αβγό, not precede it.
  check("AFTER — Αβγό before Άλφα", ["Άλφα", "Αβγό"].sort(cmp), ["Αβγό", "Άλφα"]);
  check("BEFORE — code units had it backwards", ["Άλφα", "Αβγό"].sort(), ["Άλφα", "Αβγό"]);
}
{
  // Numeric-aware, so a list of "Item 2 / Item 10" reads correctly.
  const cmp = search.textComparator("en");
  check("Item 2 sorts before Item 10", cmp("Item 2", "Item 10") < 0, true);
  // Case- and accent-insensitive ordering, matching what search does.
  check("case is not an ordering signal", cmp("apple", "Apple"), 0);
}
{
  // A malformed locale must degrade, not throw — locale can come from a URL.
  let threw = false;
  try {
    search.textComparator("not a locale!!")("a", "b");
  } catch {
    threw = true;
  }
  check("a bad locale tag does not throw", threw, false);
}

// ---------------------------------------------------------------------
console.log("\n== 4. no list component still does the broken comparison ==");
// ---------------------------------------------------------------------
// Fixing eight or nine call sites is worth nothing if the tenth is added
// next week. This walks the whole component tree rather than the list I
// happened to find.
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(path.join(ROOT, "src"))) {
  const source = readFileSync(file, "utf8");
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
  // `.toLowerCase()` feeding a substring test IS the defect. Other uses of
  // toLowerCase (comparing an email to an allowlist, matching an HTML tag)
  // are ASCII by nature and are not what this is about — so the pattern is
  // deliberately narrow: lower-casing immediately followed by a containment
  // check on the same expression.
  for (const m of code.matchAll(/\.toLowerCase\(\)\s*\.\s*(includes|indexOf|startsWith|endsWith)\s*\(/g)) {
    const line = code.slice(0, m.index).split("\n").length;
    offenders.push(`${path.relative(ROOT, file)}:${line}`);
  }
}

// lib/admin.ts compares an email against a configured allowlist and
// lib/website-html-extract.ts finds "</html>" in generated markup — both
// pure-ASCII by construction, and both are `X.includes(y.toLowerCase())`
// rather than the broken shape, so neither appears here. If either ever
// does, that is a real finding and this list should not be widened to hide
// it.
check("no component compares user text with toLowerCase().includes()", offenders, []);

// THE SHAPE THIS MISSES, and the shape command-palette.tsx,
// memory-search.tsx and lib/chat/entity-mentions.ts actually had:
//
//   const query = rawQuery.trim().toLowerCase();   // lowered into a variable
//   ...
//   const index = label.indexOf(query);             // compared later, on a
//                                                     // DIFFERENT expression
//
// `.toLowerCase()` and `.includes(`/`.indexOf(` are not adjacent in the
// source text — there is an assignment, sometimes a whole function, in
// between — so the chained-expression regex above never sees them as
// connected. All three were genuine: a Greek "καφε" found nothing in
// "Καφές" through the app's own command palette, the AI Memory search
// box, and the "you already logged this" detector chat relies on to
// attach linked entities. Fixing three call sites is worth nothing if a
// fourth is written the same way next month, which is what this closes.
//
// TWO SUB-SHAPES, both real:
//   A. the lowered value is bound to a name, then that name is later the
//      receiver OR the argument of includes/indexOf/startsWith/endsWith.
//   B. the lowering happens INLINE, as the argument to the comparison —
//      `haystack.includes(needle.toLowerCase())` — which is exactly
//      entity-mentions.ts's shape and is invisible to shape A's variable
//      tracking because there is no variable.
{
  const COMPARE_METHODS = "includes|indexOf|startsWith|endsWith";
  const indirectOffenders = [];

  for (const file of walk(path.join(ROOT, "src"))) {
    const rel = path.relative(ROOT, file);
    const source = readFileSync(file, "utf8");
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join("\n");

    // Shape B: toLowerCase() called INLINE as an argument to the comparison.
    for (const m of code.matchAll(new RegExp(`\\.(${COMPARE_METHODS})\\([^)]*\\.toLowerCase\\(\\)[^)]*\\)`, "g"))) {
      const line = code.slice(0, m.index).split("\n").length;
      indirectOffenders.push(`${rel}:${line} (inline .toLowerCase() argument)`);
    }

    // Shape A: a name bound to `<expr>.toLowerCase()`, later used as
    // either side of a comparison call anywhere else in the same file.
    const lowered = new Set();
    for (const m of code.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*\.toLowerCase\(\)/g)) {
      lowered.add(m[1]);
    }
    for (const name of lowered) {
      const asReceiver = new RegExp(`\\b${name}\\.(${COMPARE_METHODS})\\(`);
      const asArgument = new RegExp(`\\.(${COMPARE_METHODS})\\([^)]*\\b${name}\\b[^)]*\\)`);
      if (asReceiver.test(code) || asArgument.test(code)) {
        indirectOffenders.push(`${rel}: "${name}" (lowered into a variable, compared elsewhere)`);
      }
    }
  }

  // Each entry below was checked, not assumed — the two Smart Search
  // helpers this same sweep found (lib/entity-link-suggestions.ts,
  // mission-detail.tsx's looksLikeWebsiteStep) were GENUINE instances of
  // this bug and were fixed rather than excluded. What is left compares
  // against a FIXED set of tokens the app itself defines, never against
  // another piece of user-typed text — so there is nothing for either
  // side to fail to fold consistently WITH:
  //
  //   lib/network/offline.ts     an error MESSAGE from the fetch API
  //                              ("failed to fetch") — machine-generated
  //                              ASCII, not user text.
  //   lib/files/limits.ts        the literal "unlimited".
  //   lib/admin.ts               an email against the admin allowlist —
  //                              already excluded above for the chained
  //                              shape; the inline-argument shape
  //                              (`.includes(email.toLowerCase())`) is
  //                              the same comparison, caught by the
  //                              other detector, and excluded here too.
  //   components/ideas/idea-row.tsx
  //   lib/trading-pattern.ts     a free-text field classified against a
  //                              small set of hardcoded ENGLISH keywords
  //                              ("pursue"/"kill", "win"/"loss") — the
  //                              field's own placeholder says "win /
  //                              loss" in English. Folding accents would
  //                              not make a Greek "Ζημιά" match the
  //                              English word "loss"; that is a
  //                              different, out-of-scope problem
  //                              (English-only heuristic classifier),
  //                              not an accent-folding one.
  //   lib/import/coerce.ts       coerceEnum() against ENUM_SYNONYMS —
  //   lib/import/paste.ts        every option and synonym is a fixed
  //                              ASCII trading/accounting term
  //                              ("buy", "tp", "stop loss").
  //   lib/publishing/subdomain.ts  DNS subdomains cannot contain
  //                              accented characters at all;
  //                              suggestSubdomain() already NFD-strips
  //                              combining marks on the way to one, so
  //                              accent-folding a value that can only
  //                              ever be a-z0-9- is a no-op wearing a
  //                              comment.
  //
  // This list should shrink only when a case is genuinely not user text,
  // never to silence a real one.
  const ASCII_BY_CONSTRUCTION = [
    "src/lib/network/offline.ts",
    "src/lib/files/limits.ts",
    "src/lib/admin.ts",
    "src/components/ideas/idea-row.tsx",
    "src/lib/trading-pattern.ts",
    "src/lib/import/coerce.ts",
    "src/lib/import/paste.ts",
    "src/lib/publishing/subdomain.ts",
  ];
  const realOffenders = indirectOffenders.filter(
    (o) => !ASCII_BY_CONSTRUCTION.some((f) => o === f || o.startsWith(f + ":"))
  );
  check("no component lower-cases user text into a variable and compares it elsewhere", realOffenders, []);

  // The gate has to be able to go red on exactly what it replaced.
  const WAS_COMMAND_PALETTE = `const query = rawQuery.trim().toLowerCase();
  for (const item of items) {
    const label = item.label.toLowerCase();
    const index = label.indexOf(query);
  }`;
  const waslowered = new Set();
  for (const m of WAS_COMMAND_PALETTE.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*\.toLowerCase\(\)/g)) waslowered.add(m[1]);
  const caught = [...waslowered].some(
    (name) => new RegExp(`\\b${name}\\.(${COMPARE_METHODS})\\(`).test(WAS_COMMAND_PALETTE)
  );
  check("the gate catches the exact command-palette shape it replaced", caught, true);
}

// The INDIRECT shape, which the check above cannot see: a helper that
// builds a haystack out of several fields and lower-cases the result, with
// the containment test in a different expression. That is exactly how
// ideas-list.tsx and generic-list.tsx hid their copies of this bug from the
// first sweep — ideas-list was caught by the SortToggle check in section 6,
// by accident, which is not a way to find bugs.
//
// The signature is `.join(...)` immediately followed by `.toLowerCase()`:
// concatenating several fields and lower-casing the result is a search key
// and nothing else. A single-value `.toLowerCase()` (a file extension, an
// email address) is a different, legitimate thing and is not flagged.
{
  const SEARCH_KEY = /\.join\([^)]*\)\s*\n?\s*\.toLowerCase\(\)/;
  const indirect = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    if (SEARCH_KEY.test(readFileSync(file, "utf8"))) indirect.push(path.relative(ROOT, file));
  }
  check("no helper builds a search haystack by lower-casing it", indirect, []);

  // The gate has to be able to go red. This is the code that was in
  // ideas-list.tsx and generic-list.tsx before this change, verbatim.
  const WAS_BROKEN = `function searchableText(idea) {
  return fields
    .filter((value) => Boolean(value))
    .join(" ")
    .toLowerCase();
}`;
  check("the gate catches the exact code it replaced", SEARCH_KEY.test(WAS_BROKEN), true);
}

// ---------------------------------------------------------------------
console.log("\n== 5. the shared helper is actually the one being used ==");
// ---------------------------------------------------------------------
const WIRED = [
  "src/components/modules/generic-list.tsx",
  "src/components/agents/agents-workspace.tsx",
  "src/components/mission/mission-list.tsx",
  "src/components/publishing/published-sites-list.tsx",
  "src/components/integrations/integrations-list.tsx",
  "src/components/website-builder/website-builder-workspace.tsx",
  "src/components/favorites/favorites-list.tsx",
  "src/components/documents/documents-list.tsx",
  "src/components/files/files-workspace.tsx",
  "src/components/ideas/ideas-list.tsx",
];
for (const rel of WIRED) {
  const source = readFileSync(path.join(ROOT, rel), "utf8");
  check(
    `${rel.replace("src/components/", "")} imports and calls matchesSearch`,
    source.includes('from "@/lib/text/search-match"') && /matchesSearch\(/.test(source),
    true
  );
}

// ---------------------------------------------------------------------
console.log("\n== 6. alphabetical sort is offered and is locale-aware ==");
// ---------------------------------------------------------------------
{
  const hook = readFileSync(path.join(ROOT, "src/lib/use-sort-and-paginate.ts"), "utf8");
  check("the hook exposes az/za", /"az"\s*\|\s*"za"/.test(hook), true);
  check("the hook orders through the shared collator", hook.includes("textComparator"), true);
  check("the hook reads the user's locale", hook.includes("useLocale"), true);

  const toggle = readFileSync(path.join(ROOT, "src/components/sort-toggle.tsx"), "utf8");
  check("the toggle can render az/za", toggle.includes('"az"') && toggle.includes('"za"'), true);
}
{
  // Every list that shows a sort control must actually pass a label, or the
  // A–Z button would be missing where a user expects it.
  const SORTED_LISTS = [
    "src/components/modules/generic-list.tsx",
    "src/components/agents/agents-workspace.tsx",
    "src/components/mission/mission-list.tsx",
    "src/components/publishing/published-sites-list.tsx",
    "src/components/documents/documents-list.tsx",
    "src/components/website-builder/website-builder-workspace.tsx",
    "src/components/ideas/ideas-list.tsx",
  ];
  const missing = SORTED_LISTS.filter((rel) => {
    const s = readFileSync(path.join(ROOT, rel), "utf8");
    return !(s.includes("alphabetical") && /useSortAndPaginate\([\s\S]{0,220}?=>/.test(s));
  });
  check("every list with a SortToggle supplies a label accessor", missing, []);

  // …and no list renders a SortToggle without forwarding the flag, which
  // would silently drop A–Z from that one page.
  const unforwarded = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    const s = readFileSync(file, "utf8");
    for (const m of s.matchAll(/<SortToggle\b[^>]*>/g)) {
      if (!m[0].includes("alphabetical")) unforwarded.push(path.relative(ROOT, file));
    }
  }
  check("every <SortToggle> forwards `alphabetical`", unforwarded, []);
}

// ---------------------------------------------------------------------
console.log("\n== 7. the sort labels exist in all ten languages ==");
// ---------------------------------------------------------------------
{
  const langs = readdirSync(path.join(ROOT, "messages")).filter((f) => f.endsWith(".json"));
  const missing = langs.filter((f) => {
    const j = JSON.parse(readFileSync(path.join(ROOT, "messages", f), "utf8"));
    return !j?.module?.sort?.az || !j?.module?.sort?.za;
  });
  check(`module.sort.az / .za present in all ${langs.length} locales`, missing, []);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
