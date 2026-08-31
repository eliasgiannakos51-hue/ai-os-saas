import { startEphemeralPostgres, psqlArgs } from "/home/user/ai-os-saas/scripts/lib/ephemeral-postgres.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const SP = process.cwd();
const pg = startEphemeralPostgres();
if (!pg.available) { console.log("NO PG:", pg.reason); process.exit(1); }
const A = psqlArgs(pg.conn);
const runFile = (f) => execFileSync("psql", [...A, "-v","ON_ERROR_STOP=1","-q","-f", f], {encoding:"utf8", stdio:["ignore","pipe","pipe"]});
const q = (s) => execFileSync("psql", [...A, "-v","ON_ERROR_STOP=1","-tAc", s], {encoding:"utf8"}).trim();
const show = (f) => execFileSync("psql", [...A, "-v","ON_ERROR_STOP=1","-f", f], {encoding:"utf8"});
let fails = 0;
const ok = (n, c, d) => { console.log((c?"  PASS  ":"  FAIL  ")+n+(c?"":"\n        "+d)); if(!c) fails++; };
try {
  runFile("/home/user/ai-os-saas/scripts/db/bootstrap-supabase.sql");
  // Deliberately WITHOUT the backfill migration, so this proves the SQL stands alone.
  for (const f of fs.readdirSync("/home/user/ai-os-saas/supabase/migrations").filter(f=>f.endsWith(".sql")).sort())
    if (f !== "20260918000000_scrub_existing_error_rows.sql") runFile("/home/user/ai-os-saas/supabase/migrations/"+f);
  ok("το σχήμα χτίστηκε ΧΩΡΙΣ το backfill migration",
     q(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='scrub_secret_text'`) === "0");

  const U = "33333333-3333-3333-3333-333333333333";
  q(`insert into auth.users (id, email) values ('${U}','sqlcheck@test.local')`);
  const JWT = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9","eyJyb2xlIjoiZXhhbXBsZSJ9","c2lnbmF0dXJlX2hlcmU"].join(".");
  const OPAQUE = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ";
  const URLSEC = "postgres://admin:hunter2@db.example.com:5432/postgres";
  const WHSEC = "whse"+"c_"+"0123456789abcdefghijklmnopqrstuv";
  const INNOCENT = 'relation "public.agent_templates" does not exist';
  const ins = (msg, stack, route) => q(
    `insert into public.production_errors (fingerprint, error_message, stack_trace, route, occurrence_count, affected_user_ids)
     values (md5(random()::text), $x$${msg}$x$, ${stack ? `$y$${stack}$y$` : "null"}, '${route}', 1, array['${U}']::uuid[]) returning 1`);
  ins(`upstream said ${JWT}`, `at handler (${OPAQUE})`, "/api/a");
  ins(`could not connect to ${URLSEC}`, null, "/api/b");
  ins(`signature ${WHSEC} rejected`, null, "/api/c");
  ins(INNOCENT, null, "/api/d");
  q(`insert into public.user_websites (user_id, name, html_content, error_message)
     values ('${U}','w','<p></p>', $x$generation failed: ${JWT}$x$)`);

  console.log("\n== 1-detect.sql ==");
  const det = show(`${SP}/docs/sql/1-detect.sql`);
  console.log(det.trim().split("\n").map(l=>"        "+l).join("\n"));
  ok("τρέχει και βρίσκει το jwt", /jwt/.test(det) && /production_errors.error_message/.test(det));

  console.log("\n== 2-preview.sql ==");
  const prev = show(`${SP}/docs/sql/2-preview.sql`);
  ok("το preview δεν περιέχει ΚΑΝΕΝΑ μυστικό",
     !prev.includes(JWT) && !prev.includes(OPAQUE) && !prev.includes("hunter2") && !prev.includes(WHSEC), prev.slice(0,400));
  ok("...και δείχνει τι θα μείνει", /redacted-jwt/.test(prev) && /upstream said/.test(prev));
  ok("...και δεν δείχνει την αθώα γραμμή", !prev.includes("agent_templates"));

  console.log("\n== 3-clean.sql ==");
  runFile(`${SP}/docs/sql/3-clean.sql`);
  const left = q(`select count(*) from public.production_errors
                   where error_message like '%${JWT}%' or coalesce(stack_trace,'') like '%${OPAQUE}%'
                      or error_message like '%hunter2%' or error_message like '%${WHSEC}%'`);
  ok("καμία γραμμή production_errors δεν κρατά μυστικό", left === "0", `έμειναν ${left}`);
  ok("το user_websites καθάρισε επίσης",
     q(`select count(*) from public.user_websites where error_message like '%${JWT}%'`) === "0");
  ok("η αθώα γραμμή έμεινε ΑΚΕΡΑΙΑ",
     q(`select count(*) from public.production_errors where error_message = $x$${INNOCENT}$x$`) === "1");
  ok("το ιστορικό δεν διαγράφηκε", q(`select count(*) from public.production_errors`) === "4");
  ok("ο host κρατήθηκε στο connection string",
     q(`select count(*) from public.production_errors where error_message like '%db.example.com:5432/postgres%'`) === "1");
  // idempotence
  const before = q(`select md5(string_agg(coalesce(error_message,'')||coalesce(stack_trace,''), '|' order by id)) from public.production_errors`);
  runFile(`${SP}/docs/sql/3-clean.sql`);
  const after = q(`select md5(string_agg(coalesce(error_message,'')||coalesce(stack_trace,''), '|' order by id)) from public.production_errors`);
  ok("δεύτερη εκτέλεση δεν αλλάζει τίποτα (ιδεμποτενσιακό)", before === after);
  ok("η προσωρινή συνάρτηση δεν έμεινε στο public",
     q(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='scrub_once'`) === "0");

  console.log("\n== 4-spend.sql / 5-undercount.sql ==");
  q(`insert into public.ai_cost_log (user_id, feature, ai_calls, real_cost_eur, credits_charged)
     values ('${U}','deep_research',8,0.42,120), ('${U}','chat',1,0.01,3)`);
  q(`insert into public.daily_ai_spend_tracking (date, total_calls, estimated_cost)
     values ((now() at time zone 'utc')::date, 1, 3)`);
  const sp = show(`${SP}/docs/sql/4-spend.sql`);
  ok("4-spend τρέχει και δίνει κλήσεις ανά χαρακτηριστικό", /deep_research/.test(sp) && /avg_calls_per_action/.test(sp), sp.slice(0,300));
  const uc = show(`${SP}/docs/sql/5-undercount.sql`);
  ok("5-undercount τρέχει και δείχνει τη διαφορά", /missed/.test(uc), uc.slice(0,300));
  console.log(uc.trim().split("\n").map(l=>"        "+l).join("\n"));
} catch (e) { console.log("ERR:", String(e.stderr||e.stdout||e.message).slice(-2500)); fails++; }
pg.stop();
console.log(fails === 0 ? "\nΟΛΑ ΠΕΡΑΣΑΝ" : `\n${fails} ΑΠΕΤΥΧΑΝ`);
process.exit(fails===0?0:1);
