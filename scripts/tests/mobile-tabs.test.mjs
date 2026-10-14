// THE PHONE'S BOTTOM BAR: HOME, CHAT, TOOLS, YOU, AND NOTHING HIDDEN
// UNDER IT.
//
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN — «ΚΙΝΗΤΟ»; BUILD-SPECS 2.4 scenario
// 13: the bar has Home, Chat, Tools and You, every target is at least
// 44px, and everything stays reachable. Which tab a page lights is run
// (src/lib/nav/tabs.ts); the bar and the pages that make room for it are
// read with their comments stripped.
//
// And since 2026-10-14 the balance beside «You» (owner, 2026-10-09: «να
// φαίνεται, μικρό και διακριτικό»): when it is low is run
// (src/lib/billing/credit-level.ts), where it sits and what it reads are
// read. In a browser, on a phone, in all ten languages:
// scripts/tests/chat-attachments-edges.prodtest.mjs.
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

console.log("\n== 5. the balance, on a phone ==");
// THE OWNER'S DECISION (2026-10-09): «Υπόλοιπο credits στο κινητό: να
// φαίνεται, μικρό και διακριτικό». Below 640px nothing said a balance was
// low or gone (docs/PROGRESS.md, «Έλεγχος του ελέγχου του πακέτου 9»): the
// number shows from lg in the top bar, the low notice from sm, and the
// top bar has no room below that. So the number sits beside «You».
const level = await loadTs("src/lib/billing/credit-level.ts");
const levels = [
  [{ credits: 0, total: 0, isAdmin: true }, "unlimited", "an admin-listed account is unlimited, whatever its row says"],
  [{ credits: null, total: 1000, isAdmin: false }, "unknown", "a balance not read yet says nothing"],
  [{ credits: Number.NaN, total: 1000, isAdmin: false }, "unknown", "...nor one that is not a number"],
  [{ credits: 0, total: 0, isAdmin: false }, "unknown", "0 of 0 (the layout's fallback when the row cannot be read) says nothing"],
  [{ credits: 40, total: null, isAdmin: false }, "ok", "a balance with no known allowance is shown, never called low"],
  [{ credits: 0, total: 1000, isAdmin: false }, "empty", "nothing left of a known allowance is empty"],
  [{ credits: -3, total: 1000, isAdmin: false }, "empty", "...and so is less than nothing"],
  [{ credits: 1, total: 1000, isAdmin: false }, "low", "one credit left is low"],
  [{ credits: 200, total: 1000, isAdmin: false }, "low", "at 20% exactly it is low"],
  [{ credits: 201, total: 1000, isAdmin: false }, "ok", "just above 20% it is not"],
  [{ credits: 3000, total: 3000, isAdmin: false }, "ok", "a full allowance is ok"],
];
for (const [input, want, name] of levels) {
  const got = level.creditLevel(input);
  check(`${name} (${want})`, got === want, `got ${got}`);
}
check("the threshold is a fifth of the allowance", level.LOW_CREDITS_THRESHOLD === 0.2, String(level.LOW_CREDITS_THRESHOLD));
check("the You tab carries the balance, in its label's line",
  /<span className="([^"]*)">\s*<span className="([^"]*)">\{t\(tab\.key\)\}<\/span>\s*\{tab\.key === "you" && <TabBalance \/>\}\s*<\/span>/.test(bar));
{
  const line = bar.match(/<span className="([^"]*)">\s*<span className="([^"]*)">\{t\(tab\.key\)\}<\/span>/) ?? [];
  check("the four icons hang from one line, so a tab that wraps keeps its icon level with the rest",
  /className=\{`flex min-h-\[56px\] flex-col items-center justify-start gap-1 pt-2 /.test(bar));
check("...which wraps under the word on a narrow phone rather than squeezing it, in tight lines that fit the page's 64px",
    /\bflex-wrap\b/.test(line[1] ?? "") && /\bleading-tight\b/.test(line[1] ?? "") && !/\bmin-w-0\b/.test(line[2] ?? "") && /\bbreak-words\b/.test(line[2] ?? ""), `${line[1]} / ${line[2]}`);
}
const balanceFn = bar.slice(bar.indexOf("function TabBalance"), bar.indexOf("export function MobileTabBar"));
check("the number is the credits context's, with no request of its own",
  /const \{ credits, total, isAdmin \} = useCredits\(\);/.test(balanceFn) && /creditLevel\(\{ credits, total, isAdmin \}\)/.test(balanceFn) && !/\bfetch\(|useEffect|\/api\//.test(bar));
check("it says nothing while the balance is unknown", /if \(level === "unknown"\) return null;/.test(balanceFn));
check("the number is written the reader's way", /const locale = useLocale\(\);/.test(balanceFn) && /formatNumber\(credits \?\? 0, locale\)/.test(balanceFn));
const tone = Object.fromEntries([...(bar.match(/const BALANCE_TONE[^{]*\{([^}]*)\}/)?.[1] ?? "").matchAll(/(\w+): "([^"]+)"/g)].map((m) => [m[1], m[2]]));
check("quiet when healthy, a warning when low, an error when gone (status colours only)",
  tone.ok === "text-muted" && tone.unlimited === "text-muted" && tone.low === "text-warning" && tone.empty === "text-danger", JSON.stringify(tone));
check("small: 10px, on one line, in the tab's own flow — it covers nothing",
  /data-testid="tab-balance"[\s\S]{0,80}className=\{`inline-flex shrink-0 items-center gap-0\.5 whitespace-nowrap text-\[10px\]/.test(balanceFn) && !/\b(absolute|fixed|-top-|-translate)/.test(balanceFn));
check("a screen reader hears the words, not a bare number",
  /<span aria-hidden="true">\{amount\}<\/span>\s*<span className="sr-only">\{spoken\}<\/span>/.test(balanceFn) &&
    ["balance", "balanceLow", "balanceEmpty", "balanceUnlimited"].every((k) => balanceFn.includes(`t("${k}"`)));
const banner = stripComments(readFileSync("src/components/credits/low-credits-banner.tsx", "utf8"));
check("the top bar's notice from 640px up decides «low» by the same rule",
  /const level = creditLevel\(\{ credits, total, isAdmin \}\);/.test(banner) && /level !== "low" && level !== "empty"/.test(banner) && !/credits \/ total|THRESHOLD/.test(banner));
for (const l of ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"]) {
  const tabs = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).sidebar?.tabs ?? {};
  check(`${l}: the balance's words, with the number in them`,
    ["balance", "balanceLow", "balanceEmpty", "balanceUnlimited"].every((k) => typeof tabs[k] === "string" && tabs[k].trim().length > 0) &&
      /\{amount\}/.test(tabs.balance) && /\{amount\}/.test(tabs.balanceLow));
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
