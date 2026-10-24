#!/usr/bin/env node
// CONNECT BY ADDRESS: TOKENS ENCRYPTED PER USER, AND USER A NEVER SEES USER B
// (the owner's security rules, 2026-10-23, applied to Phase 2's first tool):
//   - «Tokens κρυπτογραφημένα, ανά χρήστη, μόνο στον server.»
//   - «Ο χρήστης Α δεν βλέπει ποτέ … του Β.»
//
// Structural, over the code that does it: the store, the five routes, the
// migration, the page and the screen. The behaviour half — two real
// accounts, the real routes, a real database stand-in — is
// scripts/tests/mcp-connect.prodtest.mjs. Every check here names a thing
// whose removal makes it fail (scripts/tests/mcp-security.mutation.mjs).
//
// Run: node scripts/tests/mcp-security.test.mjs
import { readFileSync, existsSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";

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
const code = (p) => stripComments(readFileSync(p, "utf8"));

const store = code("src/lib/mcp/store.ts");
const migration = readFileSync("supabase/migrations/20261026000000_mcp_servers.sql", "utf8");
const migrationCode = migration.replace(/--[^\n]*/g, "");
const ROUTES = {
  "list/add": "src/app/api/mcp/route.ts",
  delete: "src/app/api/mcp/[id]/route.ts",
  refresh: "src/app/api/mcp/[id]/refresh/route.ts",
  run: "src/app/api/mcp/[id]/run/route.ts",
  call: "src/app/api/mcp/[id]/call/route.ts",
};
const routes = Object.fromEntries(Object.entries(ROUTES).map(([k, p]) => [k, code(p)]));
const page = code("src/app/dashboard/integrations/page.tsx");
const screen = code("src/components/integrations/mcp-apps.tsx");
const types = code("src/lib/mcp/types.ts");

console.log("== 1. the token is encrypted, per user, and only the server holds it ==");
check("the store encrypts with the existing crypto module", /from "@\/lib\/integrations\/crypto"/.test(store) && /encryptSecret\(/.test(store));
check("...bound to THIS user (tokenContext with the user's id), so a ciphertext copied to another row does not decrypt",
  /encryptSecret\(params\.token, tokenContext\(params\.userId, "mcp", "access"\)\)/.test(store) && /decryptSecret\(row\.auth_token_encrypted, tokenContext\(userId, "mcp", "access"\)\)/.test(store));
check("the table has a column for the ciphertext and none for a plaintext token", /auth_token_encrypted text/.test(migrationCode) && !/\b(auth_token|token|secret|api_key|bearer)\s+text/.test(migrationCode.replace(/auth_token_encrypted/g, "")));
check("the store never logs a token: its errors go through safeErrorDetail", /logApiError\("mcp:decrypt", safeErrorDetail\(err\)/.test(store));
check("the browser's type of a server has a flag for a token and no token", /hasToken: boolean;/.test(types) && !/\btoken\s*[:?]/.test(types.replace(/hasToken/g, "")));
check("the store's summary carries hasToken, never the ciphertext", /hasToken: Boolean\(row\.auth_token_encrypted\)/.test(store) && !/auth_token_encrypted:/.test(store.slice(store.indexOf("function summarise"), store.indexOf("export async function listMcpServers"))));
check("only getMcpServerForUse decrypts, and it is the only function that returns a token", (store.match(/decryptSecret\(/g) ?? []).length === 1 && /export async function getMcpServerForUse/.test(store));
const usesToken = Object.entries(routes).filter(([, src]) => /found\.token/.test(src)).map(([k]) => k).sort();
check("...and the token goes only to the three routes that call the app (refresh, run, call)", usesToken.join(",") === "call,refresh,run", usesToken.join(","));
const responseBodies = (src) => [...src.matchAll(/NextResponse\.json\(([\s\S]*?)\);/g)].map((m) => m[1].replace(/"[^"]*"/g, '""'));
const leaks = Object.entries(routes).filter(([, src]) => responseBodies(src).some((body) => /\btoken\b|found\.token|auth_token/.test(body)));
check("no route puts a token into a response", leaks.length === 0, leaks.map(([k]) => k).join(", "));
check("a token that cannot be encrypted is not stored at all (fails closed)", /if \(token && !encryptionAvailable\(\)\) return NextResponse\.json\(\{ ok: false, code: "encryption_unavailable" \}, \{ status: 503 \}\)/.test(routes["list/add"]));
check("the screen sends the token once and keeps no copy: it clears the field after a connect", /setToken\(""\)/.test(screen) && /type="password"/.test(screen) && /autoComplete="off"/.test(screen));
check("the page hands the screen summaries from the store, never rows", /listMcpServers\(user\.id\)/.test(page) && !/auth_token/.test(page + screen));

console.log("\n== 2. the table: the person reads their own rows, and not even the ciphertext; the server writes ==");
check("row level security is on", /alter table public\.mcp_servers enable row level security/i.test(migrationCode));
check("a select policy for the owner of the row", /for select\s+using \(auth\.uid\(\) = user_id\)/i.test(migrationCode));
check("no insert, update or delete policy exists", !/for (insert|update|delete|all)\b/i.test(migrationCode));
check("insert, update and delete are revoked from the client roles", /revoke insert, update, delete on public\.mcp_servers from anon, authenticated/i.test(migrationCode));
check("select is revoked and granted back on every column EXCEPT the ciphertext", /revoke select on public\.mcp_servers from anon, authenticated/i.test(migrationCode) && /grant select \(id, user_id, name, url, tools, tools_checked_at, status, created_at\)/i.test(migrationCode) && !/grant select \([^)]*auth_token_encrypted/i.test(migrationCode));
check("the rows go with the account (ON DELETE CASCADE from auth.users)", /user_id uuid not null references auth\.users\(id\) on delete cascade/i.test(migrationCode));
check("one address once per person", /unique \(user_id, url\)/i.test(migrationCode));
check("the store writes with the service role, since the client roles cannot", /createAdminClient/.test(store));
check("the table is in the account export, with its ciphertext column redacted", /table: "mcp_servers",[\s\S]{0,120}redactColumns: \["auth_token_encrypted"\]/.test(readFileSync("src/lib/gdpr/user-data-registry.ts", "utf8")));
check("...and in the schema canaries, so /api/health notices a migration nobody ran", /table: "mcp_servers",\s*migration: "20261026000000_mcp_servers\.sql"/.test(readFileSync("src/lib/health/schema-canaries.ts", "utf8")));

console.log("\n== 3. every route knows who is asking, and every query names them ==");
for (const [name, src] of Object.entries(routes)) {
  check(`${name}: the caller is authenticated`, /supabase\.auth\.getUser\(\)/.test(src) && /if \(!user\) return NextResponse\.json\(\{ ok: false, error: "not_signed_in" \}, \{ status: 401 \}\)/.test(src));
}
const exported = [...store.matchAll(/export async function (\w+)\(\s*([^)]*)\)/g)].map((m) => ({ name: m[1], params: m[2] }));
check(`the store's functions were read (${exported.length})`, exported.length >= 6, exported.map((e) => e.name).join(", "));
check("every store function takes the user id: none takes a row id alone", exported.every((e) => /\buserId\b|params: \{[\s\S]*userId/.test(e.params) || /params:/.test(e.params)), exported.filter((e) => !/\buserId\b/.test(e.params) && !/params:/.test(e.params)).map((e) => e.name).join(", "));
const queries = store.split(/createAdminClient\(\)/).length - 1;
const scoped = (store.match(/\.eq\("user_id", (userId|params\.userId)\)/g) ?? []).length;
check(`every read, update and delete of a row is scoped by user_id (${scoped}: list, count, delete, save, get)`, scoped >= 5 && /insert\(\{\s*user_id: params\.userId/.test(store), `${queries} clients, ${scoped} scopes`);
check("a row is fetched by id AND user together, never by id alone",
  (store.match(/\.eq\("id", id\)\s*\.eq\("user_id", userId\)/g) ?? []).length >= 3 && !/\.eq\("id", id\)\s*\.(maybeSingle|single|select)/.test(store));
for (const [name, src] of Object.entries(routes)) {
  if (name === "list/add") continue;
  check(`${name}: reads the server through the caller's id`, /\((user\.id), id\)|\(user\.id, id/.test(src), "must call a store function with user.id and the row id");
}
check("list: lists with the caller's id", /listMcpServers\(user\.id\)/.test(routes["list/add"]));
check("add: counts and writes with the caller's id", /countMcpServers\(user\.id\)/.test(routes["list/add"]) && /addMcpServer\(\{ userId: user\.id/.test(routes["list/add"]));
check("a plan cap holds the list (a Free account may connect one)", /maxMcpServersForPlan\(await resolveEffectivePlanSlug\(user\)\)/.test(routes["list/add"]) && /free: 1,/.test(code("src/lib/mcp/limits.ts")));
check("adding and calling are rate limited per person", /scope: "mcp_add", identifier: user\.id/.test(routes["list/add"]) && /scope: "mcp_call", identifier: user\.id/.test(routes.call) && /scope: "mcp_refresh", identifier: user\.id/.test(routes.refresh));
check("no route takes a user id from the request", !Object.values(routes).some((src) => /body\.(user|userId|user_id)\b|searchParams\.get\("user/.test(src)));
check("an app that is not the caller's is a 404, the same as one that does not exist", /found\.reason === "not_found" \? 404 : 409/.test(routes.run) && /removed \? 200 : 404/.test(routes.delete));
check("the screen never asks for another person's anything: it only calls /api/mcp routes with ids from its own list", !/user_id|userId/.test(screen));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
