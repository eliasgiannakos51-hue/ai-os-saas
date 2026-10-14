// ALL TOOLS' SQUARES ARE BEHIND A SWITCH THAT STARTS CLOSED, AND HIDE
// NOTHING BUT THEMSELVES.
//
// The owner, 2026-10-14: «Κρύψε όλα τα εργαλεία από το All tools, χωρίς να
// σβήσεις τίποτα. Είναι απόφαση εμφάνισης, όχι αφαίρεσης.» A new switch,
// `all-tools-tiles` (src/lib/flags/flags.ts): at «Κανείς» the page shows
// no square, no group heading and no search; at «Όλοι» everything is back
// as it was, without a deploy. It starts at «Κανείς» for everyone, the
// owner included.
//
// 1. The switch is RUN: flags.ts is loaded with the database stood in,
//    and asked who sees the squares with no row, with an unreadable table,
//    and with each of the owner's three choices.
// 2. The page is read with comments stripped: with the switch off it
//    returns before the grid, and what it returns draws no square.
// 3. Nothing else reads the switch — ranged over every file in src/ — so
//    every tool keeps its own page and address, and Chat, ⌘K and the
//    Library are untouched. Each square's page is checked to exist.
// 4. The line the hidden page shows is worded in every language.
// 5. Every prodtest that walks the squares opens the switch first, or it
//    would be walking an empty page.
//
// The squares themselves, drawn and measured in both states on a computer
// and a phone, are scripts/tests/all-tools-tiles.prodtest.mjs.
//
// Run: node scripts/tests/all-tools-tiles.test.mjs
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const KEY = "all-tools-tiles";

console.log("== 1. the switch, run ==");
// flags.ts whole, its three imports stood in: the database is whatever
// `globalThis.__flagsDb` answers, the owner is owner@example.com.
const flagsSrc = readFileSync("src/lib/flags/flags.ts", "utf8");
const standIn = [
  'const createAdminClient = () => ({ from: () => ({ select: async () => globalThis.__flagsDb() }) });',
  'const isAdminEmail = (email) => String(email).trim().toLowerCase() === "owner@example.com";',
  "const logApiError = () => {};",
].join("\n");
const runnable = flagsSrc
  .replace(/^import[^\n]*\n/gm, "")
  .replace("export { FLAG_AUDIENCES, type FlagAudience };", readFileSync("src/lib/flags/audience.ts", "utf8").replace(/\/\*\*[\s\S]*?\*\//, "") + "\n" + standIn);
const dir = mkdtempSync(join(tmpdir(), "all-tools-tiles-"));
writeFileSync(join(dir, "flags.ts"), runnable);
const flags = await loadTs(join(dir, "flags.ts"));
const OWNER = { email: "owner@example.com" };
const CUSTOMER = { email: "someone@example.com" };
async function seen(db) {
  globalThis.__flagsDb = db;
  return { owner: await flags.isFeatureOn(KEY, OWNER), customer: await flags.isFeatureOn(KEY, CUSTOMER), audience: (await flags.readFlagAudiences())[KEY] };
}
check(`${KEY} is a declared switch`, flags.isFlagKey(KEY));
const none = await seen(async () => ({ data: [], error: null }));
check("with no row it reads as «Κανείς»: no square for anyone, the owner included", none.audience === "off" && !none.owner && !none.customer, JSON.stringify(none));
const broken = await seen(async () => { throw new Error("the table cannot be read"); });
check("...and the same when the table cannot be read", broken.audience === "off" && !broken.owner && !broken.customer, JSON.stringify(broken));
const errored = await seen(async () => ({ data: null, error: { message: "relation does not exist" } }));
check("...or answers with an error", errored.audience === "off" && !errored.owner && !errored.customer, JSON.stringify(errored));
const everyone = await seen(async () => ({ data: [{ key: KEY, audience: "everyone" }], error: null }));
check("«Όλοι»: the squares for everyone", everyone.owner && everyone.customer, JSON.stringify(everyone));
const staff = await seen(async () => ({ data: [{ key: KEY, audience: "staff" }], error: null }));
check("«Εσύ και ο λογαριασμός δοκιμής»: the owner sees them, a customer not", staff.owner && !staff.customer, JSON.stringify(staff));
const off = await seen(async () => ({ data: [{ key: KEY, audience: "off" }], error: null }));
check("«Κανείς», chosen: nobody", !off.owner && !off.customer, JSON.stringify(off));
const other = await seen(async () => ({ data: [], error: null }));
const othersStaff = Object.keys(flags.FLAGS).filter((k) => k !== KEY).every((k) => flags.defaultAudienceOf(k) === "staff");
check("every other switch still starts at staff", othersStaff && other.audience === "off");

console.log("\n== 2. the page: with the switch off, no square, no group, no search ==");
const PAGE = "src/app/dashboard/tools/page.tsx";
const page = stripComments(readFileSync(PAGE, "utf8"));
const gate = 'if (!(await isFeatureOn("all-tools-tiles", user))) {';
const at = page.indexOf(gate);
// The block the condition opens, to its matching brace.
let hidden = "";
if (at >= 0) {
  let depth = 0;
  for (let i = at + gate.length - 1; i < page.length; i++) {
    if (page[i] === "{") depth++;
    else if (page[i] === "}") depth--;
    if (depth === 0) {
      hidden = page.slice(at, i + 1);
      break;
    }
  }
}
check("the page asks the switch for THIS person", at >= 0);
check("...after the sign-in check and before it draws the grid",
  at > page.indexOf('if (!user) redirect("/login");') && page.indexOf('redirect("/login")') >= 0 && at < page.indexOf("<ToolsGrid"));
check("...and with it off returns, drawing no grid", /\breturn \(/.test(hidden) && !/ToolsGrid|SWITCHED_SQUARES|tools-search|tool-tile/.test(hidden), hidden.slice(0, 300));
check("...the title, and one line on how to reach a tool instead", /title=\{t\("title"\)\}/.test(hidden) && /\{t\("tilesHidden"\)\}/.test(hidden) && /data-testid="tools-hidden"/.test(hidden));
check("...without the description or the help that speak of every tool", !/description=|helpKey=/.test(hidden));
check("with it on the page is as before: the squares, the pins, the new tools' switches",
  /<ToolsGrid isOwner=\{isOwner\} pinned=\{readRecentPrefs\(user\.user_metadata\)\.pinned\} switchedOn=\{switchedOn\} \/>/.test(page.slice(at + hidden.length)));

console.log("\n== 3. nothing else reads it: every tool still opens at its address ==");
function walk(d, out = []) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(e)) out.push(p);
  }
  return out;
}
const sources = walk("src");
const readers = sources.filter((f) => stripComments(readFileSync(f, "utf8")).includes(`"${KEY}"`)).filter((f) => !f.startsWith(join("src", "lib", "flags")));
check(`the All tools page is the only file in src/ that names the switch (${sources.length} read)`, readers.length === 1 && readers[0] === join(...PAGE.split("/")), readers.join(", "));
const { ALL_TOOLS_GROUPS, SWITCHED_SQUARES } = await loadTs("src/lib/nav/all-tools.ts");
const squares = [...ALL_TOOLS_GROUPS.flatMap((g) => g.hrefs), ...SWITCHED_SQUARES.map((s) => s.href)];
// A tool's page is its own folder, or the modules' shared route
// (app/dashboard/[module]/page.tsx) for a slug lib/modules.ts knows.
const { getModule } = await loadTs("src/lib/modules.ts");
const pageOf = (h) =>
  existsSync(`src/app${h}/page.tsx`) ? `src/app${h}/page.tsx`
    : /^\/dashboard\/[a-z-]+$/.test(h) && getModule(h.slice("/dashboard/".length)) ? "src/app/dashboard/[module]/page.tsx"
    : null;
const noPage = squares.filter((h) => !pageOf(h));
check(`every square's tool keeps its own page (${squares.length})`, squares.length > 0 && noPage.length === 0, noPage.join(", "));
const leaning = squares.filter((h) => pageOf(h) && /dashboard\/tools\/page|components\/tools\/tools-grid/.test(readFileSync(pageOf(h), "utf8")));
check("...none of which leans on the All tools page or its grid", leaning.length === 0, leaning.join(", "));

console.log("\n== 4. the hidden page's line, in every language ==");
const LOCALES = readdirSync("messages").filter((f) => /^[a-z]{2}\.json$/.test(f)).map((f) => f.slice(0, 2));
for (const l of LOCALES) {
  const line = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard?.tools?.tilesHidden;
  check(`${l}: worded, naming ⌘K`, typeof line === "string" && line.includes("⌘K") && !/[{}]/.test(line), String(line));
}
check(`...all ${LOCALES.length} of messages/`, LOCALES.length >= 10);
const el = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.tools.tilesHidden;
check("the Greek line carries no English word", ((el ?? "").replace("⌘K", "").match(/[A-Za-z]+/g) ?? []).length === 0, el);

console.log("\n== 5. every prodtest that walks the squares opens them first ==");
const walkers = readdirSync("scripts/tests").filter((f) => f.endsWith(".prodtest.mjs") && f !== "all-tools-tiles.prodtest.mjs")
  .filter((f) => readFileSync(`scripts/tests/${f}`, "utf8").includes('data-testid="tool-tile"'));
const shut = walkers.filter((f) => !/["']all-tools-tiles["']/.test(stripComments(readFileSync(`scripts/tests/${f}`, "utf8"))));
check(`each of them sets all-tools-tiles (${walkers.length})`, walkers.length > 0 && shut.length === 0, shut.join(", "));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
