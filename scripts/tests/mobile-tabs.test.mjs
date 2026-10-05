// THE PHONE'S BOTTOM BAR: HOME, CHAT, TOOLS, YOU, AND NOTHING HIDDEN
// UNDER IT.
//
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN — «ΚΙΝΗΤΟ»; BUILD-SPECS 2.4 scenario
// 13: the bar has Home, Chat, Tools and You, every target is at least
// 44px, and everything stays reachable. Which tab a page lights is run
// (src/lib/nav/tabs.ts); the bar and the pages that make room for it are
// read with their comments stripped.
//
// Run: node scripts/tests/mobile-tabs.test.mjs
import { readFileSync } from "node:fs";
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

console.log("== 1. the four tabs, and which one a page lights ==");
const T = await loadTs("src/lib/nav/tabs.ts");
check("Home, Chat, Tools, You, in that order", T.TABS.map((t) => t.key).join() === "home,chat,tools,you");
check("...to the four places", T.TABS.map((t) => t.href).join() === "/dashboard/overview,/dashboard/chat,/dashboard/tools,/dashboard/settings");
const cases = [
  ["/dashboard/overview", "home"],
  ["/dashboard/chat/abc", "chat"],
  ["/dashboard/tools", "tools"],
  ["/dashboard/coding", "tools"],
  ["/dashboard/posts", "tools"],
  ["/dashboard/activity", "tools"],
  ["/dashboard/settings/billing", "you"],
  ["/pricing", null],
];
const wrong = cases.filter(([p, want]) => T.activeTab(p) !== want).map(([p, want]) => `${p}: ${T.activeTab(p)} (want ${want})`);
check(`every page lights the right tab (${cases.length} cases)`, wrong.length === 0, wrong.join(", "));

console.log("\n== 2. the bar ==");
const bar = stripComments(readFileSync("src/components/dashboard/mobile-tab-bar.tsx", "utf8"));
check("it is drawn from the four tabs", /\{TABS\.map\(\(tab\) => \{/.test(bar) && /href=\{tab\.href\}/.test(bar));
check("on a phone only", /fixed inset-x-0 bottom-0[^"]*md:hidden/.test(bar));
const minH = Number(bar.match(/min-h-\[(\d+)px\]/)?.[1] ?? 0);
check(`every target is at least 44px (${minH}px)`, minH >= 44);
check("the current tab says so to a screen reader", /aria-current=\{isActive \? "page" : undefined\}/.test(bar) && /const active = activeTab\(pathname\);/.test(bar));
check("it is a named navigation landmark", /<nav\s+aria-label=\{t\("label"\)\}/.test(bar));
check("it clears the phone's home indicator", /pb-\[env\(safe-area-inset-bottom\)\]/.test(bar));

console.log("\n== 3. nothing ends up underneath it ==");
const layout = stripComments(readFileSync("src/app/dashboard/layout.tsx", "utf8"));
check("every dashboard page mounts it", /<MobileTabBar \/>/.test(layout));
check("...and the page body leaves its height free below md", /<main id="main-content" className="flex-1 pb-16 md:pb-0">/.test(layout));
const chat = stripComments(readFileSync("src/app/dashboard/chat/page.tsx", "utf8"));
check("the conversation, which fills the screen, keeps its field above the bar", /h-\[calc\(100dvh-8rem\)\] md:h-\[calc\(100vh-4rem\)\]/.test(chat));
const home = stripComments(readFileSync("src/app/dashboard/overview/page.tsx", "utf8"));
check("...and Home's block is centred in the space that is left", /min-h-\[calc\(100dvh-8rem\)\][^"]*md:min-h-\[calc\(100vh-4rem\)\]/.test(home));

console.log("\n== 4. in every language ==");
for (const l of ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"]) {
  const tabs = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).sidebar?.tabs ?? {};
  check(`${l}: the four tabs and the bar's name`, ["home", "chat", "tools", "you", "label"].every((k) => typeof tabs[k] === "string" && tabs[k].length > 0));
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
