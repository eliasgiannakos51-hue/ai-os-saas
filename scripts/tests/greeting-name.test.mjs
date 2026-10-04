// THE HOME PAGE GREETS IN THE READER'S LANGUAGE, WITH THEIR NAME OR NONE.
//
// V6 1.10a (docs/QUEUE.md). Until 2026-10-03 the greeting was English in
// every locale ("Good morning" was a literal in src/lib/greeting.ts) and
// the name was the email's local part with the digits stripped:
// "nikos84" greeted as "Nikos". This holds the three
// halves of the fix: the words come from the messages files, the name comes
// from what the person typed or what Google sign-in supplies, and the
// email is never the source.
//
// Run: node scripts/tests/greeting-name.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const { greetingName, timeOfDayGreeting, MAX_DISPLAY_NAME_LENGTH } = await loadTs("src/lib/greeting.ts");

console.log("== 1. the name: typed, then Google's, then none ==");
check("what the person typed wins, exactly as typed", greetingName({ display_name: "Νίκο", given_name: "Nikos" }) === "Νίκο");
check("Google's given_name is next", greetingName({ given_name: "Nikos", full_name: "Nikos Papadakis" }) === "Nikos");
check("then the first word of full_name", greetingName({ full_name: "Nikos Papadakis" }) === "Nikos");
check("then the first word of name", greetingName({ name: "Maria Papadopoulou" }) === "Maria");
check("a blank typed name falls through", greetingName({ display_name: "   ", given_name: "Nikos" }) === "Nikos");
check("nothing known -> no name", greetingName({}) === null && greetingName(null) === null);
check("the email is never the source", greetingName({ email: "nikos84@example.com" }) === null);
check("a non-string is ignored", greetingName({ display_name: 42 }) === null);
check(
  `a name is capped at ${MAX_DISPLAY_NAME_LENGTH} characters`,
  greetingName({ display_name: "x".repeat(200) }).length === MAX_DISPLAY_NAME_LENGTH,
);

console.log("\n== 2. the time of day is a key, not English ==");
// 05:00, 13:00 and 20:00 UTC are 08:00, 16:00 and 23:00 in Athens (EEST).
const at = (iso) => timeOfDayGreeting(new Date(iso), "Europe/Athens").part;
check("08:00 Athens -> morning", at("2026-10-03T05:00:00Z") === "morning");
check("16:00 Athens -> afternoon", at("2026-10-03T13:00:00Z") === "afternoon");
check("23:00 Athens -> evening", at("2026-10-03T20:00:00Z") === "evening");
const src = stripComments(readFileSync("src/lib/greeting.ts", "utf8"));
check("no English greeting is left in the code", !/Good (morning|afternoon|evening)/.test(src));

console.log("\n== 3. every locale has the words ==");
const locales = readdirSync("messages").filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
check(`all ten locales are read (${locales.length})`, locales.length === 10);
const messages = Object.fromEntries(locales.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
for (const l of locales) {
  const g = messages[l].promise?.greeting ?? {};
  check(`${l}: morning, afternoon, evening`, ["morning", "afternoon", "evening"].every((k) => (g[k] ?? "").trim() !== ""));
  const d = messages[l].settings?.displayName ?? {};
  check(
    `${l}: the settings field's seven strings`,
    ["title", "description", "placeholder", "saved", "saveFailed", "save", "saving"].every((k) => (d[k] ?? "").trim() !== ""),
  );
  if (l !== "en") {
    check(`${l}: the greeting is not the English one`, g.morning !== messages.en.promise.greeting.morning);
  }
}
check("Greek morning is Καλημέρα", messages.el.promise.greeting.morning === "Καλημέρα");

console.log("\n== 4. the screen uses all of it ==");
const header = stripComments(readFileSync("src/components/overview/greeting-header.tsx", "utf8"));
check("the header renders the translated part", /tPromise\(`greeting\.\$\{greeting\.part\}`\)/.test(header));
check("the header no longer derives a name from the email", !/displayNameFromEmail|email/.test(header));
check("no name -> no comma", /name \? `, \$\{name\}` : ""/.test(header));
const overview = stripComments(readFileSync("src/app/dashboard/overview/page.tsx", "utf8"));
check("home passes greetingName(user.user_metadata)", /<GreetingHeader name={greetingName\(user\.user_metadata\)} \/>/.test(overview));
const field = stripComments(readFileSync("src/components/settings/display-name-settings.tsx", "utf8"));
check("the settings field writes display_name to the account", /updateUser\(\{\s*data:\s*\{\s*display_name:/.test(field));
check("...and refreshes so the greeting changes", /router\.refresh\(\)/.test(field));
check("...and has no English left in it", !/>\s*(Save|Saving)/.test(field));
const settings = stripComments(readFileSync("src/app/dashboard/settings/page.tsx", "utf8"));
check("settings renders the field", /<DisplayNameSettings\b/.test(settings));

console.log(
  failures.length === 0
    ? `\nALL PASS: ${pass} passed, 0 failed`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
