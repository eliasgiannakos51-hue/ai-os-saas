// EVERY ENVIRONMENT VARIABLE THE CODE READS IS WRITTEN DOWN, AND
// EVERYTHING WRITTEN DOWN IS STILL READ.
//
// The rule this enforces has been in the working agreement for months:
// every new variable states its default and what goes SILENT without it.
// It was being kept by hand, and by hand it had drifted by fifty-nine
// variables — including the four annual Stripe price IDs, without which
// the annual toggle appears on /pricing and Checkout fails at the moment
// of payment, and the three VAPID keys, without which no push
// notification is ever sent and nothing errors.
//
// WHY NOBODY NOTICED. A grep for `process.env.X` finds 51 of the 130.
// The other 79 are named as STRINGS and read through `process.env[name]`:
//
//     export const FILE_LIMIT_ENV_VARS: Record<PlanSlug, string> = {
//       free: "FILE_LIMIT_FREE",
//
// Same blind spot as a Recharts dataKey or a Supabase .from("table") — a
// name the compiler never checks. My own first count of this gap said
// "fifteen" for exactly that reason, and was wrong by a factor of four.
// The collector in scripts/lib/env-usage.mjs reads both forms.
//
// THE REVERSE MATTERS TOO. A variable documented here and read nowhere
// is an instruction to set something that does nothing — and the day the
// code stops reading a real setting, this is what says so.
//
// Run: node scripts/tests/env-documented.test.mjs
import { readFileSync } from "node:fs";
import { envVarsReadByCode, envVarsInExample } from "../lib/env-usage.mjs";

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
function checkList(name, actual) {
  check(name, actual.length === 0, actual.slice(0, 12).join("\n        "));
}

const read = envVarsReadByCode();
const documented = envVarsInExample();
const documentedSet = new Set(documented);

console.log("== 1. the scan sees both ways a variable is named ==");
// A COLLECTOR THAT FINDS NOTHING AGREES WITH EVERY FILE. Two floors, one
// per form, so neither half can go blind while the other carries the
// count.
check(
  `the scan found the variables (${read.size})`,
  read.size >= 130,
  `${read.size} — this floor rises as settings are added, and never falls`,
);
// Named ONLY as process.env.X — nowhere in a map, nowhere in
// env-check.ts. STRIPE_WEBHOOK_SECRET was the first probe here and it
// proved nothing: the registry names it too, so it survived the direct
// reader being switched off. These four do not.
for (const directOnly of [
  "STRIPE_PRICE_STARTER",
  "FILE_MAX_UPLOADS_PER_HOUR",
  "PUBLISHED_SITE_DOMAIN",
  "MAX_DAILY_AI_CALLS",
]) {
  check(`a directly-named variable is found (${directOnly})`, read.has(directOnly));
}
// Named only as a string inside a map, invisible to a process.env grep.
for (const indirect of ["FILE_LIMIT_GROWTH", "VOICE_MINUTES_STARTER", "GROQ_API_KEY"]) {
  check(`an indirectly-named variable is found (${indirect})`, read.has(indirect));
}
// Named only as a lone constant, with no colon, comma or bracket before it.
check("a lone ENV_VAR constant is found (AI_BATCH_ENABLED)", read.has("AI_BATCH_ENABLED"));

console.log("\n== 2. nothing the code reads is undocumented ==");
checkList(
  `every variable is in .env.local.example (${read.size} read)`,
  [...read.keys()]
    .filter((v) => !documentedSet.has(v))
    .sort()
    .map((v) => `${v} — read in ${read.get(v)}, documented nowhere`),
);

console.log("\n== 3. nothing documented is dead ==");
checkList(
  `every documented variable is still read (${documented.length} documented)`,
  documented.filter((v) => !read.has(v)).sort(),
);
// A DUPLICATED KEY MEANS THE LAST ONE SILENTLY WINS, which is how a
// documented default quietly stops being the one in force.
const seen = new Set();
const duplicated = documented.filter((v) => (seen.has(v) ? true : (seen.add(v), false)));
checkList("no variable is documented twice", [...new Set(duplicated)]);

console.log("\n== 4. every documented variable says what happens without it ==");
// The rule is DEFAULT + WHAT GOES SILENT, so a bare `NAME=` with no
// prose above it is a name, not documentation. Checked as the comment
// block immediately preceding each assignment.
const lines = readFileSync(".env.local.example", "utf8").split("\n");
const undocumented = [];
for (let i = 0; i < lines.length; i++) {
  const name = (lines[i].match(/^([A-Z0-9_]+)=/) || [])[1];
  if (!name) continue;
  // Walk back over any sibling assignments in the same family, then
  // require prose above them.
  let j = i - 1;
  while (j >= 0 && /^[A-Z0-9_]+=/.test(lines[j])) j--;
  let prose = 0;
  while (j >= 0 && (lines[j].startsWith("#") || lines[j].trim() === "")) {
    if (lines[j].startsWith("#")) prose += lines[j].length;
    j--;
  }
  if (prose < 60) undocumented.push(`${name} (only ${prose} characters of comment above it)`);
}
checkList("every variable has prose above it", undocumented);

console.log("\n== 5. the runtime registry and the setup file agree ==");
// env-check.ts warns at runtime about what is missing; this file is what
// somebody reads while setting the deployment up. A variable the runtime
// calls required or recommended, and the setup file never mentions, is a
// warning nobody can act on.
const { loadTs } = await import("./load-ts.mjs");
const { ENV_REQUIREMENTS } = await loadTs("src/lib/env-check.ts");
check(`the registry loaded (${ENV_REQUIREMENTS.length} entries)`, ENV_REQUIREMENTS.length >= 40);
checkList(
  "every required or recommended variable is in the setup file",
  ENV_REQUIREMENTS.filter((r) => r.level !== "optional")
    .filter((r) => !documentedSet.has(r.name))
    .map((r) => `${r.name} (${r.level})`),
);
// And the registry's own contract: anything not required must say what
// the code falls back to, because that is the half that tells an
// operator whether to care.
checkList(
  "every non-required registry entry names its fallback",
  ENV_REQUIREMENTS.filter((r) => r.level !== "required" && !r.fallback).map((r) => r.name),
);

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
