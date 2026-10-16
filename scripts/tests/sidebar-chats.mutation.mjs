// THE DEFECTS sidebar-chats.test.mjs HAS TO CATCH, put back one at a
// time. Each one is a thing that was true of this feature at some point
// while it was being written, or that the next person to touch it would
// plausibly do.
//
// Run: node scripts/tests/sidebar-chats.mutation.mjs
import { runMutations } from "./lib/mutation-runner.mjs";

const RAIL = "src/lib/nav/rail.ts";
const ROWS = "src/components/dashboard/conversation-rows.tsx";
const ROUTE = "src/app/api/conversations/[id]/route.ts";
const MEMBERS = "src/app/api/projects/[id]/members/route.ts";
const LATER = "src/lib/chat/delete-later.ts";
const CHAT_WORKSPACE = "src/components/chat/chat-workspace.tsx";
const PAGE = "src/app/dashboard/chats/page.tsx";
const WORKSPACE = "src/components/chats/chats-workspace.tsx";

// A NAMED ARRAY, NOT AN INLINE ONE. scripts/tests/lib/mutant-list.mjs
// finds the declaration below by name and EVALUATES it; anything else
// falls back to a regex that cannot see `edits:` lists, and the number
// of suites read that weaker way is a ceiling held at 19 by
// baselines.test.mjs. Writing the array inline breached it.
//
// AND THE NAME IS NOT SPELLED OUT IN THIS COMMENT, which cost a round:
// that reader does indexOf on the declaration's text, so a comment
// quoting it is found FIRST — and the bracket scan then starts inside
// a comment, where a backtick opens a string that never closes. The
// suite fell back for a sentence about not falling back.
const MUTANTS = [
    // ---- the rail --------------------------------------------------
    {
      name: "the switch changes nothing: the third row stays Chat",
      file: RAIL,
      from: 'chatsPage && row.key === "chat" ? { key: "chats" as const, href: CHATS_HREF }',
      to: 'false && row.key === "chat" ? { key: "chats" as const, href: CHATS_HREF }',
      expect: "open, the third row is Chats at /dashboard/chats",
    },
    {
      name: "the switch also drops a row, so the rails are different lengths",
      file: RAIL,
      from: "  return RAIL_ROWS.map((row) =>",
      to: "  return RAIL_ROWS.filter((r) => !chatsPage || r.key !== \"coding\").map((row) =>",
      expect: "the two rails are the same length",
    },
    {
      name: "activeRail ignores the rail it was given and always uses the old one",
      file: RAIL,
      from: "  for (const row of rows) if (under(pathname, row.href)) return { key: row.key };",
      to: "  for (const row of RAIL_ROWS) if (under(pathname, row.href)) return { key: row.key };",
      expect: "activeRail follows the rail it is given",
    },

    // ---- the delete, and whose row it is ---------------------------
    {
      name: "deleting another account's conversation answers 200 instead of 404",
      file: ROUTE,
      from: '    if (!deleted || deleted.length === 0) {\n      return fail("not_found", 404);\n    }',
      to: "",
      expect: "a row that was not this account's answers 404, not 200",
    },
    {
      name: "the delete stops being scoped to the signed-in account",
      file: ROUTE,
      from: '      .delete()\n      .eq("id", params.id)\n      .eq("user_id", user.id)\n      .select("id");',
      to: '      .delete()\n      .eq("id", params.id)\n      .select("id");',
      expect: "the delete is scoped by user_id as well as by id",
    },
    {
      name: "the members route takes any id it is handed, as it did before",
      file: MEMBERS,
      from: "    if (!(await ownsMember(supabase, user.id, String(table), memberId))) {\n      return NextResponse.json({ error: \"no_such_member\" }, { status: 404 });\n    }\n\n",
      to: "",
      expect: "the members route reads the member row back as the caller's own",
    },
    {
      name: "a move leaves the old project edge behind, so the conversation is in two",
      file: MEMBERS,
      from: '    const { error: clearError } = await supabase\n      .from("entity_links")\n      .delete()',
      to: '    const { error: clearError } = await supabase\n      .from("entity_links")\n      .select("id")',
      expect: "a move clears the previous project edge before writing the new one",
    },

    // ---- the Undo --------------------------------------------------
    {
      name: "the delete is sent at once, so there is nothing to undo",
      file: LATER,
      from: "    setTimeout(() => {\n      PENDING.delete(id);\n      commit();\n    }, windowMs)",
      to: "    setTimeout(() => {\n      PENDING.delete(id);\n    }, 0) && commit()",
      expect: "nothing is deleted during the window: the request is scheduled",
    },
    {
      name: "a tab closed inside the window drops the delete silently",
      file: LATER,
      from: '        void fetch(conversationDeleteUrl(id), { method: "DELETE", keepalive: true });',
      to: "        /* nothing */",
      expect: "a page that goes away still commits, with a real DELETE",
    },
    {
      name: "the flush goes back to sendBeacon, which can only POST",
      file: LATER,
      from: '        void fetch(conversationDeleteUrl(id), { method: "DELETE", keepalive: true });',
      to: "        navigator.sendBeacon?.(conversationDeleteUrl(id));",
      expect: "and NOT with sendBeacon, which can only send a POST",
    },

    // ---- one sidebar, and nothing lost -----------------------------
    {
      name: "the drawer inside Chat is drawn again, so there are two lists",
      file: CHAT_WORKSPACE,
      from: "          sidebarOpen && !chatsPage ? \"flex\" : \"hidden\"",
      to: '          sidebarOpen ? "flex" : "hidden"',
      expect: "the drawer inside Chat is not drawn when the switch is on",
    },
    {
      name: "the favourite star does not come across from the drawer",
      file: ROWS,
      from: "            <FavoriteButton",
      to: "            <span data-not-the-star",
      expect: "carried over: the favourite star",
    },
    {
      name: "the rows component goes back to talking to the database itself",
      file: ROWS,
      from: '        const res = await fetch(conversationDeleteUrl(id), {\n          method: "PATCH",',
      to: '        const res = await fetch(`/rest/v1/chat_conversations?id=eq.${id}`, {\n          method: "PATCH",',
      expect: "rename and pin go to api/conversations/[id] with PATCH",
    },

    // ---- the page --------------------------------------------------
    {
      name: "the Chats page is reachable with the switch shut",
      file: PAGE,
      from: '  if (!(await isFeatureOn("chats-page", user))) notFound();',
      to: "",
      expect: "the page is behind the switch and 404s when it is shut",
    },
    {
      name: "the title search goes back to toLowerCase, which is wrong in Greek",
      file: WORKSPACE,
      from: "      (c) => matchesSearch(displayConversationTitle(c.title) ?? \"\", q) || contentIds?.has(c.id)",
      to: "      (c) => (c.title ?? \"\").toLowerCase().includes(q.toLowerCase()) || contentIds?.has(c.id)",
      expect: "the Chats page searches titles with the folding matcher, not toLowerCase",
    },
    {
      name: "the search stops saying what it actually looked at",
      file: WORKSPACE,
      from: "{searching ? t(\"searching\") : t(\"searchedContent\", { scanned: CONTENT_ROWS_SCANNED })}",
      to: '{searching ? t("searching") : ""}',
      expect: "the content search says what it looked at",
    },
];

runMutations({
  name: "sidebar-chats",
  gate: "scripts/tests/sidebar-chats.test.mjs",
  targets: [RAIL, ROWS, ROUTE, MEMBERS, LATER, CHAT_WORKSPACE, PAGE, WORKSPACE],
  mutants: MUTANTS,
});
