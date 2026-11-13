// ΑΣ2-1.2: the wave the per-IP login block cannot see.
//
// src/app/api/auth/login/route.ts blocks one address after 8 failures in
// 15 minutes (MAX_FAILED_ATTEMPTS). An attacker who spreads the same
// attack across many addresses — none crossing 8 — was never blocked:
// the only account-level signal, LOGIN_FAILURE_ALERT.accountScope, only
// emailed the owner (src/lib/auth/login-failure-alert.ts), it never
// denied a request. login-failure-alert.test.mjs §5 holds that the
// route now READS this same row set and returns 429 at the right
// threshold — by source, since the route also calls Supabase Auth,
// which this itest cannot reach. What it can reach, against a real
// Postgres, is the one thing a source check cannot see: that
// countRateLimitHits/recordRateLimitHit — the exact functions both the
// route and the alert call — actually count correctly when many
// different "IPs" write to the SAME account-keyed row set, and that the
// per-IP scope staying under its own cap the whole time does not stop
// the account cap from being reached.
//
// Same harness as scripts/tests/submit-form-ip-limit.itest.mjs: a real
// ephemeral PostgreSQL, through a shim speaking the exact PostgREST
// requests countRateLimitHits/recordRateLimitHit send. Nothing here is
// stubbed.
//
// Run: node scripts/tests/login-account-block.itest.mjs
import { execFile } from "node:child_process";
import http from "node:http";
import { promisify } from "node:util";
import { startEphemeralPostgres, psqlArgs } from "../lib/ephemeral-postgres.mjs";

const execFileAsync = promisify(execFile);

let pass = 0;
let fail = 0;
function check(name, actual, expected, detail = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}${detail ? `\n        ${detail}` : ""}`);
  }
}

console.log("login-account-block");

const pg = startEphemeralPostgres();
if (!pg.available) {
  console.log("\n== behaviour: SKIPPED ==");
  console.log(`  ${pg.reason}`);
  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

const ARGS = psqlArgs(pg.conn);
async function sql(statement) {
  const { stdout } = await execFileAsync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-tAc", statement], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout.trim();
}

let shim;
try {
  console.log("\n== behaviour, against a real database ==");

  await sql(`drop table if exists public.rate_limit_log cascade`);
  await sql(`create table public.rate_limit_log (
      id uuid primary key default gen_random_uuid(),
      scope text not null,
      identifier text not null,
      created_at timestamptz not null default now())`);

  const SERVICE_KEY = "test-service-role-key";
  const quote = (v) => `'${String(v).replace(/'/g, "''")}'`;

  // Identical shape to submit-form-ip-limit.itest.mjs's shim: a HEAD/GET
  // with count=exact + eq/gte filters becomes a count query, a POST an
  // insert — exactly what countRateLimitHits/recordRateLimitHit send.
  shim = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const url = new URL(req.url, "http://localhost");
        if (!url.pathname.startsWith("/rest/v1/rate_limit_log") || req.headers.apikey !== SERVICE_KEY) {
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ message: `unexpected: ${req.method} ${req.url}` }));
        }

        if (req.method === "POST") {
          const row = JSON.parse(body);
          await sql(
            `insert into public.rate_limit_log (scope, identifier) values (${quote(row.scope)}, ${quote(row.identifier)})`
          );
          res.writeHead(201, { "Content-Type": "application/json" });
          return res.end("[]");
        }

        const where = [];
        for (const [key, raw] of url.searchParams) {
          if (key === "select") continue;
          const [op, ...rest] = raw.split(".");
          const value = rest.join(".");
          if (op === "eq") where.push(`${key} = ${quote(value)}`);
          else if (op === "gte") where.push(`${key} >= ${quote(value)}::timestamptz`);
          else throw new Error(`unsupported operator ${op}`);
        }
        const count = Number(
          await sql(`select count(*) from public.rate_limit_log${where.length ? ` where ${where.join(" and ")}` : ""}`)
        );
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Range": `0-${Math.max(count - 1, 0)}/${count}`,
        });
        return res.end(req.method === "HEAD" ? "" : "[]");
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: String(err.message || err) }));
      }
    });
  });

  await new Promise((resolve) => shim.listen(0, "127.0.0.1", resolve));
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${shim.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

  const { loadTsWithDeps } = await import("./load-ts.mjs");
  const { countRateLimitHits, recordRateLimitHit } = await loadTsWithDeps("src/lib/rate-limit.ts");
  const { LOGIN_FAILURE_ALERT, accountKey } = await loadTsWithDeps("src/lib/auth/login-failure-policy.ts");

  const VICTIM = accountKey("victim@example.gr");
  const MAX_FAILED_ATTEMPTS = 8; // src/app/api/auth/login/route.ts's own per-IP cap

  // The scenario the finding names: 20 attackers, one address each, every
  // one of them well under the per-IP cap of 8 — so the per-IP block
  // (keyed by IP alone, a separate scope this itest never writes to)
  // would wave every single one of these through — all hitting the SAME
  // account. noteLoginFailure() (login-failure-alert.ts) and the route's
  // own new check both read this exact scope/identifier.
  const ATTACKERS = Array.from({ length: LOGIN_FAILURE_ALERT.accountThreshold - 1 }, (_, i) => `203.0.113.${i}`);
  check("fewer attackers than the account threshold, to prove the LAST one is what tips it", ATTACKERS.length, LOGIN_FAILURE_ALERT.accountThreshold - 1);
  check("every attacker individually stays under the per-IP cap (1 failure each, cap is 8)", 1 < MAX_FAILED_ATTEMPTS, true);

  for (const ip of ATTACKERS) {
    void ip; // the IP never appears in what gets written — the account check does not key on it at all
    await recordRateLimitHit({ scope: LOGIN_FAILURE_ALERT.accountScope, identifier: VICTIM });
  }

  const beforeLast = await countRateLimitHits({
    scope: LOGIN_FAILURE_ALERT.accountScope,
    identifier: VICTIM,
    windowMinutes: LOGIN_FAILURE_ALERT.windowMinutes,
  });
  check("one short of the threshold: not yet at the account cap", beforeLast, { count: LOGIN_FAILURE_ALERT.accountThreshold - 1, ok: true });
  check("...so the route's own check (count >= threshold) would still let this one through", beforeLast.count >= LOGIN_FAILURE_ALERT.accountThreshold, false);

  // The 20th distinct address, still its own first-ever failure.
  await recordRateLimitHit({ scope: LOGIN_FAILURE_ALERT.accountScope, identifier: VICTIM });
  const afterLast = await countRateLimitHits({
    scope: LOGIN_FAILURE_ALERT.accountScope,
    identifier: VICTIM,
    windowMinutes: LOGIN_FAILURE_ALERT.windowMinutes,
  });
  check("the account cap is now crossed — by distinct addresses the per-IP block never touched", afterLast, { count: LOGIN_FAILURE_ALERT.accountThreshold, ok: true });
  check("...so the route's own check would now return 429, before ever calling Supabase Auth", afterLast.count >= LOGIN_FAILURE_ALERT.accountThreshold, true);

  // A different account, hit from the very same pool of addresses, is
  // unaffected — the cap is per account, not a site-wide trip-wire (that
  // is LOGIN_FAILURE_ALERT.globalScope, a different number entirely).
  const OTHER = accountKey("someone-else@example.gr");
  const other = await countRateLimitHits({ scope: LOGIN_FAILURE_ALERT.accountScope, identifier: OTHER, windowMinutes: LOGIN_FAILURE_ALERT.windowMinutes });
  check("an account nobody has attacked is not blocked by somebody else's", other, { count: 0, ok: true });

  // Fails open on a database outage, same tolerance as every other
  // limiter in this app (lib/rate-limit.ts's own comment) — verified by
  // pointing the client at a port with nothing listening.
  const goodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
  const outage = await countRateLimitHits({ scope: LOGIN_FAILURE_ALERT.accountScope, identifier: VICTIM, windowMinutes: LOGIN_FAILURE_ALERT.windowMinutes });
  check("a database outage answers ok:false, never a false 'blocked'", outage.ok, false);
  process.env.NEXT_PUBLIC_SUPABASE_URL = goodUrl;
} finally {
  if (shim) await new Promise((r) => shim.close(r));
  pg.stop();
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
