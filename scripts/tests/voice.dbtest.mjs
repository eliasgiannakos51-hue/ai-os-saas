// THE VOICE MINUTE LEDGER, AGAINST A REAL POSTGRES.
//
// Every claim here is one the DATABASE either enforces or does not, and
// each protects something a route cannot:
//
//   THE CAP IS ATOMIC. Two tabs recording at once must not both read
//   "29 of 30 minutes used" and both proceed. The check and the write
//   are one statement; this file interleaves two sessions and proves the
//   second is refused rather than trusting the comment that says so.
//   That is the deduct_credits_atomic lesson, applied to minutes.
//
//   NOBODY MAY WRITE THEIR OWN USAGE. A user who could update this row
//   could set it to zero and have unlimited minutes — the cap would
//   still be enforced, against a number they control.
//
//   THE CONSUME FUNCTION IS NOT REACHABLE BY A SIGNED-IN USER. It is
//   SECURITY DEFINER over the ledger the cap is enforced against;
//   execute belongs to service_role alone.
//
//   THERE IS NOWHERE TO PUT AUDIO. The brief's "τα ηχητικά ΔΕΝ
//   αποθηκεύονται" is enforced by a schema with no column for it, and
//   that is checked here rather than asserted in a comment.
//
// Run: node scripts/tests/voice.dbtest.mjs   (needs a database; run
// through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.log("SKIPPED: no DATABASE_URL or PGDATABASE — run through `npm run test:db`.");
  process.exit(0);
}

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const PSQL_TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|DO|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+)$/;
function answer(out) {
  const lines = out.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !PSQL_TAG.test(l));
  return lines.length === 0 ? "" : lines[lines.length - 1];
}
const dbArgs = () =>
  process.env.DATABASE_URL ? ["-d", process.env.DATABASE_URL] : ["-d", process.env.PGDATABASE];

function sql(query) {
  return answer(
    execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", query], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  );
}
function sqlAll(query) {
  return execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !PSQL_TAG.test(l));
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

// EMAILS ARE NAMESPACED PER SUITE. Every *.dbtest.mjs runs against the
// same throwaway database in sequence and auth.users.email is unique; a
// collision here kills a file that has nothing to do with this one.
const USER = "cccccccc-0000-0000-0000-000000000001";
const OTHER = "cccccccc-0000-0000-0000-000000000002";
sql(`insert into auth.users (id, email) values
  ('${USER}', 'voice-user@test.local'), ('${OTHER}', 'voice-other@test.local')
  on conflict (id) do nothing`);

const MONTH = `date_trunc('month', (now() at time zone 'utc'))::date`;
const reset = () =>
  sql(`delete from public.voice_usage where user_id in ('${USER}', '${OTHER}')`);

// ===========================================================================
console.log("== 1. the ledger exists, and there is nowhere to put audio ==");
// ===========================================================================

ok("voice_usage exists",
  sql(`select to_regclass('public.voice_usage') is not null`) === "t");

const columns = sqlAll(
  `select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'voice_usage' order by column_name`
);
ok(`it holds exactly the seven counters and keys it needs (${columns.join(", ")})`,
  JSON.stringify(columns) === JSON.stringify([
    "month", "speak_characters", "speak_seconds", "transcribe_seconds", "updated_at", "user_id",
  ]),
  columns.join(", "));
// THE PRODUCT RULE, AS A SCHEMA FACT. Not "we promise not to keep the
// audio" — there is no column, of any type, that could hold it.
ok("no column could hold audio, a transcript, or what was said",
  columns.every((c) => !/audio|clip|blob|recording|transcript|text|content|url|path|file/i.test(c)),
  columns.filter((c) => /audio|clip|blob|recording|transcript|text|content|url|path|file/i.test(c)).join(", "));
ok("no bytea or json column exists on it at all",
  sql(`select count(*) from information_schema.columns
        where table_schema='public' and table_name='voice_usage'
          and data_type in ('bytea','json','jsonb')`) === "0");

ok("the primary key is (user_id, month), so a month is one row",
  sql(`select string_agg(a.attname, ',' order by a.attname)
       from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = 'public.voice_usage'::regclass and i.indisprimary`) === "month,user_id");
ok("deleting the account takes its usage with it",
  sql(`select confdeltype from pg_constraint
       where conrelid = 'public.voice_usage'::regclass and contype = 'f'`) === "c");
ok("RLS is on",
  sql(`select relrowsecurity from pg_class where oid = 'public.voice_usage'::regclass`) === "t");

// ===========================================================================
console.log("\n== 2. the cap, and it is one statement ==");
// ===========================================================================

reset();
// 60-second limit. Three 20-second clips fit exactly; the fourth must not.
// EVERY ROW, JOINED, AND THE COUNT WITH IT.
//
// The first version of this read the LAST line psql printed, which is
// how it very nearly missed a real bug: on the refusal path the function
// fell through and returned (false, ...) AND THEN (true, ...), so the
// last row said "allowed" about a request that was not. A helper that
// silently keeps one row of a multi-row answer cannot report a function
// that returns the wrong number of rows — so this reports all of them,
// and a second assertion pins the count at one.
const consumeRows = (user, seconds, kind, limit, characters = 0) =>
  sqlAll(`select allowed || '|' || used_seconds || '|' || remaining_seconds
          from public.consume_voice_seconds('${user}', ${seconds}, ${characters}, ${limit}, '${kind}')`);
const consume = (...args) => consumeRows(...args).join(" ++ ");

ok("the first clip fits and the ledger says how much is left",
  consume(USER, 20, "transcribe", 60) === "true|20|40");
ok("the second fits", consume(USER, 20, "transcribe", 60) === "true|40|20");
ok("the third fills the month exactly — an exact fit is a fit, not an overrun",
  consume(USER, 20, "transcribe", 60) === "true|60|0");
const refusal = consume(USER, 1, "transcribe", 60);
ok("the fourth is REFUSED, and the refusal still reports the true total",
  refusal === "false|60|0", refusal);
// ONE ROW, ALWAYS. A function that answers "did this fit" with two
// contradictory rows is one careless `.at(-1)` away from an unlimited
// month, and it is invisible to any caller that reads row 0.
ok("a refusal is ONE row, not a refusal followed by an approval",
  consumeRows(USER, 1, "transcribe", 60).length === 1,
  consumeRows(USER, 1, "transcribe", 60).join(" ++ "));
ok("an approval is one row too",
  consumeRows(USER, 0, "transcribe", 6000).length === 1);
ok("...and refusing wrote nothing",
  sql(`select transcribe_seconds from public.voice_usage where user_id='${USER}' and month=${MONTH}`) === "60");

reset();
ok("a clip larger than the whole month's allowance is refused outright",
  consume(USER, 999, "transcribe", 60) === "false|0|60");
ok("...and left the ledger at zero, not at 999",
  sql(`select coalesce(sum(transcribe_seconds),0) from public.voice_usage where user_id='${USER}'`) === "0");

reset();
ok("a zero limit refuses everything — a plan without voice cannot consume any",
  consume(USER, 1, "transcribe", 0) === "false|0|0");

reset();
ok("speech-out counts against the SAME ceiling as speech-in",
  consume(USER, 30, "transcribe", 60) === "true|30|30" &&
  consume(USER, 30, "speak", 60, 450) === "true|60|0" &&
  consume(USER, 1, "transcribe", 60) === "false|60|0");
ok("...and the characters are recorded alongside the seconds",
  sql(`select speak_characters from public.voice_usage where user_id='${USER}' and month=${MONTH}`) === "450");

reset();
ok("a negative duration cannot be used to hand somebody minutes back",
  consume(USER, -500, "transcribe", 60) === "true|0|60" &&
  sql(`select transcribe_seconds from public.voice_usage where user_id='${USER}' and month=${MONTH}`) === "0");
ok("a null duration is treated as zero rather than throwing",
  sql(`select allowed from public.consume_voice_seconds('${USER}', null, null, 60, 'transcribe')`) === "t");

let unknownKindRefused = false;
try {
  sql(`select allowed from public.consume_voice_seconds('${USER}', 5, 0, 60, 'sing')`);
} catch {
  unknownKindRefused = true;
}
ok("an unknown kind is refused rather than silently counted as neither", unknownKindRefused);

// THE ATOMICITY ITSELF. Two open transactions, both past the point where
// a read-then-write implementation would have read "0 used".
reset();
{
  // Both sessions ask for 40 of a 60-second month. Exactly one may win.
  // Run as two concurrent psql processes rather than two statements in
  // one, because two statements in one session cannot interleave.
  const script = (label) => `
begin;
select '${label}:' || allowed from public.consume_voice_seconds('${USER}', 40, 0, 60, 'transcribe');
commit;`;
  const run = (label) =>
    new Promise((resolve) => {
      import("node:child_process").then(({ execFile }) => {
        execFile("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", script(label)],
          { encoding: "utf8" },
          (err, stdout) => resolve(String(stdout || "") + (err ? String(err.stderr || "") : "")));
      });
    });
  const [a, b] = await Promise.all([run("A"), run("B")]);
  const results = (a + "\n" + b).split("\n").map((l) => l.trim()).filter((l) => /^[AB]:(true|false)$/.test(l));
  const winners = results.filter((r) => r.endsWith(":true")).length;
  ok(`two concurrent 40s consumes against a 60s cap: exactly one wins (${results.join(" ")})`,
    winners === 1, results.join(" "));
  ok("...and the ledger holds 40, not 80",
    sql(`select transcribe_seconds from public.voice_usage where user_id='${USER}' and month=${MONTH}`) === "40");
}

// ===========================================================================
console.log("\n== 3. months do not leak into each other ==");
// ===========================================================================

reset();
consume(USER, 60, "transcribe", 60);
sql(`insert into public.voice_usage (user_id, month, transcribe_seconds)
     values ('${USER}', (${MONTH} - interval '1 month')::date, 3600)
     on conflict (user_id, month) do update set transcribe_seconds = 3600`);
ok("last month's 3,600 seconds do not count against this month",
  consume(USER, 1, "transcribe", 120) === "true|61|59");
ok("last month's row is untouched by this month's writes",
  sql(`select transcribe_seconds from public.voice_usage
       where user_id='${USER}' and month=(${MONTH} - interval '1 month')::date`) === "3600");
reset();

// ===========================================================================
console.log("\n== 4. who may read, who may write, who may call ==");
// ===========================================================================

sql(`insert into public.voice_usage (user_id, month, transcribe_seconds)
     values ('${USER}', ${MONTH}, 42), ('${OTHER}', ${MONTH}, 99)
     on conflict (user_id, month) do update set transcribe_seconds = excluded.transcribe_seconds`);

const ownRead = tryAs("authenticated", USER, `select transcribe_seconds from public.voice_usage;`);
ok("a user reads their own usage", ownRead.ok && ownRead.out === "42", JSON.stringify(ownRead));
const otherRead = tryAs("authenticated", USER,
  `select count(*) from public.voice_usage where user_id = '${OTHER}';`);
ok("...and cannot see anybody else's", otherRead.ok && otherRead.out === "0", JSON.stringify(otherRead));

const zeroOut = tryAs("authenticated", USER,
  `update public.voice_usage set transcribe_seconds = 0 where user_id = '${USER}';`);
ok("a user CANNOT zero their own usage — the cap must not be enforced against a number they control",
  !zeroOut.ok || sql(`select transcribe_seconds from public.voice_usage where user_id='${USER}' and month=${MONTH}`) === "42",
  JSON.stringify(zeroOut).slice(0, 160));
const insertOwn = tryAs("authenticated", USER,
  `insert into public.voice_usage (user_id, month) values ('${USER}', (${MONTH} - interval '2 months')::date);`);
ok("a user cannot insert rows into the ledger either", !insertOwn.ok, JSON.stringify(insertOwn).slice(0, 160));
const deleteOwn = tryAs("authenticated", USER, `delete from public.voice_usage where user_id = '${USER}';`);
ok("nor delete them", !deleteOwn.ok, JSON.stringify(deleteOwn).slice(0, 160));

const anonRead = tryAs("anon", USER, `select count(*) from public.voice_usage;`);
ok("anon cannot read the ledger at all", !anonRead.ok, JSON.stringify(anonRead).slice(0, 160));

// THE DEFINER FUNCTION. This is the one that writes.
const callAsUser = tryAs("authenticated", USER,
  `select allowed from public.consume_voice_seconds('${OTHER}', 60, 0, 60, 'transcribe');`);
ok("a signed-in user cannot call consume_voice_seconds — not even on their own account",
  !callAsUser.ok, JSON.stringify(callAsUser).slice(0, 160));
const callAsAnon = tryAs("anon", USER,
  `select allowed from public.consume_voice_seconds('${USER}', 60, 0, 60, 'transcribe');`);
ok("nor can anon", !callAsAnon.ok, JSON.stringify(callAsAnon).slice(0, 160));
ok("service_role can, because the routes are what call it",
  sql(`select has_function_privilege('service_role',
        'public.consume_voice_seconds(uuid, integer, integer, integer, text)', 'execute')`) === "t");

ok("consume_voice_seconds is SECURITY DEFINER with a pinned search_path",
  sql(`select prosecdef from pg_proc where proname = 'consume_voice_seconds'`) === "t" &&
  sql(`select array_to_string(proconfig, ',') from pg_proc where proname = 'consume_voice_seconds'`)
    .includes("search_path="));
ok("voice_usage_this_month is SECURITY INVOKER — a read scoped by the policy, not a read-anybody primitive",
  sql(`select prosecdef from pg_proc where proname = 'voice_usage_this_month'`) === "f");

const ownSummary = tryAs("authenticated", USER,
  `select transcribe_seconds from public.voice_usage_this_month('${USER}');`);
ok("a user can read their own month through the summary function",
  ownSummary.ok && ownSummary.out === "42", JSON.stringify(ownSummary));
const otherSummary = tryAs("authenticated", USER,
  `select transcribe_seconds from public.voice_usage_this_month('${OTHER}');`);
ok("...and the summary function shows 0, not 99, for somebody else — the invoker's policy is what scopes it",
  otherSummary.ok && otherSummary.out === "0", JSON.stringify(otherSummary));

reset();

// ===========================================================================
console.log("\n== 5. the migration is idempotent, and re-running it loses nothing ==");
// ===========================================================================

const MIGRATION = "supabase/migrations/20260827000000_voice_usage.sql";
sql(`insert into public.voice_usage (user_id, month, transcribe_seconds)
     values ('${USER}', ${MONTH}, 77) on conflict (user_id, month) do update set transcribe_seconds = 77`);
let reapplied = true;
let reapplyError = "";
try {
  execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-f", MIGRATION], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (err) {
  reapplied = false;
  reapplyError = String(err.stderr || err.stdout || err.message);
}
ok("the migration applies a second time without error", reapplied, reapplyError.slice(0, 200));
ok("...and the row that was there is still there, with its value",
  sql(`select transcribe_seconds from public.voice_usage where user_id='${USER}' and month=${MONTH}`) === "77");
ok("the grants survive the re-run (authenticated still cannot execute the consume)",
  sql(`select has_function_privilege('authenticated',
       'public.consume_voice_seconds(uuid, integer, integer, integer, text)', 'execute')`) === "f");
ok("...and still cannot write the table",
  sql(`select has_table_privilege('authenticated', 'public.voice_usage', 'update')`) === "f" &&
  sql(`select has_table_privilege('authenticated', 'public.voice_usage', 'insert')`) === "f" &&
  sql(`select has_table_privilege('authenticated', 'public.voice_usage', 'delete')`) === "f");
ok("...and can still read it", sql(`select has_table_privilege('authenticated', 'public.voice_usage', 'select')`) === "t");

// The non-negative constraint is the last line under a direct write.
let negativeRejected = false;
try {
  sql(`update public.voice_usage set transcribe_seconds = -1 where user_id='${USER}' and month=${MONTH}`);
} catch {
  negativeRejected = true;
}
ok("a negative total is rejected by the table itself, whoever writes it", negativeRejected);

reset();
sql(`delete from public.voice_usage where user_id in ('${USER}', '${OTHER}')`);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
