#!/usr/bin/env node
/*
 * WHICH FEATURES ACTUALLY KNOW ANYTHING ABOUT THE PERSON USING THEM?
 *
 * Run: node scripts/data-advantage.mjs
 *
 * The whole strategy rests on one sentence: "the specialist does not
 * have your data." That sentence is a claim about the CODE, and until
 * this file nobody had checked it. It turns out to be true of six
 * features and false of five — and the five include the three the
 * strategy names first.
 *
 * THE POPULATION IS DERIVED, NOT TYPED. A paid model call is a route
 * that reserves credits, so the set of AI features is the set of routes
 * calling estimateForAction — found by reading them, never by a list
 * here that would go stale the day a feature is added. That is the
 * "if the rule says every X, range over the same set" rule from
 * CLAUDE.md, applied to routes.
 *
 * WHAT COUNTS AS KNOWING. Not "does it touch the database" — every
 * route does, to save its own row. The question is whether anything
 * about the person's OTHER work reaches the model, so the signal is a
 * call to one of the loaders that read across modules. Each loader is
 * named with the file that defines it, and the file is checked, so a
 * renamed loader fails here rather than quietly reporting every feature
 * as blind.
 *
 * WHAT IT CANNOT SAY: whether the context that arrives is any GOOD —
 * whether the right five rows were picked, whether the model used them.
 * That needs a generation and a judge. This answers the prior question,
 * which had never been asked: does anything arrive at all.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const API = "src/app/api";

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// THE LOADERS THAT READ ACROSS THE PERSON'S WORK, each with the file
// that defines it. Both halves are checked: a name that is not exported
// where it says it is fails, and so does a loader file that stops
// exporting it — otherwise this table degrades into "nothing found".
const LOADERS = [
  { fn: "getUserFullContext", file: "src/lib/user-context.ts", what: "every module's headlines, missions, health" },
  { fn: "loadWorkspaceContext", file: "src/lib/ai/workspace-context.ts", what: "module headlines picked for a prompt" },
  { fn: "selectCrossContext", file: "src/lib/ai/cross-module-context.ts", what: "chat and coding, each seeing the other" },
  { fn: "loadMentorContext", file: "src/lib/chat/mentor-context.ts", what: "the mentor's view of the account" },
  { fn: "loadRelevantBusinessContext", file: "src/lib/ai/business-context.ts", what: "what this business is and sells, picked for a brief" },
];

let problems = 0;
for (const l of LOADERS) {
  if (!existsSync(l.file)) {
    console.log(`  !! ${l.fn}: ${l.file} does not exist`);
    problems++;
    continue;
  }
  const src = readFileSync(l.file, "utf8");
  if (!new RegExp(`export (async )?function ${l.fn}\\b`).test(src)) {
    console.log(`  !! ${l.fn} is not exported by ${l.file} — the signal below would read as "blind"`);
    problems++;
  }
}

const routes = walk(API).filter((f) => /estimateForAction\s*\(/.test(strip(readFileSync(f, "utf8"))));

// A route may reach a loader through one hop — api/research calls
// lib/research/research-context.ts, which calls getUserFullContext — so
// the route's own imports from src/lib are followed one level. Deeper
// than that and the answer stops meaning "this feature decided to".
function reachesLoader(routeFile) {
  const src = strip(readFileSync(routeFile, "utf8"));
  const hits = new Set(LOADERS.filter((l) => new RegExp(`\\b${l.fn}\\s*\\(`).test(src)).map((l) => l.fn));
  for (const m of src.matchAll(/from "@\/lib\/([^"]+)"/g)) {
    const dep = `src/lib/${m[1]}.ts`;
    if (!existsSync(dep)) continue;
    const depSrc = strip(readFileSync(dep, "utf8"));
    for (const l of LOADERS) if (new RegExp(`\\b${l.fn}\\s*\\(`).test(depSrc)) hits.add(l.fn);
  }
  return [...hits];
}

// AND THE OTHER WAY A ROUTE CAN KNOW THE PERSON: by querying other
// features' tables itself. api/insights/generate reads missions,
// finance, ideas and trades directly and calls no loader at all — a
// signal built only on loader names would have filed the one feature
// that reads the whole account as blind.
//
// "Other features' tables" means: not the one this route writes. The
// route's own name gives that away badly, so the rule is a count —
// three or more distinct tables is a route looking around, one or two
// is a route reading its own row and its parent's.
function tablesRead(routeFile) {
  const src = strip(readFileSync(routeFile, "utf8"));
  return [...new Set([...src.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]))];
}
const BROWSING_THRESHOLD = 3;

const rows = routes
  .map((f) => {
    const tables = tablesRead(f);
    return {
      route: f.slice(API.length + 1).replace(/\/route\.ts$/, ""),
      loaders: reachesLoader(f),
      tables,
      browses: tables.length >= BROWSING_THRESHOLD,
    };
  })
  .sort((a, b) => (b.loaders.length - a.loaders.length) || a.route.localeCompare(b.route));

const knows = rows.filter((r) => r.loaders.length > 0 || r.browses);
const blind = rows.filter((r) => r.loaders.length === 0 && !r.browses);

console.log(`every route that reserves credits — ${rows.length} of them\n`);
console.log(`  KNOWS THE PERSON (${knows.length})`);
for (const r of knows)
  console.log(
    `    ${r.route.padEnd(34)} ` +
      (r.loaders.length ? r.loaders.join(", ") : `reads ${r.tables.length} tables itself: ${r.tables.join(", ")}`)
  );
console.log(`\n  SEES ONLY THE BRIEF (${blind.length})`);
for (const r of blind) console.log(`    ${r.route}`);

// THE SECOND SIGNAL IS A HEURISTIC AND PRINTS ITS OWN PRECISION.
// Settled by hand on 2026-09-27, three rows matched it: insights/generate
// (trades, finance, ideas, missions — four different features) REAL;
// cron/scheduled-runs (runs agents across the whole account) REAL;
// websites/generate/process (user_websites, website_reference_images,
// website_versions — all three the website feature's own) FALSE
// POSITIVE. 2 of 3. The tables are printed beside each row so the next
// reader can re-settle it rather than trust this paragraph.
//
// LATER THE SAME DAY that false positive stopped being one: the website
// route now calls loadWorkspaceContext, so it is counted by the loader
// signal and no longer reaches this one. The precision figure above is
// left as it was measured rather than quietly improved — it describes
// the detector on the tree it was measured against.
const browsers = knows.filter((r) => r.loaders.length === 0);
console.log(
  `\n  the table-count signal matched ${browsers.length}; measured 2026-09-27 it was 2 real of 3.` +
  `\n  Each row prints its tables so a reader can judge without re-running anything.`
);

console.log(
  `\n${knows.length} of ${rows.length} features send the model something about the person.\n` +
  "The rest get one sentence typed into a box, which is exactly what the\n" +
  "specialist competitor also gets — and the specialist has had years to\n" +
  "get better at it."
);
process.exit(problems === 0 ? 0 : 1);
