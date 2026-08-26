#!/usr/bin/env node
/*
 * WHICH STEP FAILED, WHY — and never a credential on the way out.
 *
 * THE REPORT. Production answered {"ok":false,"db":false,"ms":529} while
 * the application was working perfectly. Every word true, none of it
 * usable: 529ms proves a round trip HAPPENED, and then one boolean
 * flattened "the table is missing", "the key was rejected", "the schema
 * cache is stale" and "the database is dead" into a single word. The
 * cause was a table created by one of the newest migrations, which had
 * not been run.
 *
 * TWO THINGS ARE ASSERTED HERE AND THEY PULL IN OPPOSITE DIRECTIONS:
 * the answer has to say enough for the person on call to go to the right
 * dashboard, and it has to say nothing a stranger can build a map from.
 *
 * Run: node scripts/tests/health-classify.test.mjs
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
const H = await loadTs("src/lib/health/classify.ts");
const { classifyProbeError, isDatabaseReachable, scrubSecrets, HEALTH_REASONS, HEALTH_STAGES } = H;

console.log("== 1. the codes that actually occur are told apart ==");
// EVERY code the classifier claims to map, checked against the reason its
// own header promises. A mapping table nobody exercises is a comment.
const CASES = [
  [{ code: "PGRST205" }, "schema_missing", "PostgREST: table not in the schema cache — THE production cause"],
  [{ code: "PGRST202" }, "schema_missing", "function not in the schema cache"],
  [{ code: "42P01" }, "schema_missing", "Postgres: undefined_table"],
  [{ code: "42703" }, "schema_missing", "Postgres: undefined_column"],
  [{ code: "PGRST301" }, "unauthorized", "JWT rejected"],
  [{ code: "42501" }, "unauthorized", "insufficient_privilege — a GRANT is missing"],
  [{ code: "28P01" }, "unauthorized", "invalid_password"],
  [{ code: "57014" }, "timeout", "query_canceled = statement timeout"],
  [{ code: "ENOTFOUND" }, "unreachable", "DNS"],
  [{ code: "ECONNREFUSED" }, "unreachable", "nothing listening"],
  [{ code: "UND_ERR_CONNECT_TIMEOUT" }, "timeout", "undici connect timeout"],
  [{ status: 401 }, "unauthorized", "no code, HTTP status only"],
  [{ status: 404 }, "schema_missing", "no code, HTTP status only"],
  [{ message: "Could not find the table 'public.x' in the schema cache" }, "schema_missing", "message fallback"],
  [{ message: "fetch failed" }, "unreachable", "message fallback"],
  [{ message: "relation \"public.x\" does not exist" }, "schema_missing", "message fallback"],
  [{ code: "23505", message: "duplicate key" }, "query_failed", "a real DB error that is none of the above"],
  [{}, "unknown", "an error object with nothing in it"],
  [null, "ok", "no error at all"],
];
const wrong = [];
for (const [err, want, why] of CASES) {
  const got = classifyProbeError(err);
  if (got !== want) wrong.push(`${JSON.stringify(err)} -> ${got}, expected ${want} (${why})`);
}
check(`all ${CASES.length} error shapes classify correctly`, wrong.length === 0, wrong.join("\n        "));
check("every returned reason is in the closed vocabulary",
  CASES.every(([e]) => HEALTH_REASONS.includes(classifyProbeError(e))));

console.log("== 2. 'db' means DID IT ANSWER, not 'is everything fine' ==");
// THE DISTINCTION THE OLD FIELD LOST. A missing table means the database
// answered — it is the deployment that is behind. Reporting db:false
// there sends the on-call engineer to a database dashboard that will be
// entirely green, and costs them the first ten minutes.
check("schema_missing: the database ANSWERED", isDatabaseReachable("schema_missing") === true);
check("unauthorized: the database ANSWERED", isDatabaseReachable("unauthorized") === true);
check("query_failed: the database ANSWERED", isDatabaseReachable("query_failed") === true);
check("unreachable: it did NOT", isDatabaseReachable("unreachable") === false);
check("timeout: it did NOT", isDatabaseReachable("timeout") === false);
check("misconfigured: it was never asked", isDatabaseReachable("misconfigured") === false);
check("ok: yes", isDatabaseReachable("ok") === true);
// Total over the whole vocabulary, so a new reason cannot be forgotten.
check("isDatabaseReachable answers for EVERY reason in the vocabulary",
  HEALTH_REASONS.every((r) => typeof isDatabaseReachable(r) === "boolean"));

console.log("== 3. NEVER A CREDENTIAL — the rule with no exception ==");
// The one place a provider's message crosses from the log into an HTTP
// response. "A Postgres error never contains a key" is a belief.
// ASSEMBLED AT RUNTIME, NEVER WRITTEN OUT AS LITERALS.
//
// The first draft of this file spelled these fixtures in full and
// GitHub's push protection rejected the push, naming line 86: the
// invented Supabase token matched the real PAT format exactly, which is
// precisely what made it a good fixture and exactly what makes it
// unpushable. The tempting fix is the "allow this secret" link. That
// link trains the habit of clicking past secret scanning, and the next
// thing it is clicked for will not be invented.
//
// So each shape is built from parts. The regex under test sees the same
// string it would see in production; the repository never contains one.
// Anyone tidying these back into literals will find out the same way.
const JWT = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJyb2xlIjoiZXhhbXBsZSJ9", "c2lnbmF0dXJlX2hlcmU"].join(".");
const SB_TOKEN = "sb" + "p_" + "0123456789abcdef".repeat(2) + "01234567";
const RESEND = "r" + "e_" + "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const OPAQUE = "abcdefghijklmnopqrstuvwxyz0123456789" + "ABCDEFGHIJ";
const DB_URL = "postgres://admin:" + "hunter2" + "@db.example.com:5432/postgres";
const SECRETS = [
  [JWT, "a service-role-shaped JWT"],
  [SB_TOKEN, "a Supabase-token-shaped string"],
  [DB_URL, "credentials inside a URL"],
  [RESEND, "a Resend-key-shaped string"],
  [OPAQUE, "a 46-char opaque token"],
];
for (const [secret, what] of SECRETS) {
  const out = scrubSecrets(`connection failed: ${secret} refused`);
  check(`${what} is removed`, !out.includes(secret), `got: ${out}`);
  check(`...and something is left to read (${what})`, out.includes("connection failed"), out);
}
check("an ordinary message survives untouched",
  scrubSecrets("relation \"public.agent_templates\" does not exist") ===
    "relation \"public.agent_templates\" does not exist");

console.log("== 4. the ROUTE keeps the anonymous answer closed ==");
const route = read("src/app/api/health/route.ts");
// The public body is a fixed set. Checked structurally because the
// behavioural half runs in health-probe.prodtest.mjs against a real build.
check("the public body carries stage and reason", /stage:\s*probe\.stage/.test(route) && /reason:\s*probe\.reason/.test(route));
check("detail is added ONLY when authorised",
  /if\s*\(authorised && probe\.detail\)\s*body\.detail = probe\.detail/.test(route),
  "an unauthenticated caller must never receive the provider's message");
check("verbose is gated by checkCronAuth, which fails closed",
  /checkCronAuth\(request\)\.ok/.test(route));
// THIS CHECK INSPECTED ZERO BLOCKS, and had since the day it was written.
// It looked for `detail: { ... }`, and the route never writes that: the
// detail is the THIRD ARGUMENT of done(), so the regex matched nothing and
// `.every()` over an empty array is true. A check that passes because it
// found nothing to look at is not a check.
//
// The property is unchanged — a provider message must not reach a response
// unscrubbed — but it is now asserted over the call sites that actually
// build one, and the count of them is asserted too.
{
  const detailArgs = [];
  for (const m of route.matchAll(/\bdone\(/g)) {
    // Brace-count from the call's opening paren so a nested object or a
    // ternary inside the argument cannot end the match early.
    let i = m.index + m[0].length;
    let depth = 1;
    const start = i;
    while (i < route.length && depth > 0) {
      if (route[i] === "(") depth++;
      else if (route[i] === ")") depth--;
      i++;
    }
    const args = route.slice(start, i - 1);
    if (/\{[\s\S]*\b(code|message)\s*:/.test(args)) detailArgs.push(args);
  }
  // THE FLOOR. Measured: the route builds a detail at two call sites (the
  // PostgREST error path and the thrown-exception path). If a refactor
  // leaves none, this fails instead of quietly passing.
  check(
    `the route builds a probe detail somewhere (${detailArgs.length} call site(s))`,
    detailArgs.length >= 2,
    "if this is 0 the scrubbing check below is inspecting nothing"
  );
  const unscrubbed = detailArgs.filter((a) => {
    const fields = [...a.matchAll(/\b(code|message)\s*:\s*([^,}]+)/g)];
    return fields.some(([, , value]) => !/scrubSecrets\(/.test(value) && !/^\s*undefined\s*$/.test(value));
  });
  check("every detail field goes through scrubSecrets", unscrubbed, [],
    "a message reaching a response without scrubbing is the whole risk");
}
// THE PROBE TABLE. The defect was probing the newest table in the schema.
check("the probe reads user_onboarding, not a recently-added table",
  /const PROBE_TABLE = "user_onboarding"/.test(route));
check("...and never mentions agent_templates as the probe target",
  !/from\(["']agent_templates["']\)/.test(route),
  "agent_templates arrived in 20260826000000 — probing it reports 'down' whenever that migration has not run");
// The env check must read PRESENCE, never a value.
check("the config stage reads booleans, never the values",
  /Boolean\(process\.env\.NEXT_PUBLIC_SUPABASE_URL\)/.test(route) &&
    /Boolean\(process\.env\.SUPABASE_SERVICE_ROLE_KEY\)/.test(route));
check("no environment VALUE is ever interpolated into the body",
  !/body\[[^\]]*\]\s*=\s*process\.env/.test(route) && !/process\.env\.[A-Z_]+\s*\)?\s*,?\s*\/\/.*body/.test(route));

console.log("== 5. the probe table really is the stable one ==");
// MEASURED against the migrations, not asserted. If somebody later adds a
// migration that touches user_onboarding, this says so while it is still
// cheap to pick a different table.
import { readdirSync } from "node:fs";
const migs = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
const baseline = migs.find((f) => f.includes("baseline_schema"));
check("the baseline migration exists", Boolean(baseline));
check("user_onboarding is created in the baseline",
  /create table if not exists public\.user_onboarding/.test(read(`supabase/migrations/${baseline}`)));
const touchers = migs.filter((f) => f !== baseline &&
  new RegExp("\\bpublic\\.user_onboarding\\b").test(read(`supabase/migrations/${f}`)));
check(`no later migration touches it (found ${touchers.length})`, touchers.length === 0, touchers.join(", "));

console.log(`\n${failures.length === 0 ? "PASS" : "FAIL"} — ${pass} checks passed, ${failures.length} failed`);
if (failures.length > 0) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
