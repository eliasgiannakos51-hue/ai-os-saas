// PUBLISHED SITES AND APPS ARE SERVED ON THE APP'S OWN DOMAIN. WHAT HOLDS
// UNTIL THEY ARE NOT, AND WHAT MOVES THEM WHEN A DOMAIN EXISTS.
//
// A published page is somebody else's AI-written HTML under our name in
// the address bar. The CSP sandbox stops it acting AS the app; nothing in
// a CSP stops it LOOKING like the app and asking for a password. Until
// 2026-11-05 a page could do exactly that, load a picture from any https
// host, and call any path of the app's API.
//
//   1. a page that asks for a password is found, however it is written
//   2. ...and the site scan and Rebuild's check both refuse it, and the
//      screen says why in the reader's language
//   3. the form endpoint drops password-like fields and caps the body
//   4. the published pages' CSP: pictures from the hosts the generator
//      uses, connections only to the form endpoint — judged by matching
//      real URLs against it, not by reading its text
//   5. the separate domain: when PUBLISHED_SITE_DOMAIN is set, sites and
//      apps are served there, nothing of the app is, and the old
//      addresses redirect
//
// Run: node scripts/tests/published-isolation.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const cred = await loadTs("src/lib/publishing/credential-fields.ts");
const scan = await loadTs("src/lib/website-html-security-scan.ts");
const app = await loadTs("src/lib/rebuild/rebuild-html.ts");
const origin = await loadTs("src/lib/publishing/content-origin.ts");
const serving = await loadTs("src/lib/publishing/public-serving.ts");

const page = (body) => `<!DOCTYPE html><html><head><title>Bakery</title></head><body>${body}</body></html>`;
const CONTACT = `<form action="/api/websites/abc/submit-form" method="post"><input name="name" type="text"><input type="email" name="email"><input type='tel' name=phone><textarea name="message"></textarea><input type="hidden" name="_hp"><button type="submit">Send</button></form>`;

console.log("== 1. a page that asks for a password is found, however it is written ==");
{
  const FOUND = [
    ['<input type="password" name="p">', "double-quoted"],
    ["<input type='password'>", "single-quoted"],
    ["<input type=password>", "bare"],
    ["<INPUT TYPE=PASSWORD NAME=P>", "upper case"],
    ['<input type=" password ">', "padded"],
    ['<input type="pass&#119;ord">', "a decimal reference inside the word"],
    ['<input type="&#x70;assword">', "a hex reference"],
    ["<input type=pass&#119;ord>", "a reference in a bare value"],
    ['<div onclick="this.firstChild.type=&quot;password&quot;"><input></div>', "an escaped inline handler"],
    ['<input name="u" autocomplete="current-password">', "the password manager asked to fill it"],
    ["<input autocomplete='username new-password'>", "a new-password hint among others"],
    ['<input type="text" style="-webkit-text-security: disc">', "a text box drawn as dots"],
    ["<style>.secret{-webkit-text-security:circle}</style>", "...or so styled from CSS"],
    ['<script>const f = document.createElement("input"); f.type = "password";</script>', "made by script"],
    ["<script>field.setAttribute('type', 'password')</script>", "set by setAttribute"],
    ['<script>render({ type: "password", name: "pin" })</script>', "as a property"],
  ];
  for (const [html, why] of FOUND) ok(`found: ${why}`, cred.findCredentialField(page(html)) !== null, html);
  const CLEAN = [
    [CONTACT, "an ordinary contact form"],
    ["<p>Forgot your password? Call us and we will help.</p>", "the word in prose"],
    ['<input type="text" name="postal_code" placeholder="Ταχυδρομικός κώδικας">', "a postal code"],
    ['<button type="submit">Book</button>', "a submit button"],
    ['<input type="search" autocomplete="off">', "a search box"],
  ];
  for (const [html, why] of CLEAN) ok(`not found: ${why}`, cred.findCredentialField(page(html)) === null, String(cred.findCredentialField(page(html))));
  ok("not found: nothing at all", cred.findCredentialField("") === null && cred.findCredentialField(null) === null);
}

console.log("\n== 2. both scanners refuse it, and the screen says why ==");
{
  const issues = scan.scanWebsiteHtmlForSecurityIssues(page(`${CONTACT}<input type='password'>`), { appHost: "ionexa.ai" });
  const found = issues.find((i) => i.type === "credential_field");
  ok("the site scan flags a password field", found !== undefined, JSON.stringify(issues));
  ok("...and says so in words", found !== undefined && /password/i.test(scan.describeSecurityScanIssue(found)));
  ok("...and a page without one is not flagged for it",
    !scan.scanWebsiteHtmlForSecurityIssues(page(CONTACT), { appHost: "ionexa.ai" }).some((i) => i.type === "credential_field"));

  const appDoc = (body) => `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${body}<script>const LIMIT = 3;</script></body></html>`;
  ok("control: an app without one passes Rebuild's check", app.checkAppHtml(appDoc('<input type="text" id="note">')).ok === true,
    JSON.stringify(app.checkAppHtml(appDoc('<input type="text" id="note">'))));
  const refused = app.checkAppHtml(appDoc('<input type="password" id="secret">'));
  ok("Rebuild's check refuses an app that asks for a password", refused.ok === false && refused.reason === "forbidden" && refused.what === "passwords", JSON.stringify(refused));
  const viaScript = app.checkAppHtml(appDoc('<input id="secret"><script>document.getElementById("secret").type = "password";</script>'));
  ok("...including one whose script makes it", viaScript.ok === false && viaScript.what === "passwords", JSON.stringify(viaScript));

  for (const route of ["src/app/api/websites/[id]/publish/route.ts", "src/app/api/published/[id]/rollback/route.ts"]) {
    const src = stripComments(readFileSync(route, "utf8"));
    ok(`${route.split("/").slice(-3, -1).join("/")}: names the case for the screen`,
      /\.\.\.\(issues\.some\(\(i\) => i\.type === "credential_field"\) \? \{ reason: "password_field" \} : \{\}\),/.test(src));
  }
  for (const screen of ["src/components/publishing/publish-control.tsx", "src/components/publishing/published-sites-list.tsx"]) {
    const src = readFileSync(screen, "utf8");
    ok(`${screen.split("/").pop()}: shows it`,
      /if \(data\?\.securityBlocked === true\) return data\.reason === "password_field" \? t\("securityBlockedPassword"\) : t\("securityBlocked"\);/.test(src));
  }
  for (const loc of ["en", "el", "de", "es", "fr", "it", "ja", "pt", "zh", "ar"]) {
    const m = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
    const text = m.dashboard?.publishing?.securityBlockedPassword;
    ok(`${loc}: the message exists`, typeof text === "string" && text.length > 30 && text !== m.dashboard?.publishing?.securityBlocked);
  }
}

console.log("\n== 3. the form endpoint keeps no password, and no outsized body ==");
{
  for (const name of ["password", "Password", "user_password", "userPassword", "passwd", "pwd", "pin", "PIN", "otp", "cvv", "κωδικός πρόσβασης", "Κωδικός_Πρόσβασης", "Συνθηματικό"]) {
    ok(`dropped: ${name}`, cred.isCredentialFieldName(name) === true);
  }
  for (const name of ["name", "email", "message", "phone", "shipping", "footprint", "opinion", "postal_code", "Ταχυδρομικός κώδικας", "company", "_consent"]) {
    ok(`kept: ${name}`, cred.isCredentialFieldName(name) === false);
  }
  const form = stripComments(readFileSync("src/app/api/websites/[id]/submit-form/route.ts", "utf8"));
  ok("the endpoint skips a field whose name says password, before it is kept",
    /if \(key === "_hp" \|\| key === "_consent"\) continue;\s*if \(isCredentialFieldName\(key\)\) continue;/.test(form));
  ok("a declared body past the cap is refused before it is read",
    /if \(Number\.isFinite\(declared\) && declared > MAX_BODY_BYTES\) \{\s*return NextResponse\.json\(\{ ok: false, code: "too_large" \}, \{ status: 413, headers \}\);/.test(form) &&
      form.indexOf("declared > MAX_BODY_BYTES") < form.indexOf("request.text()"));
  ok("...and a read one past it before it is parsed",
    /if \(Buffer\.byteLength\(raw, "utf8"\) > MAX_BODY_BYTES\) \{/.test(form) && form.indexOf("Buffer.byteLength(raw") < form.indexOf("JSON.parse(raw)"));
  ok("...which is a small number", /const MAX_BODY_BYTES = 64 \* 1024;/.test(form));
  ok("the body is not parsed unbounded anywhere else", !/request\.json\(\)/.test(form));
  ok("the per-site and per-IP limits are still there",
    /scope: "website_form_ip"/.test(form) && /\(recentCount \?\? 0\) >= MAX_SUBMISSIONS_PER_HOUR/.test(form));
}

console.log("\n== 4. the published pages' CSP, judged on real URLs ==");
{
  /** Does a CSP source list allow `url`? Host and path-prefix sources,
   *  'self' against `self`, 'none' — what this policy uses. */
  const allows = (directive, url, self) => {
    const u = new URL(url);
    const sources = directive.split(/\s+/).slice(1);
    if (sources.includes("'none'")) return false;
    return sources.some((s) => {
      if (s === "'self'") return u.origin === self;
      if (s === "data:" || s === "blob:" || s === "https:") return u.protocol === s;
      if (!/^https?:\/\//.test(s)) return false;
      const src = new URL(s);
      if (src.origin !== u.origin) return false;
      return src.pathname === "/" || (src.pathname.endsWith("/") ? u.pathname.startsWith(src.pathname) : u.pathname === src.pathname);
    });
  };
  const APP = "https://ionexa.ai";
  const SUPABASE = "https://abcd.supabase.co";
  const csp = serving.buildPublishedCsp({ appUrl: APP, supabaseUrl: SUPABASE });
  const directive = (name) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? `${name} 'none'`;
  const img = directive("img-src");
  const SELF = "https://ionexa.ai";

  ok("an Unsplash photo loads", allows(img, "https://images.unsplash.com/photo-1501?ixid=x&fm=webp&w=1080", SELF), img);
  ok("...and the owner's own upload", allows(img, `${SUPABASE}/storage/v1/object/public/website-references/u1/shopfront.jpg.web.webp`, SELF), img);
  ok("a picture from anywhere else does not", !allows(img, "https://collector.example.com/p.gif?d=secret", SELF), img);
  ok("...nor another bucket of the same project", !allows(img, `${SUPABASE}/storage/v1/object/public/user-files/u1/a.png`, SELF), img);
  ok("no directive accepts any https host", !/(^|\s)https:(\s|$)/.test(csp.split(";").filter((d) => !/^\s*(upgrade|sandbox)/.test(d)).join(";")), csp);
  ok("media is held to the same hosts", !allows(directive("media-src"), "https://collector.example.com/a.mp3?d=secret", SELF));

  const connect = directive("connect-src");
  const endpoint = `${APP}/api/websites/7c1d/submit-form`;
  ok("a contact form's script reaches its endpoint", allows(connect, endpoint, SELF), connect);
  ok("...and nothing else of the app", !allows(connect, `${APP}/api/credits/balance`, SELF) && !allows(connect, `${APP}/api/auth/login`, SELF), connect);
  ok("...nor anywhere else", !allows(connect, "https://collector.example.com/c", SELF), connect);
  const form = directive("form-action");
  ok("a form posts to its endpoint", allows(form, endpoint, SELF) && allows(form, endpoint, "https://acme.ionexa.site"), form);
  ok("...on a domain of its own too, where 'self' is that domain", allows(form, endpoint, "https://acme.ionexa.site"));
  ok("a form does not post to a third party", !allows(form, "https://collector.example.com/c", SELF));

  const bare = serving.buildPublishedCsp({});
  ok("with no addresses configured nothing is widened", /connect-src 'none'/.test(bare) && !/supabase/.test(bare) && /img-src 'self' data: blob: https:\/\/images\.unsplash\.com https:\/\/plus\.unsplash\.com;/.test(bare), bare);

  // THE HEADERS THE ROUTES SEND are built from the same function with the
  // deployment's own addresses, not from a frozen string.
  const saved = { site: process.env.NEXT_PUBLIC_SITE_URL, supa: process.env.NEXT_PUBLIC_SUPABASE_URL };
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.example.test";
  const sent = serving.publishedSiteHeaders()["Content-Security-Policy"];
  for (const [k, v] of [["NEXT_PUBLIC_SITE_URL", saved.site], ["NEXT_PUBLIC_SUPABASE_URL", saved.supa]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  ok("the served header carries this deployment's form path and uploads",
    sent.includes("connect-src https://app.example.test/api/websites/") && sent.includes("https://proj.example.test/storage/v1/object/public/website-references/"), sent);

  // THE CLAIM THAT WAS FALSE is gone: form-action never stopped a page
  // from sending what it collected somewhere else.
  const servingSrc = readFileSync("src/lib/publishing/public-serving.ts", "utf8");
  ok("the comment no longer says form-action keeps a visitor's details in", !/so a page cannot POST a visitor's details to a third party/.test(servingSrc));
}

console.log("\n== 5. a domain of their own, when one is set ==");
{
  ok("no domain configured is no domain", origin.contentDomain(undefined) === null && origin.contentDomain("  ") === null);
  ok("a domain is normalised", origin.contentDomain("https://IONEXA.site/") === "ionexa.site");
  for (const bad of ["ionexa.site:8443", "ionexa.site/path", "localhost", "user@ionexa.site", "*.ionexa.site"]) {
    ok(`not a domain: ${bad}`, origin.contentDomain(bad) === null);
  }
  const D = "ionexa.site";
  const route = (host, p) => origin.routeContentHost(host, p, D);
  ok("the app's own host is not touched", route("ionexa.ai", "/dashboard/overview") === null && route("ionexa.ai", "/s/acme") === null);
  ok("...nor is anything when no domain is set", origin.routeContentHost("acme.ionexa.site", "/", null) === null);
  ok("a look-alike host is not the content domain", route("evilionexa.site", "/") === null);
  ok("a site's home is its /s/ route", JSON.stringify(route("acme.ionexa.site", "/")) === JSON.stringify({ kind: "rewrite", pathname: "/s/acme" }));
  ok("...and its pages and files below it",
    route("acme.ionexa.site", "/services").pathname === "/s/acme/services" && route("acme.ionexa.site", "/sitemap.xml").pathname === "/s/acme/sitemap.xml");
  ok("the app's API is not on the content domain", route("acme.ionexa.site", "/api/credits/balance").kind === "not_found");
  ok("...except a site's own form endpoint", route("acme.ionexa.site", "/api/websites/7c1d/submit-form").kind === "pass");
  ok("nothing deeper than a page", route("acme.ionexa.site", "/a/b").kind === "not_found");
  ok("a name nobody may have is not served", route("admin.ionexa.site", "/").kind === "not_found" && route("a.b.ionexa.site", "/").kind === "not_found");
  ok("the apex serves apps", route("ionexa.site", "/a/my-tool").kind === "pass");
  ok("...and nothing else", route("ionexa.site", "/").kind === "not_found" && route("ionexa.site", "/dashboard/overview").kind === "not_found");

  const req = (url, host) => ({ url, headers: { get: (n) => (n === "host" ? host : null) } });
  ok("no domain: the app's own /s/ is served here", origin.wrongOriginRedirect(req("https://ionexa.ai/s/acme", "ionexa.ai"), null) === null);
  ok("a site on the app's domain moves to its own",
    origin.wrongOriginRedirect(req("https://ionexa.ai/s/acme", "ionexa.ai"), D) === "https://acme.ionexa.site/");
  ok("...a page, with its query",
    origin.wrongOriginRedirect(req("https://ionexa.ai/s/acme/services?x=1", "ionexa.ai"), D) === "https://acme.ionexa.site/services?x=1");
  ok("...and an app", origin.wrongOriginRedirect(req("https://ionexa.ai/a/my-tool", "ionexa.ai"), D) === "https://ionexa.site/a/my-tool");
  ok("a request that came through the content domain is served, not bounced",
    origin.wrongOriginRedirect(req("https://acme.ionexa.site/s/acme", "acme.ionexa.site"), D) === null);
  ok("an address nobody may have is not redirected anywhere", origin.wrongOriginRedirect(req("https://ionexa.ai/s/ADMIN", "ionexa.ai"), D) === null);

  // THE WIRING, over every route that serves a published page.
  const proxy = stripComments(readFileSync("src/proxy.ts", "utf8"));
  const body = proxy.slice(proxy.indexOf("export async function proxy("));
  ok("the proxy decides the content domain first, before any session is read",
    body.indexOf("routeContentHost(") > 0 && body.indexOf("routeContentHost(") < body.indexOf("createServerClient("));
  ok("...from the configured domain", /contentDomain\(process\.env\.PUBLISHED_SITE_DOMAIN\)/.test(body));
  ok("...and answers it there, rewriting a site and refusing the rest",
    /if \(content\) \{\s*if \(content\.kind === "rewrite"\) \{[\s\S]{0,160}return NextResponse\.rewrite\(url\);\s*\}\s*if \(content\.kind === "pass"\) return NextResponse\.next\(\);\s*return new NextResponse\("Not found", \{ status: 404/.test(body));
  const servers = [];
  for (const top of ["src/app/s", "src/app/a"]) {
    (function walk(dir) {
      for (const e of readdirSync(dir)) {
        const f = path.join(dir, e);
        if (statSync(f).isDirectory()) walk(f);
        else if (e === "route.ts") servers.push(f);
      }
    })(top);
  }
  ok(`the routes serving published pages were found (${servers.length})`, servers.length >= 5);
  for (const f of servers) {
    const src = stripComments(readFileSync(f, "utf8"));
    const get = src.slice(src.indexOf("export async function GET("));
    const first = get.slice(get.indexOf(") {") + 3).trim();
    ok(`${f.replace("src/app/", "")}: redirects to the content domain before anything else`,
      first.startsWith("const moved = wrongOriginRedirect(request, contentDomain(process.env.PUBLISHED_SITE_DOMAIN));\n  if (moved) return Response.redirect(moved, 308);"),
      first.slice(0, 120));
  }
  const rebuildPage = readFileSync("src/app/dashboard/rebuild/page.tsx", "utf8");
  const shell = readFileSync("src/components/rebuild/rebuild-shell.tsx", "utf8");
  ok("Rebuild shows an app's address on the content domain when there is one",
    /publishedAppBase=\{publishedAppBase\(contentDomain\(process\.env\.PUBLISHED_SITE_DOMAIN\)\)\}/.test(rebuildPage) &&
      /const appUrl = publishedAppBase \?\? \(typeof window !== "undefined" \? window\.location\.origin : ""\);/.test(shell));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
