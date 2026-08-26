// Two live modules with the same name, one directory apart.
//
// WHAT IT COST. cross-module-context-chat-coding.mutation.mjs named
// scripts/tests/cross-module-context.test.mjs as its gate. The gate it
// needed was cross-module-context-chat-coding.test.mjs — the same string
// plus a suffix. The wrong gate loaded src/lib/ai/context-relevance.ts; the
// suite mutated src/lib/context-relevance.ts. Two live modules, disjoint
// APIs, identical filename. Fourteen mutations applied cleanly and the gate
// stayed green, and the suite reported 0 of 14 for months while reading as
// a coverage number.
//
// THE SHAPE, STATED PRECISELY, because a blanket "no duplicate basenames"
// rule would be wrong and would be deleted the first week:
//
//   - src/lib/X.ts existing alongside src/lib/<anything>/X.ts is the
//     dangerous one. The bare file has no directory to disambiguate it, so
//     "@/lib/X" and "@/lib/thing/X" differ by one path segment and nothing
//     in either name says which is which.
//
//   - src/lib/a/X.ts alongside src/lib/b/X.ts is FINE and is this repo's
//     convention: store.ts under five feature directories, limits.ts under
//     three, types.ts under many. There the directory IS the name, and
//     "@/lib/files/store" reads unambiguously.
//
//   - src/app/**/route.ts, page.tsx, layout.tsx and sitemap.ts are named by
//     Next.js, not by us. src/app/sitemap.ts is the App Router metadata
//     route; it cannot be called anything else, and it is not in lib/.
//
// So the rule is the first bullet only, and it is exhaustive over src/lib.
//
// Run: node scripts/tests/module-name-collisions.test.mjs
import { readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";

const LIB = "src/lib";
let pass = 0;
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

console.log("module-name-collisions");

const all = walk(LIB).sort();
const bare = all.filter((f) => path.dirname(f) === LIB);
const nested = all.filter((f) => path.dirname(f) !== LIB);

// FLOORS. "No bare file collides" is trivially true of an empty list, and
// this whole file is two array comparisons — exactly the shape that has gone
// vacuous elsewhere in this directory.
ok(`src/lib was read (${all.length} modules)`, all.length >= 250, `found ${all.length}`);
ok(`...of which ${bare.length} sit bare in src/lib`, bare.length >= 80, `found ${bare.length}`);
ok(`...and ${nested.length} in subdirectories`, nested.length >= 100, `found ${nested.length}`);

// ---------------------------------------------------------------------
console.log("\n== no bare module in src/lib shares a name with a nested one ==");
// ---------------------------------------------------------------------
const nestedByName = new Map();
for (const f of nested) {
  const b = path.basename(f);
  if (!nestedByName.has(b)) nestedByName.set(b, []);
  nestedByName.get(b).push(f);
}

const collisions = [];
for (const f of bare) {
  const b = path.basename(f);
  const others = nestedByName.get(b);
  if (others) collisions.push({ bare: f, others });
}

for (const c of collisions) {
  ok(
    `${c.bare} does not collide`,
    false,
    `also exists as ${c.others.join(", ")} — give the bare one a name that says what it does, ` +
      `or move it into a directory. Two live modules one path segment apart is how a gate ` +
      `ends up loading the wrong file.`
  );
}
ok(`no bare module collides with a nested one (${collisions.length} found)`, collisions.length === 0);

// ---------------------------------------------------------------------
console.log("\n== the two that were fixed stay fixed ==");
// ---------------------------------------------------------------------
// Named, because a floor cannot tell "the collision was resolved" from "the
// scan stopped finding anything". Each pair must still be TWO modules with
// DISJOINT exports — a rename that quietly merged them would be a different
// bug wearing this fix's clothes.
const PAIRS = [
  ["src/lib/download/table-csv.ts", "src/lib/data-analysis/csv.ts"],
  ["src/lib/auth/admin-emails.ts", "src/lib/supabase/admin.ts"],
  ["src/lib/text/relevance-budget.ts", "src/lib/ai/module-relevance.ts"],
];
const exportsOf = (file) =>
  new Set(
    [...readFileSync(file, "utf8").matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|type|class|interface)\s+(\w+)/gm)]
      .map((m) => m[1])
  );
for (const [a, b] of PAIRS) {
  const ea = exportsOf(a);
  const eb = exportsOf(b);
  ok(`${path.basename(a)} and ${path.basename(b)} are differently named`,
    path.basename(a) !== path.basename(b));
  ok(`...${path.basename(a)} still exports something (${ea.size})`, ea.size > 0);
  ok(`...${path.basename(b)} still exports something (${eb.size})`, eb.size > 0);
  const shared = [...ea].filter((n) => eb.has(n));
  ok(`...and they share no export name`, shared.length === 0, shared.join(", "));
}

// ---------------------------------------------------------------------
console.log("\n== the same rule, one level up: no two gates share a name ==");
// ---------------------------------------------------------------------
// scripts/tests is flat, so a duplicate basename there is impossible — but a
// gate and a mutation suite differing only by suffix is the same hazard, and
// mutation-suite-shape.test.mjs is where that is enforced. Asserted here so
// the two files point at each other.
ok("mutation-suite-shape.test.mjs exists and guards the suite/gate pairing",
  readFileSync("scripts/tests/mutation-suite-shape.test.mjs", "utf8").includes("targets its own gate"));

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`
);
process.exit(failures.length === 0 ? 0 : 1);
