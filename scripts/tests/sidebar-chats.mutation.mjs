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
const SIDEBAR = "src/components/dashboard/sidebar.tsx";
const PAGE = "src/app/dashboard/chats/page.tsx";
const FLAGS = "src/lib/flags/flags.ts";
const EN = "messages/en.json";
const WORKSPACE = "src/components/chats/chats-workspace.tsx";
const COLUMN = "src/components/chat/conversation-column.tsx";
const CHAT_PAGE = "src/app/dashboard/chat/page.tsx";

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
      name: "the two rows the owner removed come back",
      file: RAIL,
      from: '  { key: "ionexaChat", href: "/dashboard/chat", match: [CHATS_HREF] },',
      to: '  { key: "new", href: "/dashboard/overview" },\n  { key: "chats", href: CHATS_HREF },',
      expect: "the rail is Logo, Ionexa Chat, Coding, All tools",
    },
    {
      name: "the row keeps its key but opens the list instead of the chat",
      file: RAIL,
      from: '  { key: "ionexaChat", href: "/dashboard/chat", match: [CHATS_HREF] },',
      to: '  { key: "ionexaChat", href: CHATS_HREF },',
      expect: "the first row is Ionexa Chat, and it opens the Chat",
    },
    {
      // WITHOUT THE match LIST, THE LIST PAGE LIGHTS NOTHING. under()
      // compares path segments, and /dashboard/chats is not under
      // /dashboard/chat — so «Όλες οι συνομιλίες» would land the person
      // on a page whose own rail says they are nowhere.
      // (No backtick in this comment on purpose: the strict reader this
      // file's header describes treats one as opening a string.)
      name: "the list page stops belonging to the row that leads to it",
      file: RAIL,
      from: '  { key: "ionexaChat", href: "/dashboard/chat", match: [CHATS_HREF] },',
      to: '  { key: "ionexaChat", href: "/dashboard/chat" },',
      expect: "the page with every conversation belongs to that same row",
    },
    {
      name: "the switch comes back as a second rail builder",
      file: RAIL,
      from: "export const SETTINGS_HREF",
      to: "export function railRows(on: boolean) { return on ? RAIL_ROWS : RAIL_ROWS; }\nexport const SETTINGS_HREF",
      expect: "there is no second rail to build",
    },
    {
      name: "activeRail ignores the rail it was given and always uses the old one",
      file: RAIL,
      from: "  for (const row of rows) {\n    if (under(pathname, row.href)) return { key: row.key };",
      to: "  for (const row of RAIL_ROWS) {\n    if (under(pathname, row.href)) return { key: row.key };",
      expect: "follows the rail it is GIVEN, not the one it knows",
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
      name: "Chat keeps the open/closed state the deleted drawer needed",
      file: CHAT_WORKSPACE,
      from: "export function ChatWorkspace({",
      to: "const sidebarOpen = false;\nexport function ChatWorkspace({",
      expect: "nor keeps the open/closed state it needed",
    },
    {
      name: "the sidebar is handed the conversations again",
      file: SIDEBAR,
      from: "  recent = [],\n}: {",
      to: "  recent = [],\n  conversations = [],\n}: {",
      expect: "the sidebar draws no conversations and takes no list to draw",
    },
    {
      name: "the sidebar draws its own list of conversations again",
      file: SIDEBAR,
      from: "        <div className=\"space-y-1 border-t border-divider px-2 py-3\">",
      to: "        <ConversationRows />\n        <div className=\"space-y-1 border-t border-divider px-2 py-3\">",
      expect: "the sidebar draws no conversations and takes no list to draw",
    },
    {
      name: "the sidebar gets its capped list back, and the link out of it",
      file: SIDEBAR,
      from: "const RAIL_ICONS: Record<DrawnRailKey, LucideIcon> =",
      to: "const RECENT_CONVERSATIONS = 15;\nconst RAIL_ICONS: Record<DrawnRailKey, LucideIcon> =",
      expect: "and the sidebar has no list left to cap",
    },
    {
      name: "the favourite star does not come across from the drawer",
      file: ROWS,
      from: "          <FavoriteButton",
      to: "          <span data-not-the-star",
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
      name: "the Chats page goes back behind a switch, so most accounts 404",
      file: PAGE,
      from: "export default async function ChatsPage(",
      to: "async function gate(user: { id: string }) { if (!(await isFeatureOn(\"chats-page\", user))) notFound(); }\nexport default async function ChatsPage(",
      expect: "the page is open to everybody, with no switch in front of it",
    },
    {
      name: "the switch is declared again, with nothing reading it",
      file: FLAGS,
      from: '  "all-tools-tiles":',
      to: '  "chats-page": "Η σελίδα με όλες τις συνομιλίες",\n  "all-tools-tiles":',
      expect: "chats-page is no longer a declared switch",
    },
    {
      name: "the heading comes back to the message files, ready to be drawn again",
      file: EN,
      from: '      "ionexaChat": "Ionexa Chat",',
      to: '      "recentChats": "Recent chats",\n      "ionexaChat": "Ionexa Chat",',
      expect: "sidebar.rail.recentChats is gone from all ten",
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

    // ---- the column, and the defect it brought back ----------------
    {
      name: "the column's rows navigate to the screen they are already on",
      file: ROWS,
      from: "            if (onOpen) {\n              onOpen(row.id);\n              return;\n            }",
      to: "",
      expect: "a row hands its id to the caller when the caller wants it",
    },
    {
      name: "the column stops asking to open the thread in place",
      file: COLUMN,
      from: "          onOpen={onOpen}",
      to: "",
      expect: "the column is the caller that wants it",
    },
    {
      name: "opening from the column changes the address and nothing else",
      file: CHAT_WORKSPACE,
      from: "    lastDeepLink.current = id;\n    selectConversation(id);",
      to: "    lastDeepLink.current = id;",
      expect: "opening from the column switches the thread, then corrects the address",
    },
    {
      name: "the deep link goes back to running once per mount",
      file: CHAT_WORKSPACE,
      from: "  const lastDeepLink = useRef<string | null>(null);\n  useEffect(() => {\n    if (!initialConversationId || lastDeepLink.current === initialConversationId) return;\n    lastDeepLink.current = initialConversationId;",
      to: "  const deepLinkedRef = useRef(false);\n  const lastDeepLink = useRef<string | null>(null);\n  useEffect(() => {\n    if (deepLinkedRef.current || !initialConversationId) return;\n    deepLinkedRef.current = true;",
      expect: "the deep link follows the address every time it changes, not once per mount",
    },
    {
      name: "the chat page leaves its conversation list to the policy alone",
      file: CHAT_PAGE,
      from: '      .select("id, title, is_pinned, created_at, updated_at")\n      .eq("user_id", user.id)',
      to: '      .select("id, title, is_pinned, created_at, updated_at")',
      expect: "the chat page asks for this account's conversations by name",
    },
    {
      name: "...and its projects too",
      file: CHAT_PAGE,
      from: '    .eq("user_id", user.id)\n    .order("created_at", { ascending: false })',
      to: '    .order("created_at", { ascending: false })',
      expect: "and for its projects the same way",
    },
];

runMutations({
  name: "sidebar-chats",
  gate: "scripts/tests/sidebar-chats.test.mjs",
  targets: [RAIL, ROWS, ROUTE, MEMBERS, LATER, CHAT_WORKSPACE, SIDEBAR, FLAGS, EN, PAGE, WORKSPACE, COLUMN, CHAT_PAGE],
  mutants: MUTANTS,
});
