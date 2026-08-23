// THE THREE PWA FIGURES, AGAINST A REAL POSTGRES.
//
// pwa_adoption_summary() is the whole answer to "native app or not". It is
// SQL, so nothing that reads source code can tell whether it computes what
// it claims — and a percentage that is quietly wrong is worse than no
// percentage, because it gets acted on.
//
// WHAT IT PROVES:
//   1. the figures match hand-computed values on a known set of devices
//   2. with no devices, the percentages are NULL — not 0%, which would
//      read as a measured "nobody"
//   3. the day window really excludes older devices
//   4. the iOS-installed figure divides by iOS devices, not by all devices
//   5. the CHECK constraints refuse a value the API does not send
//   6. one row per (user, browser) — a heartbeat updates, never duplicates
//   7. deleting the account takes the rows with it
//   8. no signed-in role may call the summary; only service_role
//
// HOW TO RUN
//   createdb ionexa_test
//   psql -d ionexa_test -f scripts/db/bootstrap-supabase.sql
//   for f in supabase/migrations/*.sql; do psql -q -d ionexa_test -f "$f"; done
//   DATABASE_URL=postgres://…/ionexa_test node scripts/tests/pwa-adoption.dbtest.mjs
//
// `npm run test:db` provisions a throwaway Postgres and runs it for real.
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
function eq(name, actual, expected) {
  check(`${name} (${actual})`, actual === expected, `expected ${expected}, got ${actual}`);
}

function sql(query) {
  const args = process.env.DATABASE_URL
    ? ["-d", process.env.DATABASE_URL]
    : ["-d", process.env.PGDATABASE];
  return execFileSync("psql", [...args, "-v", "ON_ERROR_STOP=1", "-tAc", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function trySql(query) {
  try {
    return { ok: true, out: sql(query) };
  } catch (err) {
    return { ok: false, out: String(err.stderr ?? err.message) };
  }
}

const A = "21111111-1111-1111-1111-111111111111";
const B = "21111111-1111-1111-1111-111111111112";

function reset() {
  sql(`delete from public.pwa_client_stats where user_id in ('${A}','${B}')`);
  for (const id of [A, B]) {
    sql(`insert into auth.users (id) values ('${id}') on conflict (id) do nothing`);
  }
}

/** Rows belonging to anyone but this test's two users.
 *
 *  pwa_adoption_summary() counts EVERY account — that is what it is for —
 *  so absolute numbers are only meaningful when nothing else is in the
 *  table. `npm run test:db` provisions a throwaway database where that
 *  holds; the documented escape hatch (DATABASE_URL pointed at a real
 *  database) is where it does not. Rather than pick one and be wrong on
 *  the other, the file MEASURES which it is and asserts accordingly — and
 *  never deletes rows it did not create. */
function foreignRows() {
  return Number(sql(`select count(*) from public.pwa_client_stats where user_id not in ('${A}','${B}')`));
}

/** The summary as an object, so an assertion names the column it means. */
function summary(days = 30) {
  const cols = [
    "devices",
    "ios_devices",
    "ios_percent",
    "installed_devices",
    "installed_percent",
    "push_granted_devices",
    "push_granted_percent",
    "push_subscribed_devices",
    "push_subscribed_percent",
    "ios_installed_devices",
    "ios_installed_percent",
  ];
  // Scoped to this test's two users. The function counts EVERY account —
  // which is what it is for — so a shared database would otherwise make
  // these numbers depend on whatever else is in it.
  const row = sql(
    `select ${cols.join(", ")} from public.pwa_adoption_summary(${days})`
  ).split("|");
  return Object.fromEntries(cols.map((c, i) => [c, row[i] ?? ""]));
}

function device(user, id, opts) {
  sql(
    `insert into public.pwa_client_stats
       (user_id, client_id, platform, browser, display_mode, installed, push_permission, push_subscribed, last_seen_at)
     values ('${user}', '${id}', '${opts.platform}', '${opts.browser ?? "safari"}',
             '${opts.mode}', ${opts.mode !== "browser"}, '${opts.push ?? "default"}',
             ${opts.subscribed ? "true" : "false"},
             now() - interval '${opts.ageDays ?? 0} days')`
  );
}

const FOREIGN = foreignRows();
const ISOLATED = FOREIGN === 0;
console.log(
  ISOLATED
    ? "database is otherwise empty — asserting ABSOLUTE figures\n"
    : `database holds ${FOREIGN} rows from other accounts — asserting DELTAS instead\n`
);

console.log("== 1. the percentages are arithmetic, not decoration ==");
reset();
device(A, "c1", { platform: "ios", mode: "standalone", push: "granted", subscribed: true });
device(A, "c2", { platform: "ios", mode: "browser" });
device(A, "c3", { platform: "ipados", mode: "fullscreen", push: "granted", subscribed: true });
device(A, "c4", { platform: "ios", browser: "chromium", mode: "browser", push: "denied" });
device(B, "c5", { platform: "android", browser: "chromium", mode: "standalone", push: "granted" });
device(B, "c6", { platform: "android", browser: "chromium", mode: "browser" });
device(B, "c7", { platform: "windows", browser: "chromium", mode: "browser" });
device(B, "c8", { platform: "macos", browser: "firefox", mode: "browser" });

const s = summary();
/** What the function should have printed, from its OWN counts. Holds
 *  whatever else is in the table, which is what makes it the check that
 *  can always run. */
function pct(numerator, denominator) {
  const n = Number(s[numerator]);
  const d = Number(s[denominator]);
  if (d === 0) return "";
  return (Math.round((1000 * n) / d) / 10).toFixed(1);
}
for (const [percent, num, den] of [
  ["ios_percent", "ios_devices", "devices"],
  ["installed_percent", "installed_devices", "devices"],
  ["push_granted_percent", "push_granted_devices", "devices"],
  ["push_subscribed_percent", "push_subscribed_devices", "devices"],
  // THE ONE THAT MATTERS MOST, and the easiest to get wrong: on iOS push
  // needs an installed app, so this is the ceiling on iPhone
  // notifications — and it has to divide by iOS devices, not by all of
  // them. Against `devices` the same data reads 25% instead of 50%.
  ["ios_installed_percent", "ios_installed_devices", "ios_devices"],
]) {
  eq(`${percent} = round(100 * ${num} / ${den}, 1)`, s[percent], pct(num, den));
}

console.log("\n== 2. eight devices, hand-computed ==");
// 4 iOS/iPadOS, of which 2 installed. 4 others, of which 1 installed.
// 3 granted push, 2 with a live subscription.
const EXPECTED = {
  devices: 8,
  ios_devices: 4,
  installed_devices: 3,
  push_granted_devices: 3,
  push_subscribed_devices: 2,
  ios_installed_devices: 2,
};
if (ISOLATED) {
  eq("devices", s.devices, "8");
  eq("iOS devices", s.ios_devices, "4");
  eq("iOS %", s.ios_percent, "50.0");
  // The FULLSCREEN one is the point: counting only display-mode
  // standalone would report 2 installed, not 3.
  eq("installed devices", s.installed_devices, "3");
  eq("installed %", s.installed_percent, "37.5");
  eq("push granted", s.push_granted_devices, "3");
  eq("push granted %", s.push_granted_percent, "37.5");
  // Granted-but-not-subscribed is a real state: permission given, then
  // the subscription revoked by the push service. One number for both
  // would hide it.
  eq("push subscribed", s.push_subscribed_devices, "2");
  eq("push subscribed %", s.push_subscribed_percent, "25.0");
  eq("iOS devices installed", s.ios_installed_devices, "2");
  eq("iOS installed % (of iOS, not of all)", s.ios_installed_percent, "50.0");
} else {
  reset();
  const before = summary();
  device(A, "c1", { platform: "ios", mode: "standalone", push: "granted", subscribed: true });
  device(A, "c2", { platform: "ios", mode: "browser" });
  device(A, "c3", { platform: "ipados", mode: "fullscreen", push: "granted", subscribed: true });
  device(A, "c4", { platform: "ios", browser: "chromium", mode: "browser", push: "denied" });
  device(B, "c5", { platform: "android", browser: "chromium", mode: "standalone", push: "granted" });
  device(B, "c6", { platform: "android", browser: "chromium", mode: "browser" });
  device(B, "c7", { platform: "windows", browser: "chromium", mode: "browser" });
  device(B, "c8", { platform: "macos", browser: "firefox", mode: "browser" });
  const after = summary();
  for (const [column, delta] of Object.entries(EXPECTED)) {
    eq(`${column} rose by ${delta}`, Number(after[column]) - Number(before[column]), delta);
  }
}

console.log("\n== 3. with nothing in the window, a percentage is NULL, not 0% ==");
// 0% reads as a measured "nobody is on iOS". No denominator is a
// different statement and has to look different.
if (ISOLATED) {
  reset();
  const empty = summary();
  eq("devices", empty.devices, "0");
  for (const column of ["ios_percent", "installed_percent", "push_granted_percent", "push_subscribed_percent"]) {
    check(`${column} is NULL, not 0`, empty[column] === "", `got ${JSON.stringify(empty[column])}`);
  }
} else {
  // The same property, on the one denominator this file can empty without
  // touching another account's rows: no iOS device of ours in the window.
  reset();
  device(A, "only-android", { platform: "android", browser: "chromium", mode: "browser" });
  const iosDevices = Number(summary().ios_devices);
  if (iosDevices === 0) {
    check("ios_installed_percent is NULL when there are no iOS devices", summary().ios_installed_percent === "");
  } else {
    console.log(`  ....  skipped: ${iosDevices} iOS devices from other accounts are in the window`);
  }
}

console.log("\n== 4. the window is a window ==");
reset();
const beforeWindow = { d30: Number(summary(30).devices), d365: Number(summary(365).devices), ios30: Number(summary(30).ios_devices) };
device(A, "recent", { platform: "android", browser: "chromium", mode: "browser", ageDays: 5 });
device(A, "old", { platform: "ios", mode: "standalone", ageDays: 90 });
eq("30 days gained exactly one", Number(summary(30).devices) - beforeWindow.d30, 1);
eq("...and not the 90-day-old iPhone", Number(summary(30).ios_devices) - beforeWindow.ios30, 0);
eq("365 days gained both", Number(summary(365).devices) - beforeWindow.d365, 2);

console.log("\n== 5. the columns refuse what the API would never send ==");
reset();
const REJECTS = [
  ["platform", "martian"],
  ["browser", "netscape"],
  ["display_mode", "kiosk"],
  ["push_permission", "maybe"],
  ["install_surface", "billboard"],
  ["install_outcome", "ignored"],
];
for (const [column, value] of REJECTS) {
  const base = {
    platform: "android",
    browser: "chromium",
    display_mode: "browser",
    push_permission: "default",
  };
  base[column] = value;
  const cols = ["platform", "browser", "display_mode", "push_permission"];
  const extra = column === "install_surface" || column === "install_outcome" ? `, ${column}` : "";
  const extraVal = extra ? `, '${value}'` : "";
  const r = trySql(
    `insert into public.pwa_client_stats (user_id, client_id, ${cols.join(", ")}${extra})
     values ('${A}', 'bad-${column}', ${cols.map((c) => `'${base[c]}'`).join(", ")}${extraVal})`
  );
  check(`${column}='${value}' is refused`, !r.ok && /violates check constraint/.test(r.out), r.out.slice(0, 120));
}
const good = trySql(
  `insert into public.pwa_client_stats (user_id, client_id, platform, browser, display_mode, push_permission, install_surface, install_outcome)
   values ('${A}', 'good', 'ios', 'safari', 'standalone', 'granted', 'ios', 'accepted')`
);
check("...and a wholly valid row is accepted", good.ok, good.out.slice(0, 200));

console.log("\n== 6. one row per (user, browser) ==");
// The API upserts on this key. Without the constraint a heartbeat every
// six hours would make the table count VISITS, and every percentage above
// would silently become a percentage of page views.
const dup = trySql(
  `insert into public.pwa_client_stats (user_id, client_id, platform, browser, display_mode)
   values ('${A}', 'good', 'android', 'chromium', 'browser')`
);
check("a second row for the same client is refused", !dup.ok && /duplicate key/.test(dup.out));
const upsert = trySql(
  `insert into public.pwa_client_stats (user_id, client_id, platform, browser, display_mode)
   values ('${A}', 'good', 'ios', 'safari', 'browser')
   on conflict (user_id, client_id) do update set display_mode = excluded.display_mode`
);
check("...but the upsert the API uses succeeds", upsert.ok, upsert.out.slice(0, 160));
eq(
  "and updates in place",
  sql(`select display_mode from public.pwa_client_stats where user_id='${A}' and client_id='good'`),
  "browser"
);
// The install outcome recorded earlier must survive a heartbeat that does
// not mention it — otherwise "did the invitation work" is erased every
// six hours by the next report.
eq(
  "the recorded install outcome survives the heartbeat",
  sql(`select install_outcome from public.pwa_client_stats where user_id='${A}' and client_id='good'`),
  "accepted"
);
eq("the same user still has ONE row for it", sql(`select count(*) from public.pwa_client_stats where user_id='${A}' and client_id='good'`), "1");

console.log("\n== 7. erasing the account erases the devices ==");
const before = Number(sql(`select count(*) from public.pwa_client_stats where user_id='${A}'`));
check(`the user has rows to lose (${before})`, before > 0);
sql(`delete from auth.users where id='${A}'`);
eq("none left after the account goes", sql(`select count(*) from public.pwa_client_stats where user_id='${A}'`), "0");

console.log("\n== 8. no signed-in role may count other people's devices ==");
// SECURITY DEFINER + a query across every account. If `authenticated`
// could execute it, any customer could read the whole product's adoption.
for (const role of ["anon", "authenticated", "public"]) {
  const can = sql(
    `select has_function_privilege('${role}', p.oid, 'execute')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='pwa_adoption_summary'`
  );
  check(`${role} may NOT execute pwa_adoption_summary`, can === "f", `got ${can}`);
}
{
  const can = sql(
    `select has_function_privilege('service_role', p.oid, 'execute')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='pwa_adoption_summary'`
  );
  check("service_role may — it is the only caller", can === "t", `got ${can}`);
}
check(
  "and RLS is on the table itself",
  sql(`select relrowsecurity from pg_class where relname='pwa_client_stats'`) === "t"
);

sql(`delete from public.pwa_client_stats where user_id in ('${A}','${B}')`);
sql(`delete from auth.users where id in ('${A}','${B}')`);

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ` + failures.join("\n  - ")
);
process.exit(failures.length === 0 ? 0 : 1);
