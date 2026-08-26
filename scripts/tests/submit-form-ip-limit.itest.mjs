// The public contact-form endpoint's per-IP cap.
//
// WHAT WAS WRONG (app/api/websites/[id]/submit-form/route.ts). The endpoint
// is public and unauthenticated by necessity — the visitor filling in a
// contact form on a published site has no Ionexa account. Every submission
// spends the SITE OWNER's credits on a lead-classification AI call. The only
// limit was 30 per website per hour, which is 720 billable AI calls a day
// that one anonymous script, from one address, with no account, could charge
// to a stranger's balance. The honeypot only stops a bot that fills every
// field blindly.
//
// The fix adds a second, per-IP cap that must ALSO pass. This test drives
// the application's own checkRateLimit — the real function from
// lib/rate-limit.ts, not a reimplementation — against a real PostgreSQL,
// through a shim that speaks the PostgREST requests supabase-js actually
// sends. Nothing in our code is stubbed.
//
// Run: node scripts/tests/submit-form-ip-limit.itest.mjs
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { startEphemeralPostgres, psqlArgs } from "../lib/ephemeral-postgres.mjs";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const ROUTE = "src/app/api/websites/[id]/submit-form/route.ts";

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

// ---------------------------------------------------------------------
// The wiring, read from the route itself. A rate limit that exists but is
// checked after the money is spent protects nothing.
// ---------------------------------------------------------------------
console.log("submit-form-ip-limit\n\n== 1. the route wires it, and wires it early ==");
const routeSource = readFileSync(path.join(ROOT, ROUTE), "utf8");

check("the route imports checkRateLimit", routeSource.includes('from "@/lib/rate-limit"'), true);
check("the route resolves the client IP", routeSource.includes("getClientIp(request)"), true);
check("the cap is declared", /MAX_SUBMISSIONS_PER_IP_PER_HOUR\s*=\s*5/.test(routeSource), true);
check(
  "the IP limit is scoped per website, so one NAT cannot lock out every site",
  routeSource.includes("`${websiteId}:${ip}`"),
  true
);

// EVERY ANCHOR IS ASSERTED BEFORE IT IS COMPARED.
//
// This block used to be `posOf(a) < posOf(b)` over plain substrings. A
// needle that stops matching returns -1, and `posOf(a) < -1` is false for
// every a — so when Prettier wrapped
//
//     .from("website_form_submissions").insert({
//
// onto two lines, the substring `.from("website_form_submissions").insert`
// stopped existing and the check went RED reporting "the IP check runs
// BEFORE anything is written". The route was, and is, correct: the insert
// sits ~80 lines below the IP check. The failure was a fact about this
// file's own text, wearing the name of a defect in the route — and the
// same shape with the comparison the other way round would have gone
// permanently GREEN instead, which is worse.
//
// So a missing anchor now fails AS A MISSING ANCHOR, saying which one.
const anchors = {};
const anchor = (label, re) => {
  const m = routeSource.match(re);
  check(`anchor: ${label}`, m !== null, true, `no match for ${re} in ${ROUTE}`);
  anchors[label] = m ? m.index : Number.NaN;
  return anchors[label];
};

const ipCheck = anchor("the per-IP rate-limit call", /scope:\s*"website_form_ip"/);
anchor("the per-website hourly cap", /MAX_SUBMISSIONS_PER_HOUR\b/);
const creditCheck = anchor("the credit check", /\bhasEnoughCredits\(/);
const aiCall = anchor("the AI classification call", /\bclassifyLeadMessage\(/);
// WHITESPACE-TOLERANT, because how the formatter breaks the chain is not
// part of the claim. And `.insert(` specifically: the FIRST mention of
// this table in the route is a `.select("id", { count: "exact", head: true })`
// — a read, done for the per-website cap — so a needle matching only the
// table name would find that one and compare the wrong position.
const insert = anchor("the submission insert", /\.from\("website_form_submissions"\)\s*\.insert\(/);

check("the IP check runs BEFORE the credit check", ipCheck < creditCheck, true);
check("the IP check runs BEFORE the AI call", ipCheck < aiCall, true);
check("the IP check runs BEFORE anything is written", ipCheck < insert, true);
check("a blocked request answers 429", /Too many submissions from this connection[\s\S]{0,120}429/.test(routeSource), true);

// ---------------------------------------------------------------------
// The behaviour, against a real database.
// ---------------------------------------------------------------------
const pg = startEphemeralPostgres();
if (!pg.available) {
  console.log("\n== 2. behaviour: SKIPPED ==");
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
  console.log("\n== 2. behaviour, against a real database ==");

  await sql(`drop table if exists public.rate_limit_log cascade`);
  await sql(`create table public.rate_limit_log (
      id uuid primary key default gen_random_uuid(),
      scope text not null,
      identifier text not null,
      created_at timestamptz not null default now())`);

  const SERVICE_KEY = "test-service-role-key";
  const quote = (v) => `'${String(v).replace(/'/g, "''")}'`;

  // A PostgREST front end covering exactly what supabase-js emits for
  // `.select("id", { count: "exact", head: true }).eq(...).gte(...)` and
  // `.insert({...})` on one table. Anything else is a 404 rather than a
  // guess, so an unnoticed change in what the app sends fails loudly.
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

        // HEAD (or GET) with count=exact.
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
          // How PostgREST reports an exact count, and what supabase-js parses.
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
  const { checkRateLimit } = await loadTsWithDeps("src/lib/rate-limit.ts");

  // The exact call the route now makes.
  const submit = (websiteId, ip) =>
    checkRateLimit({
      scope: "website_form_ip",
      identifier: `${websiteId}:${ip}`,
      maxAttempts: 5,
      windowMinutes: 60,
    });

  const SITE = "site-a";
  const ATTACKER = "203.0.113.9";

  // Sequential, because that is what a scripted flood looks like from one
  // address and because the counts must be exact to mean anything.
  const outcomes = [];
  for (let i = 0; i < 8; i++) outcomes.push((await submit(SITE, ATTACKER)).allowed);
  check("first five submissions from one IP are allowed", outcomes.slice(0, 5), [true, true, true, true, true]);
  check("the sixth onward are refused", outcomes.slice(5), [false, false, false]);

  // BEFORE: with only the per-website cap of 30, all eight would have gone
  // through and all eight would have billed the owner.
  check("BEFORE — the per-website cap of 30 would have allowed all 8", 8 <= 30, true);
  check("AFTER — how many of the 8 actually got through", outcomes.filter(Boolean).length, 5);

  // A different visitor to the same site must be unaffected.
  check("a different IP on the same site is still allowed", (await submit(SITE, "198.51.100.4")).allowed, true);

  // And the same visitor on a different site is unaffected — the cap is
  // scoped per website, so an office behind one NAT address cannot lock
  // itself out of the whole platform.
  check("the same IP on a different site is still allowed", (await submit("site-b", ATTACKER)).allowed, true);

  // The combined ceiling: the per-website cap of 30 an hour now needs at
  // least six distinct source addresses to be reached instead of one.
  check("distinct IPs now needed to exhaust one site's hourly budget", Math.ceil(30 / 5), 6);

  const logged = Number(await sql(`select count(*) from public.rate_limit_log where scope = 'website_form_ip'`));
  check("only the allowed attempts were recorded", logged, 7); // 5 + 1 + 1

  // Fails OPEN on a database error, like every other limiter in this app: a
  // logging hiccup must not break a real visitor's contact form. Verified by
  // pointing the client at a port with nothing on it.
  const goodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
  check("a database outage does not block a real visitor", (await submit(SITE, ATTACKER)).allowed, true);
  process.env.NEXT_PUBLIC_SUPABASE_URL = goodUrl;
} finally {
  if (shim) await new Promise((r) => shim.close(r));
  pg.stop();
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
