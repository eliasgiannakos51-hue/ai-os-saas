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
 *   4. THE SWITCH: the card, the connect route, Chat's reads and an
 *      automation's reads all ask it.
 *   5. THE DATABASE AND THE WORDS.
 *   6. THE PERSON'S DAYS: «αύριο» counted from today where they are, and a
 *      day read midnight to midnight in their zone (found 2026-10-08 by
 *      scripts/tests/connections-automations-edges.prodtest.mjs).
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

const { calendarWindow, todayIn } = await loadTs("src/lib/integrations/calendar-window.ts");
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
    /const \{ timeMin, timeMax \} = calendarWindow\(period\.from, period\.to, new Date\(\), period\.timeZone\);/.test(read));
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
check("...with days, offered only when the calendar is connected", /\.\.\.\(unique\.includes\("calendar"\)\s*\?\s*\{\s*from: \{ type: "string"/.test(tool) && /period: \{ from: input\.from, to: input\.to, timeZone: params\.timeZone \?\? undefined \},/.test(tool));
check("...what it reads is fenced as data, like the rest", /content: wrapUntrusted\(formatItemsForModel\(result\.items\)\),/.test(tool));
check("...and the model is told today's date WHERE THE PERSON IS, so «αύριο» means their tomorrow",
  /const today = timeZone \? `\$\{todayIn\(timeZone\)\} \(\$\{timeZone\}\)` : todayIn\(null\);/.test(tool) && /σήμερα είναι \$\{today\}\./.test(tool));

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
const runner = code("src/lib/automations/runner.ts");
check("an automation already on stops reading the calendar when the switch closes",
  /if \(box\.source\.startsWith\("calendar_"\)\) \{\s*if \(!\(await providersOpenTo\(ctx\.user\)\)\.has\("google_calendar"\)\) return \{ ok: false, note: "not_connected" \};\s*const result = await searchUserData\(/.test(runner));
check("...and the automations count the calendar as connected only while the switch is open: switching on, and the boxes on the screen",
  /\? !open\.has\("google_calendar"\) \|\| !integrations\.some\(\(i\) => i\.provider === "google_calendar" && i\.status === "connected"\)/.test(code("src/lib/automations/flow-access.ts")) &&
    /calendar \? providersOpenTo\(user\) : /.test(code("src/lib/automations/flow-access.ts")) &&
    /google_calendar: open\.has\("google_calendar"\) && integrations\.some\(/.test(code("src/lib/automations/page-data.ts")));
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

// WHEN IT READS, SAID TRUTHFULLY. An automation switched on reads the
// calendar at its hour, by itself (src/lib/automations/runner.ts), so the
// consent the person reads before Google's screen cannot say «only when a
// question needs it — never in the background», which it did until
// 2026-10-08. Every language names the automations, in the word that
// language's screen calls them; held for as long as the runner reads it.
const AUTOMATION_WORD = { ar: "أتمتة", de: "automation", el: "αυτοματισμ", en: "automation", es: "automatizaci", fr: "automatisation", it: "automazion", ja: "オートメーション", pt: "automaç", zh: "自动化" };
const runnerReadsCalendar = /source: "calendar"/.test(runner);
check("the runner still reads the calendar, so the consent must say so", runnerReadsCalendar);
for (const file of LOCALES) {
  const locale = file.replace(/\.json$/, "");
  const consent = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.integrations?.providers?.googleCalendar?.consent ?? "";
  const word = AUTOMATION_WORD[locale];
  check(`${file}: the consent says an automation the person switched on reads it too`, Boolean(word) && consent.toLowerCase().includes(word.toLowerCase()), consent);
}
const consentPanel = list.slice(list.indexOf("function ConsentPanel"));
check("one press shows its answer: the consent step is brought into view and focused when it opens",
  /useEffect\(\(\) => \{\s*panelRef\.current\?\.scrollIntoView\(\{ block: "center" \}\);\s*panelRef\.current\?\.focus\(\{ preventScroll: true \}\);\s*\}, \[providerId\]\);/.test(consentPanel) && /ref=\{panelRef\}\s*tabIndex=\{-1\}/.test(consentPanel));

// ---------------------------------------------------------------------
console.log("\n== 6. the person's days ==");
// ---------------------------------------------------------------------
// Executed: midnight to midnight in the zone, a 25-hour day where the
// clocks go back, and Greenwich's days without a zone, as before.
w = calendarWindow("2026-10-09", "2026-10-09", NOW, "Europe/Athens");
check("«2026-10-09» in Athens is Athens' day: 21:00 to 21:00 UTC in summer", w.timeMin === "2026-10-08T21:00:00.000Z" && w.timeMax === "2026-10-09T21:00:00.000Z", JSON.stringify(w));
w = calendarWindow("2026-10-25", undefined, NOW, "Europe/Athens");
check("...the day the clocks go back is 25 hours, to the next midnight there", w.timeMin === "2026-10-24T21:00:00.000Z" && w.timeMax === "2026-10-25T22:00:00.000Z", JSON.stringify(w));
w = calendarWindow("2026-10-20", "2026-10-10", NOW, "Europe/Athens");
check("...days the wrong way round, turned round, in the zone", w.timeMin === "2026-10-09T21:00:00.000Z" && w.timeMax === "2026-10-20T21:00:00.000Z", JSON.stringify(w));
w = calendarWindow("2026-10-09", "2026-10-09", NOW, "Not/AZone");
check("...a zone that is not one reads Greenwich's day, as before", w.timeMin === "2026-10-09T00:00:00.000Z" && w.timeMax === "2026-10-10T00:00:00.000Z", JSON.stringify(w));
w = calendarWindow("2026-10-09T08:00:00Z", "2026-10-09T10:00:00Z", NOW, "Europe/Athens");
check("...and a moment with its own time is that moment, whatever the zone", w.timeMin === "2026-10-09T08:00:00.000Z" && w.timeMax === "2026-10-09T10:00:00.000Z", JSON.stringify(w));
const LATE = new Date("2026-10-08T21:30:00Z");
check("today at 00:30 in Athens is the 9th there, the 8th in Greenwich", todayIn("Europe/Athens", LATE) === "2026-10-09" && todayIn(null, LATE) === "2026-10-08" && todayIn("Not/AZone", LATE) === "2026-10-08");
const chat = code("src/app/api/chat/route.ts");
check("Chat takes the person's zone from the browser, only a real one, and hands it to the instruction and to the read",
  /timeZone = typeof body\?\.timeZone === "string" && body\.timeZone\.length <= 64 && isValidTimeZone\(body\.timeZone\) \? body\.timeZone : null;/.test(chat) &&
    /searchToolInstruction\(\s*integrations\.filter\(\(i\) => i\.status === "connected"\)\.map\(\(i\) => i\.provider\),\s*timeZone\s*\)/.test(chat) &&
    /executeSearchTool\(\{ userId: user\.id, input: toolUse\.input, timeZone \}\)/.test(chat));
check("...the Chat screen and the voice conversation send it",
  /timeZone: resolveBrowserTimeZone\(\),/.test(code("src/components/chat/chat-workspace.tsx")) && /timeZone: resolveBrowserTimeZone\(\) \}\)/.test(code("src/components/voice/voice-conversation.tsx")));
check("...and an automation reads its days in its own zone", /period: \{ \.\.\.periodFor\(box\.source, ctx\.flow\.time_zone\), timeZone: ctx\.flow\.time_zone \}/.test(runner));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
