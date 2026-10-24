#!/usr/bin/env node
/*
 * CAN mcp-security.test.mjs AND mcp-data-not-instructions.test.mjs SEE THE
 * RULES OF CONNECT BY ADDRESS COME LOOSE?
 *
 * The token stored without its per-user binding, a store query that forgets
 * the user, a route without its sign-in check, the table readable by anyone
 * or its ciphertext granted back, a route that returns a token; and the
 * owner's rule «nothing that changes something runs without a press»: the
 * approval check removed or loosened, the ask running a tool that is not
 * read-only, the screen sending the press without one, the model fed a
 * result, the guarded lookup and the address check taken out of the client's
 * road, an eval of something an app said.
 *
 * Run: node scripts/tests/mcp-security.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/mcp-security.test.mjs";
const DATA_GATE = "scripts/tests/mcp-data-not-instructions.test.mjs";
const STORE = "src/lib/mcp/store.ts";
const MIGRATION = "supabase/migrations/20261026000000_mcp_servers.sql";
const LIST_ROUTE = "src/app/api/mcp/route.ts";
const DELETE_ROUTE = "src/app/api/mcp/[id]/route.ts";
const REFRESH_ROUTE = "src/app/api/mcp/[id]/refresh/route.ts";
const RUN_ROUTE = "src/app/api/mcp/[id]/run/route.ts";
const CALL_ROUTE = "src/app/api/mcp/[id]/call/route.ts";
const SCREEN = "src/components/integrations/mcp-apps.tsx";
const CLIENT = "src/lib/mcp/client.ts";
const GDPR = "src/lib/gdpr/user-data-registry.ts";

const MUTANTS = [
  // ---- tokens
  { name: "the token is encrypted without the person's binding", file: STORE, from: 'encryptSecret(params.token, tokenContext(params.userId, "mcp", "access"))', to: 'encryptSecret(params.token, "mcp")', expect: "bound to THIS user" },
  { name: "the token is decrypted without the person's binding", file: STORE, from: 'decryptSecret(row.auth_token_encrypted, tokenContext(userId, "mcp", "access"))', to: 'decryptSecret(row.auth_token_encrypted, "mcp")', expect: "bound to THIS user" },
  { name: "a second function decrypts a token", file: STORE, from: "export async function deleteMcpServer(", to: 'export function leak(row: { auth_token_encrypted: string }, userId: string) { return decryptSecret(row.auth_token_encrypted, tokenContext(userId, "mcp", "access")); }\nexport async function deleteMcpServer(', expect: "only getMcpServerForUse decrypts" },
  { name: "the summary carries the ciphertext", file: STORE, from: "    hasToken: Boolean(row.auth_token_encrypted),", to: "    hasToken: Boolean(row.auth_token_encrypted),\n    auth_token_encrypted: row.auth_token_encrypted,", expect: "the store's summary carries hasToken, never the ciphertext" },
  { name: "the refresh route stops being a token user... and the list route starts being one", file: LIST_ROUTE, from: "return NextResponse.json({ ok: true, servers: await listMcpServers(user.id) });", to: "const found = { token: \"\" }; return NextResponse.json({ ok: true, servers: await listMcpServers(user.id), found: found.token });", expect: "the token goes only to the three routes" },
  { name: "a route returns the token", file: REFRESH_ROUTE, from: "return NextResponse.json({ ok: true, server: servers.find((s) => s.id === id) ?? null });", to: "return NextResponse.json({ ok: true, server: servers.find((s) => s.id === id) ?? null, token: found.token });", expect: "no route puts a token into a response" },
  { name: "a token that cannot be encrypted is stored anyway", file: LIST_ROUTE, from: 'if (token && !encryptionAvailable()) return NextResponse.json({ ok: false, code: "encryption_unavailable" }, { status: 503 });', to: "", expect: "fails closed" },
  { name: "the screen keeps the token in its field after connecting", file: SCREEN, from: '      setToken("");\n', to: "", expect: "keeps no copy" },
  { name: "the token field shows what is typed", file: SCREEN, from: 'type="password"', to: 'type="text"', expect: "keeps no copy" },
  // ---- the table
  { name: "row level security is off", file: MIGRATION, from: "alter table public.mcp_servers enable row level security;", to: "", expect: "row level security is on" },
  { name: "anybody may read any row", file: MIGRATION, from: "  using (auth.uid() = user_id);", to: "  using (true);", expect: "a select policy for the owner of the row" },
  { name: "the client roles may write", file: MIGRATION, from: "revoke insert, update, delete on public.mcp_servers from anon, authenticated;\n", to: "", expect: "insert, update and delete are revoked from the client roles" },
  { name: "the ciphertext is granted back to the person", file: MIGRATION, from: "grant select (id, user_id, name, url, tools, tools_checked_at, status, created_at)", to: "grant select (id, user_id, name, url, auth_token_encrypted, tools, tools_checked_at, status, created_at)", expect: "select is revoked and granted back on every column EXCEPT the ciphertext" },
  { name: "the rows outlive the account", file: MIGRATION, from: "references auth.users(id) on delete cascade", to: "references auth.users(id)", expect: "the rows go with the account" },
  { name: "the export carries the ciphertext", file: GDPR, from: 'redactColumns: ["auth_token_encrypted"],\n  },\n', to: "redactColumns: [],\n  },\n", expect: "in the account export, with its ciphertext column redacted" },
  // ---- who is asking
  { name: "a delete by id alone", file: STORE, from: '.delete().eq("id", id).eq("user_id", userId).select("id")', to: '.delete().eq("id", id).select("id")', expect: "every read, update and delete of a row is scoped by user_id" },
  { name: "a fetch by id alone", file: STORE, from: '.select("*").eq("id", id).eq("user_id", userId).maybeSingle()', to: '.select("*").eq("id", id).maybeSingle()', expect: "a row is fetched by id AND user together" },
  { name: "the list is not scoped", file: STORE, from: '    .select("*")\n    .eq("user_id", userId)\n    .order("created_at", { ascending: false })', to: '    .select("*")\n    .order("created_at", { ascending: false })', expect: "every read, update and delete of a row is scoped by user_id" },
  { name: "the delete route forgets the sign-in", file: DELETE_ROUTE, from: '  if (!user) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });\n', to: "", expect: "delete: the caller is authenticated" },
  { name: "the call route forgets the sign-in", file: CALL_ROUTE, from: '  if (!user) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });\n', to: "", expect: "call: the caller is authenticated" },
  { name: "the run route reads the app without the person", file: RUN_ROUTE, from: "getMcpServerForUse(user.id, id)", to: "getMcpServerForUse(String(body.userId ?? user.id), id)", expect: "no route takes a user id from the request" },
  { name: "the free cap goes", file: "src/lib/mcp/limits.ts", from: "  free: 1,", to: "  free: 0,", expect: "a plan cap holds the list" },
  { name: "adding is not rate limited", file: LIST_ROUTE, from: 'scope: "mcp_add", identifier: user.id', to: 'scope: "mcp_add", identifier: "everyone"', expect: "adding and calling are rate limited per person" },
  // ---- approval and data
  { name: "the approval check is removed", gate: DATA_GATE, file: CALL_ROUTE, from: "    if (needsApproval(tool) && body.approved !== true) {\n      return NextResponse.json({ ok: false, code: \"approval_required\" }, { status: 409 });\n    }\n", to: "", expect: "the call route refuses a tool that needs a press" },
  { name: "the approval check accepts anything truthy", gate: DATA_GATE, file: CALL_ROUTE, from: "body.approved !== true", to: "!body.approved", expect: "the check is on `=== true`" },
  { name: "the ask runs a tool that is not read-only", gate: DATA_GATE, file: RUN_ROUTE, from: "    if (!chosen.readOnly) return NextResponse.json({ ok: true, plan: chosen, needsApproval: true, creditsCharged: settlement.creditsCharged });\n", to: "", expect: "only a tool the app marked read-only runs inside the ask" },
  { name: "a tool the app never listed may be called", gate: DATA_GATE, file: CALL_ROUTE, from: '    if (!tool) return NextResponse.json({ ok: false, code: "unknown_tool" }, { status: 400 });', to: "", expect: "the tool must be one the app listed" },
  { name: "the press is sent without one: approved is always true", gate: DATA_GATE, file: SCREEN, from: "body: JSON.stringify({ request: text }),", to: 'body: JSON.stringify({ request: text, approved: true }),', expect: "the ONLY place the screen sends approved: true" },
  { name: "the plan runs by itself when it is shown", gate: DATA_GATE, file: SCREEN, from: "  function decline(id: string) {", to: "  useEffect(() => { for (const s of servers) if (plans[s.id]?.needsApproval) void approve(s); });\n  function decline(id: string) {", expect: "the press is a button the person presses" },
  { name: "a result is rendered as markup", gate: DATA_GATE, file: SCREEN, from: "<pre className=\"field-box mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 text-xs\">{plan.result.text}</pre>", to: "<pre className=\"mt-1\" dangerouslySetInnerHTML={{ __html: plan.result.text }} />", expect: "the screen shows a result as text in a <pre>" },
  { name: "an app's description is evaluated", gate: DATA_GATE, file: CLIENT, from: "const clip = (value: unknown, max: number): string =>", to: "const run = (code: string) => eval(code);\nconst clip = (value: unknown, max: number): string =>", expect: "no eval, no new Function" },
  { name: "the guarded lookup is taken out of the road", gate: DATA_GATE, file: CLIENT, from: "        lookup: guardedLookup as never,\n", to: "", expect: "the client opens every connection through the guarded lookup" },
  { name: "a redirect is no longer refused", gate: DATA_GATE, file: CLIENT, from: "        if (status >= 300 && status < 400) {", to: "        if (status >= 600) {", expect: "refuses a redirect instead of following it" },
  { name: "the address is not parsed first", gate: DATA_GATE, file: CLIENT, from: "  const parsed = parseMcpUrl(rawUrl);\n  if (!parsed.ok) throw new McpError(\"bad_url\", parsed.reason);", to: "  const parsed = { ok: true as const, url: new URL(rawUrl) };", expect: "parses every address first" },
  { name: "the result is fed back to the model", gate: DATA_GATE, file: CALL_ROUTE, from: 'import { callMcpTool, McpError } from "@/lib/mcp/client";', to: 'import { callMcpTool, McpError } from "@/lib/mcp/client";\nimport { runCompletion } from "@/lib/ai/providers/complete";\nvoid runCompletion;', expect: "call makes no model call at all" },
  { name: "the add route connects before it checks the address", gate: DATA_GATE, file: LIST_ROUTE, from: "    const parsed = parseMcpUrl(rawUrl);\n    if (!parsed.ok) return NextResponse.json({ ok: false, code: parsed.reason }, { status: 400 });", to: "    const parsed = { ok: true as const, url: new URL(rawUrl) };", expect: "the add route checks the address before it connects" },
  { name: "the app's own call reserves credits", gate: DATA_GATE, file: CALL_ROUTE, from: "    const result = await callMcpTool(", to: "    const reserved = await (await import(\"@/lib/billing/reservations\")).reserveCredits(user.id, 1, \"mcp_call\");\n    void reserved;\n    const result = await callMcpTool(", expect: "the app's own call is free" },
];

runMutations({
  name: "mcp-security",
  gate: GATE,
  targets: [STORE, MIGRATION, LIST_ROUTE, DELETE_ROUTE, REFRESH_ROUTE, RUN_ROUTE, CALL_ROUTE, SCREEN, CLIENT, GDPR, "src/lib/mcp/limits.ts"],
  mutants: MUTANTS,
});
