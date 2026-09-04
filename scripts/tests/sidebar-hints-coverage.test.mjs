// The test that would have caught "no tooltips on the live site".
//
// WHAT WENT WRONG. The sidebar tooltips were verified with a hand-built
// /dev-sidebar harness page and reported as working — 218ms, role=tooltip,
// keyboard focus. All of that was true. It was also nearly useless, because
// 12 of the 37 sidebar items had no hintKey at all, and a Tooltip with no
// content renders nothing:
//
//     const hint = item.hintKey ? t(`hints.${item.hintKey}`) : undefined;
//     ...
//     if (!content) return <>{children}</>;    // components/ui/tooltip.tsx
//
// The 12 were not a random dozen. hintKeys had been attached with a regex
// over `{ href: "...", label: "..." }`, which silently skipped every item
// whose href or label is a CONSTANT, and every item written across multiple
// lines. That is exactly the top of the Workspace group — Home, Create
// Studio, Ionexa Chat, Timeline, Mission Control, Weekly Reflection — plus
// Settings and Website Builder. The first six things anyone hovers.
//
// WHY THE EXISTING GUARDS MISSED IT.
//   - check-i18n.js reads messages/*.json; it never sees the code.
//   - i18n-coverage.test.mjs resolves t("literal") calls, and deliberately
//     skips computed keys. The sidebar's call is t(`hints.${item.hintKey}`)
//     — computed. Invisible to it by design.
//   - The harness screenshot showed a tooltip on the one item that happened
//     to be hovered.
//
// So this file checks the thing that actually determines whether a user
// sees a tooltip: does EVERY item carry a hintKey, and does every hintKey
// resolve in EVERY locale.
//
// Run: node scripts/tests/sidebar-hints-coverage.test.mjs
import { readFileSync, existsSync } from "node:fs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const src = readFileSync("src/lib/sidebar-nav.ts", "utf8");

// Brace-matched parse, NOT a line regex. A line regex is what created the
// bug; using one to test for it would reproduce the same blind spot.
function parseItems(text) {
  const body = text.slice(text.indexOf("MAIN_SIDEBAR_GROUPS"));
  const items = [];
  let i = 0;
  for (;;) {
    const h = body.indexOf("href:", i);
    if (h < 0) break;
    const start = body.lastIndexOf("{", h);
    let depth = 0,
      end = start;
    for (let k = start; k < body.length; k++) {
      if (body[k] === "{") depth++;
      else if (body[k] === "}") {
        depth--;
        if (depth === 0) {
          end = k;
          break;
        }
      }
    }
    const obj = body.slice(start, end + 1);
    items.push({
      href: obj.match(/href:\s*([^,\n]+)/)?.[1]?.trim() ?? "?",
      label: obj.match(/label:\s*([^,\n]+)/)?.[1]?.trim() ?? "?",
      hintKey: obj.match(/hintKey:\s*"([^"]+)"/)?.[1] ?? null,
    });
    i = end + 1;
  }
  return items;
}

const items = parseItems(src);

console.log("== 1. every sidebar item carries a hint ==");
checkTrue(`items parsed (${items.length})`, items.length >= 30);
const noHint = items.filter((it) => !it.hintKey).map((it) => `${it.label} (${it.href})`);
check("no item is missing a hintKey", noHint, []);

// The specific twelve that were missing, named so a regression is obvious
// rather than a count going up by one.
const PREVIOUSLY_MISSING = [
  "OVERVIEW_NAV_ITEM.href",
  // Written as a literal since 2026-09-04: Create Studio moved under
  // Build, and scripts/tests/sidebar-naming.test.mjs reads that group as
  // TEXT to check what may sit there — a constant is invisible to it. The
  // item is the same item, and it still has to carry a hint.
  '"/dashboard/create"',
  "CHAT_NAV_ITEM.href",
  "TIMELINE_NAV_ITEM.href",
  "MISSION_NAV_ITEM.href",
  "REFLECTION_NAV_ITEM.href",
  "SETTINGS_NAV_ITEM.href",
  '"/dashboard/website-builder"',
  '"/dashboard/data-analysis"',
  '"/dashboard/presentations"',
  '"/dashboard/trading-workflow"',
  '"/dashboard/product-workflow"',
];
// AN ENTRY THAT LEFT THE SIDEBAR CANNOT CARRY A SIDEBAR HINT, and that
// is not a loophole: it is named, and the destination has to still be
// reachable. TIMELINE_NAV_ITEM is the first one — everything-in-order
// moved inside the timeline's starred tab, together with favourites and
// search, so the row is gone and the page is not. Anything else that
// disappears from this list has to appear here with its own reason.
//
// RETARGETED IN THE MERGE. This named /dashboard/library, which was the
// losing side of two independent implementations of the same brief —
// main's consolidation kept /dashboard/timeline and /dashboard/records,
// and the library page had nothing left importing or linking it. The
// destination still has to be reachable, which is the property this
// exemption exists to keep, so it points at the page that exists.
const LEFT_THE_SIDEBAR = {
  "TIMELINE_NAV_ITEM.href": {
    file: "src/app/dashboard/timeline/page.tsx",
    reason: "reachable from Mine; the starred tab carries favourites and search",
  },
};
for (const href of PREVIOUSLY_MISSING) {
  const it = items.find((x) => x.href === href);
  const departed = LEFT_THE_SIDEBAR[href];
  if (!it && departed) {
    checkTrue(
      `${href} left the sidebar (${departed.reason}) and its destination still exists`,
      existsSync(departed.file),
    );
    continue;
  }
  checkTrue(`${href} has a hint`, Boolean(it?.hintKey));
}
// And the exemption list may not grow silently either: one today.
check("only the recorded entries were allowed to leave", Object.keys(LEFT_THE_SIDEBAR).length, 1);
// Items whose href/label are CONSTANTS are the ones a regex drops. If none
// exist any more the guard above is testing nothing, so assert they do.
const constantHref = items.filter((it) => !it.href.startsWith('"'));
checkTrue(`config still contains constant-href items (${constantHref.length})`, constantHref.length > 0);
check("...and all of them have hints", constantHref.filter((it) => !it.hintKey).map((it) => it.href), []);

console.log("\n== 2. every hint resolves, in every locale ==");
const keys = [...new Set(items.map((it) => it.hintKey).filter(Boolean))];
checkTrue(`distinct hint keys (${keys.length})`, keys.length >= 25);
for (const loc of LOCALES) {
  const hints = messages[loc]?.sidebar?.hints ?? {};
  const missing = keys.filter((k) => typeof hints[k] !== "string" || !hints[k].trim());
  check(`${loc}: all ${keys.length} hints present`, missing, []);
}

console.log("\n== 3. the chat focus-mode toggle is discoverable ==");
// It shipped as a bare 36x36 icon whose only affordance was a native
// `title`. It rendered correctly and no user found it. "Renders" is not
// the same claim as "is findable".
const chat = readFileSync("src/components/chat/chat-workspace.tsx", "utf8");
checkTrue("the toggle exists", /aria-expanded=\{sidebarOpen\}/.test(chat));
checkTrue("it has a VISIBLE text label, not just an icon", /\{sidebarOpen \? t\("hideConversations"\) : t\("focusMode"\)\}/.test(chat));
checkTrue("it uses the real Tooltip, not a native title", /<Tooltip[\s\S]{0,400}aria-expanded=\{sidebarOpen\}/.test(chat));
check("no native title attribute on it", /title=\{sidebarOpen \? t\("hideConversations"\)/.test(chat), false);
for (const key of ["hideConversationsHint", "showConversationsHint", "focusMode", "hideConversations"]) {
  const missing = LOCALES.filter((l) => typeof messages[l]?.dashboard?.chat?.[key] !== "string");
  check(`dashboard.chat.${key} in every locale`, missing, []);
}

console.log("\n== 4. the Tooltip renders nothing without content ==");
// This is the mechanism that turned 12 missing hintKeys into 12 silently
// absent tooltips. Keeping it is correct — an empty tooltip box would be
// worse — so the coverage check above is what has to hold.
const tip = readFileSync("src/components/ui/tooltip.tsx", "utf8");
checkTrue("an empty content short-circuits", /if \(!content\) return <>\{children\}<\/>;/.test(tip));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
