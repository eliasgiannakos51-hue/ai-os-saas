#!/usr/bin/env node
/*
 * A STAR THAT DRAWS AND THEN FAILS.
 *
 * Favourites covered modules, websites, missions, documents and the
 * timeline — everything except the surface people most want to come back
 * to. Adding conversations meant three places agreeing about what
 * "starrable" is: the toggle route's allow-list, the favourites page's
 * grouping, and the button itself. All three read lib/favoritable.ts, and
 * the registry exists precisely so a conversation the UI lets you star
 * cannot be one the route rejects.
 *
 * So the mutants below are the disagreements. A registry entry removed
 * while both stars keep rendering; a deep link that loses the id it was
 * for; two surfaces whose shared state stops being shared; and — the one
 * that is not cosmetic — the ?c= parameter reaching the workspace without
 * being checked against the conversations this account actually owns.
 *
 * Run: node scripts/tests/chat-favorites.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/chat-favorites.test.mjs";
const REGISTRY = "src/lib/favoritable.ts";
const PAGE = "src/app/dashboard/chat/page.tsx";
const SIDEBAR = "src/components/chat/conversation-sidebar.tsx";
const WORKSPACE = "src/components/chat/chat-workspace.tsx";
const BUTTON = "src/components/favorites/favorite-button.tsx";
const FAV_LIB = "src/lib/favorites.ts";

const MUTANTS = [
  {
    // THE ID FROM THE URL, UNCHECKED. Everything else in this file is a
    // star that looks wrong; this one hands the workspace a conversation
    // id nobody verified belongs to the caller.
    name: "the ?c= deep link is trusted without checking the caller owns that conversation",
    file: PAGE,
    from: "          searchParams.c && conversations.some((c) => c.id === searchParams.c)",
    to: "          searchParams.c",
    expect: "only for a conversation the user actually owns",
  },
  {
    // THE DEEP LINK LOSES WHAT IT IS FOR. A starred conversation then
    // opens a blank new chat, which is exactly the thing starring was
    // added to prevent.
    name: "the favourite's link drops the conversation id",
    file: REGISTRY,
    from: "    hrefFor: (id) => `/dashboard/chat?c=${id}`,",
    to: "    hrefFor: () => `/dashboard/chat`,",
    expect: "deep link carries the conversation id",
  },
  {
    // TWO THINGS IN ONE GROUP. Slugs title the groups on the favourites
    // page and are the registry's identity; a collision silently merges
    // two kinds of row under one heading.
    name: "a second registry entry takes the chat slug",
    file: REGISTRY,
    from: '    table: "user_websites",\n    slug: "websiteBuilder",',
    to: '    table: "user_websites",\n    slug: "chat",',
    expect: "no duplicate slug",
  },
  {
    // THE HEADLINE COLUMN CHANGED UNDER THE PAGE. lib/favorites.ts reads
    // `row[config.headlineKey]`, so a wrong key renders a row of blanks
    // on the favourites page while the star itself still works.
    name: "the conversation's headline column is renamed in the registry only",
    file: REGISTRY,
    from: '    titleKey: "sidebar.items.chat",\n    headlineKey: "title",',
    to: '    titleKey: "sidebar.items.chat",\n    headlineKey: "name",',
    expect: "headline column is `title`",
  },
  {
    // STARRED STATE NEVER ARRIVES. The batched read still happens and the
    // stars still draw — all of them empty, on every load, until the
    // first click.
    name: "the page stops folding the starred ids onto the rows",
    file: PAGE,
    from: "    is_favorited: favoritedIds.has(c.id),",
    to: "    is_favorited: false,",
    expect: "folds the result onto every row",
  },
  {
    // A STAR THAT HIDES WHEN THE POINTER LEAVES. Starring is a memory
    // aid; a starred row that looks identical to an unstarred one at rest
    // has none of that value.
    name: "a starred row's star fades out again at rest",
    file: SIDEBAR,
    from: '                          conversation.is_favorited\n                            ? "opacity-100"',
    to: '                          conversation.is_favorited\n                            ? "opacity-0 group-hover/row:opacity-100"',
    expect: "keeps its star visible at rest",
  },
  {
    // THE TWO COPIES STOP AGREEING. The header button is keyed on the
    // conversation AND its starred state so it re-mounts when the sidebar
    // copy is clicked; without that the header keeps showing the old star.
    name: "the header star stops re-mounting when the sidebar copy is toggled",
    file: WORKSPACE,
    from: "key={`${activeConversation.id}:${activeConversation.is_favorited}`}",
    to: "key={activeConversation.id}",
    expect: "re-mounts when the sidebar copy toggles",
  },
  {
    // BELOW THE MINIMUM TAP TARGET. 36px is what this was, and
    // layout-stress.prodtest.mjs measured it as one of the smallest
    // targets in the app — on every card on every list screen.
    name: "the star shrinks back under the 44px tap target",
    file: BUTTON,
    from: 'corner ? "absolute end-3 top-3 h-11 w-11" : "h-11 w-11",',
    to: 'corner ? "absolute end-3 top-3 h-9 w-9" : "h-9 w-9",',
    expect: "44x44",
  },
  {
    // THE GLOW COMES BACK. Redesign phase 4 removed the orange bloom from
    // every button; the gate forbids it here rather than merely not
    // asserting it, so re-adding it is a failure and not a silent revert.
    name: "the removed orange glow is put back on the starred state",
    file: BUTTON,
    from: '"bg-white/[0.04] text-muted shadow-[0_0_0_1px_rgba(255,255,255,0.09)]',
    to: '"bg-white/[0.04] text-muted shadow-[0_0_16px_rgba(249,115,22,0.5)]',
    expect: "does not glow",
  },
  {
    // GROUPING STOPS BEING REGISTRY-DRIVEN. Hard-coding the list is how
    // the favourites page and the toggle route drift apart: a new
    // favouritable kind would be starrable and invisible.
    name: "the favourites page hard-codes its groups instead of walking the registry",
    file: FAV_LIB,
    from: "for (const config of FAVORITABLE) {",
    to: "for (const config of FAVORITABLE.filter((c) => c.slug !== \"chat\")) {",
    expect: "group order walks the registry",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"] };
  }
}

console.log("chat-favorites mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [f, t] of originals) writeFileSync(f, t); };

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, m.all ? original.split(m.from).join(m.to) : original.replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restoreAll(); }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(after.green ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("The three places that must agree about a starrable conversation cannot drift without this going red.");
