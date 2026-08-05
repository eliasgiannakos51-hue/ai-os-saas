// Reproduction test for the two money bugs in grantCredits() found in the
// V1+V2 audit.
//
// The old implementation:
//
//     const { data: row } = await admin.from("user_credits").select(...)
//     const nextRemaining = (row?.credits_remaining ?? 0) + amount;
//     await admin.from("user_credits").upsert({ credits_remaining: nextRemaining, ... })
//     await admin.from("credit_transactions").insert({ ... })
//
//   BUG 1 — not idempotent. The Stripe webhook called this for every
//   checkout.session.completed, with no record of what it had handled.
//   Stripe's delivery guarantee is at-least-once; a redelivery granted the
//   whole pack again. Up to 8,000 free credits per replay.
//
//   BUG 2 — not atomic. Read and write are separate round trips. Two grants
//   that overlap in that window both read the same balance and the second
//   write discards the first. No error, anywhere.
//
// Both are asserted against a REAL Postgres running the REAL migration,
// because the fix lives in SQL and reading SQL proves nothing about how it
// behaves under concurrency. When no server is reachable the behavioural
// half is reported as SKIPPED — loudly, never silently passed.
//
// Run:  node scripts/tests/credit-grants.test.mjs
// With a database:  PGTEST_URL="postgres://..." node scripts/tests/credit-grants.test.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

let pass = 0,
  fail = 0,
  skipped = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

const MIGRATION = "supabase/migrations/20260805_idempotent_credit_grants.sql";
const sql = readFileSync(MIGRATION, "utf8");

console.log("== 1. the migration encodes the right invariants ==");
checkTrue(
  "the idempotency key is UNIQUE only where present (nulls must not collide)",
  /create unique index[\s\S]*?credit_transactions \(idempotency_key\)[\s\S]*?where idempotency_key is not null/i.test(sql)
);
checkTrue(
  "the key is claimed with ON CONFLICT DO NOTHING, not a read-then-check",
  /on conflict \(idempotency_key\)[\s\S]{0,60}do nothing/i.test(sql)
);
checkTrue(
  "a lost claim returns early WITHOUT touching the balance",
  /if v_inserted = 0 then[\s\S]*?return query select false[\s\S]*?return;/i.test(sql)
);
checkTrue(
  "the increment is done BY POSTGRES, not by the application",
  /credits_remaining = public\.user_credits\.credits_remaining \+ p_amount/i.test(sql)
);
// The grant function creates credits. It must not be callable with the anon key.
checkTrue("execute is revoked from public", /revoke all on function public\.grant_credits_idempotent[\s\S]*?from public/i.test(sql));
checkTrue("execute is revoked from anon", /from anon/i.test(sql));
checkTrue("execute is revoked from authenticated", /from authenticated/i.test(sql));
checkTrue("execute is granted to service_role only", /grant execute on function public\.grant_credits_idempotent[\s\S]*?to service_role/i.test(sql));
checkTrue("it is a security definer function with a pinned search_path", /security definer[\s\S]{0,80}set search_path = public/i.test(sql));

console.log("\n== 2. the application actually passes idempotency keys ==");
const CALLERS = [
  ["src/app/api/webhooks/stripe/route.ts", "stripe_checkout:${session.id}", "a credit-pack purchase"],
  ["src/app/api/signup/route.ts", "signup_grant:${createData.user.id}", "the password signup grant"],
  ["src/app/auth/callback/route.ts", "signup_grant:${user.id}", "the OAuth bootstrap grant"],
];
for (const [file, key, what] of CALLERS) {
  const src = readFileSync(file, "utf8");
  checkTrue(`${what} passes an idempotency key`, src.includes(key));
}
// Both signup paths must use the SAME key shape, or they don't dedupe
// against each other at all — which is the entire point.
checkTrue(
  "both signup paths share one key namespace",
  readFileSync("src/app/api/signup/route.ts", "utf8").includes("signup_grant:") &&
    readFileSync("src/app/auth/callback/route.ts", "utf8").includes("signup_grant:")
);

const credits = readFileSync("src/lib/billing/credits.ts", "utf8");
checkTrue("grantCredits goes through the RPC", credits.includes('rpc("grant_credits_idempotent"'));
check(
  "grantCredits no longer reads-then-writes the balance in TypeScript",
  /const nextRemaining = \(row\?\.credits_remaining \?\? 0\) \+ amount/.test(credits),
  false
);
checkTrue("a failed grant is surfaced, not swallowed", /throw new Error\(`Could not grant credits/.test(credits));
checkTrue("callers can tell a real grant from a replay", /granted: Boolean\(row\?\.granted\)/.test(credits));
// The webhook must ACT on that flag — otherwise a replay would still
// re-record the pack purchase rate.
const webhook = readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8");
checkTrue("the webhook returns early on a replay", /if \(!granted\) \{[\s\S]{0,400}return;/.test(webhook));
checkTrue(
  "...before recording the pack purchase rate",
  // Compare the CALL SITE, not any textual occurrence — the import line at
  // the top of the file mentions the name long before it is called.
  webhook.indexOf("if (!granted)") < webhook.indexOf("await recordPackPurchaseRate(")
);

console.log("\n== 3. behaviour, against a real Postgres running the real migration ==");

function findPsql() {
  if (process.env.PGTEST_URL) return { url: process.env.PGTEST_URL };
  // The socket a developer (or this test) may already have running.
  for (const args of [["-h", "/tmp", "-p", "55432", "-U", "postgres"]]) {
    try {
      execFileSync("psql", [...args, "-tAc", "select 1"], { stdio: ["ignore", "pipe", "ignore"] });
      return { args };
    } catch {
      /* try the next one */
    }
  }
  return null;
}

const conn = findPsql();
if (!conn) {
  skipped++;
  console.log("  SKIP  no Postgres reachable — the behavioural half did NOT run.");
  console.log("        These bugs live in SQL semantics under concurrency; the static");
  console.log("        checks above cannot substitute. To run them:");
  console.log("          initdb -D /tmp/pgtest -U postgres --auth=trust");
  console.log("          pg_ctl -D /tmp/pgtest -o '-k /tmp -p 55432' start");
  console.log("        or set PGTEST_URL to any throwaway database.");
} else {
  const base = conn.url ? [conn.url] : conn.args;
  const q = (text) =>
    execFileSync("psql", [...base, "-v", "ON_ERROR_STOP=1", "-tAc", text], { encoding: "utf8" }).trim();
  const run = (text) =>
    execFileSync("psql", [...base, "-v", "ON_ERROR_STOP=1", "-q"], { input: text, encoding: "utf8" });

  // A throwaway schema, so the test is repeatable and touches nothing else.
  run(`
    drop schema if exists grants_test cascade;
    create schema grants_test;
    set search_path = grants_test;
    create table user_credits (
      user_id uuid primary key,
      credits_remaining integer not null default 0,
      credits_total integer not null default 0,
      plan_tier text not null default 'free',
      beta_expires_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create table credit_transactions (
      id bigserial primary key,
      user_id uuid not null,
      amount integer not null,
      action_type text not null,
      description text not null default '',
      idempotency_key text,
      created_at timestamptz not null default now()
    );
    create unique index on credit_transactions (idempotency_key) where idempotency_key is not null;
  `);

  // The real function body, retargeted at the throwaway schema. Extracted
  // from the migration rather than retyped, so this cannot drift from what
  // actually ships.
  const fnStart = sql.indexOf("create or replace function public.grant_credits_idempotent");
  const fnEnd = sql.indexOf("$$;", fnStart) + 3;
  checkTrue("the function body was extracted from the migration", fnStart > 0 && fnEnd > fnStart);
  const fnBody = sql
    .slice(fnStart, fnEnd)
    .replace(/public\./g, "grants_test.")
    .replace(/set search_path = public/, "set search_path = grants_test");
  run(fnBody);

  const U1 = "11111111-1111-1111-1111-111111111111";
  const grant = (user, amt, key, extra = "") =>
    q(`select granted from grants_test.grant_credits_idempotent('${user}', ${amt}, 'purchase', 'x', ${key}${extra})`);
  const balance = (user) =>
    Number(q(`select coalesce(max(credits_remaining),0) from grants_test.user_credits where user_id='${user}'`));

  console.log("  -- BUG 1: a redelivered Stripe event must not grant twice --");
  check("first delivery grants", grant(U1, 8000, `'stripe_checkout:cs_1'`), "t");
  check("second delivery does NOT", grant(U1, 8000, `'stripe_checkout:cs_1'`), "f");
  check("third delivery does NOT", grant(U1, 8000, `'stripe_checkout:cs_1'`), "f");
  check("balance reflects ONE purchase", balance(U1), 8000);
  check("the transaction log has one row", Number(q(`select count(*) from grants_test.credit_transactions`)), 1);

  console.log("  -- a genuinely different purchase is unaffected --");
  check("a new session grants", grant(U1, 500, `'stripe_checkout:cs_2'`), "t");
  check("balance accumulates", balance(U1), 8500);

  console.log("  -- both signup paths share one key --");
  const U2 = "22222222-2222-2222-2222-222222222222";
  check(
    "api/signup grants",
    q(`select granted from grants_test.grant_credits_idempotent('${U2}', 200, 'signup_grant', 'x', 'signup_grant:${U2}', 200, 'free', null)`),
    "t"
  );
  check(
    "auth/callback then grants nothing",
    q(`select granted from grants_test.grant_credits_idempotent('${U2}', 200, 'signup_grant', 'x', 'signup_grant:${U2}', 200, 'free', null)`),
    "f"
  );
  check("one signup allotment, not two", balance(U2), 200);
  check("plan columns were applied", q(`select plan_tier from grants_test.user_credits where user_id='${U2}'`), "free");

  console.log("  -- a null key stays repeatable (admin adjustments must not dedupe) --");
  const U3 = "33333333-3333-3333-3333-333333333333";
  check("first", q(`select granted from grants_test.grant_credits_idempotent('${U3}', 50, 'admin_adjustment', 'x', null)`), "t");
  check("second", q(`select granted from grants_test.grant_credits_idempotent('${U3}', 50, 'admin_adjustment', 'x', null)`), "t");
  check("both applied", balance(U3), 100);

  console.log("  -- BUG 2: concurrent grants must not lose updates --");
  // Real concurrency, real connections. The old read-modify-write loses
  // grants here; a single-statement increment cannot.
  const U4 = "44444444-4444-4444-4444-444444444444";
  run(`insert into grants_test.user_credits (user_id, credits_remaining) values ('${U4}', 0)`);
  const N = 8;
  const children = Array.from({ length: N }, (_, i) =>
    // Distinct keys: this measures ATOMICITY, not deduplication.
    `select grants_test.grant_credits_idempotent('${U4}', 100, 'purchase', 'c${i}', 'concurrent:${i}');`
  );
  // Fire them all at once and wait for every one to finish.
  const procs = children.map((stmt) =>
    execFileSync("bash", ["-c", `psql ${base.map((a) => `'${a}'`).join(" ")} -q -c "${stmt}" >/dev/null 2>&1 & echo $!`], {
      encoding: "utf8",
    }).trim()
  );
  execFileSync("bash", ["-c", `while kill -0 ${procs.join(" ")} 2>/dev/null; do sleep 0.05; done`], {
    encoding: "utf8",
  });
  check(`${N} concurrent grants of 100 all landed`, balance(U4), N * 100);

  run("drop schema if exists grants_test cascade;");
}

console.log(
  `\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed${skipped ? `, ${skipped} SKIPPED (see above)` : ""}`
);
process.exit(fail === 0 ? 0 : 1);
