// EVERY TABLE, NOT EVERY TABLE SOMEBODY REMEMBERED.
//
// WHAT WAS ACTUALLY RUNNING BEFORE THIS FILE. db-migrations.test.mjs
// section 5 is the only thing in the build that looks at row level
// security, and what it asserts, in full, is:
//
//     check("row level security is enabled somewhere in the path", ...)
//     check("there are enough of them to be plausible", rlsStatements >= 40)
//
// One boolean over the whole corpus, and a count. A table added tomorrow
// with no RLS and `grant select on public.new_table to authenticated`
// moves that count UP, not down. Nothing anywhere would go red.
//
// ITS REASON FOR STOPPING THERE WAS A GOOD ONE, and is the thing this file
// had to solve rather than ignore. Its comment says the first version
// counted `alter table X enable row level security` and reported 47 of 70
// — "twenty-three unprotected tables" — while the live database said 70 of
// 70, because the baseline schema enables RLS inside three DO blocks that
// loop over a list and `execute format('alter table public.%I enable row
// level security', t)`. A regex sees no table name there. A permanent red
// naming twenty-three healthy tables is worse than no check: everybody
// learns to scroll past it, and the twenty-fourth is the real one.
//
// So the live half was left to do the work — and the live half is a
// dbtest, behind DATABASE_URL, which this project has never had. The
// check that matters has never run. That is not a gap in coverage, it is
// the shape in docs/shapes.md: the assertion is sound about the set it
// iterates and the set is "a boolean about the corpus".
//
// WHY IT CAN BE DONE STATICALLY AFTER ALL. The three loops iterate
// `unnest(array['ideas', 'competitors', ...])` — LITERAL arrays, in the
// file, parseable. Resolving them turns 86 literal + 23 looped into 109
// of 110, and the 110th is a probe table created and dropped inside one
// DO block. There is no false red to fear, and the check below says so by
// refusing a DO block that enables RLS from a list it cannot read.
//
// Measured 2026-09-16. This does NOT replace user-isolation.dbtest.mjs,
// which proves the policies actually isolate; it guarantees the thing that
// must be true before a policy can matter at all.
//
// Run: node scripts/tests/rls-coverage.test.mjs
import { readFileSync, readdirSync } from "node:fs";

let pass = 0,
  fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const DIR = "supabase/migrations";
const FILES = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
// Line comments only. A `/* */` stripper would be wrong here: SQL uses
// `/*` inside no construct this file reads, but security-posture.test.mjs
// records an unpaired opener eating a whole file, and the cheap way to
// never have that is to not strip the form that can be unpaired.
const strip = (s) => s.replace(/--[^\n]*/g, "");
const SQL = FILES.map((f) => strip(readFileSync(`${DIR}/${f}`, "utf8"))).join("\n");

check(`the migrations were read (${FILES.length} files, ${SQL.length} chars)`, FILES.length >= 50 && SQL.length > 100000, "the corpus is too small to be the real one");

// ---------------------------------------------------------------------
// 1. THE POPULATION: every table these migrations create.
// ---------------------------------------------------------------------
const TABLES = new Set();
for (const m of SQL.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_0-9]+)/gi)) {
  TABLES.add(m[1]);
}
check(`tables created in public (${TABLES.size})`, TABLES.size >= 90, "the create-table scraper found almost nothing, and every check below would pass on an empty set");

// ---------------------------------------------------------------------
// 2. RLS, resolved BOTH ways.
// ---------------------------------------------------------------------
const literalRls = new Set();
for (const m of SQL.matchAll(/alter\s+table\s+(?:public\.)?([a-z_0-9]+)\s+enable\s+row\s+level\s+security/gi)) {
  literalRls.add(m[1]);
}

// A dollar-quoted block, with its own tag, so a nested $fn$ inside a
// $$...$$ does not end the outer one early.
const DO_BLOCK = /do\s+\$([a-z_0-9]*)\$([\s\S]*?)\$\1\$/gi;
const loopRls = new Set();
const loopPolicy = new Set();
const unreadableLoops = [];
let doBlocks = 0,
  rlsLoops = 0;
for (const m of SQL.matchAll(DO_BLOCK)) {
  doBlocks++;
  const body = m[2];
  if (!/enable\s+row\s+level\s+security/i.test(body)) continue;
  const arr = /unnest\s*\(\s*array\s*\[([\s\S]*?)\]\s*\)/i.exec(body);
  if (!arr) {
    // THE ONLY WAY THIS GATE CAN GO BLIND, named out loud rather than
    // silently skipped. A loop that takes its tables from pg_tables, or
    // from a variable, protects real tables that this file cannot see —
    // and would make the coverage check below understate reality without
    // any sign that it had.
    unreadableLoops.push(body.slice(0, 120).replace(/\s+/g, " "));
    continue;
  }
  rlsLoops++;
  const names = [...arr[1].matchAll(/'([a-z_0-9]+)'/gi)].map((x) => x[1]);
  const makesPolicy = /create\s+policy/i.test(body);
  for (const t of names) {
    loopRls.add(t);
    if (makesPolicy) loopPolicy.add(t);
  }
}
check(`dollar-quoted blocks parsed (${doBlocks})`, doBlocks >= 40, "the DO-block parser matched almost nothing — the loops it exists to read would be invisible");
check(`RLS loops resolved (${rlsLoops}, covering ${loopRls.size} tables)`, rlsLoops >= 3 && loopRls.size >= 20, "the loops that protect a third of the schema were not read");
check(
  "no DO block enables RLS from a list this gate cannot read",
  unreadableLoops.length === 0,
  unreadableLoops.length
    ? `${unreadableLoops.length} such block(s). Keep the table list a literal array, or this file understates coverage silently:\n        ` +
      unreadableLoops.join("\n        ")
    : ""
);

const literalPolicy = new Set();
for (const m of SQL.matchAll(/create\s+policy\s+"?[a-zA-Z_0-9 ]+"?\s+on\s+public\.([a-z_0-9]+)/gi)) {
  literalPolicy.add(m[1]);
}
check(`policies found (${literalPolicy.size} tables literally, ${loopPolicy.size} through loops)`, literalPolicy.size >= 50, "the policy scraper found almost nothing");

const protectedTable = (t) => literalRls.has(t) || loopRls.has(t);
const hasPolicy = (t) => literalPolicy.has(t) || loopPolicy.has(t);

// ---------------------------------------------------------------------
// 3. WHO MAY REACH A TABLE FROM A BROWSER.
// ---------------------------------------------------------------------
const clientGrants = new Map();
for (const m of SQL.matchAll(/grant\s+([a-z, ]+?)\s+on\s+(?:table\s+)?public\.([a-z_0-9]+)\s+to\s+([a-z_, ]+)/gi)) {
  const roles = m[3].toLowerCase();
  if (!/authenticated|anon/.test(roles)) continue;
  clientGrants.set(m[2], `${m[1].trim()} to ${m[3].trim()}`);
}
check(`tables granted to a client role (${clientGrants.size})`, clientGrants.size >= 5, "the grant scraper found nothing, so the hard failure below cannot fire");

// ---------------------------------------------------------------------
// 4. THE DECLARATIONS. Both checked the other way, so neither can go
//    stale into a place where the rule does not apply.
// ---------------------------------------------------------------------
const RLS_NOT_NEEDED = {
  zz_anon_default_probe:
    "not a table of this schema: 20260909000000_revoke_anon_default_privileges creates it and DROPS it inside one DO block, purely to ask has_table_privilege('anon', ...) what a brand-new table inherits. It exists for microseconds, holds one int column and no data, and the migration raises an exception if anon can touch it.",
};

// RLS ON AND NO POLICY IS DENY-ALL, which is a posture rather than an
// oversight — but only when somebody meant it. Postgres with RLS enabled
// and zero policies refuses every row to every non-owner role that is not
// BYPASSRLS, so these are reachable by the service role and by nothing
// else. Each one is a table the product writes ABOUT a user rather than
// FOR them.
const DENY_ALL_ON_PURPOSE = {
  rate_limit_log: "the limiter's own ledger. A client that could read it would learn other accounts' request rates; one that could write it could clear its own limit.",
  production_errors: "server-side error records, scrubbed and admin-read only through the service role.",
  daily_ai_spend_tracking: "platform-wide spend, aggregated across every account — one row here is not any one user's data.",
  cost_alert_log: "which cost alerts have already been sent, so the cron does not send them twice.",
  revenue_snapshots: "whole-business figures for the owner's dashboard; not per-user data at all.",
  subscriber_months: "the monthly subscriber roll-up behind the revenue history, again whole-business.",
  subscription_events: "the billing audit trail. Written by the Stripe webhook under the service role; a user reading their own would be a feature nobody has asked for and a user WRITING one would be able to grant themselves a plan.",
  business_inputs: "the owner's own figures for the margin report, reached only through an admin-gated route.",
  account_deletion_requests: "the emailed single-use deletion tokens. A user who could read this table could delete another account; the route claims a token atomically under the service role.",
  routing_decisions: "which model served which request, granted explicitly to service_role and to nobody else.",
};

const unprotected = [...TABLES].filter((t) => !protectedTable(t) && !RLS_NOT_NEEDED[t]).sort();
check(
  "every table this schema creates has row level security",
  unprotected.length === 0,
  unprotected.length
    ? `no RLS anywhere: ${unprotected.join(", ")}\n        ` +
      "Enable it in the migration that creates the table, or declare it in RLS_NOT_NEEDED with the argument."
    : ""
);

// THE ONE THAT IS NOT A JUDGEMENT CALL. A grant to authenticated or anon
// on a table with no RLS is every row of it readable by every account
// that has ever signed up. No reason belongs on this list.
const reachableAndOpen = [...clientGrants.keys()].filter((t) => TABLES.has(t) && !protectedTable(t)).sort();
check(
  "no table is granted to a client role while unprotected",
  reachableAndOpen.length === 0,
  reachableAndOpen.map((t) => `${t}: ${clientGrants.get(t)}, and no RLS`).join("\n        ")
);

const silentDenyAll = [...TABLES].filter((t) => protectedTable(t) && !hasPolicy(t) && !DENY_ALL_ON_PURPOSE[t]).sort();
check(
  "a table with RLS and no policy says that it means it",
  silentDenyAll.length === 0,
  silentDenyAll.length
    ? `RLS on, zero policies, no entry: ${silentDenyAll.join(", ")}\n        ` +
      "Deny-all is a posture. Write it down in DENY_ALL_ON_PURPOSE, or add the policy the table is missing."
    : ""
);

// BOTH WAYS. An entry whose table has gained a policy, or has left the
// schema, is a sentence that has stopped being true — the failure mode
// lib/absent-on-purpose.mjs was written for.
const staleDenyAll = Object.keys(DENY_ALL_ON_PURPOSE).filter((t) => !TABLES.has(t) || !protectedTable(t) || hasPolicy(t));
check(
  "no deny-all entry has gone stale",
  staleDenyAll.length === 0,
  staleDenyAll
    .map((t) => (!TABLES.has(t) ? `${t}: no such table` : hasPolicy(t) ? `${t}: has a policy now — drop the entry` : `${t}: RLS is off now`))
    .join("\n        ")
);
const staleNotNeeded = Object.keys(RLS_NOT_NEEDED).filter((t) => !TABLES.has(t) || protectedTable(t));
check("no RLS_NOT_NEEDED entry has gone stale", staleNotNeeded.length === 0, staleNotNeeded.join(", "));
for (const [t, why] of Object.entries({ ...RLS_NOT_NEEDED, ...DENY_ALL_ON_PURPOSE })) {
  if (why.length < 40) check(`${t}: the reason is an argument`, false, `"${why}" is too short to be one`);
}

// Nothing may turn it off again.
const disabled = [...SQL.matchAll(/alter\s+table\s+(?:public\.)?([a-z_0-9]+)\s+disable\s+row\s+level\s+security/gi)].map((m) => m[1]);
check("no migration disables row level security", disabled.length === 0, disabled.join(", "));

// ---------------------------------------------------------------------
// 4b. AND EVERY POLICY SCOPES TO auth.uid().
//
// RLS being ON is half the sentence. Sixty-six authenticated routes in
// this app act on an id the request supplied, and fifty of them do NOT
// filter by user_id in TypeScript at all — they read through the caller's
// own Supabase client and let the policy do the scoping. That is the
// right design and it is why `using (true)` on one table would be an
// ownership hole in fifty routes at once, with every one of them still
// calling auth.getUser() and looking correct.
//
// BOTH SPELLINGS. 193 policies are written literally; 12 more are created
// inside the baseline's DO loops as `execute format('create policy
// "select_own_%1$s" ... using (auth.uid() = user_id)')`, which is a
// policy in a STRING. A scan that read only the literal form would pass
// while the loops covering 23 tables said anything at all.
// ---------------------------------------------------------------------
const LITERAL_POLICY = /create\s+policy\s+"?([a-zA-Z_0-9 ]+)"?\s+on\s+public\.([a-z_0-9]+)([\s\S]{0,600}?);/gi;
const literalPolicies = [...SQL.matchAll(LITERAL_POLICY)].map((m) => ({
  name: m[1].trim(),
  table: m[2],
  body: m[3],
}));
const FORMATTED_POLICY = /execute\s+format\s*\(\s*\n?\s*'([^']*create policy[^']*)'/gi;
const formattedPolicies = [...SQL.matchAll(FORMATTED_POLICY)].map((m) => ({
  name: (/"([^"]+)"/.exec(m[1]) || [, "(unnamed)"])[1],
  table: "(loop)",
  body: m[1],
}));
check(`policies written literally (${literalPolicies.length})`, literalPolicies.length >= 150, "the literal policy parser found almost nothing");
check(`policies created inside a loop (${formattedPolicies.length})`, formattedPolicies.length >= 8, "the execute-format parser found almost nothing, and the loops cover 23 tables");

// Policies a stranger is SUPPOSED to satisfy. Each one is a row this
// product publishes on purpose.
const NOT_USER_SCOPED = {
  help_articles_public_read_published:
    "published help articles, readable by anon and authenticated alike: half the questions they answer are asked before anyone signs up, and app/help/page.tsx is public for the same reason. The predicate is `published = true`, so a draft is still nobody's business.",
};
const unscopedPolicies = [...literalPolicies, ...formattedPolicies]
  .filter((p) => !/auth\.uid\(\)/.test(p.body))
  .filter((p) => !NOT_USER_SCOPED[p.name]);
check(
  "every policy scopes its rows to auth.uid(), or says why it does not",
  unscopedPolicies.length === 0,
  unscopedPolicies
    .map((p) => `${p.table}: ${p.name} — ${p.body.replace(/\s+/g, " ").slice(0, 110)}`)
    .join("\n        ")
);
const stalePublic = Object.keys(NOT_USER_SCOPED).filter(
  (name) => ![...literalPolicies, ...formattedPolicies].some((p) => p.name === name && !/auth\.uid\(\)/.test(p.body))
);
check("no public-policy entry has gone stale", stalePublic.length === 0, stalePublic.join(", "));

// AND AN INSERT MAY NOT LET A CALLER WRITE SOMEBODY ELSE'S ROW. A `using`
// clause scopes what is READ; the `with check` is what stops `insert
// ... user_id = <someone else>`, and they are different clauses.
const insertPolicies = [...SQL.matchAll(/create\s+policy\s+"?([a-zA-Z_0-9 ]+)"?\s+on\s+public\.([a-z_0-9]+)[\s\S]{0,300}?for\s+insert[\s\S]{0,200}?with\s+check\s*\(([^;]{0,200})/gi)];
check(`insert policies with a with-check (${insertPolicies.length})`, insertPolicies.length >= 30, "the insert-policy parser found almost nothing");
const openInserts = insertPolicies.filter((m) => !/auth\.uid\(\)/.test(m[3])).map((m) => `${m[2]}: ${m[1].trim()}`);
check("every insert policy binds the row to the caller", openInserts.length === 0, openInserts.join("\n        "));

// ---------------------------------------------------------------------
// 5. CONTROLS. They drive the resolvers above on text of their own, so a
//    resolver that has stopped working cannot be hidden by a tree that
//    happens to be fine.
// ---------------------------------------------------------------------
function resolveLoop(text) {
  const out = new Set();
  for (const m of text.matchAll(DO_BLOCK)) {
    if (!/enable\s+row\s+level\s+security/i.test(m[2])) continue;
    const arr = /unnest\s*\(\s*array\s*\[([\s\S]*?)\]\s*\)/i.exec(m[2]);
    if (!arr) continue;
    for (const n of arr[1].matchAll(/'([a-z_0-9]+)'/gi)) out.add(n[1]);
  }
  return out;
}
const SAMPLE = `do $$
declare t text;
begin
  for t in select unnest(array['alpha', 'beta']) loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;`;
const sampleOut = resolveLoop(SAMPLE);
check("control: a loop's literal array is read", sampleOut.has("alpha") && sampleOut.has("beta"), `got ${[...sampleOut].join(",") || "nothing"}`);
check("control: a DO block that does not touch RLS contributes nothing", resolveLoop("do $$ begin perform 1; end $$;").size === 0);
check(
  "control: the real tree needs the loop resolver — 20+ tables are protected ONLY that way",
  [...TABLES].filter((t) => loopRls.has(t) && !literalRls.has(t)).length >= 20,
  "if this drops, the loops have been rewritten literally and the resolver is no longer load-bearing"
);
check(
  "control: ai_presentations is one of them",
  loopRls.has("ai_presentations") && !literalRls.has("ai_presentations"),
  "the table behind /dashboard/presentations is protected through the third loop; a resolver that missed it would report a table the product reads by id every day as open"
);

console.log(`\n        ${TABLES.size} tables · ${[...TABLES].filter(protectedTable).length} with RLS (${[...TABLES].filter((t) => literalRls.has(t)).length} literal, ${[...TABLES].filter((t) => loopRls.has(t) && !literalRls.has(t)).length} through a loop) · ${[...TABLES].filter((t) => protectedTable(t) && !hasPolicy(t)).length} deny-all`);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
