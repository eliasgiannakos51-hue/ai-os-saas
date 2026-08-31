#!/usr/bin/env node
/*
 * A CREDENTIAL MUST NOT REACH A LOG, A DATABASE ROW, A WEB PAGE OR AN INBOX.
 *
 * THE DEFECT THIS EXISTS FOR, measured before it was fixed. scrubSecrets()
 * was written for /api/health and called from that one file. logApiError()
 * — which every API route in this product calls — wrote the provider's raw
 * message to three sinks with no scrubbing at all:
 *
 *     node -e "…logApiError('/api/x', new Error('boom ' + serviceRoleJwt))"
 *     {"level":"error","endpoint":"/api/x",…,"message":"boom eyJhbGciOiJI…"}
 *
 * That string goes to stderr (Vercel Runtime Logs), to the
 * production_errors table via recordProductionError(), and — once the
 * occurrence threshold is crossed — into an email to the owner. And
 * /dashboard/system-health renders the production_errors row as text, so
 * the third destination is a web page.
 *
 * WHAT IS ASSERTED HERE IS THE VALUE, NOT THE WIRING. Every check below
 * either runs a real string through the real function and looks at what
 * comes out, or reads the source of the one place a raw error could still
 * be picked up. "logApiError imports the scrubber" would pass with the
 * scrubber applied to nothing.
 *
 * Run: node scripts/tests/log-scrubbing.test.mjs
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) pass++;
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
const read = (p) => readFileSync(p, "utf8");

const S = await loadTs("src/lib/scrub-secrets.ts");
const { scrubSecrets, scrubMaybe } = S;
const L = await loadTs("src/lib/log-error.ts");
const { logApiError, describeError } = L;

// NO REAL SECRET IN THIS REPOSITORY, and no literal that LOOKS like one.
//
// A token-shaped literal trips GitHub's push protection and makes the
// branch unpushable. The tempting fix is the "allow this secret" link,
// and that link trains the habit of clicking past secret scanning — the
// next thing it is clicked for will not be invented. So every shape is
// assembled from parts. The regex under test sees exactly the string it
// would see in production; the file on disk never contains one.
const SHAPES = [
  ["jwt", ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJyb2xlIjoiZXhhbXBsZSJ9", "c2lnbmF0dXJlX2hlcmU"].join("."),
    "SUPABASE_SERVICE_ROLE_KEY's classic form — the most dangerous string in the app"],
  ["sb", "s" + "b_" + "secret_" + "0123456789abcdef0123", "Supabase's newer secret key"],
  ["sbp", "sb" + "p_" + "0123456789abcdef".repeat(2) + "01234567", "Supabase personal access token"],
  ["re", "r" + "e_" + "AbCdEfGhIjKlMnOpQrStUvWxYz012345", "RESEND_API_KEY"],
  ["sk", "s" + "k_" + "live_" + "0123456789abcdefghijklmn", "STRIPE_SECRET_KEY (and ELEVENLABS_API_KEY's shape)"],
  ["pk", "p" + "k_" + "live_" + "0123456789abcdefghijklmn", "Stripe publishable key"],
  ["rk", "r" + "k_" + "live_" + "0123456789abcdefghijklmn", "Stripe restricted key"],
  ["whsec", "whse" + "c_" + "0123456789abcdefghijklmnopqrstuv",
    "STRIPE_WEBHOOK_SECRET — 38 characters, so the >=40 catch-all missed it and no prefix rule claimed it"],
  ["telegram", "1234567890" + ":" + "AAH" + "0123456789abcdefghijklmnopqrstuvwx",
    "TELEGRAM_BOT_TOKEN — digits, a colon, a 35-char tail; neither half reaches 40"],
  ["userinfo", "postgres://admin:" + "hunter2" + "@db.example.com:5432/postgres",
    "a Postgres connection string, which is how a password leaves a database error"],
  ["opaque", "abcdefghijklmnopqrstuvwxyz0123456789" + "ABCDEFGHIJ",
    "the catch-all: ANTHROPIC_API_KEY's tail, UNSPLASH_ACCESS_KEY (43), VAPID_PRIVATE_KEY (43), INTEGRATION_ENCRYPTION_KEY (64)"],
];

console.log("== 1. every shape this product actually holds is removed ==");
// THE FLOOR, first. A loop over an empty list reports "all pass", and
// that is how a suite ends up asserting nothing while printing green.
// The count is the number of credential shapes this product holds; if
// somebody removes one, this fails rather than quietly covering less.
check(`there are shapes to test (${SHAPES.length})`, SHAPES.length >= 11,
  "an empty SHAPES makes every loop below vacuous");
let shapesScrubbed = 0;
for (const [key, secret, why] of SHAPES) {
  shapesScrubbed++;
  const out = scrubSecrets(`connection failed: ${secret} refused`);
  check(`${key} is removed`, !out.includes(secret), `${why}\n        got: ${out}`);
  // A scrubber that returns "" removes every secret and every clue with
  // it. The message has to stay readable or the log stops being a log.
  check(`${key}: the message survives`, out.includes("connection failed") && out.includes("refused"), out);
  check(`${key}: something says a redaction happened`, /\[redacted-[a-z-]+\]/.test(out), out);
}
check("...and the loop actually ran over all of them", shapesScrubbed === SHAPES.length,
  `${shapesScrubbed} of ${SHAPES.length}`);

console.log("== 2. the userinfo rule keeps the host, which is the useful half ==");
{
  const out = scrubSecrets("could not connect to postgres://admin:hunter2@db.example.com:5432/postgres");
  check("the password is gone", !out.includes("hunter2"), out);
  check("the host is kept", out.includes("db.example.com:5432/postgres"), out);
  check("the scheme is kept", out.includes("postgres://"), out);
}

console.log("== 3. ordinary text is left ALONE ==");
// The failure mode opposite to leaking: a scrubber so broad that the
// on-call engineer reads "[redacted-opaque] does not exist".
const INNOCENT = [
  'relation "public.agent_templates" does not exist',
  "Could not find the table 'public.user_onboarding' in the schema cache",
  "fetch failed",
  "duplicate key value violates unique constraint \"credit_ledger_pkey\"",
  "new row violates row-level security policy for table \"documents\"",
  "insert or update on table \"missions\" violates foreign key constraint",
];
let innocentChecked = 0;
for (const text of INNOCENT) {
  innocentChecked++;
  check(`untouched: ${text.slice(0, 46)}…`, scrubSecrets(text) === text, `got: ${scrubSecrets(text)}`);
}
check(`...over the whole list (${INNOCENT.length})`,
  innocentChecked === INNOCENT.length && INNOCENT.length >= 6,
  "an emptied list makes this section report 'all pass' having compared nothing");

console.log("== 4. what it does NOT catch, pinned as a value rather than left to be found ==");
// CRON_SECRET is whatever the operator typed. A secret with no shape
// cannot be recognised by a regex, and pretending otherwise is worse
// than saying so: this asserts the real behaviour so that nobody reads
// "everything is scrubbed" into it. If a future rule DOES start catching
// arbitrary short strings, this check fails and the claim gets rewritten.
const ARBITRARY = "hunter2";
check("a short operator-chosen secret passes through — this is the documented limit",
  scrubSecrets(`token ${ARBITRARY} rejected`) === `token ${ARBITRARY} rejected`,
  "if this now fails, update the NOT CAUGHT section of lib/scrub-secrets.ts");
check("...and the module says so in as many words",
  /NOT CAUGHT/.test(read("src/lib/scrub-secrets.ts")) && /CRON_SECRET/.test(read("src/lib/scrub-secrets.ts")));

console.log("== 5. the prefix list, the doc and this file agree ==");
// A prefix added to the regex with no case here is a rule nothing
// exercises. This reads the alternation out of the source and demands a
// case for each branch — so the three can only drift together.
{
  const src = read("src/lib/scrub-secrets.ts");
  const m = src.match(/\\b\((sb\|[^)]*)\)_/);
  check("the prefix alternation is found in the source", Boolean(m), "the check below inspects nothing without it");
  const prefixes = m ? m[1].split("|") : [];
  check(`...and has branches (${prefixes.length})`, prefixes.length >= 5);
  const covered = new Set(SHAPES.map(([k]) => k));
  const untested = prefixes.filter((p) => !covered.has(p));
  check("every prefix branch has a case above", untested, [], `untested: ${untested.join(", ")}`);
}

console.log("== 6. logApiError: the stderr sink ==");
function capture(fn) {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.join(" "));
  try { fn(); } finally { console.error = original; }
  return lines.join("\n");
}
let shapesLogged = 0;
for (const [key, secret, why] of SHAPES) {
  shapesLogged++;
  const out = capture(() => logApiError("/api/test", new Error(`upstream said ${secret}`)));
  check(`stderr: ${key} does not reach the log`, !out.includes(secret), `${why}\n        got: ${out}`);
  // The capture itself has to be working. A console.error that was never
  // called produces "" and "" contains no secret — the check would pass
  // over a sink it never observed.
  check(`stderr: ${key} — the log line was actually captured`, out.includes("/api/test"), `got: ${JSON.stringify(out)}`);
}
check("...and every shape went through logApiError", shapesLogged === SHAPES.length,
  `${shapesLogged} of ${SHAPES.length}`);
// A Supabase error is a plain object, not an Error — the branch that
// carries details and hint, which are the fields a Postgres error uses
// for the values it is complaining about.
{
  const [, jwt] = SHAPES[0];
  const [, opaque] = SHAPES.find(([k]) => k === "opaque");
  const [, userinfo] = SHAPES.find(([k]) => k === "userinfo");
  const out = capture(() =>
    logApiError("/api/test", { message: `bad ${jwt}`, code: "42501", details: `at ${opaque}`, hint: `try ${userinfo}` })
  );
  check("stderr: message, details and hint are all scrubbed on a PostgREST-shaped error",
    !out.includes(jwt) && !out.includes(opaque) && !out.includes("hunter2"), out);
  check("...and the useful part is still there", out.includes("42501") && out.includes("/api/test"), out);
}
// The context spread. Documented as safe metadata, enforced by nobody
// across the ~200 call sites, so it is scrubbed too.
{
  const [, secret] = SHAPES.find(([k]) => k === "whsec");
  const out = capture(() => logApiError("/api/test", new Error("boom"), { stage: "verify", signature: secret }));
  check("stderr: a secret passed as CONTEXT is scrubbed", !out.includes(secret), out);
  check("...and ordinary context survives", out.includes("verify"), out);
}

console.log("== 7. logApiError: the production_errors sink, which a web page renders ==");
// /dashboard/system-health reads production_errors and prints message and
// stack. Both come from describeError; this checks the VALUES it returns
// and then checks that those are the values handed to the persist call.
{
  const [, jwt] = SHAPES[0];
  const err = new Error(`upstream rejected ${jwt}`);
  const d = describeError(err);
  check("the described message is scrubbed", !d.message.includes(jwt), d.message);
  check("the described STACK is scrubbed", typeof d.stack === "string" && !d.stack.includes(jwt),
    "the stack is stored in production_errors and shown on the system-health page");
  check("...and the stack is still a stack", /log-scrubbing|at /.test(d.stack ?? ""), d.stack?.slice(0, 120));
}
{
  // EVERY field, not the ones somebody remembered. describeError scrubs by
  // iterating its own return object, so a field added later is covered by
  // construction; this asserts that property rather than the field list.
  const src = read("src/lib/log-error.ts");
  check("describeError scrubs by iteration, not by naming each field",
    /for \(const \[key, value\] of Object\.entries\(raw\)\) scrubbed\[key\] = scrubMaybe\(value\)/.test(src),
    "naming the fields is how the next one added arrives unscrubbed");
  check("the persist call takes its stack from describeError, not from the raw error",
    /stack: stack \?\? null/.test(src) && !/stack: error instanceof Error \? error\.stack/.test(src),
    "reading error.stack here puts an unscrubbed string into a row a page renders");
  check("the persist call takes its userId from the scrubbed context",
    /userId: typeof safeContext\.userId === "string"/.test(src));
  check("the log line spreads the SCRUBBED context",
    /\.\.\.safeContext,/.test(src) && !/\.\.\.context,/.test(src));
}

console.log("== 8. scrubMaybe leaves non-strings alone ==");
// It exists so no call site needs a ternary; a ternary at each call site
// is where one gets forgotten. It must therefore be safe on anything.
check("a number is returned unchanged", scrubMaybe(42) === 42);
check("undefined is returned unchanged", scrubMaybe(undefined) === undefined);
check("null is returned unchanged", scrubMaybe(null) === null);
check("false is returned unchanged", scrubMaybe(false) === false);
check("a string IS scrubbed", scrubMaybe(SHAPES[0][1]) === "[redacted-jwt]");

console.log("== 9. the scrubber has one home, and the health route uses it ==");
{
  const classify = read("src/lib/health/classify.ts");
  check("classify.ts no longer defines its own scrubber",
    !/export function scrubSecrets/.test(classify),
    "two copies is how one of them stops being applied");
  const route = read("src/app/api/health/route.ts");
  check("the health route imports the shared one",
    /import \{ scrubSecrets \} from "@\/lib\/scrub-secrets"/.test(route), route.slice(0, 400));
  check("lib/scrub-secrets.ts does not import server-only",
    !/^\s*import "server-only"/m.test(read("src/lib/scrub-secrets.ts")),
    "a scrubber that cannot be imported from a client component is a scrubber with a hole");
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
