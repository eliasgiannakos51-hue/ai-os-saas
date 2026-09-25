// THE NODE VERSION, HELD IN THREE PLACES THAT MUST AGREE — AND A FOURTH
// THAT THIS REPOSITORY CANNOT SEE.
//
// Run: node scripts/tests/node-version.test.mjs
//
// THE FOUR PLACES:
//
//   .nvmrc               what a human's version manager reads. THE SOURCE
//                        OF TRUTH here, because it is the one a person
//                        actually looks at.
//   package.json engines what npm and the platform read.
//   process.version      what is ACTUALLY running this check.
//   Vercel dashboard     Settings → General → Node.js Version. Lives
//                        outside the repository. Nothing in this tree can
//                        read it, and no gate can assert it.
//
// THE POINT OF THIS FILE IS THE THIRD ONE, and it is why this is a gate
// rather than the checklist item it first looked like. The dashboard
// setting cannot be read — but its EFFECT can, because `process.version`
// during `npm run build` IS the version the dashboard chose. This gate
// runs inside the build, so it runs on the builder, so a dashboard that
// disagrees with .nvmrc turns the build red HERE, with the fix printed,
// instead of somewhere unrelated three minutes later.
//
// A thing that lives outside the repository is not automatically
// un-gateable. Ask what it CHANGES that runs inside, and check that.
//
// THE FOURTH CHECK is the one nobody would have written by hand: every
// installed dependency declares the Node range it needs, and the pinned
// major has to satisfy all of them. Measured 2026-09-25,
// @supabase/supabase-js@2.110.9 and five of its siblings declare
// `"node": ">=22.0.0"` — so a pin to 20 would have been wrong on the
// evidence, whatever the dashboard said.
import { readFileSync, readdirSync, existsSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const majorOf = (s) => (String(s).match(/(\d+)/) ?? [])[1] ?? null;

console.log("== 1. the three places inside the repository ==");

check(".nvmrc exists", existsSync(".nvmrc"), "it is the source of truth for this gate");
const nvmrc = existsSync(".nvmrc") ? readFileSync(".nvmrc", "utf8").trim() : "";
const WANT = majorOf(nvmrc);
check(".nvmrc names a major version", WANT !== null, `.nvmrc says ${JSON.stringify(nvmrc)}`);

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const declared = String(pkg.engines?.node ?? "").trim();
check("package.json declares engines.node", declared !== "", "npm and the platform read this one");
check(
  "...and it names the same major as .nvmrc",
  WANT !== null && majorOf(declared) === WANT,
  `.nvmrc ${nvmrc} vs engines.node ${declared} — they would pick different runtimes for a human and for the builder`
);

console.log("\n== 2. the version actually running this build ==");
// THE DASHBOARD CHECK, BY ITS EFFECT. On Vercel this is the version the
// project's Node.js Version setting chose; here it is whatever the
// developer's machine runs. Either way it is the one the code will meet.
const running = process.versions.node;
check(
  "the running Node is the major this repository pins",
  majorOf(running) === WANT,
  `running v${running}, pinned ${nvmrc}.\n` +
    `        If this is the Vercel build: Settings → General → Node.js Version → ${nvmrc}.x\n` +
    `        If this is a laptop: nvm use`
);

console.log("\n== 3. every dependency's own requirement is satisfied ==");
// THE POPULATION IS node_modules, so the check ranges over node_modules —
// not over a list somebody remembered to keep up to date.
// THE SCAN PRODUCES THE POPULATION; THE OFFENDERS ARE DERIVED FROM IT.
//
// It used to push straight into an `offenders` array, and
// gate-vacuity.test.mjs failed the build for it: an emptiness assertion
// over a scanned collection with no floor. It was right. A node_modules
// that could not be read produces no offenders and a green line, which is
// the exact shape CLAUDE.md opens with — and the separate "did it scan
// anything" check did not help, because nothing tied the two together.
//
// Now the population is the variable, the offenders are a filter of it,
// and the floor sits on the population where it can actually break.
const declaringPackages = [];
const scanDir = (dir, prefix) => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith("@")) {
      scanDir(`${dir}/${e.name}`, `${e.name}/`);
      continue;
    }
    const p = `${dir}/${e.name}/package.json`;
    if (!existsSync(p)) continue;
    let json;
    try {
      json = JSON.parse(readFileSync(p, "utf8"));
    } catch {
      continue;
    }
    const range = json.engines?.node;
    if (typeof range !== "string") continue;
    // Only the unambiguous shape `>=N` or `>=N.x.y`, alone. A range with
    // alternatives ("^12.22.0 || ^14.17.0 || >=16.0.0") is satisfied by
    // any modern major and reading it properly needs semver, which this
    // build does not depend on. The narrow reading is the honest one: it
    // can miss, and it cannot cry wolf.
    const m = range.trim().match(/^>=\s*(\d+)(?:\.\d+)*$/);
    declaringPackages.push({ name: `${prefix}${e.name}`, range, needs: m ? Number(m[1]) : 0 });
  }
};
if (existsSync("node_modules")) scanDir("node_modules", "");
console.log(`        ${declaringPackages.length} installed package(s) declare an engines.node range`);
check(
  "the dependency scan read packages that declare a Node range",
  declaringPackages.length > 0,
  "an empty scan makes the clause below true while measuring nothing"
);
const offenders = declaringPackages
  .filter((p) => WANT !== null && Number(WANT) < p.needs)
  .map((p) => `${p.name} needs node ${p.range}, pinned ${nvmrc}`);
check(
  "no installed dependency needs a newer Node than this repository pins",
  offenders.length === 0,
  offenders.slice(0, 6).join("\n        ")
);

console.log("\n== 4. what this gate CANNOT check, said out loud ==");
// The checklist item, kept next to the checks so it cannot drift away
// from them. docs/v6-list.md carries the same sentence for a reader who
// is not running the gate.
const readme = existsSync("README.md") ? readFileSync("README.md", "utf8") : "";
// WHITESPACE-TOLERANT ON PURPOSE: prose wraps, and the first version of
// this check went red because the README broke "Node.js Version" across
// two lines. A check a paragraph can fail by being re-wrapped is checking
// the layout, not the content.
//
// AND NARROWER THAN IT FIRST WAS. It asked for the words "Node.js Version"
// and "dashboard" anywhere in the file — and "dashboard" was already in
// the Deploy section, so half the check was free. Its own mutation caught
// that: deleting the sentence left the gate green. It now wants the PATH a
// person clicks, and the admission that no gate can reach it.
const namesThePath = /Settings\s*→\s*General\s*→\s*Node\.js\s+Version/.test(readme);
const admitsItCannotBeRead =
  /lives outside this repository|nothing here can read|no gate can reach/i.test(readme);
check(
  "the README names the dashboard setting by its path",
  namesThePath,
  "Settings → General → Node.js Version — a deployer needs the route, not the noun"
);
check(
  "...and says plainly that nothing in this repository can read it",
  admitsItCannotBeRead,
  "an unreachable setting presented as if it were checked is worse than no sentence"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
