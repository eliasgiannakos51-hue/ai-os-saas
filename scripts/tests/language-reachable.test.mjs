// THE LANGUAGE SETTING HAS TO BE REACHABLE AT EVERY WIDTH.
//
// A Greek-speaking user reported an English dashboard and could not find
// the setting. The setting existed. On a phone it was nowhere:
//
//   - global-controls.tsx renders the selector, then returns null for
//     any path under /dashboard;
//   - top-nav.tsx wraps it in `hidden sm:contents`, so below 640px it is
//     not rendered at all;
//   - the mobile menu button toggles the sidebar and nothing else, and
//     the sidebar had no language control.
//
// So below 640px, on every dashboard route, there was no way to change
// the language. A setting nobody can reach is the same as a setting that
// does not exist — and no existing gate could see it, because every
// piece was present and correct on its own.
//
// STATIC, and it says so: it reads which components render the selector
// and how they are hidden. The width-by-width proof belongs in a browser;
// scripts/tests/settings-language.prodtest.mjs is where that lives.
//
// Run: node scripts/tests/language-reachable.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
const read = (p) => readFileSync(p, "utf8");

const topNav = read("src/components/dashboard/top-nav.tsx");
const sidebar = read("src/components/dashboard/sidebar.tsx");
const global = read("src/components/global-controls.tsx");

console.log("== 1. the premise: the two desktop paths do not cover a phone ==");
check("the floating controls opt out of /dashboard",
  /pathname\?\.startsWith\("\/dashboard"\)[\s\S]{0,60}return null/.test(global),
  "if this stopped being true the sidebar copy could be dropped — check before dropping it");
check("the top bar hides its controls below sm",
  /hidden sm:contents/.test(topNav),
  "if the top bar now shows them at every width, this gate's premise has changed");

console.log("\n== 2. so the sidebar — which IS the mobile menu — carries them ==");
check("the sidebar renders the language selector", /<LanguageSelector\s*\/?>/.test(sidebar),
  "below 640px there is then no way to change the language on any dashboard route");
check("...and imports it", /from "@\/components\/i18n\/language-selector"/.test(sidebar));
check("...and renders the theme toggle too", /<ThemeToggle\s*\/?>/.test(sidebar));

console.log("\n== 3. and it is shown exactly where the top bar hides it ==");
// Not "rendered somewhere in the sidebar": rendered in a block that is
// visible at the widths the other paths are not. Both `sm:hidden` and no
// hiding at all satisfy reachability; `hidden` alone does not.
const block = sidebar.match(/<div className="([^"]*)"[^>]*>\s*<LanguageSelector/);
check(`the block carrying it was found (${block ? block[1] : "none"})`, block !== null,
  "cannot tell at which widths it renders");
check("...and it is not itself hidden on mobile",
  block !== null && !/(^|\s)hidden(\s|$)/.test(block[1]),
  block ? block[1] : "");
check("...and it does not also show on desktop, where the top bar already has one",
  block !== null && /sm:hidden/.test(block[1]),
  block ? `${block[1]} — two selectors on one screen is its own defect` : "");

console.log("\n== 4. the mobile button opens the sidebar, which is why this works ==");
const menu = read("src/components/dashboard/menu-button.tsx");
check("the menu button toggles the sidebar", /useSidebar\(\)[\s\S]{0,120}toggle/.test(menu),
  "if it opened something else, putting the control in the sidebar would not reach it");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
