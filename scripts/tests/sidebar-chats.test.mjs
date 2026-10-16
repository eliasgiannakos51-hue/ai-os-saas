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
console.log("== 1. the switch, run ==");
// ---------------------------------------------------------------------
const standIn = [
  'const createAdminClient = () => ({ from: () => ({ select: async () => globalThis.__flagsDb() }) });',
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
const OWNER = { email: "owner@example.com" };
const CUSTOMER = { email: "someone@example.com" };
async function seen(db) {
  globalThis.__flagsDb = db;
  return {
    owner: await flags.isFeatureOn(KEY, OWNER),
    customer: await flags.isFeatureOn(KEY, CUSTOMER),
    audience: (await flags.readFlagAudiences())[KEY],
  };
}
check(`${KEY} is a declared switch`, flags.isFlagKey(KEY));
const none = await seen(async () => ({ data: [], error: null }));
check(
  "with no row it is «Εσύ και ο λογαριασμός δοκιμής»: the owner sees Chats, a customer does not",
  none.audience === "staff" && none.owner && !none.customer,
  JSON.stringify(none)
);
const broken = await seen(async () => ({ data: null, error: { message: "no such table" } }));
check(
  "a table that cannot be read falls back to the same place, not to «Όλοι»",
  broken.audience === "staff" && !broken.customer,
  JSON.stringify(broken)
);
const everyone = await seen(async () => ({ data: [{ key: KEY, audience: "everyone" }], error: null }));
check("«Όλοι»: a customer sees it too", everyone.owner && everyone.customer);
const off = await seen(async () => ({ data: [{ key: KEY, audience: "off" }], error: null }));
check("«Κανείς»: not even the owner", !off.owner && !off.customer);

// ---------------------------------------------------------------------
console.log("\n== 2. the rail differs in exactly one row ==");
// ---------------------------------------------------------------------
const rail = await loadTs("src/lib/nav/rail.ts");
const shut = rail.railRows(false);
const open = rail.railRows(true);
check("the two rails are the same length", shut.length === open.length && shut.length > 0, `${shut.length} vs ${open.length}`);
const differing = shut.map((r, i) => (r.key === open[i].key && r.href === open[i].href ? null : i)).filter((i) => i !== null);
// INDEX 1, NOT 2: the Logo is row 1 of the DESIGN and is not a rail
// row at all — RAIL_ROWS starts at New. Written out because counting
// it is the obvious mistake, and this check made it once.
check("exactly one row differs, and it is the Chat one", differing.length === 1 && differing[0] === 1, JSON.stringify(differing));
check(
  "shut, the third row is Chat at /dashboard/chat",
  shut[1].key === "chat" && shut[1].href === "/dashboard/chat",
  JSON.stringify(shut[1])
);
check(
  "open, the third row is Chats at /dashboard/chats",
  open[1].key === "chats" && open[1].href === rail.CHATS_HREF && rail.CHATS_HREF === "/dashboard/chats",
  JSON.stringify(open[1])
);
check(
  "the order is Logo, New, Chats, Coding, All tools either way",
  open.map((r) => r.key).join() === "new,chats,coding,allTools" && shut.map((r) => r.key).join() === "new,chat,coding,allTools"
);
check(
  "activeRail follows the rail it is given: /dashboard/chats is the Chats row",
  JSON.stringify(rail.activeRail("/dashboard/chats", [], [], open)) === '{"key":"chats"}'
);
check(
  "...and with the old rail it is not a rail row at all",
  rail.activeRail("/dashboard/chats", [], [], shut) === null
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
check("the page is behind the switch and 404s when it is shut", /isFeatureOn\("chats-page", user\)/.test(pageSrc) && /notFound\(\)/.test(pageSrc));
check("the sidebar reads the switch through its parent, not itself", /chatsPage/.test(src(SIDEBAR)) && /isFeatureOn\("chats-page", user\)/.test(src("src/app/dashboard/layout.tsx")));
// THE DRAWER ITSELF, NOT THE SCRIM. Both are guarded by the same
// words, so a regex for `sidebarOpen && !chatsPage` went on matching
// the scrim after the drawer's own guard had been removed — the list
// came back and the gate did not notice. Anchored on the className
// that decides whether the drawer is laid out at all.
check(
  "the drawer inside Chat is not drawn when the switch is on",
  /sidebarOpen && !chatsPage \? "flex" : "hidden"/.test(src(CHAT_WORKSPACE))
);
check("...and the button that opened it is not drawn either", /\{!chatsPage && \(/.test(src(CHAT_WORKSPACE)));

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
  ["a new conversation", () => open[0].key === "new" && /rows\.map\(\(r\) => row\(r\.href/.test(src(SIDEBAR))],
];
for (const [what, held] of CARRIED) check(`carried over: ${what}`, held());
check("the drawer's own file is still there, so the switch can go back", existsSync("src/components/chat/conversation-sidebar.tsx"));

check("the Chats page searches titles with the folding matcher, not toLowerCase", /matchesSearch\(/.test(workSrc) && !/toLowerCase\(\)\.includes/.test(workSrc));
check("...and asks the server for what was said", /\/api\/conversations\/search\?q=/.test(workSrc));
check("the content search says what it looked at", /searchedContent/.test(workSrc) && /CONTENT_ROWS_SCANNED/.test(workSrc));
check("several at once share the single delete's route", /conversationDeleteUrl\(id\), \{ method: "DELETE" \}/.test(workSrc));
check("the sidebar caps the list and offers the way out", /RECENT_CONVERSATIONS/.test(src(SIDEBAR)) && /rail\.allConversations/.test(src(SIDEBAR)));

// ---------------------------------------------------------------------
console.log("\n== 6. the words, in all ten languages ==");
// ---------------------------------------------------------------------
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
check("ten locale files were read", Object.keys(messages).length === 10);
const NEEDED = [
  ["sidebar", "rail", "chats"],
  ["sidebar", "rail", "allConversations"],
  ["dashboard", "chat", "moveToProject"],
  ["dashboard", "chat", "undo"],
  ["dashboard", "chat", "deleteFailed"],
  ["dashboard", "chats", "title"],
  ["dashboard", "chats", "searchPlaceholder"],
  ["dashboard", "chats", "noMatches"],
  ["pageTitle", "chats"],
];
const at = (o, path) => path.reduce((v, k) => (v == null ? v : v[k]), o);
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

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
