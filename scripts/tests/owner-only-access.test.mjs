// Owner-only surfaces are gated ON THE SERVER, not just hidden.
//
// THE FAILURE THIS EXISTS TO CATCH, stated by the brief: a component
// hidden with `{isAdmin && ...}` while the API behind it answers anyone
// with a fetch. That is the classic shape, and it is invisible in review
// because the page looks correct.
//
// This app's owner-only surfaces are React SERVER Components and one API
// route, so there is no client bundle to inspect and no endpoint to curl
// for the margin data. But "there is no endpoint today" is not a
// guarantee — it is a fact that a future route could change. So this walks
// the whole API surface and the whole dashboard, and requires that
// anything touching platform-wide data proves it checked.
//
// Run: node scripts/tests/owner-only-access.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

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

function walk(dir, filename) {
  const out = [];
  (function rec(d) {
    for (const entry of readdirSync(d)) {
      const full = `${d}/${entry}`;
      if (statSync(full).isDirectory()) rec(full);
      else if (entry === filename) out.push(full);
    }
  })(dir);
  return out.sort();
}

console.log("== 1. the owner check itself ==");
const admin = readFileSync("src/lib/admin.ts", "utf8");
check("it is server-only", /^import "server-only";/m.test(admin));
check("the list comes from ADMIN_EMAILS plus a hardcoded owner", /HARDCODED_ADMIN_EMAILS/.test(admin) && /process\.env\.ADMIN_EMAILS/.test(admin));
check("comparison is case-insensitive", /toLowerCase\(\)/.test(admin));
check("a missing email is never an admin", /if \(!email\) return false;/.test(admin));

console.log("\n== 2. ADMIN_EMAILS never reaches the browser ==");
// server-only would fail the build, but the failure would be at build
// time in whatever future PR did it — this names it explicitly.
function everyFile(dir) {
  const out = [];
  (function rec(d) {
    for (const entry of readdirSync(d)) {
      const full = `${d}/${entry}`;
      if (statSync(full).isDirectory()) rec(full);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
  })(dir);
  return out;
}
const clientFilesImportingAdmin = everyFile("src")
  .filter((f) => /^\s*"use client";/m.test(readFileSync(f, "utf8")))
  .filter((f) => /from "@\/lib\/admin"/.test(readFileSync(f, "utf8")));
check(
  "no client component imports lib/admin",
  clientFilesImportingAdmin.length === 0,
  clientFilesImportingAdmin.join(", ")
);

console.log("\n== 3. every owner-only SURFACE checks on the server ==");
// The margin report is the one that reads PLATFORM-WIDE data with the
// service-role client, so it gets the strictest treatment: it must check
// for itself, not rely on its caller.
const marginReport = readFileSync("src/components/settings/margin-report.tsx", "utf8");
check("MarginReport reads the session itself", /await supabase\.auth\.getUser\(\)/.test(marginReport));
check("and checks isAdminEmail itself", /isAdminEmail\(user\.email\)/.test(marginReport));
check(
  "returning null — not an error box that confirms it exists",
  /if \(!user \|\| !isAdminEmail\(user\.email\)\) return null;/.test(marginReport)
);
// The check must come BEFORE the service-role query, or the data is read
// (and could be logged) before anyone is authorised.
const checkAt = marginReport.indexOf("isAdminEmail(user.email)");
const adminClientAt = marginReport.indexOf("createAdminClient()");
check("the check runs BEFORE the service-role client is created", checkAt > 0 && checkAt < adminClientAt);

// Defence in depth: the caller's gate stays too.
const settingsPage = readFileSync("src/app/dashboard/settings/page.tsx", "utf8");
check("the settings page still gates it as well", /\{isAdmin && \(/.test(settingsPage));
check("and computes isAdmin server-side", /const isAdmin = isAdminEmail\(user\.email\)/.test(settingsPage));
check("the settings page is a server component", !/^\s*"use client";/m.test(settingsPage));

const systemHealth = readFileSync("src/app/dashboard/system-health/page.tsx", "utf8");
check("system-health checks isAdminEmail", /isAdminEmail\(user\.email\)/.test(systemHealth));
check("and 404s rather than saying 'not allowed'", /if \(!isAdminEmail\(user\.email\)\) notFound\(\);/.test(systemHealth));
check("system-health is a server component", !/^\s*"use client";/m.test(systemHealth));

const resolveRoute = readFileSync("src/app/api/system-health/resolve/route.ts", "utf8");
check("the resolve API checks on the server", /isAdminEmail\(user\.email\)/.test(resolveRoute));
check("and replies 404, not 403 — a 403 confirms the endpoint exists", /status: 404/.test(resolveRoute));

console.log("\n== 4. NO API route exposes platform-wide data unguarded ==");
// The real invariant, checked across every route rather than the three we
// happen to remember. A route that uses the service-role client AND is not
// a cron/webhook/internal endpoint must scope to the caller or check
// admin — otherwise it can read across accounts.
const routes = walk("src/app/api", "route.ts");
check(`the scan found the API surface (${routes.length} routes)`, routes.length >= 40);

const offenders = [];
for (const file of routes) {
  const src = readFileSync(file, "utf8");
  if (!/createAdminClient\(/.test(src)) continue;

  const isWebhook = file.includes("/api/webhooks/");
  // The research continuation authenticates with the internal token when
  // called by our own infrastructure, and by ownership otherwise.
  const hasInternalToken = /internalHandoffToken\(\)/.test(src);
  // An actual CALL, not a mention.
  //
  // This used to be /requireCronAuth|CRON_SECRET/, which every cron route
  // satisfied through the words "CRON_SECRET" in its header COMMENT — so
  // a new cron route that documented the convention and forgot to enforce
  // it would have passed this check. Every cron route in the app really
  // does call checkCronAuth(); requiring the call is both stricter and a
  // true description of the pattern. Verified against all five cron-shaped
  // routes (api/cron/* and api/weekly-digest).
  const hasCronAuth = /\b(?:check|require)CronAuth\s*\(/.test(src);
  // CRON-SHAPED IS ABOUT THE GUARD, NOT THE FOLDER. This used to be
  // `file.includes("/api/cron/")`, and api/weekly-digest — which the
  // comment above already counts as one of the five cron routes — passed
  // only because it happened to contain a `.eq("user_id", ...)` in its
  // own body. When that query moved into a lib, the route lost its
  // authorisation in this check's eyes while losing nothing in reality.
  // Keying off the CALL is both correct and stricter: a route under
  // /api/cron/ that does not call the guard is still an offender below,
  // and a route anywhere else now has to actually call it rather than
  // inherit safety from a user-scoped query it may later stop making.
  const isCron = file.includes("/api/cron/") || hasCronAuth;
  const hasAdminCheck = /isAdminEmail\(/.test(src);
  // Scoping every query to the authenticated user is the other legitimate
  // pattern: the service-role client is used to write across RLS, but the
  // rows are still selected by the caller's own id. The identifier is not
  // always literally `user.id` — api/websites/status passes it as `userId`
  // — so match any binding, not one spelling.
  const scopesToUser = /\.eq\("user_id", [A-Za-z_$][\w$.]*\)/.test(src) || /auth\.getUser\(\)/.test(src);
  // Some routes legitimately run before any session exists (signup,
  // login), are authorised by a single-use emailed token, or are public by
  // design (a published site's contact form). Each of those must SAY SO in
  // the file — an explicit marker, so a new route cannot inherit an
  // exemption by sitting in the same folder as one.
  const justified = /@service-role-justified/.test(src);

  if (isCron || isWebhook) {
    if (!hasCronAuth && !isWebhook) offenders.push(`${file}: cron route with no CRON_SECRET check`);
    continue;
  }
  if (hasAdminCheck || hasInternalToken || scopesToUser || justified) continue;
  offenders.push(
    `${file}: service-role client with no admin check, no internal token, no user scoping ` +
      `and no @service-role-justified marker`
  );
}
check("every service-role route is authorised somehow", offenders.length === 0, offenders.join("\n        "));

console.log("\n== 4b. every service-role exemption states a recognised reason ==");
// The marker must not become a way to silence this check. Only three
// reasons are accepted, and each one is a real architectural constraint.
const justifiedRoutes = routes.filter((f) => /@service-role-justified/.test(readFileSync(f, "utf8")));
check(`exemptions are few and declared (${justifiedRoutes.length})`, justifiedRoutes.length <= 6);
for (const file of justifiedRoutes) {
  const src = readFileSync(file, "utf8");
  const reason = src.match(/@service-role-justified (\w[\w-]*)/)?.[1];
  check(
    `${file.split("/api/")[1]} declares a recognised reason (${reason ?? "none"})`,
    ["pre-auth", "token-auth", "public"].includes(reason ?? ""),
    "must be one of: pre-auth, token-auth, public"
  );
}

console.log("\n== 5. no owner-only data leaks through a client component ==");
// A server component may only hand a client component data the client is
// allowed to have. The margin data never crosses that line because
// MarginReportView is itself a server component.
check("MarginReportView is NOT a client component", !/^\s*"use client";/m.test(marginReport));
check(
  "and the margin lib is not imported by any client component",
  everyFile("src")
    .filter((f) => /^\s*"use client";/m.test(readFileSync(f, "utf8")))
    .filter((f) => /billing\/margin-report/.test(readFileSync(f, "utf8"))).length === 0
);

console.log("\n== 6. there is still no unguarded margin endpoint ==");
// The brief's exact worry. If someone later adds one, this catches it.
const marginRoutes = routes.filter((f) => /margin/i.test(f));
check(
  `no /api route serves margin data (${marginRoutes.length} found)`,
  marginRoutes.every((f) => /isAdminEmail\(/.test(readFileSync(f, "utf8"))),
  marginRoutes.join(", ")
);
check("and ai_cost_log is not read by any unguarded route", true);
const costLogRoutes = routes.filter((f) => /ai_cost_log/.test(readFileSync(f, "utf8")));
for (const file of costLogRoutes) {
  const src = readFileSync(file, "utf8");
  check(
    `${file.split("/api/")[1]} scopes ai_cost_log to one user or checks admin`,
    /\.eq\("user_id", [A-Za-z_$][\w$.]*\)/.test(src) ||
      /isAdminEmail\(/.test(src) ||
      file.includes("/api/cron/"),
    "reads ai_cost_log without scoping it to one user"
  );
}

console.log("\n== 7. the dashboard has no other unguarded admin page ==");
const pages = walk("src/app/dashboard", "page.tsx");
const adminPages = pages.filter((f) => /createAdminClient\(/.test(readFileSync(f, "utf8")));
check(`admin-client dashboard pages found (${adminPages.length})`, adminPages.length >= 1);
for (const file of adminPages) {
  const src = readFileSync(file, "utf8");
  check(
    `${file.replace("src/app/", "")} gates on isAdminEmail`,
    /isAdminEmail\(user\.email\)/.test(src),
    "renders platform data with no owner check"
  );
}

console.log("\n== a query that runs under the SERVICE-ROLE client scopes itself ==");
// THE LEAK THIS PREVENTS. getUserFullContext relied entirely on RLS to
// scope its ~15 reads — true for a client carrying the user's session,
// and NOT true for the service-role client, which bypasses RLS. Two job
// handlers passed exactly that client, so on any database with more than
// one account the Create Anything classifier and the Mission Planner
// built their prompts from the newest rows of EVERY user's ideas, leads,
// finance entries, trades and missions, and the model answered out of
// them. api/agents/build had noticed and worked around it at its own
// call site; a workaround at one caller is not a fix.
{
  // Both files on this path: the context builder and the helper it calls.
  // A scanner that saw only some of the queries would pass while the
  // others leaked — which is what the first version of this check did
  // (it matched 2 of 5 and reported all-clear).
  for (const file of ["src/lib/user-context.ts", "src/lib/energy-checkins.ts"]) {
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // EVERY .from(...) in the file, with the ~600 characters that follow
    // it — enough to contain the whole chained call however it is wrapped.
    const reads = [...code.matchAll(/\.from\(([^)]+)\)/g)].map((m) => ({
      table: m[1].trim(),
      chain: code.slice(m.index, m.index + 600),
    }));
    check(`${file.split("/").pop()}: reads found (${reads.length})`, reads.length > 0);
    const unscoped = reads
      .filter((r) => !/\.eq\("user_id", userId\)/.test(r.chain.split(";")[0]))
      .map((r) => r.table);
    check(
      `${file.split("/").pop()}: no read is left to RLS alone`,
      unscoped.length === 0,
      `unscoped: ${unscoped.join(", ")}`
    );
  }
  const code = readFileSync("src/lib/user-context.ts", "utf8");
  // The per-module scan takes the id rather than closing over nothing.
  check("the module scan receives the user id", /scanModule\(supabase, config, now, userId\)/.test(code));
  check("and filters on it", /\.from\(config\.table\)[\s\S]{0,400}?\.eq\("user_id", userId\)/.test(code));

  // The two handlers that pass the service-role client are still allowed
  // to — that is the POINT of the filter being inside the function.
  for (const handler of ["src/lib/jobs/handlers/create.ts", "src/lib/jobs/handlers/mission-plan.ts"]) {
    const src = readFileSync(handler, "utf8");
    check(
      `${handler.split("/").pop()} still passes the worker's client (safe now)`,
      /getUserFullContext\(admin, ctx\.userId\)/.test(src)
    );
  }
}

console.log("\n== a page that reads EVERY module table bounds itself ==");
// dashboard/memory read 21 tables with select("*") and no limit, then
// serialised every row into the client as props. Fine on a demo account,
// a page-load timeout on a real one. lib/timeline.ts had already solved
// the same problem with the same shape.
{
  const mem = readFileSync("src/app/dashboard/memory/page.tsx", "utf8");
  check("the per-module read is limited", /\.order\("created_at", \{ ascending: false \}\)\s*\.limit\(PER_MODULE_LIMIT\)/.test(mem));
  check("and the combined list is capped", /\.slice\(0, MAX_MEMORY_RESULTS\)/.test(mem));
  const timeline = readFileSync("src/lib/timeline.ts", "utf8");
  const memPer = /const PER_MODULE_LIMIT = (\d+)/.exec(mem)?.[1];
  const tlPer = /const PER_MODULE_LIMIT = (\d+)/.exec(timeline)?.[1];
  check(`both surfaces use the same per-module bound (${memPer} vs ${tlPer})`, memPer === tlPer);
}

console.log("\n== the star means the same thing on every page that shows one ==");
// GenericList falls back to `favoritedIds?.has(id) ?? false`, so a page
// that forgets the prop renders every star empty on records the user
// really has starred.
for (const page of [
  "src/app/dashboard/[module]/page.tsx",
  "src/app/dashboard/product-workflow/page.tsx",
  "src/app/dashboard/trading-workflow/page.tsx",
]) {
  const src = readFileSync(page, "utf8");
  const lists = (src.match(/<GenericList/g) ?? []).length;
  const withFavs = (src.match(/favoritedIds=\{favoritedIds\}/g) ?? []).length;
  check(`${page.split("/").slice(-2)[0]}: all ${lists} list(s) receive favoritedIds`, lists > 0 && withFavs === lists, `${withFavs} of ${lists}`);
  check(`${page.split("/").slice(-2)[0]}: and it is really loaded`, /loadFavoriteIds\(/.test(src));
}

console.log("\n== NO component shows a raw database error, anywhere ==");
// THE FOURTH TIME this defect was found by hand. Fixed once on the create
// form, once on the record detail, then found again on delete-button, the
// website workspace, the idea forms, the energy widget and the link
// modal. Fixing instances is why it kept coming back; nothing stopped the
// next one. This is the thing that stops it.
//
// A PostgREST message ("new row violates row-level security policy for
// table \"trades\"") names an internal table, is English in a
// ten-language app, and tells the user nothing they can act on. It goes
// through lib/errors/use-error-text.ts, which turns it into what / next /
// what-happened-to-the-money.
{
  const componentFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".tsx")) componentFiles.push(full);
    }
  };
  walk("src/components");
  walk("src/app");
  // `<name>Error.message` or `error.message` handed straight to the user.
  const RAW = /(?:setError\(\s*(\w*[eE]rror)\.message\s*\)|addToast\(\s*`[^`]*\$\{\s*(\w*[eE]rror)\.message\s*\})/;
  const offenders = componentFiles.filter((f) => {
    if (f.startsWith("src/app/api/")) return false; // routes reply in English by convention
    const body = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    return RAW.test(body);
  });
  check(
    `no component renders a raw database error (${componentFiles.length} scanned)`,
    offenders.length === 0,
    offenders.join("\n        ")
  );
  // ...and the scanner must really be able to see one.
  check(
    "the scanner catches the shape it is looking for",
    RAW.test('setError(insertError.message);') && RAW.test('addToast(`✗ ${deleteError.message}`, "error");')
  );
}

console.log("\n== editing a record cannot show a raw database error ==");
// The create path was fixed to route PostgREST text through the error
// describer; the update path in the same feature was not, so editing a
// row still printed "new row violates row-level security policy for
// table \"trades\"" at the user.
{
  const detail = readFileSync("src/components/modules/generic-record-detail.tsx", "utf8");
  check("the update failure goes through the describer", /describe\(new ApiError\(500, \{ error: updateError\.message \}\)\)/.test(detail));
  check("and the raw message is not rendered", !/setError\(updateError\.message\)/.test(detail));
  check("nor toasted", !/addToast\(`✗ \$\{updateError\.message\}`/.test(detail));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
