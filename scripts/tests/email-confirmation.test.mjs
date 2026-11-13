// NEEDS 22 (ΑΣ-5.8), the owner's decision of 2026-10-05: an account's
// address is proved before the account is used.
//
// The pieces, and what each one must not lose:
//   src/app/api/signup/route.ts            creates the account unconfirmed,
//                                          signs nobody in (signup-latency
//                                          holds that half)
//   src/lib/auth/confirm-email.ts          the link, and the one rule for
//                                          where it may send somebody
//   src/app/auth/confirm/route.ts          verifies the single-use token
//   src/proxy.ts                      keeps an unconfirmed session out
//                                          of the dashboard and the API
//   src/app/api/auth/login/route.ts        a right password on an unproved
//                                          address gets a new link, bounded
//   src/app/api/auth/resend-confirmation   the same, for a session, bounded
//
// Run: node scripts/tests/email-confirmation.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (f) => strip(readFileSync(f, "utf8"));

console.log("== 1. the link sends nobody to another host ==");
const lib = await loadTs("src/lib/auth/confirm-email.ts");
const safe = typeof lib.safeNextPath === "function" ? lib.safeNextPath : () => "MISSING";
for (const [raw, want] of [
  ["/pricing", "/pricing"],
  ["/dashboard/overview", "/dashboard/overview"],
  ["//evil.example", "/dashboard/overview"],
  ["/\\evil.example", "/dashboard/overview"],
  ["https://evil.example", "/dashboard/overview"],
  ["javascript:alert(1)", "/dashboard/overview"],
  [undefined, "/dashboard/overview"],
  // THE PARSER'S OWN REWRITES (2026-11-05 review, A4). The URL parser
  // drops tab, LF and CR anywhere and reads a backslash as a slash, so a
  // prefix test passes a string the redirect then resolves off-site.
  ["/\t/evil.example", "/dashboard/overview"],
  ["/\n/evil.example", "/dashboard/overview"],
  ["/\r/evil.example", "/dashboard/overview"],
  ["/dash\nboard", "/dashboard/overview"],
  ["/a\\b", "/dashboard/overview"],
  ["/\u0000x", "/dashboard/overview"],
  // A dot segment can collapse into a leading double slash.
  ["/.//evil.example", "/dashboard/overview"],
  ["/a/..//evil.example", "/dashboard/overview"],
  ["pricing", "/dashboard/overview"],
  // What a real path keeps: its query and its fragment.
  ["/pricing?plan=pro#top", "/pricing?plan=pro#top"],
]) {
  ok(`safeNextPath(${JSON.stringify(raw)}) -> ${want}`, safe(raw) === want, `got ${safe(raw)}`);
}
// EVERY ROUTE THAT FOLLOWS A `next` USES THE ONE RULE. The population is
// the tree: every route.ts or page that reads a `next` query parameter.
const { readdirSync, statSync } = await import("node:fs");
const followers = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry) && /searchParams\.get\(\s*"next"\s*\)|body\??\.next\b/.test(read(full))) followers.push(full);
  }
})("src/app");
ok(`the routes that follow a next were found (${followers.length})`, followers.length >= 3, followers.join(", "));
for (const f of followers) {
  const src = read(f);
  ok(`${f} passes its next through safeNextPath`, /safeNextPath\(\s*(url\.searchParams\.get\("next"\)|body\?\.next)\s*\)/.test(src));
}
ok("auth/callback has no prefix test of its own any more", !/rawNext/.test(read("src/app/auth/callback/route.ts")));
const libSrc = read("src/lib/auth/confirm-email.ts");
ok("the link carries the hashed token, for the server to verify", /token_hash: hashed/.test(libSrc));
ok("…and its next goes through the same rule", /next: safeNextPath\(next\)/.test(libSrc));

console.log("\n== 2. the landing verifies before it trusts anything ==");
const confirm = read("src/app/auth/confirm/route.ts");
ok("it verifies the token with verifyOtp", /supabase\.auth\.verifyOtp\(\{ token_hash: tokenHash, type \}\)/.test(confirm));
ok("…refuses an unknown type", /!ACCEPTED_TYPES\.includes\(type\)/.test(confirm));
ok("…and a failed verification opens nothing", /if \(error \|\| !data\.user\)[\s\S]{0,200}verify-email\?error=1/.test(confirm));
ok("its redirect target is kept on this site", /const next = safeNextPath\(url\.searchParams\.get\("next"\)\)/.test(confirm));
ok(
  "the welcome mail is marked before it is sent, so it goes once",
  confirm.indexOf("welcome_sent_at") > 0 && confirm.indexOf("welcome_sent_at") < confirm.indexOf("sendWelcomeEmail(")
);

console.log("\n== 3. an unconfirmed session stays outside ==");
const mw = read("src/proxy.ts");
ok("the middleware asks whether the address is proved", /if \(user && !user\.email_confirmed_at\)/.test(mw));
ok("…sends a page to /verify-email", /url\.pathname = "\/verify-email"/.test(mw) && /isDashboardRoute \|\| path\.startsWith\("\/onboarding"\)/.test(mw));
ok("…and refuses an API call by code", /code: "email_not_confirmed" \}, \{ status: 403 \}/.test(mw));
ok("…except the way out", /path\.startsWith\("\/api\/auth\/resend-confirmation"\)/.test(mw));

console.log("\n== 4. every new link is bounded ==");
const login = read("src/app/api/auth/login/route.ts");
ok("login recognises a right password on an unproved address", /signInError\?\.code === "email_not_confirmed"/.test(login));
ok(
  "…and sends at most three links an hour to that address",
  /scope: "login_resend_confirmation"[\s\S]{0,120}maxAttempts: 3[\s\S]{0,60}windowMinutes: 60/.test(login) && /if \(!limit\.allowed\)/.test(login)
);
const resend = read("src/app/api/auth/resend-confirmation/route.ts");
ok("the resend button sends to the session's own address only", /confirmLinkFor\(createAdminClient\(\), user\.email,/.test(resend));
ok("…three an hour", /scope: "resend_confirmation"[\s\S]{0,120}maxAttempts: 3/.test(resend) && /if \(!limit\.allowed\)/.test(resend));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
