// A GATE THAT DEPENDS ON SOMETHING NOBODY PROMISED.
//
// THE QUESTION, 2026-09-19: "you ran build:ci, it passed locally, and
// CI broke. What ELSE differs between your machine and Vercel, beyond
// the env vars? Find the GENERAL case."
//
// The env half already had an answer — build:ci runs the build under a
// deployed environment, and env-independence.test.mjs forbids handing a
// gate the machine's environment. This is the half that was missing.
//
// readdirSync PROMISES NO ORDER. On the ext4 image this tree is
// developed on it is hash order; a fresh clone laid down in another
// sequence, on another filesystem, returns another. Every gate was run
// three times by scripts/scan-order-dependence.mjs — twice normally, to
// find the lines that move on their own, and once with every listing
// reversed. Fifteen disagreed with themselves. Fourteen differed only
// in the ORDER OFFENDERS WERE PRINTED IN, which is not a wrong verdict
// but is a failure two people cannot compare. One flipped GREEN -> RED:
//
//   rpc-signatures.test.mjs builds `sigs[name] = params` in a loop over
//   an unsorted listing of supabase/migrations. Several migrations
//   redefine a function with `create or replace`, so last writer wins —
//   and WHICH definition survives was decided by the filesystem. Under
//   a reversed listing an obsolete signature won and the gate reported
//   two call sites as passing arguments the function does not take.
//   Both arguments are in the current signature. Green here, red on a
//   builder, with a diff explaining nothing.
//
// WHAT THIS GATE HOLDS, and why it is not "every listing must be
// sorted". There are 237 readdirSync call sites in this tooling and
// almost all of them enumerate in order to filter and count, where
// order changes nothing. A rule with a baseline of 234 is a baseline
// set to the size of the problem, which CLAUDE.md names as its own
// failure mode.
//
// So this holds the CORRECTNESS subset at zero: an unsorted listing
// whose loop body assigns into a keyed collection. That is exactly the
// last-writer-wins shape, it is the one that changes a verdict rather
// than a line order, and it is decidable without running anything.
//
// The empirical half is `npm run test:order` — 280 gates, three runs
// each, about twenty minutes. It belongs beside `npm run test:env` in
// the before-a-deploy tier, not in the build.
//
// Run: node scripts/tests/order-stability.test.mjs
import { readdirSync, readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const DIRS = ["scripts", "scripts/tests", "scripts/tests/lib", "scripts/db"];

/** The body of the block opening at `open`, brace-matched. */
function blockAt(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i);
    }
  }
  return src.slice(open);
}

/** Every `for (const x of <listing>) { … }` over a directory. */
export function listingLoops() {
  const out = [];
  for (const dir of DIRS) {
    for (const file of [...readdirSync(dir)].sort()) {
      if (!/\.(mjs|js|cjs)$/.test(file)) continue;
      const path = `${dir}/${file}`;
      const src = stripComments(readFileSync(path, "utf8"));
      for (const m of src.matchAll(/for\s*\(\s*const\s+(\w+)\s+of\s+([^)]*readdirSync\([^;]*?)\)\s*\{/g)) {
        const [, variable, expr] = m;
        const body = blockAt(src, src.indexOf("{", m.index + m[0].length - 1));
        out.push({
          path,
          variable,
          sorted: /\.sort\(/.test(expr),
          // `x[k] = v` or `map.set(k, v)`: the last file to run decides
          // what the key holds.
          //
          // `[^=;\n]` AND NOT `[^\]]`, which is what this was and which
          // could not see the one line it exists for. The defect is
          // `sigs[m[1]] = …` — a nested bracket — and a class that
          // excludes `]` stops at the inner one and never reaches the
          // `=`. Settled by putting the real defect back: the first
          // version stayed GREEN, which is why nothing here is trusted
          // until a mutation has reddened it.
          lastWriterWins: /\w+\[[^=;\n]{1,80}\]\s*=(?!=)/.test(body) || /\.set\(/.test(body),
          expr: expr.trim().replace(/\s+/g, " ").slice(0, 70),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------
console.log("== 1. the scan found loops to look at ==");
const loops = listingLoops();
ok(`for-of loops over a directory listing (${loops.length})`,
  loops.length >= 20,
  `${loops.length} — an empty scan passes the check below by finding nothing`);
ok("...and some of them are already sorted, so the detector can tell them apart",
  loops.some((l) => l.sorted) && loops.some((l) => !l.sorted),
  `${loops.filter((l) => l.sorted).length} sorted, ${loops.filter((l) => !l.sorted).length} not`);

// ---------------------------------------------------------------------
console.log("\n== 2. no unsorted listing decides which entry wins ==");
const offenders = loops.filter((l) => !l.sorted && l.lastWriterWins);
ok("no loop over an unsorted listing assigns into a keyed collection",
  offenders.length === 0,
  offenders.map((o) => `${o.path}: for (const ${o.variable} of ${o.expr}…) writes a key — last writer wins, and which file is last is the filesystem's choice`).join("\n        "));

// ---------------------------------------------------------------------
console.log("\n== 3. the instrument that measured it is still here ==");
// The structural check above is a proxy. The thing that actually found
// the defect runs every gate with the listings reversed, and a proxy
// whose evidence has been deleted is a proxy for nothing.
const scan = "scripts/scan-order-dependence.mjs";
const preload = "scripts/tests/lib/reverse-readdir.cjs";
for (const f of [scan, preload]) {
  ok(`${f} exists`, [...readdirSync(f.split("/").slice(0, -1).join("/"))].includes(f.split("/").pop()));
}
{
  const src = readFileSync(scan, "utf8");
  ok("...and it runs a CONTROL, so a pid is not read as an order",
    /const control = runGate\(file\);/.test(src),
    "without two normal runs first, every check printing a changing value looks order-dependent");
  // THE ASSIGNMENT, not the name. This read `includes("fs.promises.readdir")`
  // and renaming the target to `fs.promises.readdirDisabled` left it
  // green — the substring is still there. A patch is `X = `, so that is
  // what is looked for.
  ok("...and the preload reverses all three readdir shapes",
    ["fs.readdirSync =", "fs.readdir =", "fs.promises.readdir ="].every((s) =>
      readFileSync(preload, "utf8").includes(s)
    ),
    readFileSync(preload, "utf8").match(/fs\.[\w.]+\s*=/g)?.join(", "));
  ok("...and it is reachable as a command", /"test:order"/.test(readFileSync("package.json", "utf8")));
}

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`ALL PASS: ${pass} passed, 0 failed`);
