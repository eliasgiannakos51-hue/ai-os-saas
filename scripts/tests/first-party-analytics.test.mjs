// The first-party page counter (2026-11-08): what it may store, and the three
// doors that keep it from storing anything else.
//
//   src/lib/analytics/normalize.ts          what a path and a source may be
//   src/app/api/analytics/view/route.ts     the only way in
//   src/components/analytics/page-view-beacon.tsx   the only sender
//   supabase/migrations/20261108010000_page_view_counts.sql   the table
//
// The promise this holds up is the one the owner's /cookies page will have to
// make before the switch is opened to everyone: no cookie, no visitor
// identifier, no IP, no user agent, no account id. Every check below that
// reads source strips comments first: "if I deleted every comment, would this
// still pass?" (CLAUDE.md).
//
// Run: node scripts/tests/first-party-analytics.test.mjs
import { readFileSync, existsSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const code = (f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
const sqlCode = (f) => readFileSync(f, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

const N = await loadTs("src/lib/analytics/normalize.ts");

console.log("== 1. what a page address may be ==");
ok("a plain page is kept", N.normalizePath("/pricing") === "/pricing" && N.normalizePath("/") === "/");
ok("a nested page is kept", N.normalizePath("/dashboard/tools") === "/dashboard/tools");
ok("a uuid segment collapses to :id", N.normalizePath("/dashboard/files/3f2b8c1e-9a4d-4e6b-8c1a-0123456789ab") === "/dashboard/files/:id");
ok("a long number collapses, a short one stays", N.normalizePath("/orders/123456") === "/orders/:id" && N.normalizePath("/step/2") === "/step/2");
ok("a long hex token collapses", N.normalizePath("/r/0123456789abcdef0123") === "/r/:id");
ok("a segment longer than 40 characters is a name, not a route", N.normalizePath("/s/" + "g".repeat(41)) === "/s/:id" && N.normalizePath("/s/" + "g".repeat(40)) === "/s/" + "g".repeat(40));
ok("a query string is refused, not trimmed", N.normalizePath("/reset?token=abc") === null);
ok("a fragment is refused", N.normalizePath("/page#section") === null);
ok("an encoded character is refused (a name could hide in it)", N.normalizePath("/u/jane%20doe") === null);
ok("an at sign or a space is refused", N.normalizePath("/u/@jane") === null && N.normalizePath("/a b") === null);
ok("a path that does not start with a slash is refused", N.normalizePath("pricing") === null && N.normalizePath("https://x.com/a") === null);
ok("dot-dot and a double slash are refused", N.normalizePath("/a/../b") === null && N.normalizePath("//evil.com") === null);
ok("the API, the auth callbacks and _next are never counted", N.normalizePath("/api/chat") === null && N.normalizePath("/auth/callback") === null && N.normalizePath("/_next/static/x.js") === null && N.normalizePath("/api") === null);
ok("a page that merely starts with the letters api is counted", N.normalizePath("/apiary") === "/apiary");
ok("not a string, empty and too long are refused", N.normalizePath(undefined) === null && N.normalizePath(42) === null && N.normalizePath("") === null && N.normalizePath("/" + "a/".repeat(80)) === null);
ok("the length limit judges the stored form: a long address that collapses to a short one is kept, one that stays long is refused", (() => { const longIds = "/f" + ("/" + "1234".repeat(8)).repeat(5); return longIds.length > N.MAX_PATH_LENGTH && N.normalizePath(longIds) === "/f" + "/:id".repeat(5); })() && N.normalizePath("/" + "x/".repeat(80)) === null);
ok("a path of exactly MAX_PATH_LENGTH characters made of short segments is kept", (() => { const p = ("/ab").repeat(N.MAX_PATH_LENGTH / 3); return p.length === N.MAX_PATH_LENGTH && N.normalizePath(p) === p; })());
ok("one character over MAX_PATH_LENGTH is refused", N.normalizePath(("/ab").repeat(N.MAX_PATH_LENGTH / 3) + "c") === null);

console.log("\n== 2. where a view came from ==");
ok("a view after the first in a visit is internal, whatever else is sent", N.normalizeSource(false, "google.com", "spam") === "internal" && N.normalizeSource(undefined, "", "") === "internal");
ok("the first view with no referrer is direct", N.normalizeSource(true, "", "") === "direct" && N.normalizeSource(true, undefined, undefined) === "direct");
ok("a referrer host is kept, lowercased, without www", N.normalizeSource(true, "WWW.Google.com", "") === "google.com");
ok("a campaign tag wins over the referrer and is prefixed", N.normalizeSource(true, "google.com", "Newsletter") === "utm:newsletter");
ok("a bad campaign tag falls back to the referrer", N.normalizeSource(true, "google.com", "has space!") === "google.com");
ok("a referrer that is not a hostname becomes other, never stored as sent", N.normalizeSource(true, "http://a.com/x?y=1", "") === "other" && N.normalizeSource(true, "localhost", "") === "other" && N.normalizeSource(true, "a@b.com", "") === "other");
ok("a referrer host over the length limit becomes other", N.normalizeSource(true, "a".repeat(58) + ".com", "") === "other");
ok("the longest campaign tag fits the source column", ("utm:" + "a".repeat(40)).length <= N.MAX_SOURCE_LENGTH && N.normalizeSource(true, "", "a".repeat(40)) === "utm:" + "a".repeat(40) && N.normalizeSource(true, "", "a".repeat(41)) === "direct");

console.log("\n== 3. the only way in ==");
const route = code("src/app/api/analytics/view/route.ts");
ok("the route asks the switch before it reads the body or writes", route.indexOf('isFeatureOn("first-party-analytics"') !== -1 && route.indexOf('isFeatureOn("first-party-analytics"') < route.indexOf("request.text()") && route.indexOf('isFeatureOn("first-party-analytics"') < route.indexOf("record_page_view"));
ok("it normalises the path and the source before the write", route.indexOf("normalizePath(") < route.indexOf("record_page_view") && route.indexOf("normalizeSource(") < route.indexOf("record_page_view"));
ok("it rate limits before the write, with ONE shared bucket (no IP in the rate-limit table)", route.indexOf("checkRateLimit(") < route.indexOf("record_page_view") && /identifier: "all"/.test(route) && !/getClientIp|x-forwarded-for|x-real-ip|x-vercel-forwarded-for/i.test(route));
ok("it refuses a cross-origin caller", /request\.headers\.get\("origin"\)/.test(route) && /originHost !== request\.headers\.get\("host"\)/.test(route));
ok("it bounds the body", /MAX_BODY/.test(route) && /text\.length > MAX_BODY/.test(route));
ok("it answers 204 with no body in every case", !/NextResponse\.json/.test(route) && (route.match(/NO_CONTENT\(\)/g) ?? []).length >= 8 && /status: 204/.test(route));
ok("it never reads the user agent, the language or a cookie by name", !/user-agent|accept-language|cookies\(\)|headers\.get\("cookie"\)/i.test(route));
ok("it hands the database exactly the path and the source", /rpc\("record_page_view", \{ p_path: path, p_source: source \}\)/.test(route));
ok("it never uses the signed-in user for anything but the switch", (route.match(/\buser\b/g) ?? []).length === 2 && !/user\.id|user\.email/.test(route), (route.match(/\buser\b/g) ?? []).length);

console.log("\n== 4. the only sender ==");
const beacon = code("src/components/analytics/page-view-beacon.tsx");
ok("the beacon stores nothing in the browser", !/localStorage|sessionStorage|document\.cookie|indexedDB/.test(beacon));
ok("it sends nothing but path, first, ref and utm", /JSON\.stringify\(\{ path: pathname, first: isFirst, ref, utm \}\)/.test(beacon));
ok("it is silent for Do Not Track and Global Privacy Control", /doNotTrack === "1"/.test(beacon) && /globalPrivacyControl === true/.test(beacon));
ok("it sends the referrer HOST only, and only on the first view", /new URL\(document\.referrer\)\.host/.test(beacon) && /if \(isFirst\) \{/.test(beacon));
ok("it never sends the query string", !/location\.search\b[^)]*\)\s*\}\)/.test(beacon) && /URLSearchParams\(window\.location\.search\)\.get\("utm_source"\)/.test(beacon) && !/location\.href|location\.search,/.test(beacon));
ok("a failed call never breaks the page", /\.catch\(\(\) => \{\}\)/.test(beacon) && /catch \{/.test(beacon));
const layout = code("src/app/layout.tsx");
ok("the layout mounts it once", (layout.match(/<PageViewBeacon \/>/g) ?? []).length === 1 && /from "@\/components\/analytics\/page-view-beacon"/.test(layout));

console.log("\n== 5. the switch ==");
const flagsSrc = readFileSync("src/lib/flags/flags.ts", "utf8");
const flagsCode = code("src/lib/flags/flags.ts");
ok("the switch is declared", /^\s*"first-party-analytics": "/m.test(flagsCode));
ok("it starts at staff: it is not in FIRST_AUDIENCE and the default is staff", !/FIRST_AUDIENCE[^=]*=\s*\{[^}]*first-party-analytics/.test(flagsCode) && /DEFAULT_AUDIENCE: FlagAudience = "staff"/.test(flagsCode));
ok("its description tells the owner to change the texts first", /\/cookies and \/privacy first/.test(flagsSrc.slice(flagsSrc.indexOf('"first-party-analytics"'), flagsSrc.indexOf('"first-party-analytics"') + 700)));

console.log("\n== 6. the table ==");
const f = "supabase/migrations/20261108010000_page_view_counts.sql";
const raw = readFileSync(f, "utf8");
const sql = sqlCode(f);
ok("DOC, not behaviour: the header says how to undo it", /^-- How to undo: .{20,}/m.test(raw));
const cols = (sql.match(/create table if not exists public\.page_view_counts \(([\s\S]*?)\n\);/) ?? [])[1] ?? "";
ok("the table has exactly four columns: day, path, source, views", [...cols.matchAll(/^\s{2}([a-z_]+) /gm)].map((m) => m[1]).filter((c) => c !== "primary").join() === "day,path,source,views", cols);
ok("no column can hold a person: no ip, agent, user, session, visitor, cookie, email or fingerprint", !/\b(ip|ip_address|user_agent|agent|user_id|session|session_id|visitor|visitor_id|cookie|email|fingerprint|device)\b/i.test(cols));
ok("row level security is on with no policy, and customers are revoked", /alter table public\.page_view_counts enable row level security/.test(sql) && !/create policy/i.test(sql) && /revoke all on public\.page_view_counts from anon/.test(sql) && /revoke all on public\.page_view_counts from authenticated/.test(sql));
ok("a day is capped at 2000 distinct rows and the overflow folds into one", />= 2000/.test(sql) && /'\/\(other\)'/.test(sql) && /'\(other\)'/.test(sql));
ok("both functions are security definer with a pinned search_path", (sql.match(/security definer/g) ?? []).length === 2 && (sql.match(/set search_path = public, pg_catalog/g) ?? []).length === 2);
ok("both are executable by service_role only", ["record_page_view\\(text, text\\)", "company_traffic\\(\\)"].every((fn) => new RegExp(`revoke all on function public\\.${fn} from public`).test(sql) && new RegExp(`revoke all on function public\\.${fn} from anon`).test(sql) && new RegExp(`revoke all on function public\\.${fn} from authenticated`).test(sql) && new RegExp(`grant execute on function public\\.${fn} to service_role`).test(sql)));
ok("the write counts up in one statement (no read then write)", /on conflict \(day, path, source\) do update set views = c\.views \+ 1/.test(sql));
ok("company_traffic returns counts only", /returns table \(metric text, value bigint\)/.test(sql) && !/select\s+(path|source)\b/.test(sql.slice(sql.indexOf("create or replace function public.company_traffic"))));
ok("the second lock repeats the length limits", /char_length\(v_path\) > 120/.test(sql) && /char_length\(v_source\) not between 1 and 60/.test(sql) && N.MAX_PATH_LENGTH === 120 && N.MAX_SOURCE_LENGTH === 60);

console.log("\n== 7. the wording the owner takes to a lawyer ==");
ok("docs/ANALYTICS-WORDING.md exists and says the switch stays off until /cookies and /privacy change", existsSync("docs/ANALYTICS-WORDING.md") && /first-party-analytics/.test(readFileSync("docs/ANALYTICS-WORDING.md", "utf8")) && /lawyer/i.test(readFileSync("docs/ANALYTICS-WORDING.md", "utf8")));
ok("the wording does not claim visitors are counted or that bots are excluded", !/unique visitors|bots (are|is) (excluded|filtered)/i.test(readFileSync("docs/ANALYTICS-WORDING.md", "utf8")));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
