#!/usr/bin/env node
/*
 * FOR EVERY MATCHER: IS ITS SOURCE WRITTEN FOR READING, OR FOR MATCHING?
 *
 * THE QUESTION IS THE OWNER'S, and it generalises two defects this
 * repository found in the same week:
 *
 *   - The module vocabulary was built from titles and field labels, which
 *     are NOUNS, because that is how an interface is named. 12 of 130
 *     verb-led questions reached their module; five languages scored zero.
 *   - The command palette RENDERED a translated label and MATCHED the
 *     untranslated English one. 168 of 490 (item x locale) pairs were
 *     reachable by the name on the screen; Greek 2 of 49, Arabic 0 of 49.
 *
 * Both are the same mistake. A string written to be READ and a string
 * written to be MATCHED are different strings, and neither defect is
 * visible when you review the list — every entry in both lists was
 * correct. What was wrong was where the list came from.
 *
 * So this file names EVERY surface in the product that matches a user's
 * words against something, says which kind of source it draws on, and
 * checks the property that makes that source safe. A new matcher added
 * without an entry here is the next instance of the shape.
 *
 * Run: node scripts/tests/match-sources.test.mjs
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

// ---------------------------------------------------------------------
console.log("== 1. the command palette matches what it displays ==");
{
  // WRITTEN FOR READING. lib/sidebar-nav.ts's `label` is an English
  // string that doubles as a state key; the palette renders it through
  // messages/*.json. The fix is not to translate the key — it is to give
  // the matcher every name the entry answers to.
  const palette = readFileSync("src/components/dashboard/command-palette.tsx", "utf8");
  ok("the palette hands the matcher the label it renders",
    /candidates:\s*\[\s*translatedLabel\(item\.label\),\s*item\.label\s*\]/.test(palette),
    "matching the raw English label is the defect this file exists for");
  ok("...and has no private matcher of its own",
    !/function filterAndRankItems/.test(palette));
  // The full cross-product lives in command-palette-language.test.mjs;
  // this is the wiring claim, which is the one that regresses silently.
}

// ---------------------------------------------------------------------
console.log("\n== 2. canned answers match phrasings, not titles ==");
{
  // WRITTEN FOR MATCHING, and it is the one surface that was right from
  // the start. help_articles.triggers is per-locale and the migration
  // says what it is for in as many words: "the phrasings a user actually
  // types". This checks that the sentence is still there AND that the
  // column is still per-locale, because either half alone can rot.
  const mig = readFileSync("supabase/migrations/20260816_help_articles.sql", "utf8");
  // includes(), not a regex, and for a specific reason: a regex literal
  // whose last word is followed by a slash and then a method call reads
  // as a directory-and-file to scripts/scan-self-claims.mjs, which
  // reported the tail of the pattern below as a comment naming a file
  // that is not there. The scanner was right about the shape and wrong
  // about the meaning, and the cheapest fix is to stop writing the shape
  // — including in this comment, which said it once and went red again.
  ok("triggers are documented as the phrasings a user types",
    mig.includes("phrasings a user actually types"),
    "if this sentence goes, the next author fills the column with titles");
  ok("...and are per-locale, so a French user is not matched on Greek",
    mig.includes("`triggers` is per-locale") && mig.includes("triggers text[]"));

  // AND THE MATCHER STILL READS THEM. A column written for matching that
  // nothing matches on is the same defect from the other end.
  const kb = readFileSync("src/lib/support/knowledge-base.ts", "utf8");
  ok("the matcher scores against triggers", /for \(const trigger of article\.triggers\)/.test(kb));
}

// ---------------------------------------------------------------------
console.log("\n== 3. the module classifier's vocabulary carries verbs ==");
{
  // WRITTEN FOR READING, and fixed on 2026-09-07. Titles and field
  // labels are nouns; `verbs` is the field that exists because of it.
  const syn = await loadTs("src/lib/ai/module-synonyms.ts");
  const slugs = Object.keys(syn.MODULE_SYNONYMS);
  ok("every module has a verbs list", slugs.every((s) => Array.isArray(syn.MODULE_SYNONYMS[s].verbs)),
    slugs.filter((s) => !Array.isArray(syn.MODULE_SYNONYMS[s].verbs)).join(", "));
  const empty = slugs.filter((s) => syn.MODULE_SYNONYMS[s].verbs.length === 0);
  ok("...and none of them is empty", empty.length === 0, empty.join(", "));
  // A TERM THAT LIVES ONLY IN `verbs`, which the first draft got wrong.
  // It asserted on "ξόδεψα", and that word is in finance's `primary` —
  // it was added there the day before the `verbs` field existed. So the
  // check passed with synonymsFor returning primary alone, which is
  // exactly the regression it was written to catch. Its own mutation
  // proved it inert.
  const verbsOnly = syn.MODULE_SYNONYMS.finance.verbs.find(
    (v) => !syn.MODULE_SYNONYMS.finance.primary.includes(v)
  );
  ok("finance has a verb that is not already a noun", Boolean(verbsOnly),
    "every verb duplicates a primary term, so the check below cannot fail");
  ok("synonymsFor emits the verbs, not just the nouns",
    Boolean(verbsOnly) && syn.synonymsFor("finance").includes(verbsOnly),
    `"${verbsOnly}" is in MODULE_SYNONYMS.finance.verbs and not in synonymsFor("finance")`);
  // The 13x10 measurement is module-verbs.test.mjs. This is the wiring.
}

// ---------------------------------------------------------------------
console.log("\n== 4. the search index matches the user's own words ==");
{
  // NEITHER, AND THAT IS WHY IT IS FINE. search_index is fed by triggers
  // on the user's own tables — the title and body of rows THEY wrote —
  // so there is no interface text in the matching path at all. Recorded
  // here so the absence is a finding rather than a gap in the list.
  const mig = readFileSync("supabase/migrations/20260824000000_unified_search.sql", "utf8");
  const specs = [...mig.matchAll(/\['([a-z_]+)','[a-z]+'/g)].map((m) => m[1]);
  ok("the index is fed from real tables", specs.length >= 10, `${specs.length} tables`);
  ok("...and they are the user's own content, not UI strings",
    specs.every((t) => t !== "sidebar" && !t.includes("label") && !t.includes("message")),
    specs.join(", "));

  // THE ONE THING THAT IS NOT FINE, and it is a different axis: help
  // articles are one row per (slug, locale) — see the 20260816 migration
  // — and the index carries NO locale column, so nothing filters them to
  // the reader's language. A Greek reader can be handed the Portuguese
  // copy of the same article, and there are ten copies of every article
  // competing for the same query.
  //
  // NOT FIXED HERE: the fix is a locale column on search_index plus a
  // filter in search_all, which is a migration, and this round did not
  // add one. Recorded in docs/v5-list.md as item 6b so it is a tracked
  // number rather than a comment. This check exists to go RED the day
  // somebody adds the column, so the note above cannot outlive the fact.
  const indexed = specs.includes("help_articles");
  const hasLocale = /\blocale\b/.test(mig);
  ok("help articles are indexed with no locale filter, and this is still true",
    indexed && !hasLocale,
    hasLocale
      ? "search_index now mentions a locale — if it is filtered, delete this check and the v5-list entry"
      : "help_articles left the index; update this check");
}

// ---------------------------------------------------------------------
console.log("\n== 5. no matcher was added without an entry above ==");
{
  // THE LIST IS THE POINT. Four surfaces are named here; a fifth that
  // matches user words against something and is not in this file is the
  // next instance of the shape, and nobody will notice it by reading.
  //
  // Counted by the one thing every such surface does: fold a user's
  // words with the shared fold before comparing them. A matcher that
  // does not do that has a bigger problem than this file.
  const { execSync } = await import("node:child_process");
  const out = execSync(
    "grep -rl 'normalizeForSearch\\|foldForMatch' src/lib src/components src/app --include=*.ts --include=*.tsx || true",
    { encoding: "utf8" }
  );
  const users = out.split("\n").filter(Boolean);

  // The files that MATCH, as opposed to the ones that merely fold (the
  // fold is also used for de-duplication and for display normalisation).
  // Each name below is accounted for in a section above, or is the fold
  // itself, or is a list filter whose source is the user's own rows.
  const ACCOUNTED = new Set([
    "src/lib/text/unicode-patterns.ts",        // the fold itself
    "src/lib/text/search-match.ts",            // the fold's list-filter wrapper
    "src/lib/command-palette-match.ts",        // section 1
    "src/lib/support/knowledge-base.ts",       // section 2
    "src/lib/ai/module-relevance.ts",          // section 3
    "src/lib/ai/module-synonyms.ts",           // section 3
    "src/components/dashboard/command-palette.tsx", // section 1
    // The free ambiguity detector. It matches a user's words against cue
    // lists that ARE written for matching — phrasings a person types, in
    // all ten languages — and the whole cross-product is measured by
    // scripts/tests/ambiguity.test.mjs, which is a better answer to this
    // file's question than a section here restating it would be.
    //
    // It arrived unaccounted for and this ratchet caught it on the build
    // that introduced it, which is what the ratchet is for.
    "src/lib/ai/ambiguity.ts",
    // The free producer router (redesign phase 1). Same case as the line
    // above and answered the same way: its cues are phrasings a person
    // TYPES, in four scripts, and scripts/tests/producer-routes.test.mjs
    // runs thirty of them and prints every result rather than asserting
    // an accuracy. It also arrived unaccounted for and this ratchet
    // caught it on the build that introduced it — twice now, which is
    // the argument for keeping the ceiling at the measured value.
    "src/lib/create-studio/producer-routes.ts",
  ]);
  const unaccounted = users.filter((f) => !ACCOUNTED.has(f));

  // A RATCHET, NOT A ZERO. Most of the unaccounted files are list filters
  // over the user's own rows — generic-list, files-workspace,
  // mission-list — which are section 4's case and are safe for the same
  // reason. The number is printed every run and may not grow: a new
  // matcher has to be looked at and either added to ACCOUNTED with a
  // reason or given a section.
  console.log(`        ${users.length} files fold user words; ${unaccounted.length} are not named above`);
  // PINNED TO THE MEASURED VALUE, not to a comfortable one. The first
  // draft set this to 32 against a real 19, which is thirteen of slack —
  // enough for a new matcher to arrive without tripping anything, which
  // is the whole failure this section exists to prevent. At 19 any new
  // folding file is a red line and a decision.
  const CEILING = 19;
  ok(`at most ${CEILING} folding files are unaccounted for`,
    unaccounted.length <= CEILING,
    `${unaccounted.length}: ${unaccounted.slice(0, 8).join(", ")}`);
}

console.log(`\n${failures.length === 0 ? "PASSED" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
