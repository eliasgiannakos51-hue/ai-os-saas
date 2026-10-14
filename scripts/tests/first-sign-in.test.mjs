/*
 * AN ACCOUNT'S FIRST SIGN-IN IS NOT TOLD AS A NEW DEVICE; EVERY LATER ONE
 * FROM A DEVICE NOT ON RECORD STILL IS (package 39, «Ανοιχτά, δεν
 * διορθώθηκαν», docs/PROGRESS.md 2026-10-08: a new account's very first
 * sign-in sent the «new sign-in» security email).
 *
 *   1. THE RULE (lib/auth/first-sign-in.ts), run: no device on record AND
 *      an account made within the window; an unreadable count, an older
 *      account, a second device, a clock behind — all still email.
 *   2. THE ROUTE (api/auth/device-check): the devices are counted before
 *      the new one is recorded, the device is recorded either way, the
 *      email is sent on every other new device, and an unreadable count is
 *      not read as zero.
 *
 * In a browser, through the real route: scripts/tests/first-task-edges.prodtest.mjs
 * (the first sign-in sends nothing; the same account on a second device
 * is told). Mutations: scripts/tests/first-sign-in.mutation.mjs.
 *
 * Run: node scripts/tests/first-sign-in.test.mjs
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

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

const rule = await loadTs("src/lib/auth/first-sign-in.ts");
const now = Date.parse("2026-10-14T12:00:00Z");
const made = (hoursAgo) => new Date(now - hoursAgo * 3600_000).toISOString();
const first = (devicesOnRecord, accountCreatedAt) => rule.isAccountsFirstSignIn({ devicesOnRecord, accountCreatedAt, now });

console.log("first-sign-in");
console.log("\n== 1. the rule, run ==");
check("the window is one day", rule.FIRST_SIGN_IN_WINDOW_MS === 24 * 3600_000);
check("an account made ten minutes ago, no device on record: its first sign-in, no email", first(0, made(1 / 6)) === true);
check("...made 23 hours ago: still its first", first(0, made(23)) === true);
check("an account older than the day, no device on record: told as before", first(0, made(25)) === false);
check("a new account's SECOND device: told", first(1, made(1)) === false);
check("a count that could not be read is not zero: told", first(null, made(1)) === false);
check("no creation time: told", first(0, undefined) === false && first(0, "not a date") === false);
check("a creation time ahead of the clock: told", first(0, new Date(now + 3600_000).toISOString()) === false);

console.log("\n== 2. the route ==");
const route = stripComments(readFileSync("src/app/api/auth/device-check/route.ts", "utf8"));
const at = (re) => route.search(re);
const counted = at(/\.from\("known_devices"\)\s*\.select\("id", \{ count: "exact", head: true \}\)\s*\.eq\("user_id", user\.id\);/);
const decided = at(/const firstSignIn = isAccountsFirstSignIn\(\{\s*devicesOnRecord: countError \? null : \(devicesOnRecord \?\? null\),\s*accountCreatedAt: user\.created_at,\s*\}\);/);
const inserted = at(/\.from\("known_devices"\)\.insert\(\{/);
const skipped = at(/if \(firstSignIn\) return NextResponse\.json\(\{ ok: true, newDevice: true, firstSignIn: true \}\);/);
const emailed = at(/await sendNewDeviceLoginEmail\(user\.email, \{/);
check("the devices are counted, and the rule asked, before the new one is recorded", counted > 0 && decided > counted && inserted > decided, JSON.stringify({ counted, decided, inserted }));
check("...the device is recorded either way, and only then is the email skipped", skipped > inserted, JSON.stringify({ inserted, skipped }));
check("...and every other new device is still told", emailed > skipped && (route.match(/sendNewDeviceLoginEmail\(/g) ?? []).length === 1, JSON.stringify({ skipped, emailed }));
check("a device already on record is not told (it returns before the count)", at(/if \(existing\) \{/) > 0 && at(/if \(existing\) \{/) < counted);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
