// transition_suggestions, ASKED OF A REAL POSTGRES.
//
// The table that turns "it suggests the wrong thing too often" from an
// argument into a fraction. Everything it claims is the kind a static
// read of the migration gets wrong:
//
//   * "revoke all from anon" in the file does not tell you whether anon
//     can still reach the IDENTITY SEQUENCE, which REVOKE ON TABLE does
//     not touch. 20260906000000_revoke_anon_grants exists because that
//     exact gap was found in seventy-eight tables.
//   * "no update policy" is a claim about what a POLICY-LESS verb does
//     under RLS, which is only visible by trying it as the role.
//   * A CHECK CONSTRAINT is a claim about a regular expression, and the
//     one thing this column must never hold is free text a user typed.
//   * A RETENTION CLAMP is arithmetic. `p_days = 0` either falls back to
//     the ninety-day default or deletes eighty-nine days of history, and
//     the difference is only visible by calling it and counting.
//
// Run: DATABASE_URL=... node scripts/tests/transition-suggestions.dbtest.mjs
//  or: npm run test:db -- transition-suggestions
import { execFileSync } from "node:child_process";

const DB = process.env.DATABASE_URL ?? process.env.PGDATABASE;
if (!DB) {
  console.log("SKIPPED: no DATABASE_URL / PGDATABASE — this file needs a real Postgres.");
  process.exit(0);
}

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const PSQL_TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|DO|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+|ALTER TABLE|CREATE INDEX)$/;
function answer(out) {
  const lines = out.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !PSQL_TAG.test(l));
  return lines.length === 0 ? "" : lines[lines.length - 1];
}
const dbArgs = () => ["-d", DB];
function sql(query) {
  return answer(
    execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", query], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  );
}
function tryStatement(query) {
  try {
    return { ok: true, out: sql(query) };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.stdout || err.message) };
  }
}
function tryAs(role, userId, query) {
  const script = `set local role ${role};
set local request.jwt.claim.sub = '${userId}';
set local request.jwt.claim.role = '${role}';
${query}`;
  try {
    return {
      ok: true,
      out: answer(
        execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", `begin; ${script}; commit;`], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
      ),
    };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.stdout || err.message) };
  }
}

console.log("transition_suggestions (live)");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
for (const id of [A, B]) {
  sql(
    `insert into auth.users (id, email) values ('${id}', '${id}@example.test') on conflict (id) do nothing`
  );
}
sql(`delete from public.transition_suggestions where user_id in ('${A}', '${B}')`);

// ---------------------------------------------------------------------
console.log("\n== 1. the table exists, with row level security ==");
check("the table is there", sql(`select to_regclass('public.transition_suggestions') is not null`) === "t");
check(
  "row level security is ON",
  sql(`select relrowsecurity from pg_class where oid = 'public.transition_suggestions'::regclass`) === "t",
  "a policy on a table without RLS does nothing at all"
);

// ---------------------------------------------------------------------
console.log("\n== 2. the column that must never hold free text ==");
// THE ONE ARGUMENT FOR KEEPING THIS TABLE is that it contains ids and
// enums and nothing a person typed. That is a claim about a regular
// expression, so it is tried rather than read.
const REFUSED = [
  ["a sentence", "what the user typed here"],
  ["a path", "/dashboard/coding"],
  ["a query string", "coding?q=secret"],
  ["punctuation", "coding; drop"],
  ["upper case first", "Coding"],
  ["empty", ""],
  ["too long", "a".repeat(40)],
];
for (const [what, value] of REFUSED) {
  const escaped = value.replace(/'/g, "''");
  const r = tryStatement(
    `insert into public.transition_suggestions (user_id, destination, source, outcome)
     values ('${A}', '${escaped}', 'offline', 'shown')`
  );
  check(`destination refuses ${what}`, !r.ok, r.ok ? `accepted ${JSON.stringify(value)}` : "");
}
for (const good of ["coding", "websiteBuilder", "deepResearch"]) {
  const r = tryStatement(
    `insert into public.transition_suggestions (user_id, destination, source, outcome)
     values ('${A}', '${good}', 'offline', 'shown')`
  );
  check(`...and accepts the real id ${good}`, r.ok, r.ok ? "" : r.error.slice(-200));
}
check(
  "source refuses a third value",
  !tryStatement(
    `insert into public.transition_suggestions (user_id, destination, source, outcome)
     values ('${A}', 'coding', 'guessed', 'shown')`
  ).ok
);
check(
  "outcome refuses a fourth value",
  !tryStatement(
    `insert into public.transition_suggestions (user_id, destination, source, outcome)
     values ('${A}', 'coding', 'offline', 'ignored')`
  ).ok
);

// ---------------------------------------------------------------------
console.log("\n== 3. a user writes their own rows and reads only their own ==");
const mine = tryAs(
  "authenticated",
  A,
  `insert into public.transition_suggestions (user_id, destination, source, outcome)
   values ('${A}', 'agents', 'model', 'dismissed'); select 1`
);
check("A may record its own event", mine.ok, mine.ok ? "" : mine.error.slice(-200));

const theirs = tryAs(
  "authenticated",
  A,
  `insert into public.transition_suggestions (user_id, destination, source, outcome)
   values ('${B}', 'agents', 'model', 'dismissed'); select 1`
);
check("...and may NOT record one against B", !theirs.ok, theirs.ok ? "the insert policy did not hold" : "");

sql(
  `insert into public.transition_suggestions (user_id, destination, source, outcome)
   values ('${B}', 'coding', 'offline', 'shown')`
);
const seen = tryAs("authenticated", A, `select count(*) from public.transition_suggestions where user_id = '${B}'`);
check("...and cannot SEE B's rows", seen.ok && seen.out === "0", `saw ${seen.out}`);

// ---------------------------------------------------------------------
console.log("\n== 4. append-only: a log the writer can rewrite is not a log ==");
// A VERB WITH NO POLICY UNDER RLS DENIES — but the grant was revoked too,
// and only one of those two is what actually stops it. Both are tried.
const upd = tryAs("authenticated", A, `update public.transition_suggestions set outcome = 'taken'`);
check("A cannot UPDATE any row, including its own", !upd.ok, upd.ok ? "the update went through" : "");
const del = tryAs("authenticated", A, `delete from public.transition_suggestions`);
check("...nor DELETE one", !del.ok, del.ok ? "the delete went through" : "");
check(
  "no update or delete policy exists to be widened later",
  sql(
    `select count(*) from pg_policies where schemaname = 'public'
       and tablename = 'transition_suggestions' and cmd in ('UPDATE', 'DELETE')`
  ) === "0"
);

// ---------------------------------------------------------------------
console.log("\n== 5. anon owns nothing — the table AND the sequence ==");
check(
  "anon holds no privilege on the table",
  sql(
    `select count(*) from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'transition_suggestions' and grantee = 'anon'`
  ) === "0"
);
// THE GAP REVOKE ON TABLE DOES NOT REACH. USAGE on an identity sequence
// survives a table revoke; seventy-eight tables were found in that state.
const seqName = sql(`select pg_get_serial_sequence('public.transition_suggestions', 'id')`);
check(`the identity sequence was found (${seqName})`, seqName.length > 0);
check(
  "...and anon has no privilege on it either",
  sql(`select has_sequence_privilege('anon', '${seqName}', 'USAGE') or
             has_sequence_privilege('anon', '${seqName}', 'SELECT')`) === "f"
);

// ---------------------------------------------------------------------
console.log("\n== 6. the retention clamp is arithmetic, so it is called ==");
sql(`delete from public.transition_suggestions where user_id in ('${A}', '${B}')`);
sql(
  `insert into public.transition_suggestions (user_id, destination, source, outcome, created_at)
   values ('${A}', 'coding', 'offline', 'shown', now() - interval '89 days')`
);
// ZERO IS NOT ONE. Clamping a stray 0 UP to 1 would turn "the caller
// passed nothing usable" into "delete eighty-nine days of history" — the
// most destructive sweep the function can perform. Measured, not read.
sql(`select public.prune_transition_suggestions(0)`);
check(
  "prune(0) falls back to the 90-day default and spares an 89-day-old row",
  sql(`select count(*) from public.transition_suggestions where user_id = '${A}'`) === "1"
);
sql(`select public.prune_transition_suggestions(null)`);
check(
  "...and so does prune(null)",
  sql(`select count(*) from public.transition_suggestions where user_id = '${A}'`) === "1"
);
sql(`select public.prune_transition_suggestions(1)`);
check(
  "...while prune(1) is honoured, so a shorter window still works",
  sql(`select count(*) from public.transition_suggestions where user_id = '${A}'`) === "0"
);
check(
  "the pruner is executable by service_role and nobody else",
  sql(
    `select has_function_privilege('service_role', 'public.prune_transition_suggestions(integer)', 'EXECUTE')
        and not has_function_privilege('authenticated', 'public.prune_transition_suggestions(integer)', 'EXECUTE')
        and not has_function_privilege('anon', 'public.prune_transition_suggestions(integer)', 'EXECUTE')`
  ) === "t"
);

// ---------------------------------------------------------------------
console.log("\n== 7. the rate this table exists to produce ==");
// THE WHOLE POINT, ARITHMETIC RATHER THAN INTENT. If `shown` were not
// recorded, `dismissed` alone would be a count with no denominator — the
// state the feature shipped in, and the reason this migration exists.
sql(`delete from public.transition_suggestions where user_id in ('${A}', '${B}')`);
for (const [outcome, n] of [["shown", 10], ["taken", 3], ["dismissed", 4]]) {
  for (let i = 0; i < n; i++) {
    sql(
      `insert into public.transition_suggestions (user_id, destination, source, outcome)
       values ('${A}', 'coding', 'offline', '${outcome}')`
    );
  }
}
check(
  "dismissed / shown is computable from rows alone (4/10)",
  sql(
    `select round(
        count(*) filter (where outcome = 'dismissed')::numeric
        / nullif(count(*) filter (where outcome = 'shown'), 0), 2)
       from public.transition_suggestions where user_id = '${A}'`
  ) === "0.40"
);
// AND WHICH DETECTOR PRODUCED IT — the count the owner asked for when
// approving the paid half.
sql(
  `insert into public.transition_suggestions (user_id, destination, source, outcome)
   values ('${A}', 'coding', 'model', 'shown')`
);
check(
  "...and the paid detector's share is a count, not an estimate (1 of 11 shown)",
  sql(
    `select count(*) filter (where source = 'model' and outcome = 'shown') || '/' ||
            count(*) filter (where outcome = 'shown')
       from public.transition_suggestions where user_id = '${A}'`
  ) === "1/11"
);

sql(`delete from public.transition_suggestions where user_id in ('${A}', '${B}')`);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
