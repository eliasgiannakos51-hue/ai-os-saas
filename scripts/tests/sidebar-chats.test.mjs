// «NEW» ΚΑΙ «CHATS» ΑΝΤΙ ΓΙΑ «NEW» ΚΑΙ «CHAT», ΚΑΙ ΟΙ ΣΥΝΟΜΙΛΙΕΣ ΤΟΥ
// SIDEBAR ΚΑΝΟΥΝ ΚΑΤΙ (owner, 2026-10-15).
//
// Two rows said almost the same thing and one of them earned nothing:
// «New» and «Chat» both landed somewhere with an empty field. The third
// row is «Chats» now and opens the list of every conversation; the
// conversations already in the rail open, rename, pin, move to a
// project and delete with an Undo; and the SECOND conversation list,
// the drawer inside Chat, is not drawn — one sidebar, as ΣΥΣΤΗΜΑ DESIGN
// §3 has said all along.
//
// 1. The switch is RUN, not read: flags.ts is loaded with the database
//    stood in and asked who sees Chats with no row, with an unreadable
//    table, and at each of the owner's three positions.
// 2. The rail differs in EXACTLY ONE ROW between the two states —
//    same length, same order, same other keys — and activeRail follows
//    whichever rail it is given.
// 3. Every action goes to a route, and the delete route answers 404 for
//    a row that is not the caller's rather than 200.
// 4. The Undo holds the request back instead of storing a deleted row,
//    and the pending ones are flushed with a real DELETE when the page
//    goes — not with sendBeacon, which can only POST.
// 5. Nothing is lost with the drawer: every action it had is in the
//    shared rows component or on the Chats page, the star included.
// 6. The words exist in all ten languages, and the two sentences this
//    change makes false have been rewritten.
//
// What this does NOT do is draw anything: the rail, the «⋯» menu, the
// long press and the phone are scripts/tests/sidebar-chats.prodtest.mjs.
//
// Run: node scripts/tests/sidebar-chats.test.mjs
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

const KEY = "chats-page";
const ROWS = "src/components/dashboard/conversation-rows.tsx";
const SIDEBAR = "src/components/dashboard/sidebar.tsx";
const PAGE = "src/app/dashboard/chats/page.tsx";
const WORKSPACE = "src/components/chats/chats-workspace.tsx";
const CONV_ROUTE = "src/app/api/conversations/[id]/route.ts";
const LATER = "src/lib/chat/delete-later.ts";
const CHAT_WORKSPACE = "src/components/chat/chat-workspace.tsx";
const src = (p) => stripComments(readFileSync(p, "utf8"));

// ---------------------------------------------------------------------
console.log("== 1. there is no switch left to read ==");
// ---------------------------------------------------------------------
// IT WAS `chats-page`, AND IT IS GONE (owner, 2026-10-16): «Για ΟΛΟΥΣ
// τους χρήστες. Όχι μόνο για μένα.» This section used to run flags.ts
// with the database stood in and ask who saw Chats at each of the
// owner's three positions. There is nothing to ask now — the rail's
// second row is «Chats» for everybody and the page is open to
// everybody — so what is held instead is that no corner of the code
// still waits for a switch that will never arrive.
// RUN, NOT READ, for the same reason the old section ran it: flags.ts
// imports the admin client, so load-ts refuses it outright and a plain
// text search for the key would pass on a file that still declared it
// in another spelling. The stand-ins are the ones that were here.
const standIn = [
  'const createAdminClient = () => ({ from: () => ({ select: async () => ({ data: [], error: null }) }) });',
  'const isAdminEmail = (email) => String(email).trim().toLowerCase() === "owner@example.com";',
  "const logApiError = () => {};",
].join("\n");
const runnable = readFileSync("src/lib/flags/flags.ts", "utf8")
  .replace(/^import[^\n]*\n/gm, "")
  .replace(
    "export { FLAG_AUDIENCES, type FlagAudience };",
    readFileSync("src/lib/flags/audience.ts", "utf8").replace(/\/\*\*[\s\S]*?\*\//, "") + "\n" + standIn
  );
const dir = mkdtempSync(join(tmpdir(), "sidebar-chats-"));
writeFileSync(join(dir, "flags.ts"), runnable);
const flags = await loadTs(join(dir, "flags.ts"));
check("chats-page is no longer a declared switch", !flags.isFlagKey("chats-page"));
// AND THE SCAN STILL SEES SWITCHES, so the line above cannot pass by
// a loader that returns nothing — the shape of an empty check.
check("...while the switches that remain are still declared", flags.isFlagKey("tool-shell"));
const namesIt = ["src/lib/nav/rail.ts", SIDEBAR, PAGE, "src/app/dashboard/layout.tsx", CHAT_WORKSPACE, "src/app/dashboard/chat/page.tsx"]
  .filter((f) => existsSync(f) && /isFeatureOn\(\s*["']chats-page["']/.test(readFileSync(f, "utf8")));
check(`nothing asks for it any more (${namesIt.length})`, namesIt.length === 0, namesIt.join(", "));
// A switch nobody reads is what feature-flags.test.mjs fails the build
// over, and a READ with no switch behind it is the same fault pointing
// the other way: it would resolve to the default for ever, silently.

// ---------------------------------------------------------------------
console.log("\n== 2. there is one rail, and its first row is Ionexa Chat ==");
// ---------------------------------------------------------------------
// THERE WERE TWO RAILS HERE, and this section held that they differed
// in exactly one row. There is one now: railRows(chatsPage) is gone
// with the switch and RAIL_ROWS is what the sidebar draws.
//
// AND THE ROW THAT WAS «Chats» IS «Ionexa Chat» (owner, 2026-10-17:
// «Φεύγουν εντελώς: New, Chats, Collapse sidebar. Μπαίνει ένα
// στοιχείο: Ionexa Chat»). The page with every conversation did NOT go
// — «Η σελίδα με όλες τις συνομιλίες μένει» — it is reached from
// «Όλες οι συνομιλίες» at the foot of the column inside Chat, and
// /dashboard/chats still answers. What changed is which row of the
// rail owns it: Ionexa Chat carries CHATS_HREF in its own `match`, so
// the page lights the row that leads to it rather than lighting
// nothing.
const rail = await loadTs("src/lib/nav/rail.ts");
const rows = rail.RAIL_ROWS;
check("the rail is Logo, Ionexa Chat, Coding, All tools", rows.map((r) => r.key).join() === "ionexaChat,coding,allTools", JSON.stringify(rows.map((r) => r.key)));
// INDEX 0, NOT 1: the Logo is row 1 of the DESIGN and is not a rail
// row at all — RAIL_ROWS starts at Ionexa Chat. Written out because
// counting it is the obvious mistake, and this check made it once.
check(
  "the first row is Ionexa Chat, and it opens the Chat",
  rows[0].key === "ionexaChat" && rows[0].href === "/dashboard/chat",
  JSON.stringify(rows[0])
);
check(
  "...and the page with every conversation belongs to that same row",
  rows[0].match?.includes(rail.CHATS_HREF) === true && rail.CHATS_HREF === "/dashboard/chats",
  JSON.stringify(rows[0])
);
check("no row of its own goes to /dashboard/chats any more", !rows.some((r) => r.href === rail.CHATS_HREF), JSON.stringify(rows));
// READ FROM THE EXPORT LIST, NOT BY TOUCHING THE NAME. `rail.railRows`
// would be the suite reading a symbol its subject does not export —
// undefined today, a TypeError the day somebody calls it — which
// test-export-drift.test.mjs §6 exists to catch. Naming every export
// and requiring this one to be absent is the same claim, made of
// something that is actually there.
check("there is no second rail to build", !Object.keys(rail).includes("railRows"), Object.keys(rail).join(", "));
check(
  "activeRail lights Ionexa Chat on /dashboard/chats",
  JSON.stringify(rail.activeRail("/dashboard/chats", [], [], rows)) === '{"key":"ionexaChat"}',
  JSON.stringify(rail.activeRail("/dashboard/chats", [], [], rows))
);
check(
  "...and on /dashboard/chat itself",
  JSON.stringify(rail.activeRail("/dashboard/chat", [], [], rows)) === '{"key":"ionexaChat"}',
  JSON.stringify(rail.activeRail("/dashboard/chat", [], [], rows))
);
// AGAINST A RAIL THAT IS NOT THE DEFAULT, because `rows` IS the default
// now and a function that ignored its argument would answer this
// identically. The phone's bottom bar is the real second caller: it
// passes RAIL_ROWS plus a Home tab the sidebar does not have
// (lib/nav/tabs.ts), so /dashboard/overview lights Home there and
// nothing here — and that only works if the given list wins.
const phoneRail = [...rows, { key: "home", href: "/dashboard/overview" }];
check(
  "...and follows the rail it is GIVEN, not the one it knows",
  JSON.stringify(rail.activeRail("/dashboard/overview", [], [], phoneRail)) === '{"key":"home"}' &&
    rail.activeRail("/dashboard/overview", [], [], rows) === null,
  `${JSON.stringify(rail.activeRail("/dashboard/overview", [], [], phoneRail))} / ${JSON.stringify(rail.activeRail("/dashboard/overview", [], [], rows))}`
);

// ---------------------------------------------------------------------
console.log("\n== 3. every action is a route, and a stranger's row is 404 ==");
// ---------------------------------------------------------------------
const rowsSrc = src(ROWS);
check("the rows component never reaches the database itself", !/from\(["']chat_conversations["']\)/.test(rowsSrc) && !/createBrowserSupabase|createClient\(\)/.test(rowsSrc));
// THE URL AND THE VERB TOGETHER. Checked apart, `conversationDeleteUrl`
// was still present further down (the DELETE uses it) while the PATCH
// had been pointed straight at /rest/v1/chat_conversations — and this
// check stayed green. Its own mutation suite found that.
check(
  "rename and pin go to api/conversations/[id] with PATCH",
  /fetch\(conversationDeleteUrl\(id\), \{\s*method: "PATCH"/.test(rowsSrc)
);
check("the move goes to api/projects/[id]/members", /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/members/.test(rowsSrc));
check('...naming the conversation table, so the route can read the row back', /table:\s*"chat_conversations"/.test(rowsSrc));

const routeSrc = src(CONV_ROUTE);
check("there is a DELETE handler on the conversation route", /export async function DELETE\(/.test(routeSrc));
check("the delete is scoped by user_id as well as by id", /\.delete\(\)[\s\S]{0,120}\.eq\("id", params\.id\)[\s\S]{0,80}\.eq\("user_id", user\.id\)/.test(routeSrc));
check(
  "a row that was not this account's answers 404, not 200",
  /if \(!deleted \|\| deleted\.length === 0\) \{\s*return fail\("not_found", 404\);/.test(routeSrc)
);
check("it answers 401 before anything else when nobody is signed in", /export async function DELETE\(([\s\S]{0,700}?)fail\("not_authenticated", 401\)/.test(routeSrc));

const membersSrc = src("src/app/api/projects/[id]/members/route.ts");
check("the members route reads the member row back as the caller's own", /async function ownsMember\(/.test(membersSrc) && /\.eq\("id", memberId\)\s*\.eq\("user_id", userId\)/.test(membersSrc));
check("...and refuses one that is not, with 404", /return NextResponse\.json\(\{ error: "no_such_member" \}, \{ status: 404 \}\)/.test(membersSrc));
// THE VERB IS THE CLAIM. The first version asked only that the source
// id appeared before the insert, which stayed true when the `.delete()`
// was changed to a `.select()` — i.e. when the clearing stopped
// clearing. The statement has to be a delete, scoped to this row, and
// it has to come first.
const clearIdx = membersSrc.search(/\.from\("entity_links"\)\s*\.delete\(\)[\s\S]{0,320}\.eq\("source_id", memberId\)/);
check(
  "a move clears the previous project edge before writing the new one",
  clearIdx >= 0 && clearIdx < membersSrc.indexOf('.insert({'),
  `clear at ${clearIdx}, insert at ${membersSrc.indexOf(".insert({")}`
);

// ---------------------------------------------------------------------
console.log("\n== 4. the Undo holds the request back ==");
// ---------------------------------------------------------------------
const laterSrc = src(LATER);
// INSIDE THE TIMER, which is the whole mechanism. Asking only that a
// setTimeout exists somewhere left the gate green when the commit was
// moved out of it and fired at once — a window with nothing in it.
check(
  "nothing is deleted during the window: the request is scheduled",
  /export function scheduleDelete\(/.test(laterSrc) &&
    /setTimeout\(\s*\(\) => \{\s*PENDING\.delete\(id\);\s*commit\(\);\s*\},\s*windowMs\s*\)/.test(laterSrc)
);
check("«Αναίρεση» is the timer being cleared, not a row being restored", /export function cancelDelete\(/.test(laterSrc) && /clearTimeout\(/.test(laterSrc) && !/deleted_at|restore|undelete/i.test(laterSrc));
check(
  "a page that goes away still commits, with a real DELETE",
  /pagehide/.test(laterSrc) && /method: "DELETE", keepalive: true/.test(laterSrc)
);
check(
  "...and NOT with sendBeacon, which can only send a POST",
  !/sendBeacon\(/.test(laterSrc)
);
check("the window is one number both ends read", /export const UNDO_WINDOW_MS/.test(laterSrc) && /UNDO_WINDOW_MS/.test(rowsSrc));

// ---------------------------------------------------------------------
console.log("\n== 5. nothing the drawer did is lost ==");
// ---------------------------------------------------------------------
check("the page and its workspace exist", existsSync(PAGE) && existsSync(WORKSPACE));
const pageSrc = src(PAGE);
const workSrc = src(WORKSPACE);
check("the page is open to everybody, with no switch in front of it", !/isFeatureOn/.test(pageSrc) && !/notFound\(\)/.test(pageSrc));
check("the sidebar draws no conversations and takes no list to draw", !/<ConversationRows/.test(src(SIDEBAR)) && !/conversations/.test(src(SIDEBAR)));
// THE DRAWER ITSELF, NOT THE SCRIM. Both are guarded by the same
// words, so a regex for `sidebarOpen && !chatsPage` went on matching
// the scrim after the drawer's own guard had been removed — the list
// came back and the gate did not notice. Anchored on the className
// that decides whether the drawer is laid out at all.
// THE DRAWER IS DELETED NOW, NOT MERELY UNDRAWN. It was kept behind
// the switch so «Πώς γυρίζει πίσω» could be one press; with the switch
// gone, its own comment's instruction applies —
// «conversation-sidebar.tsx is removed in the round that removes this
// switch». Absence is checked three ways because a half-removal is the
// likely one: the file, the import, and the state it needed.
check("the drawer inside Chat is gone from the tree", !existsSync("src/components/chat/conversation-sidebar.tsx"));
check("...and Chat no longer imports or lays it out", !/ConversationSidebar/.test(src(CHAT_WORKSPACE)));
check("...nor keeps the open/closed state it needed", !/sidebarOpen|toggleSidebar/.test(src(CHAT_WORKSPACE)));

// EVERY ACTION THE DRAWER HAD, AND WHERE IT WENT. The list is the
// population this ranges over: a fifth action added to the drawer that
// is not here would be lost in silence, which is precisely how
// «Καμία λειτουργία δεν χάνεται» gets broken.
const CARRIED = [
  ["select a conversation", () => /router\.push\(`\/dashboard\/chat\?c=/.test(rowsSrc)],
  ["rename in place", () => /<InlineTitle/.test(rowsSrc)],
  ["pin and unpin", () => /is_pinned: next/.test(rowsSrc)],
  ["delete", () => /scheduleDelete\(/.test(rowsSrc)],
  ["the favourite star", () => /<FavoriteButton/.test(rowsSrc)],
  ["pinned grouped above the rest", () => /groupPinned/.test(rowsSrc)],
  ["an empty state", () => /noConversations/.test(rowsSrc)],
  // «Νέα συνομιλία» came OFF the rail on 2026-10-17 and went INTO the
  // Chat's own title row, which is where the owner asked for it. So
  // this entry reads the button rather than a rail row — and it reads
  // the handler as well as the label, because a button wired to
  // nothing renders exactly as well as one that works.
  ["a new conversation", () => /onClick=\{startNewChat\}[\s\S]{0,240}data-testid="chat-new-conversation"/.test(src(CHAT_WORKSPACE))],
];
for (const [what, held] of CARRIED) check(`carried over: ${what}`, held());

// AND THE ONE THING THE COLUMN HAD TO DO DIFFERENTLY, which is the
// defect this section would otherwise have missed entirely.
//
// Every other list of conversations is on ANOTHER route, so choosing
// one mounts the chat screen around it and `?c=` is read on the way
// in. The column is ON that screen: a push to /dashboard/chat?c=…
// changes a prop and remounts nothing. With the once-per-mount guard
// the deep-link effect carried until 2026-10-17, the FIRST
// conversation opened and every one after it left the address saying
// one thread while the page showed another — and re-opening the one
// you had just left did nothing at all, because the address was
// already its own.
//
// THREE HALVES, because any one of them alone passes on the broken
// version: the row hands the id to its caller instead of navigating,
// the caller selects the thread and corrects the address, and the
// effect follows the address every time rather than once.
{
  const rowsSrc2 = src(ROWS);
  const workspace = src(CHAT_WORKSPACE);
  const column = src("src/components/chat/conversation-column.tsx");
  check(
    "a row hands its id to the caller when the caller wants it",
    /if \(onOpen\) \{\s*onOpen\(row\.id\);\s*return;\s*\}/.test(rowsSrc2) &&
      /router\.push\(`\/dashboard\/chat\?c=\$\{encodeURIComponent\(row\.id\)\}`\)/.test(rowsSrc2),
    "and still navigates for the screens that are not the chat"
  );
  check("...and the column is the caller that wants it", /onOpen=\{onOpen\}/.test(column) && /onOpen=\{openFromColumn\}/.test(workspace));
  check(
    "...and opening from the column switches the thread, then corrects the address",
    /function openFromColumn\(id: string\) \{[\s\S]{0,200}selectConversation\(id\);[\s\S]{0,200}router\.replace\(`\/dashboard\/chat\?c=\$\{encodeURIComponent\(id\)\}`/.test(workspace),
    "a reload, a share and Back all have to land on the conversation that is open"
  );
  check(
    "...and the deep link follows the address every time it changes, not once per mount",
    /lastDeepLink\.current === initialConversationId\) return;/.test(workspace) && !/deepLinkedRef/.test(workspace),
    "a boolean here is the defect: it opens the first conversation and silently ignores the second"
  );
  // AND THE NAME IN THE TITLE ROW IS THE NAME IN THE COLUMN.
  //
  // The rows keep their own copy and refresh the page after every
  // write; the workspace seeded its list once and ignored what came
  // back, so a conversation renamed in the column carried its new
  // name there and its OLD name above the thread, both on screen at
  // once. Measured by sidebar-chats.prodtest.mjs §1b on 2026-10-17.
  check(
    "...and the list follows the server after the column writes to it",
    /useEffect\(\(\) => setConversations\(initialConversations\), \[initialConversations\]\);/.test(workspace) &&
      /router\.refresh\(\)/.test(rowsSrc2),
    "two copies of one conversation's name, visible at the same time, disagreeing"
  );
}

// AND THE LIST THE COLUMN DRAWS IS THIS ACCOUNT'S, said by the query
// and not only by the policy. app/dashboard/chats/page.tsx has always
// named the owner on the same table; the chat page left it to RLS
// alone, which is one layer where the other screen has two. Found on
// 2026-10-17 by sidebar-chats.prodtest.mjs §1b, which seeds a second
// account's conversation and requires the column not to carry it.
{
  const chatPage = src("src/app/dashboard/chat/page.tsx");
  check(
    "the chat page asks for this account's conversations by name",
    /from\("chat_conversations"\)[\s\S]{0,400}\.eq\("user_id", user\.id\)/.test(chatPage)
  );
  check(
    "...and for its projects the same way",
    /from\("projects"\)[\s\S]{0,400}\.eq\("user_id", user\.id\)/.test(chatPage)
  );
}
// THE FILE WAS KEPT ON PURPOSE WHILE THE SWITCH EXISTED, so «Πώς
// γυρίζει πίσω» could be one press on /dashboard/system-health. With
// the switch gone, going back is a Revert, and the file's own comment
// said this round is the one that removes it. Held the other way now,
// in section 5 above: it must NOT be there.

check("the Chats page searches titles with the folding matcher, not toLowerCase", /matchesSearch\(/.test(workSrc) && !/toLowerCase\(\)\.includes/.test(workSrc));
check("...and asks the server for what was said", /\/api\/conversations\/search\?q=/.test(workSrc));
check("the content search says what it looked at", /searchedContent/.test(workSrc) && /CONTENT_ROWS_SCANNED/.test(workSrc));
check("several at once share the single delete's route", /conversationDeleteUrl\(id\), \{ method: "DELETE" \}/.test(workSrc));
// THE CAP AND ITS «Όλες οι συνομιλίες» LINK WERE THE SIDEBAR'S, and
// the sidebar has no list to cap any more. The Chats page has its own
// bound and says it out loud (CHATS_LIST_CAP, «atCap»), which is the
// claim worth holding now: a page that quietly renders its newest 500
// is indistinguishable from one that is broken.
check("the Chats page says so when its own list is capped", /CHATS_LIST_CAP/.test(workSrc) && /atCap/.test(workSrc));
check("...and the sidebar has no list left to cap", !/RECENT_CONVERSATIONS/.test(src(SIDEBAR)) && !/allConversations/.test(src(SIDEBAR)));
// AND THE WORDS WENT WITH IT, in all ten. A heading left in the
// message files is a heading the next person puts back without
// thinking about it, and `sidebar.rail.*` is a dynamic namespace —
// orphan-i18n-keys.test.mjs counts every key under it as reachable,
// so nothing else would have noticed these two going dead.
//
// FIVE MORE WENT ON 2026-10-17 with the rows they named: «New»,
// «Chats», «Collapse sidebar», «Expand sidebar», and the bare «Chat»
// the first row used before it became «Ionexa Chat». Same reason, and
// one of them worse than a heading — a message file that still says
// «Collapse sidebar» in ten languages is a control the next person
// rebuilds.
const DELETED_WORDS = [
  ["sidebar", "rail", "recentChats"],
  ["sidebar", "rail", "allConversations"],
  ["sidebar", "rail", "new"],
  ["sidebar", "rail", "chat"],
  ["sidebar", "rail", "chats"],
  ["sidebar", "rail", "collapse"],
  ["sidebar", "rail", "expand"],
];

// ---------------------------------------------------------------------
console.log("\n== 6. the words, in all ten languages ==");
// ---------------------------------------------------------------------
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
check("ten locale files were read", Object.keys(messages).length === 10);
const NEEDED = [
  ["sidebar", "rail", "ionexaChat"],
  ["dashboard", "chat", "newChat"],
  ["dashboard", "chat", "searchConversations"],
  ["dashboard", "chat", "allConversations"],
  ["dashboard", "chat", "moveToProject"],
  ["dashboard", "chat", "undo"],
  ["dashboard", "chat", "deleteFailed"],
  ["dashboard", "chats", "title"],
  ["dashboard", "chats", "searchPlaceholder"],
  ["dashboard", "chats", "noMatches"],
  ["pageTitle", "chats"],
];
const at = (o, path) => path.reduce((v, k) => (v == null ? v : v[k]), o);
for (const path of DELETED_WORDS) {
  const left = LOCALES.filter((l) => at(messages[l], path) !== undefined);
  check(`${path.join(".")} is gone from all ten`, left.length === 0, left.join(", "));
}
for (const path of NEEDED) {
  const missing = LOCALES.filter((l) => typeof at(messages[l], path) !== "string" || !at(messages[l], path).trim());
  check(`${path.join(".")} is written in all ten`, missing.length === 0, missing.join(", "));
}
// THE TWO SENTENCES THIS CHANGE MADE FALSE. Both shipped, both were
// true until today, and both are read by a person on a screen.
const stillSaysForever = LOCALES.filter((l) => {
  const s = at(messages[l], ["projects", "chatFixed"]) ?? "";
  return /whole life|όλη της τη ζωή|toda su vida|toute sa durée|ihr Leben lang|tutta la sua vita|toda a sua vida|终其一生|一生のあいだ|طوال عمرها/.test(s);
});
check("«a conversation belongs to its project for life» is gone, in all ten", stillSaysForever.length === 0, stillSaysForever.join(", "));
const stillSaysNoUndo = LOCALES.filter((l) => {
  const s = at(messages[l], ["dashboard", "chat", "deleteConfirm"]) ?? "";
  return /can't be undone|δεν αναιρείται|No se puede deshacer|irréversible|nicht rückgängig|irreversibile|não é possível anular|无法撤销|元に戻せません|لا يمكن التراجع/.test(s);
});
check("«this can't be undone» is gone from the delete, in all ten", stillSaysNoUndo.length === 0, stillSaysNoUndo.join(", "));

// A FLOOR ON WHAT THOSE TWO SEARCHED. Both checks above assert an empty
// list, and an empty list is also what a typo in the path produces —
// scripts/tests/gate-vacuity.test.mjs exists because of exactly that.
const present = LOCALES.filter((l) => typeof at(messages[l], ["projects", "chatFixed"]) === "string");
check("...and both sentences were actually found to be read", present.length === 10, `${present.length} of 10`);

console.log("\n== 7. the column's closed width is not a Tailwind coin-flip ==");
// `md:w-[280px]` used to sit in the slot's UNCONDITIONAL base classes
// AND in the open branch — harmless together (the same class twice —
// but ALSO in the closed branch's `md:w-0`, at the same time as the
// base's `md:w-[280px]`. Two same-specificity utilities on one element
// resolve by the order Tailwind emits them in the compiled stylesheet,
// not by where they sit in this string, so whether the column actually
// collapsed was a build detail rather than something this file
// controlled. Found 2026-10-17, after it happened to render correctly
// in every screenshot taken that day — which was the emitted order
// being favourable, not a guarantee.
{
  const ws = src(CHAT_WORKSPACE);
  const slotMatch = ws.match(/data-testid="chat-column-slot"[\s\S]{0,400}data-open=\{columnOpen\}[\s\S]{0,400}className=\{`([\s\S]*?)`\}/);
  const slotClass = slotMatch ? slotMatch[1] : "";
  check("the slot's className was found", Boolean(slotMatch), "chat-column-slot's class template literal");
  const base = slotClass.split("${columnOpen")[0];
  // NO \b AFTER A BRACKET. `]` is not a word character, and neither is
  // the space that follows it — a trailing \b there finds no boundary
  // to match and silently never fires, which is how this check passed
  // on the very mutation it was written to catch the first time it was
  // run. The literal bracketed class name is specific enough on its
  // own; this needs no \b at all.
  check(
    "...and the unconditional base never claims a width Tailwind would have to arbitrate",
    !base.includes("md:w-[280px]") && !/\bmd:w-0\b/.test(base),
    base
  );
  check(
    "...each conditional branch still sets its own width",
    /columnOpen \? "translate-x-0 md:w-\[280px\]"/.test(slotClass) && /: "-translate-x-full[\s\S]{0,40}md:w-0/.test(slotClass)
  );
}

console.log("\n== 8. deleting the open conversation closes it — read seconds late, correctly ==");
// NEW SINCE 2026-10-17, not carried over: delete used to live only on
// the Chats page, which has no open thread beside it to invalidate.
// The column does, and a delete commits several seconds after the
// press that scheduled it (the Undo window) — by which point the
// person may have opened a DIFFERENT conversation. `activeId` read
// directly inside that late callback would be whatever it was at
// click time, not now; the three checks below are the three places
// that have to agree for "was the one I deleted still open, right
// now" to be answered with the right "now".
{
  const rows = src(ROWS);
  const column = src("src/components/chat/conversation-column.tsx");
  const ws = src(CHAT_WORKSPACE);
  check(
    "a confirmed delete tells its caller, after the server confirms it — not when it is only scheduled",
    /forget\(row\.id\);\s*onDeleted\?\.\(row\.id\);\s*router\.refresh\(\);/.test(rows)
  );
  check("...and the column forwards it", /onDeleted=\{onDeleted\}/.test(column));
  check(
    "...and the workspace reads a REF for \"is this still open\", not the activeId closed over at click time",
    /const activeIdRef = useRef<string \| null>\(null\);/.test(ws) &&
      /activeIdRef\.current = activeId;/.test(ws) &&
      /onDeleted=\{\(id\) => \{\s*if \(id === activeIdRef\.current\) startNewChat\(\);/.test(ws),
    "a plain `activeId` read inside this callback would be the value from the render at click time, stale by the time the Undo window elapses"
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
