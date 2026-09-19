#!/usr/bin/env node
/*
 * WHAT DOES EACH GATE HAVE TO DISAGREE WITH?
 *
 * The owner's question, 2026-09-19: "a gate that reads the same file as
 * the code checks nothing — it confirms that the file equals itself."
 * scan-self-confirming-gates.mjs answered it for one narrow mechanism
 * (a regex satisfied by a comment) and its census half answered it
 * badly: a binary "is this self-confirming" flag that scored 0 of 8.
 *
 * THE MISTAKE WAS THE VERDICT, NOT THE QUESTION. "Self-confirming" is
 * not a property a parser can decide. What a parser CAN decide is what
 * a gate is holding the code up against, and that is a ladder with the
 * owner's four at the top:
 *
 *   NETWORK    what production actually answers
 *   DOM        what actually reaches the screen
 *   DB         what the database actually has
 *   DISK       which files actually exist — an enumeration, so a file
 *              appearing or vanishing changes the answer
 *   EXECUTION  the code RUN rather than read: loadTs and a call, or a
 *              program spawned and its output read
 *   CROSS-KIND two artefacts of different kinds that a human must keep
 *              in step — migrations against TypeScript, messages
 *              against components, package.json against scripts
 *   LITERAL    an expectation written in the gate. A second statement,
 *              and a real one — but written by the same hand on the
 *              same day as the code, so it rots WITH it. This is the
 *              weakest rung that is still a rung.
 *   NONE       nothing. The file can only equal itself.
 *
 * Each gate is reported at its STRONGEST rung. The number that matters
 * is not "how many are self-confirming" — it is how far down the ladder
 * the build's evidence actually sits, and that number is printed rather
 * than judged.
 *
 * WHAT THIS CANNOT DO, stated because the last version did not. It reads
 * the gate's text. A gate that enumerates a directory and then ignores
 * the result counts as DISK here; only mutation settles that, and the
 * bottom rungs are settled that way one at a time — see
 * docs/shapes.md, "a gate that reads the same file as the code".
 *
 * Run: node scripts/scan-gate-independence.mjs
 *      node scripts/scan-gate-independence.mjs --json
 *      node scripts/scan-gate-independence.mjs --rung LITERAL
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./check-mutation-markers.mjs";

const DIR = "scripts/tests";

/** Every suite in scripts/tests, by the suffix that says when it runs. */
export const SUITES = {
  build: /\.test\.mjs$/,
  mutation: /\.mutation\.mjs$/,
  prod: /\.prodtest\.mjs$/,
  db: /\.dbtest\.mjs$/,
  integration: /\.itest\.mjs$/,
};

export const RUNGS = ["NETWORK", "DOM", "DB", "DISK", "EXECUTION", "CROSS-KIND", "LITERAL", "NONE"];

/** Which KIND of artefact a path is. Two files of the same kind are one
 *  statement; two of different kinds are two a human must keep in step. */
function kindOf(p) {
  if (p.startsWith("src/")) return "app";
  if (p.startsWith("supabase/")) return "schema";
  if (p.startsWith("messages/")) return "i18n";
  if (p.startsWith("scripts/")) return "tooling";
  if (p.startsWith("docs/") || p.endsWith(".md")) return "prose";
  if (p.startsWith("public/")) return "static";
  return "config";
}

export function classify(src) {
  const code = stripComments(src);
  const why = {};

  // --- the four the owner named ---------------------------------------
  // \b ON BOTH SIDES. Without a leading boundary, BASE_URL matches inside
  // DATABASE_URL, and every gate that mentions the database was filed
  // under NETWORK — the rung above the one it belongs to.
  const network =
    /\bfetch\(\s*[`"']https?:|\bhttp\.request\(|\bhttps\.request\(|createServer\(|\bPROD_URL\b|\bBASE_URL\b/.test(code);
  if (network) why.NETWORK = (code.match(/fetch\(\s*[`"']https?:[^`"']*/) ?? ["a request over the network"])[0];

  const dom = /chromium|puppeteer|playwright|jsdom|\bpage\.(goto|evaluate|locator|\$\()/.test(code);
  if (dom) why.DOM = "drives a browser";

  const db =
    /\bfrom\s+["']pg["']|new Client\(|DATABASE_URL|createClient\(\s*(process\.env|SUPABASE)/.test(code);
  if (db) why.DB = "opens a database connection";

  // DISK is an ENUMERATION, not a read. readFileSync("a/b.ts") states
  // which file to read; readdirSync states nothing and answers with
  // whatever is there, so a file appearing changes the result.
  const disk = /\breaddirSync\(|\bglobSync\(|\bwalk\(|readdir\(/.test(code);
  if (disk) why.DISK = "enumerates the filesystem";

  // --- executing the code rather than reading it ----------------------
  const ns = new Set();
  for (const m of code.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+(?:loadTs|import)\(/g)) {
    ns.add(m[1]);
  }
  for (const m of code.matchAll(
    /(?:const|let)\s*\{([^}]*)\}\s*=\s*await\s+(?:loadTs|import)\(/g
  )) {
    for (const name of m[1].split(",")) {
      const n = name.split(":").pop().trim();
      if (n) ns.add(n);
    }
  }
  // AND ONE STEP REMOVED. website-variation.test.mjs does
  //   const v = await loadTs("src/lib/website-variation.ts");
  //   const { pickVariation, MOTION_VOCABULARIES, ... } = v;
  // and never writes `v.` again. Reported as holding nothing, while it
  // is one of the few gates in the build that actually RUNS the code.
  for (const n of [...ns]) {
    for (const m of code.matchAll(
      new RegExp(`(?:const|let)\\s*\\{([^}]*)\\}\\s*=\\s*${n.replace(/\$/g, "\\$")}\\s*;`, "g")
    )) {
      for (const name of m[1].split(",")) {
        const nm = name.split(":").pop().trim();
        if (nm) ns.add(nm);
      }
    }
  }

  const called = [...ns].filter((n) =>
    new RegExp(`\\b${n.replace(/\$/g, "\\$")}(?:\\.[A-Za-z_$][\\w$]*)*\\s*\\(`).test(code)
  );
  const spawns = /execFileSync\(|spawnSync\(|execSync\(|\bspawn\(/.test(code);
  // TWO MORE WAYS THIS TREE RUNS CODE, both missed by the first version
  // and both among the strongest gates in the build.
  // device-fingerprint.test.mjs lifts networkOf() out of the route with
  // a regex and evaluates the real text with `new Function`, because
  // exporting an internal for a test is how an internal stops being one.
  // mission-planner.test.mjs transpiles and imports through a data: URL.
  const evaluates = /new Function\(/.test(code);
  const dataImport = /import\(\s*["'`]data:text\/javascript/.test(code);
  if (called.length > 0 || spawns || evaluates || dataImport) {
    why.EXECUTION =
      called.length > 0
        ? `calls ${called.slice(0, 3).join(", ")}`
        : evaluates
          ? "evaluates the source it read"
          : dataImport
            ? "transpiles and imports the source it read"
            : "spawns a program";
  }

  // --- two artefacts a human must keep in step ------------------------
  // EVERY PATH THE GATE NAMES, not only the ones spelled inside a
  // readFileSync call. This project has recorded the same blind spot
  // three times now — a path held in a `const`, built with path.join,
  // or passed through a one-line `read()` wrapper — and the first
  // version of this scan had it too: stop-everywhere.test.mjs reads a
  // migration, ten message files and app source, and was reported as
  // holding nothing. So: any string or template literal that resolves
  // to a real file, or whose directory is real, counts as read.
  const reads = new Set();
  for (const m of code.matchAll(/["'`]([A-Za-z0-9_@./$*{}-]{4,200})["'`]/g)) {
    const lit = m[1];
    if (!lit.includes("/") || lit.startsWith("http") || lit.startsWith("node:")) continue;
    const concrete = lit.replace(/\$\{[^}]*\}/g, "*");
    const dir = path.dirname(concrete.split("*")[0]);
    if (existsSync(concrete) || (concrete.includes("*") && existsSync(dir))) reads.add(concrete);
  }
  const kinds = new Set([...reads].map(kindOf));
  if (kinds.size > 1) why["CROSS-KIND"] = [...kinds].sort().join(" + ");

  // --- an expectation written in the gate -----------------------------
  // A TABLE, not a comparison. The first version of this counted
  // `=== <number>` and `.length > 0` as an expectation, which made 264
  // of the 275 build gates match on their own pass/fail footer — a
  // detector that says yes to everything, sorting nothing. What counts
  // is a collection of two or more literals written at the top of the
  // gate, under a name that is not the gate's own bookkeeping.
  const BOOKKEEPING = /^(failures?|passes?|pass|ok|out|rows|results?|errors?|missed|checks?|seen|args|lines)$/i;
  let literal = null;
  for (const m of code.matchAll(
    /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:new (?:Set|Map)\(\s*)?(\[[\s\S]{0,4000}?\]|\{[\s\S]{0,4000}?\})\s*\)?\s*;/gm
  )) {
    const [, name, bodyText] = m;
    if (BOOKKEEPING.test(name)) continue;
    const entries = (bodyText.match(/["'`][^"'`\n]{1,120}["'`]|(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g) ?? []).length;
    if (entries >= 2) {
      literal = `${name} holds ${entries} literal${entries === 1 ? "" : "s"}`;
      break;
    }
  }
  if (literal) why.LITERAL = literal;

  const rung = RUNGS.find((r) => why[r]) ?? "NONE";
  return { rung, why, reads: [...reads], kinds: [...kinds] };
}

export function scanAll() {
  const out = [];
  for (const [suite, re] of Object.entries(SUITES)) {
    for (const file of readdirSync(DIR).filter((f) => re.test(f)).sort()) {
      const src = readFileSync(path.join(DIR, file), "utf8");
      out.push({ suite, file, ...classify(src) });
    }
  }
  return out;
}


/**
 * SHAPE 35: THE RULE TARGETS THE SHAPE, THE CHECK ANCHORS ON THE EXAMPLE.
 *
 * A check whose NAME quantifies over a kind — "every table", "no route",
 * "each page" — while its evidence is a regex over ONE hardcoded file of
 * a kind the tree has many of, and the gate never enumerates.
 *
 * The instance, 2026-09-19: user-photos.test.mjs, "...and every table
 * that carries HTML is read", evidenced by four table names written in
 * the gate. A fifth table with an html_content column was added to a
 * migration and the gate stayed green — while the consequence sits two
 * lines above it in that same gate: a table the cleanup does not read
 * contributes no references, so every photograph reachable only from it
 * is deleted.
 *
 * PRECISION, MEASURED: 1 real of 3 on 2026-09-19. The two others are
 * quantifiers that range INSIDE one file ("each card" over a .map in
 * pricing/page.tsx) or over behaviour rather than files ("a hedged
 * answer produces no button"). A looser version of this — any universal
 * word at all — found 45 across 20 gates and almost none were real; a
 * looser one still — any gate naming one file of a many-instance kind —
 * found 80 of 275, which sorts nothing.
 */
export function kindWideClaims() {
  const walk = (d, out = []) => {
    for (const e of readdirSync(d)) {
      const f = `${d}/${e}`;
      if (statSync(f).isDirectory()) walk(f, out);
      else out.push(f);
    }
    return out;
  };
  const byBase = new Map();
  for (const f of walk("src")) {
    const b = f.split("/").pop();
    byBase.set(b, (byBase.get(b) ?? 0) + 1);
  }
  const KINDWIDE =
    /\b(every|each|all|no|none|any)\s+(?:other\s+|such\s+|single\s+)?(route|page|endpoint|screen|component|handler|module|form|button|card|table|migration|locale|write|mutation|api)\b/i;
  const out = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".test.mjs")).sort()) {
    const code = stripComments(readFileSync(path.join(DIR, file), "utf8"));
    if (/readdirSync\(|globSync\(|\bwalk\(/.test(code)) continue;
    const vars = new Map();
    for (const m of code.matchAll(
      /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[A-Za-z_$][\w$]*\()?\s*readFileSync\(\s*["'`](src\/[^"'`$]+)["'`]/g
    )) {
      if (existsSync(m[2])) vars.set(m[1], m[2]);
    }
    if (vars.size === 0) continue;
    for (const m of code.matchAll(
      /\b(?:check|ok)\(\s*[`"']([^`"']{6,160})[`"']\s*,\s*([\s\S]{0,240}?)\)\s*[,;)]/g
    )) {
      const [, name, arg] = m;
      if (!KINDWIDE.test(name)) continue;
      const used = [...vars].filter(([v]) => new RegExp(`\\b${v}\\b`).test(arg));
      if (used.length !== 1) continue;
      const target = used[0][1];
      const siblings = byBase.get(target.split("/").pop()) ?? 1;
      if (siblings >= 20) out.push({ file, name, target, siblings });
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = scanAll();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  }
  const only = process.argv.includes("--rung") ? process.argv[process.argv.indexOf("--rung") + 1] : null;

  const build = rows.filter((r) => r.suite === "build");
  console.log(`== ${rows.length} suites in ${DIR}, ${build.length} of them in the build ==\n`);

  console.log("-- THE STRONGEST THING EACH SUITE HOLDS THE CODE UP AGAINST --\n");
  console.log(`  ${"rung".padEnd(11)}${"build".padStart(6)}${"prod".padStart(6)}${"db".padStart(5)}${"itest".padStart(7)}${"mut".padStart(6)}`);
  for (const rung of RUNGS) {
    const at = (s) => rows.filter((r) => r.rung === rung && r.suite === s).length;
    const total = rows.filter((r) => r.rung === rung).length;
    if (total === 0) continue;
    console.log(
      `  ${rung.padEnd(11)}${String(at("build")).padStart(6)}${String(at("prod")).padStart(6)}` +
        `${String(at("db")).padStart(5)}${String(at("integration")).padStart(7)}${String(at("mutation")).padStart(6)}`
    );
  }

  console.log("\n-- THE FOUR INDEPENDENT SOURCES, IN THE BUILD ONLY --\n");
  for (const s of ["NETWORK", "DOM", "DB", "DISK"]) {
    const n = build.filter((r) => r.why[s]).length;
    console.log(`  ${s.padEnd(9)} ${String(n).padStart(3)} of ${build.length} build gates reach it`);
  }

  console.log("\n-- THE BOTTOM TWO RUNGS, BY NAME --\n");
  for (const rung of ["LITERAL", "NONE"]) {
    const at = rows.filter((r) => r.rung === rung);
    console.log(`  ${rung}: ${at.length}`);
    for (const r of at) console.log(`     ${r.file}${r.why[rung] ? `  (${r.why[rung]})` : ""}`);
  }

  if (only) {
    console.log(`\n-- EVERY SUITE AT ${only} --\n`);
    for (const r of rows.filter((x) => x.rung === only)) {
      console.log(`  ${r.file}\n      reads: ${r.reads.slice(0, 4).join(", ") || "(nothing)"}`);
    }
  }

  console.log("\n-- SHAPE 35: A KIND-WIDE CLAIM WITH ONE-FILE EVIDENCE --\n");
  const claims = kindWideClaims();
  console.log(`  ${claims.length} check(s) quantify over a kind and read one file of it\n`);
  for (const c of claims) {
    console.log(`   ${c.file}\n       "${c.name}"\n       evidence: ${c.target} (1 of ${c.siblings})`);
  }
  console.log(
    "\n  PRECISION 1 OF 3, measured 2026-09-19. The real one was\n" +
      "  user-photos' \"every table that carries HTML is read\", whose evidence\n" +
      "  was four table names written in the gate; it derives them from the\n" +
      "  migrations now. The rest quantify inside one file, or over behaviour."
  );

  console.log(
    "\n  THIS READS TEXT, NOT BEHAVIOUR. A gate that enumerates a directory\n" +
      "  and ignores the answer still counts as DISK here. The rung is where\n" +
      "  to look, not a verdict: settle one by MUTATION — break the thing it\n" +
      "  claims to protect and require it to go red."
  );
}
