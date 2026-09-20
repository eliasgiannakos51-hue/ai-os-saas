#!/usr/bin/env node
/*
 * CAN silent-fallbacks.test.mjs SEE A FAILURE DRESSED AS AN EMPTY LIST?
 *
 * The defect it exists for is put back verbatim below: `res.ok &&
 * data.ok ? data.results : []`. That one line made "⌘K finds nothing"
 * and "⌘K is broken" the identical screen, and the owner reported the
 * first — twice — while living with the second.
 *
 * Run: node scripts/tests/silent-fallbacks.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/silent-fallbacks.test.mjs";
const PALETTE = "src/components/dashboard/command-palette.tsx";
const EL = "messages/el.json";
const EN = "messages/en.json";
const SCAN = "scripts/scan-silent-fallbacks.mjs";

const TARGETS = [GATE, PALETTE, EL, EN, SCAN];

const MUTANTS = [
  {
    // THE LINE ITSELF.
    name: "a failed search becomes an empty result again",
    file: PALETTE,
    from: "        if (!res.ok || !data.ok) {\n          setSearchFailed(true);\n          setContentResults([]);\n          if (unnarrowed) setFacets(NO_FACETS);\n          return;\n        }\n        setSearchFailed(false);\n        const results: SearchResult[] = data.results;",
    to: "        const results: SearchResult[] = res.ok && data.ok ? data.results : [];",
    expect: "a non-ok response is not turned into results",
  },
  {
    // AND THE CACHE, which is what made one outage outlive itself.
    name: "the failure is cached, so retyping never retries",
    file: PALETTE,
    from: "          if (unnarrowed) setFacets(NO_FACETS);\n          return;\n        }",
    to: "          if (unnarrowed) setFacets(NO_FACETS);\n        }",
    expect: "the failure path returns before reaching it",
  },
  {
    name: "the dropped request is swallowed again",
    file: PALETTE,
    from: "        if (token === searchTokenRef.current) {\n          setSearchFailed(true);\n          setContentResults([]);\n        }",
    to: "        if (token === searchTokenRef.current) setContentResults([]);",
    expect: "the network half does the same",
  },
  {
    name: "the flag is never lowered, so one outage becomes a permanent banner",
    file: PALETTE,
    from: "        setSearchFailed(false);\n        const results: SearchResult[] = data.results;",
    to: "        const results: SearchResult[] = data.results;",
    expect: "a successful search lowers the flag again",
  },
  {
    name: "the panel says 'no matches' about a request that never answered",
    file: PALETTE,
    from: '                : searchFailed\n                  ? tCommon("searchFailed")\n                  : tCommon("noMatches", { query })}',
    to: '                : tCommon("noMatches", { query })}',
    expect: "renders the failure rather than 'no matches'",
  },
  {
    name: "the flag leaks from one opening of the palette to the next",
    file: PALETTE,
    from: "    // Or the next opening starts by announcing a failure that belonged\n    // to the last one.\n    setSearchFailed(false);\n",
    to: "",
    expect: "closing the palette clears it",
  },
  {
    name: "Greek gets the English sentence",
    file: EL,
    from: '"searchFailed": "Η αναζήτηση δεν είναι διαθέσιμη αυτή τη στιγμή — δεν σημαίνει ότι δεν υπάρχουν αποτελέσματα. Δοκίμασε ξανά σε λίγο."',
    to: '"searchFailed": "Search is unavailable right now — this is not an empty result. Try again in a moment."',
    expect: "Greek is not the English string copied across",
  },
  {
    name: "the English copy stops saying it is not an empty result",
    file: EN,
    from: '"searchFailed": "Search is unavailable right now — this is not an empty result. Try again in a moment."',
    to: '"searchFailed": "Search failed. Try again in a moment."',
    expect: "it says it is NOT an empty result",
  },
  {
    // THE CENSUS'S OWN FLOOR. A classifier that files everything under
    // "reports" stops being able to find the next silent one.
    name: "the classifier calls every catch a reporting one",
    file: SCAN,
    from: "        reports: REPORTS.test(body) || CARRIES_FAILURE.test(body),",
    to: "        reports: true,",
    expect: "recover silently",
  },
  {
    // THE FLOOR UNDER THE POPULATION CHECK. A detector that finds no
    // callers makes "every one of them reads res.ok" pass over an empty
    // list — which is what the first version of it did, looking for a
    // quoted string where the code uses a template literal.
    name: "the caller sweep finds no components",
    file: GATE,
    from: 'includes("/api/search?")) callers.push(p);',
    to: 'includes("/api/search-nowhere?")) callers.push(p);',
    expect: "components that call /api/search were found",
  },
  {
    // A SWEEP THAT WALKS THE WRONG TREE finds callers, just not the ones
    // this file is about — so the count clause above stays green while
    // the palette itself goes unchecked.
    name: "the caller sweep walks a directory the palette is not in",
    file: GATE,
    from: 'walk("src/components");',
    to: 'walk("src/app");',
    expect: "the palette is one of them, by name",
  },
  {
    // res.ok read, and the result still rendered as an empty account.
    name: "the palette raises the flag on a 500 but not on a dropped request",
    file: PALETTE,
    from: "        if (token === searchTokenRef.current) {\n          setSearchFailed(true);\n          setContentResults([]);\n        }",
    to: "        if (token === searchTokenRef.current) {\n          setContentResults([]);\n        }",
    expect: "raises a flag on the dropped request too",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]) };
  }
}

console.log("silent-fallbacks mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — nothing below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, () => m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.join(" | ")}`);
      continue;
    }
    caught += 1;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
