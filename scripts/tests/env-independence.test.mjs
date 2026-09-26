// A GATE MUST GIVE THE SAME ANSWER ON EVERY MACHINE.
//
// THE FAILURE THIS EXISTS FOR, in full, because it cost a red deploy on
// code that had been green locally for days.
//
// Merge commit aec56a2 turned Vercel red with exactly one failing line:
//
//     scripts/tests/check-site-spelling.test.mjs
//     == 5. what it refuses to do ==
//       FAIL  ...and names the key
//
// That check asserted the runner prints "MISSING ANTHROPIC_API_KEY" when
// invoked with no arguments. It spawned the runner with no `env`, so the
// child inherited the machine's environment. The line only appears when
// the key is ABSENT. It is absent on a development machine and PRESENT
// on Vercel, because the application needs it there. Green here, red
// there, same bytes.
//
// NOTE WHICH WAY ROUND THAT IS, because the natural guess is backwards:
// the gate passed locally because the variable was MISSING, and failed in
// CI because it was SET. Any machine with a key would have turned it red.
//
// THREE THINGS GUARD IT NOW, at three costs:
//
//   npm run build      this file. Structural, milliseconds. It asks
//                      whether a gate could inherit an environment, not
//                      whether it does today.
//   npm run test:env   scripts/env-sensitivity.mjs. Behavioural: runs
//                      all 252 gates twice, once bare and once with 161
//                      variables set, and names any that disagree. ~25
//                      minutes, so it is a before-you-push step rather
//                      than a build step.
//   npm run build:ci   the real build under the deployed environment.
//
// Run: node scripts/tests/env-independence.test.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { probedNames } from "../env-sensitivity.mjs";
const { stripComments } = await import("../check-mutation-markers.mjs");

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

// ---------------------------------------------------------------------
// DOES A FILE, OR ANYTHING IT IMPORTS, READ THE ENVIRONMENT?
//
// Transitive, because the one that broke was direct but the next one
// need not be: prodtest-hygiene reaches CHROMIUM_PATH through
// lib/chromium.mjs, two files away from the gate that failed.
function readsEnv(file, seen = new Set()) {
  const abs = resolve(file);
  if (seen.has(abs) || !existsSync(abs)) return null;
  seen.add(abs);
  let src;
  try {
    src = readFileSync(abs, "utf8");
  } catch {
    return null;
  }
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");
  if (/process\.env\s*[.[]/.test(code)) return { file, via: null };
  for (const m of code.matchAll(/from\s+"(\.[^"]+)"/g)) {
    const r = readsEnv(join(dirname(abs), m[1]), seen);
    if (r) return { file: r.file, via: m[1] };
  }
  return null;
}

// THE OPTIONS OBJECT OF A SPAWN, read by balancing braces rather than by
// a regex for `env:`. The first version of this check looked for exactly
// that string and reported the fix for the original defect as still
// broken, because the fix passes `env` as a SHORTHAND property — the
// object is `{ encoding, stdio, timeout, env }`. A scanner that cannot
// read the code it grades is the failure this repository keeps finding
// in its own instruments.
function spawnOptions(src) {
  const out = [];
  for (const m of src.matchAll(/\b(?:execFileSync|execSync|spawnSync|execFile|spawn)\s*\(/g)) {
    let i = m.index + m[0].length;
    let depth = 1;
    let quote = null;
    const start = i;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "(" || c === "{" || c === "[") depth++;
      else if (c === ")" || c === "}" || c === "]") depth--;
      i++;
    }
    out.push(src.slice(start, i));
  }
  return out;
}
const givesEnv = (call) => /[{,]\s*env\s*[:,}]/.test(call) || /\benv\s*:/.test(call);

// A PATH HELD IN A VARIABLE IS STILL A PATH.
//
// AND THIS IS THE CLAUSE THAT MADE THIS FILE WORTH RE-CHECKING. The
// first version read script paths out of the spawn call as string
// LITERALS, so when the original defect was put back to see the gate go
// red, it stayed green — because the gate that broke Vercel spawns
// `[RUNNER, ...args]`, and RUNNER is `const RUNNER =
// "scripts/check-site-spelling.mjs"` fifty lines above. A checker that
// only reads literals is blind to the exact file it was written for.
//
// Same shape as every "invisible to the compiler" finding in CLAUDE.md:
// the name is there, just not where a naive reader looks.
function constPaths(src) {
  const out = new Map();
  for (const m of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*["'`](scripts\/[a-z0-9/._-]+\.(?:mjs|js))["'`]/g)) {
    out.set(m[1], m[2]);
  }
  return out;
}
function pathsIn(call, consts) {
  const found = new Set();
  for (const m of call.matchAll(/["'`](scripts\/[a-z0-9/._-]+\.(?:mjs|js))["'`]/g)) found.add(m[1]);
  for (const [name, path] of consts) {
    if (new RegExp(`\\b${name}\\b`).test(call)) found.add(path);
  }
  return [...found];
}

// ---------------------------------------------------------------------
console.log("== 0. the reader, on samples it must get right ==");
check(
  "an options object with env: is controlled",
  givesEnv(spawnOptions('execFileSync(node, [x], { encoding: "utf8", env: myEnv })')[0])
);
// THE SHORTHAND, which is what the fix for the original defect uses and
// which the first version of this file called uncontrolled.
check(
  "...and so is one with the shorthand",
  givesEnv(spawnOptions('execFileSync(node, [x], { encoding: "utf8", timeout: 1, env })')[0])
);
check(
  "one without it is not",
  !givesEnv(spawnOptions('execFileSync(node, [x], { encoding: "utf8", stdio: "pipe" })')[0])
);
// A `>` OR A BRACE INSIDE A STRING DOES NOT END THE CALL.
check(
  "a brace inside a string argument does not end the options object",
  givesEnv(spawnOptions('execFileSync(node, ["--eval", "if (a) { b }"], { env })')[0]),
  JSON.stringify(spawnOptions('execFileSync(node, ["--eval", "if (a) { b }"], { env })'))
);
check("two spawns are two calls", spawnOptions("spawnSync(a, b, { env }); spawnSync(c, d, {})").length === 2);
// AND THE ONE THAT MATTERED: the path is a constant, not a literal.
{
  const SAMPLE = 'const RUNNER = "scripts/check-site-spelling.mjs";\nexecFileSync(node, [RUNNER, ...args], { encoding: "utf8" });';
  const consts = constPaths(SAMPLE);
  check("a const holding a script path is collected", consts.get("RUNNER") === "scripts/check-site-spelling.mjs");
  check(
    "...and a spawn that names only the const still resolves to it",
    pathsIn(spawnOptions(SAMPLE)[0], consts).includes("scripts/check-site-spelling.mjs"),
    JSON.stringify(pathsIn(spawnOptions(SAMPLE)[0], consts))
  );
  check(
    "...while a spawn that does not name it does not",
    pathsIn('execFileSync(node, ["--version"], {})', consts).length === 0
  );
}

// ---------------------------------------------------------------------
console.log("\n== 1. no gate spawns an env-reading program without an environment ==");
const GATES = readdirSync("scripts/tests").filter((f) => f.endsWith(".test.mjs"));
check(`the gates were found (${GATES.length})`, GATES.length >= 200, String(GATES.length));

const offenders = [];
let spawningGates = 0;
for (const f of GATES) {
  const p = `scripts/tests/${f}`;
  const src = readFileSync(p, "utf8");
  const calls = spawnOptions(src);
  if (calls.length === 0) continue;
  spawningGates++;
  const uncontrolled = calls.filter((c) => !givesEnv(c));
  if (uncontrolled.length === 0) continue;
  // THE TARGET COMES FROM THE CALL, NOT FROM THE FILE.
  //
  // The first version of this loop collected every "scripts/…" string
  // ANYWHERE in the gate and treated all of them as things it spawns.
  // It therefore accused this very file — which READS
  // check-site-spelling.test.mjs to assert something about it — of
  // spawning it, and accused prodtest-hygiene of spawning the helper it
  // imports. A scanner whose first real run indicts itself is telling
  // the truth about itself and lying about everything else.
  const risky = [];
  const consts = constPaths(src);
  for (const call of uncontrolled) {
    for (const path of pathsIn(call, consts)) {
      const r = readsEnv(path);
      if (r) risky.push(r);
    }
  }
  if (risky.length > 0) {
    offenders.push(`${f}: spawns ${risky.map((r) => r.file + (r.via ? ` (env via ${r.via})` : "")).join(", ")} with no env of its own`);
  }
}
check(
  `gates that spawn something (${spawningGates})`,
  spawningGates >= 15,
  "a rule about spawns, checked against no spawns, passes for the wrong reason"
);
check(
  "none of them hands an env-reading program the machine's environment",
  offenders.length === 0,
  offenders.join("\n        ")
);
// THE CONTROL, so the clause above cannot pass because readsEnv() stopped
// finding anything. These two are known to read the environment; the
// first directly, the second two files away.
check(
  "the env reader finds a direct read",
  readsEnv("scripts/check-site-spelling.mjs")?.via === null
);
// AND ONE BEHIND AN IMPORT — anchored on a file that reads NO
// environment of its own, which is the only kind that proves the walk.
// The first version pointed at prodtest-hygiene, which reads
// CHROMIUM_PATH directly as well, so disabling the import walk left this
// clause green: its own mutation suite reported the miss.
// check-site-spelling.test.mjs contains no `process.env` at all and
// reaches one through ./lib/clean-env.mjs.
{
  const chain = readsEnv("scripts/tests/check-site-spelling.test.mjs");
  check(
    "...and one behind an import",
    chain !== null && chain.via === "./lib/clean-env.mjs",
    JSON.stringify(chain)
  );
}
check("...and does not invent one", readsEnv("scripts/tests/fixtures/greek-site.html") === null);

// ---------------------------------------------------------------------
console.log("\n== 2. the sweep's own declared exceptions ==");
// scripts/env-sensitivity.mjs excuses eleven variables from the sweep
// because their influence is the point — DATABASE_URL is the switch that
// decides whether a db suite runs at all. An excuse list is only as
// honest as its reverse: a name on it that nothing reads any more is a
// sentence protecting nothing, and the list must not quietly grow to
// cover a real finding.
const sweep = readFileSync("scripts/env-sensitivity.mjs", "utf8");
// TWO LISTS, TWO RATCHETS. They are different claims and a single
// count conflates them — which is what the first version did, and its
// own ceiling went red the moment the second list existed. That was the
// ratchet working; keeping them apart is what makes each number mean
// something.
//
//   INTENTIONAL  a switch that decides whether a gate runs at all.
//                DATABASE_URL is the type: present means connect,
//                absent means skip.
//   TUNING       a knob that changes a computed number. Setting one
//                models a different price list, not a different machine.
function namesInMap(name) {
  const m = sweep.match(new RegExp(`const ${name} = new Map\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!m) return [];
  return [...m[1].matchAll(/\["([A-Z_][A-Z0-9_]*)", "([^"]*)"\]/g)].map((x) => ({ name: x[1], why: x[2] }));
}
const intentional = namesInMap("INTENTIONAL");
const tuning = namesInMap("TUNING");
const declared = [...intentional, ...tuning].map((x) => x.name);
check(`the sweep declares exceptions (${declared.length})`, declared.length >= 8, declared.join(", "));
check(
  `both lists were parsed (${intentional.length} switches, ${tuning.length} knobs)`,
  intentional.length >= 8 && tuning.length >= 4,
  "a ratchet on a list the reader could not find is a ratchet on zero"
);
check(
  "every one carries a reason",
  [...intentional, ...tuning].every((x) => x.why.length >= 20),
  [...intentional, ...tuning].filter((x) => x.why.length < 20).map((x) => x.name).join(", ")
);
const probed = probedNames();
// A RATCHET ON THE LIST, AND THE REPLACEMENT FOR A CHECK THAT COULD NOT
// FAIL.
//
// The clause here used to read "...and none of them is also being
// probed" — and probedNames() DELETES every declared name before
// returning, so that condition was true by construction. A check that
// cannot go red is a sentence; its own mutation suite is what said so,
// by mutating it and watching the gate stay green.
//
// The real risk is not contradiction, it is GROWTH: the cheapest way to
// make this sweep stop reporting a finding is to add the variable to the
// excuse list. Eleven is what it holds today. Lowering it is free;
// raising it needs a reason written beside the entry AND a line here.
check(
  `the switch list has not grown (${intentional.length}, ceiling 11)`,
  intentional.length <= 11,
  intentional.map((x) => x.name).join(", ") + " — a variable excused rather than fixed is a finding hidden"
);
check(
  `the knob list has not grown (${tuning.length}, ceiling 6)`,
  tuning.length <= 6,
  tuning.map((x) => x.name).join(", ") + " — the cheapest way to silence this sweep is to call a finding a knob"
);
check(
  `the sweep probes the rest (${probed.size})`,
  probed.size >= 140,
  "a sweep of nothing reports no difference"
);
// THE TWO THAT MATTER MOST, named rather than counted: the variable that
// broke the build, and the one the sweep could not see until it learnt
// to read the scripts tree as well as .env.local.example.
check("ANTHROPIC_API_KEY is probed", probed.has("ANTHROPIC_API_KEY"));
check("CHROMIUM_PATH is probed", probed.has("CHROMIUM_PATH"));

// ---------------------------------------------------------------------
console.log("\n== 3. the two fixes, asserted where they live ==");
const spelling = readFileSync("scripts/tests/check-site-spelling.test.mjs", "utf8");
check(
  "the spelling gate asks for BOTH answers, not the one its machine gives",
  /names the key, when there is no key/.test(spelling) && /does NOT name it when there is one/.test(spelling),
  "one of the two directions is missing"
);
const hygiene = readFileSync("scripts/tests/prodtest-hygiene.test.mjs", "utf8");
check(
  "the prodtest gate deletes CHROMIUM_PATH before asking what the default is",
  /delete process\.env\.CHROMIUM_PATH;\s*\nconst resolved = chromiumPath\(\)/.test(hygiene),
  "it would otherwise assert that whatever the machine points at exists"
);
check(
  "...and puts back whatever the machine had",
  /priorChromiumPath !== undefined\) process\.env\.CHROMIUM_PATH = priorChromiumPath/.test(hygiene)
);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
check(
  "the runner used by the build under a deployed environment exists",
  existsSync("scripts/ci-build.mjs"),
  "scripts/ci-build.mjs"
);
check(
  "...and npm run build:ci reaches it",
  pkg.scripts["build:ci"] === "node scripts/ci-build.mjs",
  String(pkg.scripts["build:ci"])
);
check(
  "...and npm run test:env reaches the sweep",
  pkg.scripts["test:env"] === "node scripts/env-sensitivity.mjs",
  String(pkg.scripts["test:env"])
);


// ===========================================================================
// AND THE BUILDER'S OWN THREE INPUTS, DERIVED RATHER THAN ASSUMED
// ===========================================================================
//
// Everything above asks whether a GATE could disagree between here and
// Vercel. This asks the same question one level up, about the harness
// that runs them: build:ci can only stand in for the builder on the
// inputs it actually copies.
//
// It copied one — the environment — and assumed the other three. The
// command came from a string literal rather than vercel.json, the node
// major was whatever the machine had, and the clock was the machine's
// zone while the bundle bakes a build time (next.config.mjs) that gates
// read back. A green build:ci on the wrong node is not evidence about
// the build that ships, and this repository has spent six rounds on
// exactly that kind of evidence.
//
// READ WITH COMMENTS STRIPPED. The paragraph above names "npm run build"
// and vercel.json, and a check that matched this file's own prose would
// be the self-confirming shape CLAUDE.md gates separately.
const ciSrc = stripComments(readFileSync("scripts/ci-build.mjs", "utf8"));
check(
  "build:ci reads the build command out of vercel.json",
  /readFileSync\(\s*"vercel\.json"/.test(ciSrc),
  "it ran npm run build from a literal, which is only Vercel's FALLBACK"
);
check(
  "...and does not spawn a hard-coded npm run build",
  !/spawnSync\(\s*"npm"/.test(ciSrc),
  "a buildCommand added to vercel.json would then never be the thing tested"
);
check(
  "...while still naming npm run build as the no-buildCommand fallback",
  /\["run",\s*"build"\]/.test(ciSrc),
  "vercel.json declares none today, so the fallback IS what runs"
);
check(
  "build:ci takes the pinned major from .nvmrc, not from a literal",
  /readFileSync\("\.nvmrc"/.test(ciSrc) && /wantMajor = nvmrc\.match/.test(ciSrc),
  ".nvmrc is the file a person edits, so it is the one the others are checked against"
);
check(
  "...and reads the running runtime to compare it with",
  /process\.versions\.node/.test(ciSrc),
  "a pin nothing verifies against the actual runtime is a comment"
);
check(
  "...and refuses to run on a different major rather than warning",
  /haveMajor !== wantMajor\)[\s\S]{0,600}process\.exit\(2\)/.test(ciSrc),
  "a pass measured on another major is not evidence about the one that ships"
);
check(
  "...and refuses when engines.node disagrees with .nvmrc",
  /enginesMajor !== wantMajor\)[\s\S]{0,600}process\.exit\(2\)/.test(ciSrc),
  "they would pick different runtimes for a human and for the builder"
);
// THE FOURTH PLACE, and the reason this is not only a checklist: the
// dashboard cannot be read, but the runtime it selects runs the build.
check(
  "a gate asserts the running Node inside the build, where the builder can fail it",
  existsSync("scripts/tests/node-version.test.mjs"),
  "scripts/tests/node-version.test.mjs"
);
// AND THE ABSENT PASS HAS TO BE ABSENT ON DISK TOO.
//
// env -i clears the process environment and nothing else. Next loads
// .env, .env.local, .env.production and .env.production.local off the
// filesystem at build time, so on a machine that has one, pass 2 is the
// developer's own credentials wearing the label "absent" — green here,
// red on a deployment missing the same values. The owner named this hole;
// it is empty in this checkout and would not stay that way.
check(
  "build:ci knows which dotenv files Next reads at build time",
  ["\\.env\\b", "\\.env\\.local", "\\.env\\.production"].every((p) => new RegExp(p).test(ciSrc)),
  "all four of them, or the guard has a gap the next .env file walks through"
);
check(
  "...and REFUSES rather than calling that pass absent",
  // 1600, measured: the two are 935 characters apart because the
  // --allow-dotenv branch sits between them. A window tight enough to
  // break on a comment being edited is a check about formatting.
  /present\.length === 0\)[\s\S]{0,1600}process\.exit\(2\)/.test(ciSrc),
  "a pass that is not the absent case must not be reported as one"
);
check(
  "...and the log records which case pass 2 actually was",
  /dotenv\s*:/.test(ciSrc),
  "a reader of the log has to be able to tell the two apart afterwards"
);

// THE RULE SAYS EVERY PASS, SO THE CHECK RANGES OVER EVERY PASS rather
// than counting occurrences: a third environment added without a TZ is
// the failure, and a count pinned at two would pass it.
const passesBlock = ciSrc.match(/const PASSES = \[([\s\S]*?)\n\];/);
const passEnvs = passesBlock ? passesBlock[1].split(/\benv:/).slice(1) : [];
check(
  "build:ci declares at least two build environments",
  passEnvs.length >= 2,
  `found ${passEnvs.length}`
);
check(
  "...and EVERY one of them pins the timezone",
  passEnvs.length >= 2 && passEnvs.every((e) => /\bTZ\b/.test(e)),
  passEnvs.map((e, i) => `pass ${i + 1}: ${/\bTZ\b/.test(e) ? "TZ" : "NO TZ"}`).join(", ")
);
check(
  "...to UTC, which is what the builder runs",
  /const BUILDER_TZ = "UTC"/.test(ciSrc),
  "a pin to the machine's own zone is not a pin"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
