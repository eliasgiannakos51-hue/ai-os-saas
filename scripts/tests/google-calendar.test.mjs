/*
 * «ΣΥΝΔΕΩ ΜΙΑ ΥΠΗΡΕΣΙΑ ΚΑΙ ΡΩΤΑΩ ΣΤΟ CHAT ΚΑΤΙ ΠΟΥ ΑΠΑΝΤΑ ΑΠΟ ΕΚΕΙ»
 * (MASTER 16, package 31): Google Calendar, behind the switch
 * "connections".
 *
 * What this holds, against the code rather than its comments:
 *
 *   1. THE PERIOD: the days a calendar question covers.
 *   2. THE READ: events only, read-only, the least of each, never the
 *      description; through the same entry point, audit trail and fence
 *      as every other connection.
 *   3. CHAT: the calendar is a source only when connected, with days.
 *   4. THE SWITCH: the card, the connect route and Chat's reads all ask it.
 *   5. THE DATABASE AND THE WORDS.
 *
 * The reader against stubbed Google answers, and the tool Chat is given:
 * google-calendar.itest.mjs. The page and the real connect route in a
 * browser: google-calendar.prodtest.mjs.
 *
 * Run: node scripts/tests/google-calendar.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
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
const code = (p) => stripComments(readFileSync(p, "utf8"));

const { calendarWindow } = await loadTs("src/lib/integrations/calendar-window.ts");
const providers = await loadTs("src/lib/integrations/providers.ts");

console.log("connections");

// ---------------------------------------------------------------------
console.log("\n== 1. the period ==");
// ---------------------------------------------------------------------
const NOW = new Date("2026-10-07T12:00:00Z");
let w = calendarWindow("2026-10-08", "2026-10-08", NOW);
check("«αύριο»: a day named alone is that whole day", w.timeMin === "2026-10-08T00:00:00.000Z" && w.timeMax === "2026-10-09T00:00:00.000Z", JSON.stringify(w));
w = calendarWindow("2026-10-08", undefined, NOW);
check("...and a start with no end is that one day", w.timeMax === "2026-10-09T00:00:00.000Z", JSON.stringify(w));
w = calendarWindow(undefined, undefined, NOW);
check("no days: from yesterday to a month ahead", w.timeMin === "2026-10-06T12:00:00.000Z" && w.timeMax === "2026-11-06T12:00:00.000Z", JSON.stringify(w));
w = calendarWindow("2026-10-20", "2026-10-10", NOW);
const turned = calendarWindow("2026-10-20", "2026-10-10T08:00:00Z", NOW);
check("days the wrong way round are turned round, and the day that now ends the period is kept whole",
  w.timeMin === "2026-10-10T00:00:00.000Z" && w.timeMax === "2026-10-21T00:00:00.000Z" && turned.timeMin === "2026-10-10T08:00:00.000Z" && turned.timeMax === "2026-10-21T00:00:00.000Z", JSON.stringify([w, turned]));
w = calendarWindow(undefined, "2026-01-01", NOW);
check("an end alone, in the past, is never a period that ends before it starts", Date.parse(w.timeMax) > Date.parse(w.timeMin), JSON.stringify(w));
w = calendarWindow("2026-01-01", "2030-01-01", NOW);
check("never more than a year in one read", Date.parse(w.timeMax) - Date.parse(w.timeMin) === 366 * 86400000, JSON.stringify(w));
w = calendarWindow("next tuesday", "'; drop", NOW);
check("anything that is not a date is ignored, not passed on", w.timeMin === "2026-10-06T12:00:00.000Z", JSON.stringify(w));

// ---------------------------------------------------------------------
console.log("\n== 2. the read ==");
// ---------------------------------------------------------------------
const cal = providers.PROVIDERS.find((p) => p.id === "google_calendar");
check("events, read-only: the narrowest calendar scope", cal?.access === "read" && JSON.stringify(cal?.scopes) === JSON.stringify(["https://www.googleapis.com/auth/calendar.events.readonly"]));
check("...on the same Google client, its own row", cal?.oauthFamily === "google" && JSON.stringify(cal?.requiredEnv) === JSON.stringify(["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"]));
const read = code("src/lib/integrations/read.ts");
check("the main calendar only, single events, soonest first, in the period",
  /new URL\("https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/primary\/events"\)/.test(read) &&
    /url\.searchParams\.set\("singleEvents", "true"\);\s*url\.searchParams\.set\("orderBy", "startTime"\);/.test(read) &&
    /const \{ timeMin, timeMax \} = calendarWindow\(period\.from, period\.to\);/.test(read));
check("the least of each event: never the description",
  /url\.searchParams\.set\("fields", "items\(id,summary,start,end,location,htmlLink,organizer\(displayName,email\),status\)"\);/.test(read) && !/description/.test(read.slice(read.indexOf("export async function readCalendar"), read.indexOf("export async function searchUserData"))));
check("a cancelled event is not offered as one that happens", /\.filter\(\(event\) => event\.status !== "cancelled"\)/.test(read));
check("through the one entry point, so the audit trail and the token rules hold",
  /calendar: "google_calendar",/.test(read) && /else if \(provider === "google_calendar"\) result = await readCalendar\(token\.accessToken, query, limit, params\.period\);/.test(read));

// ---------------------------------------------------------------------
console.log("\n== 3. chat ==");
// ---------------------------------------------------------------------
const tool = code("src/lib/integrations/chat-tool.ts");
check("the calendar is a source of its own", /google_calendar: "calendar",/.test(tool) && /if \(!SOURCES\.has\(source\)\) \{/.test(tool));
check("...with days, offered only when the calendar is connected", /\.\.\.\(unique\.includes\("calendar"\)\s*\?\s*\{\s*from: \{ type: "string"/.test(tool) && /period: \{ from: input\.from, to: input\.to \},/.test(tool));
check("...what it reads is fenced as data, like the rest", /content: wrapUntrusted\(formatItemsForModel\(result\.items\)\),/.test(tool));
check("...and the model is told today's date, so «αύριο» means a day", /σήμερα είναι \$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}/.test(tool));

// ---------------------------------------------------------------------
console.log("\n== 4. the switch ==");
// ---------------------------------------------------------------------
check('"connections" is declared as a switch', /\n  "connections": "/.test(code("src/lib/flags/flags.ts")) && cal?.behindSwitch === "connections");
const switches = code("src/lib/integrations/switches.ts");
check("one answer to which providers are open, read from the switch", /const calendar = await isFeatureOn\("connections", user\);/.test(switches) && /!p\.behindSwitch \|\| \(p\.behindSwitch === "connections" && calendar\)/.test(switches));
check("the page draws only those", /const open = await providersOpenTo\(user\);\s*const shown = PROVIDERS\.map\(\(p\) => p\.id\)\.filter\(\(id\) => open\.has\(id\)\);/.test(code("src/app/dashboard/integrations/page.tsx")) &&
  /PROVIDERS\.filter\(\(p\) => shown\.includes\(p\.id\) && matchesSearch\(p\.name, q\)\)/.test(code("src/components/integrations/integrations-list.tsx")));
const list = code("src/components/integrations/integrations-list.tsx");
check("ONE PRESS: with the switch, Connect is a button on the card that opens what it will read",
  /connectButton=\{await isFeatureOn\("connections", user\)\}/.test(code("src/app/dashboard/integrations/page.tsx")) &&
    /\{connectButton && !isConnected && \(\s*<button\s*type="button"\s*disabled=\{!isAvailable\}\s*onClick=\{\(\) => setConsentFor\(provider\.id\)\}/.test(list));
check("...and the consent step it opens goes on to the provider's own window", /href=\{`\/api\/integrations\/\$\{provider\.id\}\/connect`\}/.test(list));
check("the connect route refuses the others", /if \(!\(await providersOpenTo\(user\)\)\.has\(provider\.id\)\) \{\s*return NextResponse\.json\(\{ ok: false, code: "unknown_provider" \}, \{ status: 404 \}\);/.test(code("src/app/api/integrations/[provider]/connect/route.ts")));
check("Chat stops reading an account already connected when the switch closes",
  /const open = await providersOpenTo\(user\);\s*const integrations = \(await listIntegrations\(user\.id\)\)\.filter\(\(i\) => open\.has\(i\.provider\)\);\s*integrationSearchTool = buildSearchTool\(integrations\);/.test(code("src/app/api/chat/route.ts")));

// ---------------------------------------------------------------------
console.log("\n== 5. the database and the words ==");
// ---------------------------------------------------------------------
const migration = readFileSync("supabase/migrations/20261020000000_google_calendar_connection.sql", "utf8").replace(/--[^\n]*/g, "");
check("the database accepts the fourth provider, and says so if it did not take",
  /check \(provider in \('gmail', 'google_drive', 'google_calendar', 'slack'\)\);/.test(migration) && /raise exception '20261020000000: user_integrations_provider_check does not allow google_calendar';/.test(migration));
const KEYS = ["summary", "sees", "consent"];
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));
check(`the ten languages (${LOCALES.length}), three words each (${KEYS.length})`, LOCALES.length === 10 && KEYS.length === 3);
for (const file of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.integrations?.providers?.googleCalendar ?? {};
  const missing = KEYS.filter((k) => typeof m[k] !== "string" || m[k].trim().length < 20);
  check(`${file}: what it reads and what it cannot do, before Google's screen`, missing.length === 0, missing.join(", "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
