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
const sidebar = strip(readFileSync("src/components/chat/conversation-sidebar.tsx", "utf8"));
check("the list renders the shared FavoriteButton", /<FavoriteButton/.test(sidebar));
check("...against chat_conversations", /table="chat_conversations"/.test(sidebar));
check("...seeded from the row's own state", /initialFavorited=\{conversation\.is_favorited\}/.test(sidebar));
check("...and reports the toggle up so the header copy stays in step", /onToggled=\{\(fav\) => onToggleFavorite\(conversation\.id, fav\)\}/.test(sidebar));
// A starred row must not vanish when the pointer leaves it.
check("a starred row keeps its star visible at rest", /is_favorited\s*\?\s*"opacity-100"/.test(sidebar));
check("an unstarred one appears on hover or focus", /focus-within:opacity-100 group-hover\/row:opacity-100/.test(sidebar));

console.log("\n== 3. the star in the open conversation (β) ==");
const ws = strip(readFileSync("src/components/chat/chat-workspace.tsx", "utf8"));
check("the header renders it", /<FavoriteButton/.test(ws));
check("...only once a conversation exists", /activeConversation && \(/.test(ws));
check("...pinned to the right of the header bar", /ml-auto shrink-0/.test(ws));
check("...and re-mounts when the sidebar copy toggles", /key=\{`\$\{activeConversation\.id\}:\$\{activeConversation\.is_favorited\}`\}/.test(ws));
check("the two copies share ONE piece of state", /function toggleFavorite\(id: string, favorited: boolean\)/.test(ws));
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
check("resting ring when unstarred", /shadow-\[0_0_0_1px_rgba\(255,255,255,0\.09\)\]/.test(btn));
check("filled amber with a glow when starred", /bg-orange-500\/20/.test(btn) && /0_0_16px_-2px_rgba\(249,115,22,0\.6\)/.test(btn));
check("the star fills only when favourited", /fill=\{favorited \? "currentColor" : "none"\}/.test(btn));
check("corner variant still pins at 12px", /absolute right-3 top-3/.test(btn));
// Both chat surfaces use the shared button rather than a copy.
check("the chat surfaces import the shared component, not a fork",
  /from "@\/components\/favorites\/favorite-button"/.test(sidebar) &&
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
