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
  // check() TAKES A BOOLEAN. `check(name, someArray, [])` reads perfectly
  // and is always green — every array is truthy in JavaScript, including
  // the empty one. Two conventions share this name across the gates:
  // check(name, cond, detail) here, check(name, actual, expected)
  // elsewhere, and a call copied between them passes forever while
  // printing its own failure text. See db-inventory.test.mjs, where the
  // same guard was added after the deleted-table regression did exactly
  // that.
  if (typeof cond !== "boolean") {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        check() takes a BOOLEAN; got ${Array.isArray(cond) ? "an array" : typeof cond}`);
    return;
  }
  if (cond) pass++;
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
const read = (p) => readFileSync(p, "utf8");
const H = await loadTs("src/lib/health/classify.ts");
const { classifyProbeError, isDatabaseReachable, HEALTH_REASONS, HEALTH_STAGES } = H;

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

console.log("== 3. NEVER A CREDENTIAL — moved, because it was unreachable ==");
// The scrubber used to be DEFINED in classify.ts and exercised here.
// It now lives in src/lib/scrub-secrets.ts, and its behaviour — every
// credential shape this product actually holds, run through the real
// function — is asserted in scripts/tests/log-scrubbing.test.mjs.
//
// It was moved because it was correct and applied in exactly one file
// while logApiError(), which every API route calls, wrote provider
// messages to stderr, to production_errors and to an alert email with no
// scrubbing at all. What is left here is the property that belongs to
// THIS file: classify.ts must not grow a second copy.
check("classify.ts does not define a scrubber of its own",
  !/function scrubSecrets/.test(read("src/lib/health/classify.ts")),
  "two copies is how one of them stops being applied — see lib/scrub-secrets.ts");
check("...and it still points at where the real one lives",
  /lib\/scrub-secrets\.ts/.test(read("src/lib/health/classify.ts")));

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
  check("every detail field goes through scrubSecrets", unscrubbed.length === 0,
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
// A FLOOR ON THE SCAN. "No migration reshapes it" is trivially true of a
// directory listing that came back empty.
check(`the migrations were read (${migs.length})`, migs.length >= 5, String(migs.length));
const touchers = migs.filter((f) => f !== baseline &&
  new RegExp("\\bpublic\\.user_onboarding\\b").test(read(`supabase/migrations/${f}`)));
// THE PROPERTY, NOT THE PROXY. "Nothing touches it" was a stand-in for
// what actually matters: the probe runs `select("user_id").limit(1)`, and
// that must not break when the schema is one migration behind the code —
// which is the single most common state a deploying project is in.
//
// An `add column if not exists` cannot break that select. A drop, a
// rename, a type change or a table drop can, and one of those arriving
// unnoticed is the fault this section exists to prevent. So the check is
// now about the VERBS, which is stricter than counting files: a later
// migration may add to the table and may not reshape it.
//
// V4.6 #10 added home_seen_at, which is why the distinction had to be
// made rather than the count bumped.
const DANGEROUS = /\b(drop\s+table|drop\s+column|rename\s+to|rename\s+column|alter\s+column\s+\w+\s+type|alter\s+column\s+\w+\s+set\s+not\s+null)\b/i;

// THE WHOLE INSTRUMENT, NOT JUST ITS REGEX. An earlier draft asserted
// DANGEROUS against four strings and ran the split/filter pipeline only
// over the real tree, where exactly one migration touches the table and
// it is additive. That is the vacuity shape: every clause of the
// statement walk could have been broken — a split on the wrong
// character, a filter that matched nothing — and reshapers would still
// have come back empty and the section would still have been green.
// Lifted into a function so the walk itself is fed inputs it must get
// right, and reshapesProbeTable() is what both the samples and the tree
// scan call.
function reshapesProbeTable(sql) {
  return sql
    .split(";")
    // Only the statements that name the probe table.
    .filter((stmt) => /\bpublic\.user_onboarding\b/.test(stmt))
    .some((stmt) => DANGEROUS.test(stmt));
}

// THE SAMPLES, each of which the instrument must classify correctly.
// Written as whole migrations rather than as bare clauses, because the
// statement split and the table filter are the parts that were unproven.
const RESHAPE_SAMPLES = [
  ["a drop column", "alter table public.user_onboarding drop column goal;", true],
  ["a rename column", "alter table public.user_onboarding rename column goal to aim;", true],
  ["a type change", "alter table public.user_onboarding alter column goal type text;", true],
  ["a table rename", "alter table public.user_onboarding rename to public.onboarding;", true],
  ["a table drop", "drop table public.user_onboarding;", true],
  [
    "an additive column",
    "alter table public.user_onboarding add column if not exists home_seen_at timestamptz;",
    false,
  ],
  // THE ONE THE STATEMENT SPLIT EXISTS FOR. A migration that drops a
  // column from a DIFFERENT table and, separately, adds one to the probe
  // table is safe — and a scan that tested the file as one blob would
  // call it a reshape and this section would go red for no reason.
  [
    "a drop on another table beside an add on this one",
    "alter table public.user_ideas drop column note;\n" +
      "alter table public.user_onboarding add column if not exists home_seen_at timestamptz;",
    false,
  ],
  // ...AND ITS MIRROR, which is the failure that actually costs
  // something: a drop on the probe table hidden after a safe statement.
  // A scan that only read the first statement would miss it.
  [
    "an add on another table beside a drop on this one",
    "alter table public.user_ideas add column if not exists note text;\n" +
      "alter table public.user_onboarding drop column user_id;",
    true,
  ],
];
for (const [name, sql, expected] of RESHAPE_SAMPLES) {
  check(
    `the reshape scan calls ${name} ${expected ? "dangerous" : "safe"}`,
    reshapesProbeTable(sql) === expected,
    `got ${reshapesProbeTable(sql)}`
  );
}

const reshapers = touchers.filter((f) => reshapesProbeTable(read(`supabase/migrations/${f}`)));
// A FLOOR ON THE TOUCHERS TOO. `reshapers.length === 0` is trivially
// true when nothing was scanned, and the table-name filter inside
// reshapesProbeTable is the thing that could silently make it so.
// One migration touches user_onboarding today: 20260914000000_home_seen_at.sql.
check(
  `the probe table's later migrations were found (${touchers.length})`,
  touchers.length >= 1,
  `${touchers.length} — a reshape scan over zero files says nothing`
);
check(
  `later migrations only ADD to the probe table (${touchers.length} touch it, ${reshapers.length} reshape it)`,
  reshapers.length === 0,
  `${reshapers.join(", ")} — the probe reads select("user_id"), which a drop/rename/type change breaks`
);

console.log(`\n${failures.length === 0 ? "PASS" : "FAIL"} — ${pass} checks passed, ${failures.length} failed`);
if (failures.length > 0) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
