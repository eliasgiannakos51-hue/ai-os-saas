// THE LANGUAGE CONTROL IS IN THE TOP BAR AT EVERY WIDTH, AND IN SETTINGS.
//
// Reported twice. First: a Greek-speaking user on a phone could not find
// the setting, because top-nav.tsx wrapped it in `hidden sm:contents` and
// the two phone-width copies — in the account menu, and at the bottom of
// the sidebar drawer — were behind a tap and below a fold respectively.
// Second, after that fix: "I cannot find it on the laptop OR the phone",
// on a build where the laptop had a bare globe icon in the bar and the
// phone had the drawer copy sixteen rows down. Rendered is not reachable.
//
// THE PREMISE NOW: one control, in the header, at every width, with the
// locale code written beside the globe so it reads as a word; the full
// card on /dashboard/settings; and the floating cluster on public pages.
// Nothing hidden by a breakpoint, and no second copy for a phone to
// scroll to.
//
// STATIC, and it says so: it reads which components render the selector
// and how they are wrapped. The width-by-width proof — elementFromPoint
// on the control's centre at 1920/1440/768/390/375, a real touch at 390 —
// is scripts/tests/language-visible.prodtest.mjs.
//
// Run: node scripts/tests/language-reachable.test.mjs
import { readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
// COMMENTS ARE NOT CODE. Every file below explains, in prose, where the
// control USED to be — and a scan that read the prose would find
// `<LanguageSelector` in a sentence about its removal.
const read = (p) => stripComments(readFileSync(p, "utf8"));

const TOP_NAV = "src/components/dashboard/top-nav.tsx";
const SIDEBAR = "src/components/dashboard/sidebar.tsx";
const GLOBAL = "src/components/global-controls.tsx";
const SETTINGS = "src/app/dashboard/settings/page.tsx";
const CARD = "src/components/settings/language-settings.tsx";
const SELECTOR = "src/components/i18n/language-selector.tsx";

const topNav = read(TOP_NAV);
const sidebar = read(SIDEBAR);
const global = read(GLOBAL);
const settings = read(SETTINGS);
const card = read(CARD);
const selector = read(SELECTOR);

/** The JSX element(s) `<LanguageSelector … />` in a file, with attributes. */
const selectorTags = (src) => [...src.matchAll(/<LanguageSelector\b([^>]*)\/?>/g)].map((m) => m[1]);

/**
 * Is `index` inside an element whose className carries `hidden` (a
 * Tailwind display:none)? Walks back over opening tags, tracking nesting,
 * so a control placed after a hidden sibling is not mistaken for a child
 * of it.
 */
function insideHiddenWrapper(src, index) {
  const before = src.slice(0, index);
  const tags = [...before.matchAll(/<(\/?)([a-zA-Z][\w.]*)\b([^>]*?)(\/?)>/g)];
  const stack = [];
  for (const t of tags) {
    const [, closing, name, attrs, selfClosing] = t;
    if (selfClosing) continue;
    if (closing) {
      // pop to the matching opener
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) { stack.splice(i); break; }
      }
      continue;
    }
    stack.push({ name, attrs });
  }
  return stack.some((s) => /className="[^"]*(^|\s)hidden(\s|")/.test(s.attrs));
}

console.log("== 1. the top bar carries the control, unconditionally ==");
check("top-nav imports the selector", /from "@\/components\/i18n\/language-selector"/.test(topNav));
const navTags = selectorTags(topNav);
check(`top-nav renders it exactly once (${navTags.length})`, navTags.length === 1,
  "twice would be the old arrangement — one per breakpoint, each hidden at the other's widths");
const navIndex = topNav.search(/<LanguageSelector\b/);
check("...outside any `hidden` wrapper, so no breakpoint removes it",
  navIndex >= 0 && !insideHiddenWrapper(topNav, navIndex),
  "`hidden sm:contents` around it is exactly what put it nowhere on a phone");
check("...with the locale code beside the globe (showCode)", /showCode/.test(navTags[0] ?? ""),
  "a bare globe among bare icons was not recognised as the language control on a laptop");
check('...and the gate\'s hook, data-testid="language-control"',
  /testId="language-control"/.test(navTags[0] ?? ""));
check("the selector forwards testId onto the button", /data-testid=\{testId\}/.test(selector));
check("...and renders the locale code when asked", /showCode && \(/.test(selector) && /\{locale\}/.test(selector));

console.log("\n== 2. and Settings has the full card ==");
check("the settings page imports LanguageSettings", /from "@\/components\/settings\/language-settings"/.test(settings));
check("...and renders it", /<LanguageSettings\s*\/>/.test(settings));
check('the card is addressable as #language', /id="language"/.test(card));
check("...and writes the ACCOUNT, not only a cookie", /persistLocalePreference/.test(card));

console.log("\n== 3. public pages keep the floating cluster ==");
check("global-controls renders the selector", selectorTags(global).length === 1);
check("...with the same testid", /testId="language-control"/.test(selectorTags(global)[0] ?? ""));
check("...and steps aside on /dashboard, where the bar has it",
  /pathname\?\.startsWith\("\/dashboard"\)[\s\S]{0,60}return null/.test(global),
  "two controls on one screen is its own defect");

console.log("\n== 4. one control per screen — the drawer copy is gone ==");
check("the sidebar does NOT render a second selector", selectorTags(sidebar).length === 0,
  "the drawer copy sat under sixteen rows, below the fold of every phone, and was reported as absent");
check("...nor does the account menu", /sm:hidden">\s*<ThemeToggle/.test(topNav.replace(/\s+/g, " ").replace(/> </g, "><")) || !/sm:hidden[^]*?<LanguageSelector/.test(topNav),
  "a copy behind the avatar is the other place it hid");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
