// nav_events, ASKED OF A REAL POSTGRES.
//
// The table that decides what gets cut. Every claim this file makes is a
// claim about privileges, policies and arithmetic — and every one of them
// is the kind that a static read of the migration text gets wrong:
//
//   * "revoke all from anon" in the file does not tell you whether anon
//     can still read through the IDENTITY SEQUENCE, which REVOKE ON TABLE
//     does not reach. 20260906000000_revoke_anon_grants exists because
//     that exact gap was found in seventy-eight tables.
//   * "security_invoker = true" in the file does not tell you the view
//     was created with it — `create or replace view` silently keeps the
//     OLD options when the new definition omits them.
//   * A RETENTION CLAMP is arithmetic. `greatest(least(p_days, 3650), 1)`
//     is either a guard against `delete ... where created_at < now()` or
//     it is a comment that looks like one, and the difference is only
//     visible by calling it with 0 and counting what survived.
//
// Run: DATABASE_URL=... node scripts/tests/nav-events.dbtest.mjs
//  or: npm run test:db -- nav-events
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
function rows(query) {
  return execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAF|", "-c", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("|"));
}
/** Full multi-line output — see section 7. */
function sqlText(query) {
  return execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
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

const A = "3a000000-0000-0000-0000-0000000000a1";
const B = "3a000000-0000-0000-0000-0000000000a2";
const C = "3a000000-0000-0000-0000-0000000000a3";
sql(`insert into auth.users (id, email) values
  ('${A}', 'nav-a@test.local'), ('${B}', 'nav-b@test.local'), ('${C}', 'nav-c@test.local')
  on conflict (id) do nothing`);

// ---------------------------------------------------------------------
console.log("== 1. the table is the shape the app writes ==");
check(
  "public.nav_events exists",
  sql(`select to_regclass('public.nav_events') is not null`) === "t"
);

const cols = Object.fromEntries(
  rows(`select column_name, data_type, is_nullable
          from information_schema.columns
         where table_schema='public' and table_name='nav_events'`).map((r) => [r[0], r.slice(1)])
);
check("user_id is a non-null uuid", cols.user_id?.[0] === "uuid" && cols.user_id?.[1] === "NO", JSON.stringify(cols.user_id));
check("path is non-null text", cols.path?.[0] === "text" && cols.path?.[1] === "NO", JSON.stringify(cols.path));
check("referrer is NULLABLE text — an unknown origin is a null, never a guess",
  cols.referrer?.[0] === "text" && cols.referrer?.[1] === "YES", JSON.stringify(cols.referrer));
check("created_at is a non-null timestamptz",
  cols.created_at?.[0] === "timestamp with time zone" && cols.created_at?.[1] === "NO", JSON.stringify(cols.created_at));

// THE CASCADE IS THE ERASURE STORY. Without it, deleting an account
// leaves a log of that person's movements with nothing pointing at it.
check(
  "user_id cascades from auth.users",
  sql(`select rc.delete_rule
         from information_schema.table_constraints tc
         join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
        where tc.table_schema='public' and tc.table_name='nav_events' and tc.constraint_type='FOREIGN KEY'`) === "CASCADE"
);

// And it is not a claim: delete the account and count what is left.
sql(`insert into auth.users (id, email) values ('${C}', 'nav-c@test.local') on conflict (id) do nothing`);
sql(`insert into public.nav_events (user_id, path) values ('${C}', '/dashboard/chat')`);
const beforeCascade = Number(sql(`select count(*) from public.nav_events where user_id='${C}'`));
sql(`delete from auth.users where id='${C}'`);
check(
  "deleting the account really removes the rows (measured, not declared)",
  beforeCascade === 1 && sql(`select count(*) from public.nav_events where user_id='${C}'`) === "0"
);

// ---------------------------------------------------------------------
console.log("\n== 2. the column cannot hold anything that is not a route ==");
for (const bad of [
  "/login",
  "https://evil.example/x",
  // THE ONE THE FIRST CONSTRAINT ACCEPTED. 62 characters, the right
  // prefix, and the exact string this table exists not to hold.
  "/dashboard/finance?record=00000000-0000-0000-0000-000000000000",
  "/dashboard/finance?record=1",
  "/dashboard/chat#top",
  "/dashboard/finance/extra/deep",
  "/dashboard/Finance",
  "/dashboard/finance ",
  "/dashboard//finance",
  "'; drop table nav_events; --",
  "/dash",
]) {
  const r = tryStatement(
    `insert into public.nav_events (user_id, path) values ('${A}', ${sqlLiteral(bad)})`
  );
  check(`rejected: ${bad.slice(0, 46)}`, !r.ok, r.ok ? "IT WAS ACCEPTED" : undefined);
}
check(
  "a path longer than 64 characters is rejected",
  !tryStatement(`insert into public.nav_events (user_id, path) values ('${A}', '/dashboard/' || repeat('x', 80))`).ok
);
check(
  "the longest real route still fits",
  tryStatement(`insert into public.nav_events (user_id, path) values ('${A}', '/dashboard/trading-workflow')`).ok
);
check(
  "referrer accepts a route, 'external', and null — and nothing else",
  tryStatement(`insert into public.nav_events (user_id, path, referrer) values ('${A}', '/dashboard', 'external')`).ok &&
    tryStatement(`insert into public.nav_events (user_id, path, referrer) values ('${A}', '/dashboard', '/dashboard/chat')`).ok &&
    tryStatement(`insert into public.nav_events (user_id, path, referrer) values ('${A}', '/dashboard', null)`).ok &&
    !tryStatement(`insert into public.nav_events (user_id, path, referrer) values ('${A}', '/dashboard', 'https://google.com/')`).ok
);
sql(`delete from public.nav_events where user_id='${A}'`);

// ---------------------------------------------------------------------
console.log("\n== 3. RLS: a user records their own navigation and nobody else's ==");
check("RLS is enabled", sql(`select relrowsecurity from pg_class where oid='public.nav_events'::regclass`) === "t");

const policies = Object.fromEntries(
  rows(`select cmd, policyname from pg_policies where schemaname='public' and tablename='nav_events'`)
    .map((r) => [r[0], r[1]])
);
check("there is an INSERT policy", Boolean(policies.INSERT), JSON.stringify(policies));
check("there is a SELECT policy", Boolean(policies.SELECT), JSON.stringify(policies));
check("there is NO UPDATE policy — an append-only log the writer can rewrite is not a log", !policies.UPDATE);
check("there is NO DELETE policy", !policies.DELETE);
check("and no ALL policy quietly granting all four", !policies.ALL);

const own = tryAs("authenticated", A, `insert into public.nav_events (user_id, path) values ('${A}', '/dashboard/finance')`);
check("a user may insert their own row", own.ok, own.error);

const forged = tryAs("authenticated", A, `insert into public.nav_events (user_id, path) values ('${B}', '/dashboard/finance')`);
check("a user may NOT write a row attributed to somebody else", !forged.ok);

tryAs("authenticated", B, `insert into public.nav_events (user_id, path) values ('${B}', '/dashboard/chat')`);
const aSees = tryAs("authenticated", A, `select count(*) from public.nav_events`);
check("a user reading the table sees only their own rows", aSees.ok && aSees.out === "1", `${aSees.out} rows`);

const edit = tryAs("authenticated", A, `update public.nav_events set path='/dashboard/settings' where user_id='${A}'`);
check("a user cannot rewrite their own trail", !edit.ok, edit.ok ? "the UPDATE succeeded" : undefined);
const wipe = tryAs("authenticated", A, `delete from public.nav_events where user_id='${A}'`);
check("a user cannot selectively erase it either", !wipe.ok, wipe.ok ? "the DELETE succeeded" : undefined);

// ---------------------------------------------------------------------
console.log("\n== 4. anon owns nothing — the table AND its sequence ==");
for (const priv of ["select", "insert", "update", "delete"]) {
  check(
    `anon has no ${priv.toUpperCase()} on nav_events`,
    sql(`select has_table_privilege('anon', 'public.nav_events', '${priv}')`) === "f"
  );
}
const seq = sql(`select pg_get_serial_sequence('public.nav_events','id')`);
check("the id column has an identity sequence", seq !== "");
for (const priv of ["select", "usage", "update"]) {
  check(
    `anon has no ${priv.toUpperCase()} on that sequence`,
    sql(`select has_sequence_privilege('anon', '${seq}', '${priv}')`) === "f"
  );
}
check("authenticated CAN select and insert",
  sql(`select has_table_privilege('authenticated','public.nav_events','select')`) === "t" &&
  sql(`select has_table_privilege('authenticated','public.nav_events','insert')`) === "t");
check("and cannot update or delete",
  sql(`select has_table_privilege('authenticated','public.nav_events','update')`) === "f" &&
  sql(`select has_table_privilege('authenticated','public.nav_events','delete')`) === "f");

// ---------------------------------------------------------------------
console.log("\n== 5. retention: 90 days, and the clamp is real ==");
const fn = rows(`select p.prosecdef, p.proconfig
                   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='prune_nav_events'`);
check("prune_nav_events exists exactly once", fn.length === 1, JSON.stringify(fn));
check("it is SECURITY DEFINER — no role has DELETE on the table", fn[0]?.[0] === "t");
check("with a pinned search_path", /search_path=public/.test(fn[0]?.[1] ?? ""), fn[0]?.[1]);
for (const role of ["anon", "authenticated", "public"]) {
  check(
    `${role} cannot execute it`,
    sql(`select has_function_privilege('${role}', 'public.prune_nav_events(integer)', 'execute')`) === "f"
  );
}
check(
  "service_role can",
  sql(`select has_function_privilege('service_role', 'public.prune_nav_events(integer)', 'execute')`) === "t"
);

sql(`delete from public.nav_events where user_id in ('${A}','${B}')`);
sql(`insert into public.nav_events (user_id, path, created_at) values
  ('${A}', '/dashboard/finance', now() - interval '200 days'),
  ('${A}', '/dashboard/finance', now() - interval '91 days'),
  ('${A}', '/dashboard/finance', now() - interval '89 days'),
  ('${A}', '/dashboard/chat',    now())`);

// A GARBAGE ARGUMENT MUST DO WHAT THE DEFAULT DOES — no more. The first
// version of this clamp used greatest(...,1), which satisfies the weaker
// promise ("never deletes today") while turning a stray 0 into the most
// destructive sweep the function allows. This measured it: prune(0)
// removed the 89-day row. It is now the 90-day sweep.
const zero = Number(sql(`select public.prune_nav_events(0)`));
check("prune_nav_events(0) deletes exactly what prune_nav_events(90) would — the two rows past 90 days",
  zero === 2, String(zero));
check("the 89-day-old row SURVIVED a zero argument",
  sql(`select count(*) from public.nav_events where user_id='${A}' and created_at < now() - interval '80 days'`) === "1");
check("and so did today's",
  sql(`select count(*) from public.nav_events where user_id='${A}' and created_at > now() - interval '1 day'`) === "1");
for (const arg of ["-5", "null", "90"]) {
  check(`prune_nav_events(${arg}) now deletes nothing — there is nothing past 90 days left`,
    Number(sql(`select public.prune_nav_events(${arg})`)) === 0);
}
check("the 89-day row is still there after all four calls",
  sql(`select count(*) from public.nav_events where user_id='${A}'`) === "2",
  sql(`select count(*) from public.nav_events where user_id='${A}'`));

// AND THE CLAMP IS NOT A LOCK. A deliberate short window is honoured;
// only a value that is not a usable number falls back.
const short = Number(sql(`select public.prune_nav_events(1)`));
check("prune_nav_events(1) is honoured and takes the 89-day row", short === 1, String(short));
check("today's row is still the one thing left",
  sql(`select count(*) from public.nav_events where user_id='${A}'`) === "1");

// THE UPPER CLAMP CAPS, it does not turn the sweep off. Two fixtures
// straddling the 3650-day ceiling say which of those happened: if 999999
// were honoured, neither row would go; if it is clamped to 3650, exactly
// the older one does.
sql(`insert into public.nav_events (user_id, path, created_at) values
  ('${A}', '/dashboard/finance', now() - interval '3000 days'),
  ('${A}', '/dashboard/finance', now() - interval '4000 days')`);
const absurd = Number(sql(`select public.prune_nav_events(999999)`));
check("prune_nav_events(999999) is clamped to 3650 and takes ONLY the 4000-day row", absurd === 1, String(absurd));
check("the 3000-day row, which is inside the ceiling, survived it",
  sql(`select count(*) from public.nav_events where user_id='${A}' and created_at < now() - interval '1000 days'`) === "1");
check("and the ordinary 90-day sweep takes it",
  Number(sql(`select public.prune_nav_events(90)`)) === 1);
check("it reports the count, so a sweep that stopped working is visible",
  Number(sql(`select public.prune_nav_events(90)`)) === 0);

// ---------------------------------------------------------------------
console.log("\n== 6. the views answer the question, and leak nothing ==");
for (const v of ["nav_screen_usage", "nav_user_breadth"]) {
  check(`${v} exists`, sql(`select to_regclass('public.${v}') is not null`) === "t");
  check(
    `${v} is security_invoker — an aggregate view over an RLS table runs as its OWNER by default`,
    sql(`select coalesce((select 't' from pg_class c where c.oid='public.${v}'::regclass
                           and c.reloptions::text like '%security_invoker=true%'), 'f')`) === "t",
    sql(`select coalesce(reloptions::text,'(none)') from pg_class where oid='public.${v}'::regclass`)
  );
  for (const role of ["anon", "authenticated"]) {
    check(
      `${role} cannot select ${v}`,
      sql(`select has_table_privilege('${role}', 'public.${v}', 'select')`) === "f"
    );
  }
  check(`service_role can select ${v}`, sql(`select has_table_privilege('service_role', 'public.${v}', 'select')`) === "t");
}

sql(`delete from public.nav_events where user_id in ('${A}','${B}')`);
const stray = sql(`select count(*) from public.nav_events`);
check(
  "the table is empty before the arithmetic is measured (another suite's rows would change every number below)",
  stray === "0",
  `${stray} rows left by something else`
);

// A: five opens across three screens, two of them a business module.
// B: two opens across two screens, one business module.
sql(`insert into public.nav_events (user_id, path) values
  ('${A}', '/dashboard/finance'),
  ('${A}', '/dashboard/finance'),
  ('${A}', '/dashboard/trading'),
  ('${A}', '/dashboard/settings'),
  ('${A}', '/dashboard/settings'),
  ('${B}', '/dashboard/finance'),
  ('${B}', '/dashboard/settings')`);

const usage = Object.fromEntries(
  rows(`select path, opens, users, opens_per_user, is_business_module, pct_of_all_opens
          from public.nav_screen_usage`).map((r) => [r[0], r.slice(1)])
);
check("finance: 3 opens by 2 users", usage["/dashboard/finance"]?.[0] === "3" && usage["/dashboard/finance"]?.[1] === "2",
  JSON.stringify(usage["/dashboard/finance"]));
check("settings: 3 opens by 2 users", usage["/dashboard/settings"]?.[0] === "3" && usage["/dashboard/settings"]?.[1] === "2");
check("trading: 1 open by 1 user", usage["/dashboard/trading"]?.[0] === "1" && usage["/dashboard/trading"]?.[1] === "1");
check("opens_per_user is opens/users, not opens", usage["/dashboard/finance"]?.[2] === "1.5",
  usage["/dashboard/finance"]?.[2]);
check("finance is flagged a business module", usage["/dashboard/finance"]?.[3] === "t");
check("trading is too", usage["/dashboard/trading"]?.[3] === "t");
check("settings is NOT — it is not a candidate for cutting whatever the number says",
  usage["/dashboard/settings"]?.[3] === "f");
check("the percentages are of the whole table and sum to 100",
  Math.abs(Object.values(usage).reduce((a, r) => a + Number(r[4]), 0) - 100) < 0.5,
  JSON.stringify(Object.values(usage).map((r) => r[4])));
check("a screen nobody opened has NO row — absence is the answer to 'what can I cut'",
  usage["/dashboard/videos"] === undefined);

const breadth = rows(`select users_with_navigation, avg_screens_per_user, median_screens_per_user,
                             avg_modules_per_user, avg_opens_per_user
                        from public.nav_user_breadth`)[0];
check("two users with navigation", breadth?.[0] === "2", JSON.stringify(breadth));
check("average screens per user is 2.5 (A saw 3, B saw 2)", breadth?.[1] === "2.5", breadth?.[1]);
check("the median is beside it", Number(breadth?.[2]) === 2.5, breadth?.[2]);
check("average BUSINESS MODULES per user is 1.5 (A: finance+trading, B: finance)",
  breadth?.[3] === "1.5", breadth?.[3]);
check("average opens per user is 3.5", breadth?.[4] === "3.5", breadth?.[4]);

// ---------------------------------------------------------------------
console.log("\n== 7. the module list in the view is the app's module list ==");
const { loadTs } = await import("./load-ts.mjs");
const { MODULES } = await loadTs("src/lib/modules.ts");
const slugs = MODULES.map((m) => m.slug).sort();
// EACH VIEW SEPARATELY, not the two concatenated. A union of the two
// lists would pass with all twelve slugs in one view and six in the
// other — which is exactly the "many mutations in one dimension" hole,
// applied to an assertion.
//
// And read with sqlText, not sql: a view definition is many lines and
// answer() keeps only the last one. The first version of this check
// compared an empty array and reported the view as having no modules at
// all, which was a fact about the reader.
for (const view of ["nav_screen_usage", "nav_user_breadth"]) {
  const def = sqlText(`select pg_get_viewdef('public.${view}'::regclass, true)`);
  // THE ARRAY EXPRESSION, NOT THE WHOLE DEFINITION. Matching every
  // quoted literal in the view text also matched date_trunc('day', ...),
  // so the list came back with a thirteenth "module" called 'day'. A
  // denylist would have hidden that; reading only what is inside
  // ARRAY[...] is what actually answers the question.
  const arrays = [...def.matchAll(/ARRAY\[([^\]]*)\]/gi)].map((m) => m[1]);
  const inView = [...new Set(arrays.flatMap((a) => [...a.matchAll(/'([^']+)'/g)].map((m) => m[1])))].sort();
  check(
    `${view} classifies exactly the ${slugs.length} modules in lib/modules.ts`,
    JSON.stringify(inView) === JSON.stringify(slugs),
    `view: ${inView.join(",")}\n        code: ${slugs.join(",")}`
  );
}

// Its own rows, and only its own.
sql(`delete from public.nav_events where user_id in ('${A}','${B}')`);

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`${pass} checks passed. nav_events is scoped, clamped and countable.`);

function sqlLiteral(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}
