// EVERY CLAUSE OF log-scrubbing.test.mjs, BROKEN ON PURPOSE.
//
// The gate says "a credential does not reach a log, a database row, a web
// page or an inbox". That sentence rests on two things — a set of regexes
// that must each still match, and a logging function that must still
// apply them — and the regexes are the half where a weakening is
// invisible: {40,} becoming {60,} changes nothing anybody would notice
// until the day it matters.
//
// The defect it was written for is a mutation here: logApiError reading
// the raw error instead of the scrubbed description. That was the real
// state of this file until today, and it put a service-role JWT into
// stderr, into production_errors, and onto /dashboard/system-health.
//
// EVERY MUTATION IS A DELETION OR AN EDIT OF REAL CODE, never an
// `if (false)`.
//
// Run: node scripts/tests/log-scrubbing.mutation.mjs
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/log-scrubbing.test.mjs";
const SCRUB = "src/lib/scrub-secrets.ts";
const LOG = "src/lib/log-error.ts";
const ROUTE = "src/app/api/health/route.ts";
const CLASSIFY = "src/lib/health/classify.ts";

// See the comment on the mutation that uses this.
const USERINFO_RULE =
  '    .replace(/([a-z][a-z0-9+.-]*:\\/\\/)[^/@\\s]+:[^/@\\s]+' + "@" + '/gi, "$1[redacted-userinfo]@")';

function gateIsGreen() {
  try {
    execFileSync("node", [GATE], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const MUTATIONS = [
  // ---- the rules themselves, each weakened the way a tidy-up would ----
  {
    name: "the JWT rule is dropped",
    file: SCRUB,
    from: '    .replace(/eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}/g, "[redacted-jwt]")\n',
    to: "",
    expect: "the jwt fixture — each of its three runs is under 40 chars, so nothing else would catch it",
  },
  {
    name: "the JWT rule requires a longer header than a real one has",
    file: SCRUB,
    from: "/eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}/g",
    to: "/eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{40,}\\.[A-Za-z0-9_-]{8,}/g",
    expect: "a short payload segment is still a JWT",
  },
  {
    name: "whsec_ is dropped from the prefix list",
    file: SCRUB,
    from: '.replace(/\\b(sb|sbp|re|sk|pk|rk|whsec)_[A-Za-z0-9_-]{12,}/g, "[redacted-token]")',
    to: '.replace(/\\b(sb|sbp|re|sk|pk|rk)_[A-Za-z0-9_-]{12,}/g, "[redacted-token]")',
    expect: "STRIPE_WEBHOOK_SECRET is 38 characters — under the >=40 catch-all",
  },
  {
    name: "the prefix rule demands a longer tail than Resend's key has",
    file: SCRUB,
    from: "(sb|sbp|re|sk|pk|rk|whsec)_[A-Za-z0-9_-]{12,}",
    to: "(sb|sbp|re|sk|pk|rk|whsec)_[A-Za-z0-9_-]{40,}",
    expect: "re_ + 32 characters is 35 in total",
  },
  {
    name: "the Telegram bot-token rule is dropped",
    file: SCRUB,
    from: '    .replace(/\\b\\d{8,12}:[A-Za-z0-9_-]{30,}\\b/g, "[redacted-bot-token]")\n',
    to: "",
    expect: "neither half of a bot token reaches 40 characters",
  },
  {
    name: "the URL-userinfo rule is dropped",
    file: SCRUB,
    // ASSEMBLED, not written out. The rule ends in `@` immediately
    // followed by the regex flags, and the literal `@` + `/gi` reads as
    // an `@/…` import specifier to scripts/tests/gate-import-paths.test.mjs
    // — which then reports a gate importing a module named "gi". The gate
    // is right; this is data that happens to be shaped like a path, which
    // is the same class of mistake as a test fixture shaped like a secret.
    from: USERINFO_RULE + "\n",
    to: "",
    expect: "a Postgres password is short — no other rule sees it",
  },
  {
    name: "the userinfo rule eats the scheme along with the password",
    file: SCRUB,
    from: '"$1[redacted-userinfo]@"',
    to: '"[redacted-userinfo]@"',
    expect: "the host and scheme are the useful half and must survive",
  },
  {
    name: "the catch-all threshold is raised past the shortest key it covers",
    file: SCRUB,
    from: '.replace(/\\b[A-Za-z0-9_-]{40,}\\b/g, "[redacted-opaque]")',
    to: '.replace(/\\b[A-Za-z0-9_-]{60,}\\b/g, "[redacted-opaque]")',
    expect: "UNSPLASH_ACCESS_KEY and VAPID_PRIVATE_KEY are 43 characters",
  },
  {
    name: "the catch-all deletes rather than labels",
    file: SCRUB,
    from: '.replace(/\\b[A-Za-z0-9_-]{40,}\\b/g, "[redacted-opaque]")',
    to: '.replace(/\\b[A-Za-z0-9_-]{40,}\\b/g, "")',
    expect: "a log that silently loses text is a log nobody can reason about",
  },
  {
    name: "the catch-all also eats ordinary words",
    file: SCRUB,
    from: '.replace(/\\b[A-Za-z0-9_-]{40,}\\b/g, "[redacted-opaque]")',
    to: '.replace(/\\b[A-Za-z0-9_-]{4,}\\b/g, "[redacted-opaque]")',
    expect: "'relation public.agent_templates does not exist' must survive intact",
  },
  {
    name: "scrubMaybe stops scrubbing strings",
    file: SCRUB,
    from: "  return (typeof value === \"string\" ? (scrubSecrets(value) as unknown as T) : value);",
    to: "  return value;",
    expect: "it is the only thing logApiError calls",
  },

  // ---- THE DEFECT ITSELF, put back ----
  {
    name: "describeError stops scrubbing — the state this file was in until today",
    file: LOG,
    from: "  for (const [key, value] of Object.entries(raw)) scrubbed[key] = scrubMaybe(value);",
    to: "  for (const [key, value] of Object.entries(raw)) scrubbed[key] = value;",
    expect: "every sink reads describeError's output",
  },
  {
    name: "logApiError goes back to the unscrubbed reader",
    file: LOG,
    from: "  const { name, message, code, details, hint, stack } = describeError(error);",
    to: "  const { name, message, code, details, hint, stack } = readErrorFields(error);",
    expect: "the scrubbing is in describeError, not in its caller",
  },
  {
    name: "the persist call reads the raw stack again",
    file: LOG,
    from: "    stack: stack ?? null,",
    to: "    stack: error instanceof Error ? error.stack ?? null : null,",
    expect: "the stack is stored in production_errors and rendered on /dashboard/system-health",
  },
  {
    name: "the stack stops being described at all",
    file: LOG,
    from: "    return { name: error.name, message: error.message, stack: error.stack ?? undefined };",
    to: "    return { name: error.name, message: error.message };",
    expect: "a missing stack is not a scrubbed stack",
  },
  {
    name: "the log line spreads the raw context again",
    file: LOG,
    from: "      ...safeContext,",
    to: "      ...context,",
    expect: "'callers must not pass secrets' is enforced by nobody across ~200 call sites",
  },
  {
    name: "the context loop stops scrubbing",
    file: LOG,
    from: "    for (const [key, value] of Object.entries(context)) safeContext[key] = scrubMaybe(value);",
    to: "    for (const [key, value] of Object.entries(context)) safeContext[key] = value;",
    expect: "a signature passed as context is a credential",
  },

  // ---- one home ----
  {
    name: "the health route stops using the shared scrubber",
    file: ROUTE,
    from: 'import { scrubSecrets } from "@/lib/scrub-secrets";',
    to: 'import { scrubSecrets } from "@/lib/health/classify";',
    expect: "the scrubber has one home",
  },
  {
    name: "classify.ts grows a second copy",
    file: CLASSIFY,
    from: " * /api/health still imports it — from its new home.\n */",
    to: " */\nexport function scrubSecrets(text: string): string { return text; }",
    expect: "two copies is how one of them stops being applied",
  },

  // ---- THE INSTRUMENT'S OWN CLAUSES ----
  {
    name: "the shape list is emptied, so every loop reports 'all pass' over nothing",
    file: GATE,
    from: "const SHAPES = [",
    to: "const SHAPES = [].concat([",
    expect: "the floor on SHAPES.length",
  },
  {
    name: "the stderr loop runs over nothing",
    file: GATE,
    from: "for (const [key, secret, why] of SHAPES) {\n  shapesLogged++;",
    to: "for (const [key, secret, why] of []) {\n  shapesLogged++;",
    expect: "the count check after the loop",
  },
  {
    name: "the capture never observes the log line",
    file: GATE,
    from: '  console.error = (...args) => lines.push(args.join(" "));',
    to: "  console.error = () => {};",
    expect: "an empty capture contains no secret and would pass every check above it",
  },
  {
    name: "the prefix cross-check looks for an alternation that is not there",
    file: GATE,
    from: "const m = src.match(/\\\\b\\((sb\\|[^)]*)\\)_/);",
    to: 'const m = src.match(/NOTHING_MATCHES_THIS/);',
    expect: "the branch count floor",
  },
  {
    name: "the 'ordinary text survives' list is emptied",
    file: GATE,
    from: "for (const text of INNOCENT) {",
    to: "for (const text of []) {",
    expect: "nothing — this is the clause with no floor, and the mutation says so",
  },
];

console.log("log-scrubbing mutations\n");
if (!gateIsGreen()) {
  console.log("baseline: the gate is RED on the unmutated tree — fix that first.");
  process.exit(1);
}
console.log("baseline: the gate is GREEN on the unmutated tree");

const originals = new Map();
let caught = 0;
const survivors = [];
const missed = [];

for (const m of MUTATIONS) {
  const before = readFileSync(m.file, "utf8");
  if (!before.includes(m.from)) {
    missed.push(`${m.name} — ANCHOR NOT FOUND in ${m.file}; the mutation never applied`);
    continue;
  }
  if (before.split(m.from).length - 1 !== 1) {
    missed.push(`${m.name} — anchor appears more than once in ${m.file}, so the edit is ambiguous`);
    continue;
  }
  originals.set(m.file, before);
  writeFileSync(m.file, before.replace(m.from, () => m.to));

  const red = !gateIsGreen();

  writeFileSync(m.file, before);
  originals.delete(m.file);

  if (red) {
    caught++;
    console.log(`  CAUGHT  ${m.name}${m.expect ? `\n          -> by ${m.expect}` : ""}`);
  } else {
    survivors.push(`${m.name} (${m.file}) — the gate stayed GREEN`);
    console.log(`  SURVIVED  ${m.name}`);
  }
}

console.log("");
if (!gateIsGreen()) {
  console.log("baseline: the gate is RED on the restored tree — a mutation was not put back.");
  process.exit(1);
}
console.log("baseline: the gate is green again on the restored tree\n");

console.log(`${caught} of ${MUTATIONS.length} mutations caught.`);
if (missed.length > 0) {
  console.log("\nMISSED ANCHORS (these mutations never ran):");
  for (const s of missed) console.log(`  - ${s}`);
}
if (survivors.length > 0) {
  console.log("\nSURVIVORS:");
  for (const s of survivors) console.log(`  - ${s}`);
}
if (missed.length > 0 || survivors.length > 0) process.exit(1);
console.log("Every clause of log-scrubbing.test.mjs is load-bearing.");
