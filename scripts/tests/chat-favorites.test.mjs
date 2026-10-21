// Starring an Ionexa Chat conversation.
//
// Favourites already covered modules, websites, missions, documents and
// the timeline — everything EXCEPT the surface people most want to come
// back to. A conversation holds the reasoning, not just the output.
//
// The thing that can silently go wrong here is not the star: it is the
// three places that have to agree about what "starrable" means. The
// toggle route's allow-list, the favourites page's grouping and the
// button itself all read lib/favoritable.ts, so a conversation that the
// UI lets you star but the route rejects is exactly what the registry
// exists to prevent.
//
// Run: node scripts/tests/chat-favorites.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const fav = await loadTs("src/lib/favoritable.ts");
const { FAVORITABLE, getFavoritableByTable, isFavoritableTable } = fav;

console.log("== 1. the registry knows about conversations (δ) ==");
const conf = getFavoritableByTable("chat_conversations");
check("chat_conversations is registered", Boolean(conf));
check("it is grouped under the chat slug", conf?.slug === "chat", `got ${conf?.slug}`);
check("its headline column is `title`", conf?.headlineKey === "title");
check(
  "the toggle route's allow-list accepts it",
  isFavoritableTable("chat_conversations") === true,
  "api/favorites/toggle rejects anything isFavoritableTable() says no to — the star would draw and then fail."
);
check(
  "the deep link carries the conversation id",
  conf?.hrefFor("abc-123") === "/dashboard/chat?c=abc-123",
  `got ${conf?.hrefFor("abc-123")}`
);
// A slug collision would make two different things share one group.
const slugs = FAVORITABLE.map((f) => f.slug);
check("no duplicate slug in the registry", new Set(slugs).size === slugs.length);

console.log("\n== 2. the star in the conversation list (α) ==");
// WHERE THE LIST IS NOW. There were two for a day — a drawer inside
// Chat and the sidebar's «Recent chats» — and on 2026-10-16 the owner
// had the sidebar section taken out and the drawer was deleted with it
// (sidebar-chats.test.mjs asserts the file is gone). ONE FILE draws
// every list there is; since 2026-10-17 it draws two surfaces, the
// Chats page and the column inside Chat.
const list = strip(readFileSync("src/components/dashboard/conversation-rows.tsx", "utf8"));
const column = strip(readFileSync("src/components/chat/conversation-column.tsx", "utf8"));
const chatsPageList = strip(readFileSync("src/components/chats/chats-workspace.tsx", "utf8"));
check("the list renders the shared FavoriteButton", /<FavoriteButton/.test(list));
check("...against chat_conversations", /table="chat_conversations"/.test(list));
check("...seeded from the row's own state", /initialFavorited=\{Boolean\(row\.is_favorited\)\}/.test(list));
// AND IT IS BEHIND A CONDITION AGAIN — ON PURPOSE, AND SAID OUT LOUD.
//
// The star was drawn only when the list was NOT the sidebar's
// (`{!sidebar && (`) until 2026-10-16, because a 240px column had no
// room. That went with the sidebar's list, and this check asserted
// that NO condition was left, because a new one would have hidden the
// star on the only screen that had it.
//
// There are two screens again since 2026-10-17, and the narrow one is
// 280px. Measured on a real build that day: a row there had 58px for
// the title and `break-words` cut a name mid-syllable. So `dense`
// takes the date and the star off in the column — and this check is
// now the pair of claims that replaces the absence, held BOTH ways so
// neither half can rot:
//
//   the Chats page does NOT ask for dense, so its rows keep the star;
//   the column DOES, deliberately, and the star is one press away at
//   «Όλες οι συνομιλίες».
//
// THE THIRD CLAIM IS THE ONE THAT MATTERS. What made the old variant a
// defect was not that it hid a star: it was that a second form of the
// list could drift from the first. So `dense` is required to appear
// exactly four times in the file — the parameter, its type, and two
// guards — and those two guards are required to be the date and the
// star. An action behind it would be a fifth.
const denseUses = (list.match(/\bdense\b/g) ?? []).length;
check(
  `...and the narrow form is the date and the star, nothing else (${denseUses} uses of dense)`,
  denseUses === 4 &&
    /\{!dense && \(\s*<span className="shrink-0 text-xs text-muted"/.test(list) &&
    /\{!dense && \(\s*<div\s*className=\{`shrink-0 transition-opacity/.test(list),
  "a fifth use of `dense` is a second form of the list, which is how the star got two states that disagreed"
);
check(
  "...the column asks for it",
  /<ConversationRows[\s\S]{0,240}\bdense\b/.test(column),
  "the 280px surface"
);
check(
  "...and the Chats page does not, so every row there keeps its star",
  /<ConversationRows/.test(chatsPageList) && !/\bdense\b/.test(chatsPageList),
  "the page with room is where the star lives"
);
check(
  "...and no older variant came back with it",
  !/\{!sidebar && \(/.test(list) && !/ConversationRowsVariant/.test(list)
);
// A starred row must not vanish when the pointer leaves it.
check("a starred row keeps its star visible at rest", /is_favorited\s*\?\s*"opacity-100"/.test(list));
check("an unstarred one appears on hover or focus", /focus-within:opacity-100 group-hover\/row:opacity-100/.test(list));

console.log("\n== 3. the star in the open conversation (β) ==");
const ws = strip(readFileSync("src/components/chat/chat-workspace.tsx", "utf8"));
check("the header renders it", /<FavoriteButton/.test(ws));
check("...only once a conversation exists", /activeConversation && \(/.test(ws));
// TRAILING EDGE, NOT "RIGHT". ms-auto is margin-inline-start:auto, which
// is identical to ml-auto in the nine left-to-right locales and is the
// correct side in Arabic — see lib/text-direction.ts and
// scripts/tests/rtl.test.mjs. The assertion is not weakened by the
// rename: it still names one exact class pair, and it now names the one
// that is right in all ten.
check("...pinned to the trailing edge of the header bar", /ms-auto shrink-0/.test(ws));
// KEYED ON THE STARRED STATE, NOT JUST THE ID. The button seeds itself
// from `initialFavorited` once, so without the state in the key it
// keeps the star it mounted with when the row behind it changes —
// which is what happens the moment you come back from the Chats page
// having starred the conversation there.
check("...and re-mounts when the row behind it changes", /key=\{`\$\{activeConversation\.id\}:\$\{activeConversation\.is_favorited\}`\}/.test(ws));
check("the header writes the click back onto the row", /function toggleFavorite\(id: string, favorited: boolean\)/.test(ws));
check("a brand-new conversation starts unstarred", /is_favorited: false/.test(ws));

console.log("\n== 4. the page actually resolves starred state (α+β need real data) ==");
const page = strip(readFileSync("src/app/dashboard/chat/page.tsx", "utf8"));
check("it reads user_favorites in one batched call", /loadFavoriteIds\(/.test(page));
check("...for this table", /"chat_conversations"/.test(page));
check("...and folds the result onto every row", /is_favorited: favoritedIds\.has\(c\.id\)/.test(page));
check("the ?c= deep link is accepted", /searchParams\.c/.test(page));
check(
  "...but only for a conversation the user actually owns",
  /conversations\.some\(\(c\) => c\.id === searchParams\.c\)/.test(page),
  "an unvalidated id from the URL would let the workspace ask for someone else's thread."
);

console.log("\n== 5. the design is the SAME control, not a lookalike (α, β) ==");
const btn = readFileSync("src/components/favorites/favorite-button.tsx", "utf8");
// 44x44, raised from 36x36.
//
// This check was written to pin the star and the card's "..." menu to the
// SAME size, so the two controls sitting side by side on every card could
// not drift apart — which is a real thing to protect and is why the check
// exists. It pinned the NUMBER as well, and the number was wrong: 36px is
// under the 44px minimum a finger needs, and layout-stress.prodtest.mjs
// measured this exact button as one of the smallest tap targets in the
// app, on every card on every list screen.
//
// So the number moves and the pairing is now asserted rather than implied:
// both controls are read, and they have to agree.
check("44x44", /h-11 w-11/.test(btn));
const cardMenu = readFileSync("src/components/ui/card-menu.tsx", "utf8");
check(
  "...and the card menu it sits beside is the same size",
  /h-11 w-11/.test(cardMenu),
  "the star and the ... menu are adjacent on every card; different sizes read as a mistake."
);
check("resting ring when unstarred", /ring-1 ring-inset ring-foreground\/10/.test(btn));
// FILLED WHEN STARRED, AND NO LONGER GLOWING. Redesign phase 4 removed
// the 16px orange bloom from this button along with every other one;
// what says "starred" is the fill, the accent text colour and the solid
// star, which are three signals and none of them needs light. The glow
// is FORBIDDEN here rather than merely absent, so putting it back turns
// this red instead of quietly re-introducing the thing the round removed.
// Since 2026-10-04 the fill is the text colour at 20%: the design has no
// accent to fill it with (docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN).
check("filled when starred", /bg-foreground\/20 text-foreground/.test(btn));
check("...and it does not glow", !/0_0_16px/.test(btn) && !/0_0_\d\dpx_.*rgba\(249,115,22/.test(btn));
check("the star fills only when favourited", /fill=\{favorited \? "currentColor" : "none"\}/.test(btn));
check("corner variant still pins at 12px from the trailing corner", /absolute end-3 top-3/.test(btn));
// Both chat surfaces use the shared button rather than a copy.
check("the chat surfaces import the shared component, not a fork",
  /from "@\/components\/favorites\/favorite-button"/.test(list) &&
  /from "@\/components\/favorites\/favorite-button"/.test(ws));

console.log("\n== 6. the favourites page groups them (γ) ==");
// Grouping is registry-driven: lib/favorites.ts walks FAVORITABLE, so
// being in the registry IS being on the page. Assert the mechanism.
const favLib = strip(readFileSync("src/lib/favorites.ts", "utf8"));
check("group order walks the registry", /for \(const config of FAVORITABLE\)/.test(favLib));
check("headlines are read via the registry's headlineKey", /row\[config\.headlineKey\]/.test(favLib));
// The group heading resolves through sidebar.items.<slug>.
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
check("`chat` has a sidebar label to title the group with", typeof en.sidebar?.items?.chat === "string");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
