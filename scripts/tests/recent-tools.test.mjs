// THE SIDEBAR IS ONE AND THE SAME ON EVERY PAGE, AND RECENT TOOLS KEEPS
// THE DESIGN'S RULES.
//
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN — ΤΟ ΤΕΛΙΚΟ, SIDEBAR; BUILD-SPECS 2.4
// scenarios 1–8. The rules are run (src/lib/nav/recent-tools.ts,
// src/lib/nav/rail.ts); the sidebar, the layout that feeds it and the
// route that stores a pin are read with their comments stripped.
//
// Run: node scripts/tests/recent-tools.test.mjs
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

const R = await loadTs("src/lib/nav/recent-tools.ts");
const RAIL = await loadTs("src/lib/nav/rail.ts");
const now = new Date("2026-10-04T12:00:00Z");
const ago = (days, minutes = 0) => new Date(now.getTime() - days * 86_400_000 - minutes * 60_000).toISOString();
const TOOLS = ["/dashboard/website-builder", "/dashboard/documents", "/dashboard/presentations", "/dashboard/posts", "/dashboard/deep-research", "/dashboard/files", "/dashboard/chat", "/dashboard/coding"];
const none = { pinned: [], removed: {} };
const run = (events, prefs = none) => R.recentTools({ events, toolHrefs: TOOLS, prefs, now });
const ev = (path, days, minutes = 0) => ({ path, created_at: ago(days, minutes) });
const hrefs = (list) => list.map((r) => r.href).join(",");

console.log("== 1. when a tool appears ==");
check("a new person has no recent tools", run([]).length === 0);
check("one use is not enough", run([ev("/dashboard/posts", 1)]).length === 0);
check(
  "two opens a few minutes apart are ONE use",
  run([ev("/dashboard/posts", 1, 0), ev("/dashboard/posts", 1, 10)]).length === 0
);
check(
  "two separate uses within 30 days: it appears",
  hrefs(run([ev("/dashboard/posts", 1), ev("/dashboard/posts", 5)])) === "/dashboard/posts"
);
check(
  "a use older than 30 days does not count",
  run([ev("/dashboard/posts", 1), ev("/dashboard/posts", 31)]).length === 0
);
check(
  "a sub-page of a tool counts as the tool",
  hrefs(run([ev("/dashboard/documents/:id", 1), ev("/dashboard/documents", 3)])) === "/dashboard/documents"
);
check(
  "Chat and Coding never appear, however much they are used",
  run([ev("/dashboard/chat", 1), ev("/dashboard/chat", 2), ev("/dashboard/coding", 1), ev("/dashboard/coding", 2)]).length === 0
);

console.log("\n== 2. five at most, the oldest goes ==");
const six = TOOLS.slice(0, 6).flatMap((t, i) => [ev(t, i + 1), ev(t, i + 10)]);
const five = run(six);
check("six candidates give five", five.length === R.RECENT_TOOLS_MAX && R.RECENT_TOOLS_MAX === 5, hrefs(five));
check("the one unused for longest is the one that goes", !five.some((r) => r.href === TOOLS[5]), hrefs(five));
check("newest first", five[0].href === TOOLS[0] && five[4].href === TOOLS[4], hrefs(five));

console.log("\n== 3. pin and remove ==");
const pinnedOld = run(six, { pinned: [TOOLS[5]], removed: {} });
check("a pinned tool stays, even the oldest", pinnedOld[0].href === TOOLS[5] && pinnedOld[0].pinned === true, hrefs(pinnedOld));
check("...and the five still hold, one fewer of the rest", pinnedOld.length === 5 && !pinnedOld.some((r) => r.href === TOOLS[4]), hrefs(pinnedOld));
const pinnedNew = run(six, { pinned: [TOOLS[0]], removed: {} });
check(
  "a pinned tool that is also the most used is listed once",
  pinnedNew.length === 5 && new Set(pinnedNew.map((r) => r.href)).size === 5 && pinnedNew.filter((r) => r.href === TOOLS[0]).length === 1,
  hrefs(pinnedNew)
);
check("a pin needs no use at all", hrefs(run([], { pinned: [TOOLS[1]], removed: {} })) === TOOLS[1]);
check("Chat cannot be pinned into the list either", run([], { pinned: ["/dashboard/chat"], removed: {} }).length === 0);
const removedPrefs = R.applyRecentAction(none, "remove", "/dashboard/posts", new Date(ago(0, 30)));
check(
  "removing a tool takes it out, past uses and all",
  run([ev("/dashboard/posts", 1), ev("/dashboard/posts", 5)], removedPrefs).length === 0
);
check(
  "...and it comes back only after two uses since",
  run([ev("/dashboard/posts", 0, 20), ev("/dashboard/posts", 0, 1), ev("/dashboard/posts", 5)], removedPrefs).length === 0 &&
    hrefs(run([ev("/dashboard/posts", 0, 35), ev("/dashboard/posts", 0, 1)], { pinned: [], removed: { "/dashboard/posts": ago(0, 40) } })) === "/dashboard/posts"
);
const pinned = R.applyRecentAction(removedPrefs, "pin", "/dashboard/posts", now);
check("pinning a removed tool brings it back", pinned.pinned.includes("/dashboard/posts") && !("/dashboard/posts" in pinned.removed));
check("unpin takes the pin away", R.applyRecentAction(pinned, "unpin", "/dashboard/posts", now).pinned.length === 0);
const full = { pinned: TOOLS.slice(0, 5), removed: {} };
check("no sixth pin", R.applyRecentAction(full, "pin", TOOLS[5], now) === full);
check(
  "what is stored is read defensively",
  JSON.stringify(R.readRecentPrefs({ recent_tools: { pinned: [1, "/a", "/a"], removed: { "/b": "nope", "/c": ago(1) } } })) ===
    JSON.stringify({ pinned: ["/a"], removed: { "/c": ago(1) } })
);
check("no metadata is no preferences", JSON.stringify(R.readRecentPrefs(null)) === JSON.stringify(none));

console.log("\n== 4. the rows, and which is active ==");
check(
  "the fixed rows are New, Chat, Coding, All tools, in that order",
  RAIL.RAIL_ROWS.map((r) => r.key).join() === "new,chat,coding,allTools"
);
const act = (p, recent = []) => JSON.stringify(RAIL.activeRail(p, recent, TOOLS));
check("Home is New", act("/dashboard/overview") === '{"key":"new"}');
check("a conversation is Chat", act("/dashboard/chat/abc") === '{"key":"chat"}');
check("a recent tool is its own row", act("/dashboard/posts", ["/dashboard/posts"]) === '{"recent":"/dashboard/posts"}');
check("any other tool is All tools, where it lives", act("/dashboard/posts") === '{"key":"allTools"}');
check("the account's pages are Settings", act("/dashboard/settings/billing") === '{"key":"settings"}');
check("a page that is none of them lights nothing", act("/somewhere") === "null");

console.log("\n== 5. the sidebar draws exactly that, and nothing else ==");
const S = stripComments(readFileSync("src/components/dashboard/sidebar.tsx", "utf8"));
check("the fixed rows come from the one constant", /\{RAIL_ROWS\.map\(\(r\) => row\(r\.href, t\(`rail\.\$\{r\.key\}`\)/.test(S));
check("no group of tools is drawn as rows", !/MAIN_SIDEBAR_GROUPS\)\.map|renderGroup|groups\.map/.test(S));
check("Recent tools, and its heading, only when there is something in it", /\{list\.length > 0 && \(/.test(S));
check("the list is the server's, not the browser's", !/localStorage\.(get|set)Item\(\s*["'`]ionexa\.recentTools/.test(S) && /recent = \[\]/.test(S));
check("Settings sits at the bottom", S.lastIndexOf("SETTINGS_HREF,") > S.indexOf('data-testid="recent-tools"'));
check("the narrow sidebar keeps the name for a tooltip and a screen reader", /<Tooltip content=\{label\} side="right">/.test(S) && /aria-label=\{collapsed \? label : undefined\}/.test(S) && /md:sr-only/.test(S));
check("no name is cut with an ellipsis", !/\btruncate\b/.test(S));
check("pin and remove are buttons with names", /aria-label=\{t\(r\.pinned \? "rail\.unpin" : "rail\.pin", \{ tool: label \}\)\}/.test(S) && /aria-label=\{t\("rail\.remove", \{ tool: label \}\)\}/.test(S));
check("the active row is the active surface", /data-active=\{isActive\}/.test(S) && /className=\{`nav-item /.test(S));

const L = stripComments(readFileSync("src/app/dashboard/layout.tsx", "utf8"));
check(
  "the layout reads the person's own last 30 days of nav_events",
  /\.from\("nav_events"\)[\s\S]{0,120}\.eq\("user_id", user\.id\)[\s\S]{0,80}\.gte\("created_at", since\)/.test(L)
);
check("and hands the result to the sidebar", /<Sidebar [^>]*recent=\{recent\} \/>/.test(L));

const API = stripComments(readFileSync("src/app/api/nav/recent-tools/route.ts", "utf8"));
check("a pin is stored on the account, through the person's own session", /supabase\.auth\.updateUser\(\{ data: \{ recent_tools: next \} \}\)/.test(API) && !/createAdminClient/.test(API));
check("only a tool this person can see may be stored", /if \(!tools\.includes\(href\)\) return NextResponse\.json\(\{ ok: false \}, \{ status: 400 \}\);/.test(API));

const locales = ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"];
const en = JSON.parse(readFileSync("messages/en.json", "utf8")).sidebar.rail;
check("the English rows are the design's words", en.new === "New" && en.chat === "Chat" && en.coding === "Coding" && en.allTools === "All tools" && en.recentTools === "Recent tools" && en.settings === "Settings");
for (const l of locales) {
  const r = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).sidebar?.rail ?? {};
  check(`${l}: every row and control is worded`, ["new", "chat", "coding", "allTools", "recentTools", "settings", "pin", "unpin", "remove", "collapse", "expand", "label", "saveFailed"].every((k) => typeof r[k] === "string" && r[k].length > 0));
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
