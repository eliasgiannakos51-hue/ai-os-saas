// AT MOST ONE ALERT PER INTERVAL — asked of a real Postgres, concurrently.
//
// record_cost_alert() suppresses a repeat with `insert ... select ...
// where not exists (...)`. One statement, which makes it look atomic. At
// READ COMMITTED it is not: two transactions arriving together each
// evaluate `not exists` against a snapshot without the other's
// uncommitted row, both find nothing, and both insert. No unique
// constraint can catch it, because the condition is a rolling time window.
//
// The cost is two identical alerts in the owner's inbox for one event,
// and a p_min_interval_seconds that means "usually" instead of "at most
// once". This file measures both halves: the window on its own, and the
// window under twenty simultaneous callers.
//
// Run: DATABASE_URL=... node scripts/tests/cost-alert-once.dbtest.mjs
//  or: npm run test:db -- cost-alert-once
import { execFileSync } from "node:child_process";

const DB = process.env.DATABASE_URL ?? process.env.PGDATABASE;
if (!DB) {
  console.log("SKIPPED: no DATABASE_URL / PGDATABASE — this file needs a real Postgres.");
  process.exit(0);
}

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (typeof cond !== "boolean") {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        check() takes a BOOLEAN; got ${Array.isArray(cond) ? "an array" : typeof cond}`);
    return;
  }
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
}
const args = (q) => ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tAc", q];
const sql = (q) => execFileSync("psql", args(q), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const TYPE = "dbtest_alert";
const clean = () => sql(`delete from public.cost_alert_log where alert_type like '${TYPE}%'`);
const count = (t = TYPE) => Number(sql(`select count(*) from public.cost_alert_log where alert_type = '${t}'`));
const fire = (t = TYPE, secs = 3600) =>
  sql(`select fired from public.record_cost_alert('${t}', '{}'::jsonb, ${secs})`);

console.log("== 1. the window, one caller at a time ==");
clean();
check("the first call fires", fire() === "t");
check("...and writes one row", count() === 1);
check("the second inside the interval does not", fire() === "f");
check("...and writes no second row", count() === 1);
check("a DIFFERENT alert type is unaffected", fire(`${TYPE}_other`) === "t");
check("an interval of 0 lets the next one through",
  fire(TYPE, 0) === "t", `rows now ${count()}`);

console.log("\n== 2. THE RACE: twenty callers at once ==");
{
  clean();
  const one = `select record_cost_alert('${TYPE}', '{}'::jsonb, 3600)`;
  execFileSync("sh", ["-c",
    Array.from({ length: 20 }, () =>
      `psql -d "${DB}" -v ON_ERROR_STOP=1 -tAc "${one}" &`).join(" ") + " wait"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  const rows = count();
  console.log(`        20 simultaneous callers, interval 3600s — ${rows} row(s) written`);
  check("exactly one alert is recorded, not one per caller", rows === 1, `got ${rows}`);
}

console.log("\n== 3. the lock is per TYPE, so alerts do not queue behind each other ==");
{
  clean();
  const kinds = ["a", "b", "c", "d"];
  execFileSync("sh", ["-c",
    kinds.flatMap((k) => Array.from({ length: 5 }, () =>
      `psql -d "${DB}" -v ON_ERROR_STOP=1 -tAc "select record_cost_alert('${TYPE}_${k}', '{}'::jsonb, 3600)" &`
    )).join(" ") + " wait"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  const perKind = kinds.map((k) => count(`${TYPE}_${k}`));
  console.log(`        four types x five callers — rows per type: ${perKind.join(", ")}`);
  check("each type recorded exactly once", perKind.every((n) => n === 1), perKind.join(", "));
}

console.log("\n== 4. the function is still service-role only ==");
check(
  "anon and authenticated cannot fire an alert",
  sql(`select has_function_privilege('anon', 'public.record_cost_alert(text,jsonb,integer)', 'execute')::text
       || ':' || has_function_privilege('authenticated', 'public.record_cost_alert(text,jsonb,integer)', 'execute')::text
       || ':' || has_function_privilege('service_role', 'public.record_cost_alert(text,jsonb,integer)', 'execute')::text`) ===
    "false:false:true",
  "a signed-in user who could fire alerts could empty the owner's inbox"
);

clean();
console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
