// Three checks that looked at a STRING where they meant to look at a
// STRUCTURE, and what each one let through.
//
// 1. THE IFRAME ALLOWLIST was `ALLOWED_HOSTS.some(h => src.includes(h))`.
//    A substring test against a whole URL, so `youtube.com` matched
//    `https://youtube.com.attacker.net/`, `https://notyoutube.com/`,
//    `https://evil.example/?ref=youtube.com` and — the classic —
//    `https://youtube.com@evil.example/`, where everything before the @
//    is userinfo and the host is evil.example.
//
// 2. THE FORM-ACTION CHECK was `!action.includes("/api/websites/")`, so
//    `https://evil.example/collect?next=/api/websites/x/submit-form`
//    carried the allowed substring in its QUERY STRING and passed as ours.
//
// 3. \w IS ASCII. JavaScript's \w is [A-Za-z0-9_] with or without the u
//    flag, so `ζημι\w*` stops dead at the "ά". One Greek alternative in
//    the trading rule parser could therefore never match anything.
//
// AND A FOURTH, found while measuring the third and worse than all of
// them: the sentence splitter split on the DECIMAL POINT. "max 2.5% risk"
// became "max 2" and "5% risk", the second half matched on its own, and
// the rule became FIVE percent — twice the risk the trader asked for,
// with their own sentence displayed beside it saying 2.5%.
//
// Every case below is run through the real module, not a copy of the
// regex. Structure, not spelling: the bypasses are asserted as HOSTS the
// check must reject, so rewriting the allowlist cannot quietly re-open
// them.
//
// Run: node scripts/tests/host-and-word-boundaries.test.mjs
import { loadTs } from "./load-ts.mjs";

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

const scan = await loadTs("src/lib/website-html-security-scan.ts");
const rules = await loadTs("src/lib/trading/rules.ts");
const APP_HOST = "ionexa.example";

const iframeFlagged = (src) =>
  scan.scanWebsiteHtmlForSecurityIssues(`<iframe src="${src}"></iframe>`).some((i) => i.type === "external_iframe");
const formFlagged = (action) =>
  scan
    .scanWebsiteHtmlForSecurityIssues(`<form action="${action}"></form>`, { appHost: APP_HOST })
    .some((i) => i.type === "external_form_target");

console.log("host-and-word-boundaries");

// ---------------------------------------------------------------------
console.log("\n== 1. an iframe host is a HOST, not a substring ==");
// ---------------------------------------------------------------------
// Each of these contains an allowed name somewhere in the URL text and is
// served by somebody else entirely.
const IFRAME_BYPASSES = [
  ["https://www.youtube.com.attacker.net/frame", "the allowed name is a PREFIX of the real host"],
  ["https://notwww.youtube.com/frame", "the allowed name is a SUFFIX of the real host"],
  ["https://evil.example/?ref=www.youtube.com", "the allowed name is in the QUERY"],
  ["https://evil.example/www.youtube.com/x", "the allowed name is in the PATH"],
  ["https://www.youtube.com@evil.example/frame", "the allowed name is USERINFO, before the @"],
  ["https://player.vimeo.com.evil.net/v", "a lookalike of the video host"],
  ["https://maps.google.com.evil.net/x", "a lookalike of the maps host"],
];
for (const [src, why] of IFRAME_BYPASSES) {
  check(`flags it when ${why}`, iframeFlagged(src), true);
}

// Non-http schemes are not embeds either.
for (const src of ["javascript:alert(1)", "data:text/html,<h1>x", "//www.youtube.com/embed/a"]) {
  check(`flags a non-https iframe src (${src.slice(0, 24)})`, iframeFlagged(src), true);
}

console.log("\n   ...and the real embeds still work:");
for (const src of [
  "https://www.youtube.com/embed/abc",
  "https://www.youtube-nocookie.com/embed/abc",
  "https://player.vimeo.com/video/1",
  "https://www.google.com/maps/embed?pb=x",
  "https://maps.google.com/maps?q=x&output=embed",
]) {
  check(`allows ${src.replace(/^https:\/\//, "").slice(0, 34)}`, iframeFlagged(src), false);
}

// google.com is allowed ONLY under /maps — the rest of Google is not an
// embed surface this app's generation contract permits.
check("google.com outside /maps is still flagged", iframeFlagged("https://www.google.com/search?q=x"), true);
check("a path that merely starts with the letters of /maps", iframeFlagged("https://www.google.com/mapsomething"), true);

// ---------------------------------------------------------------------
console.log("\n== 2. a form target is a HOST and a PATH, not a substring ==");
// ---------------------------------------------------------------------
for (const [action, why] of [
  ["https://evil.example/collect?next=/api/websites/x/submit-form", "the allowed path is in the QUERY"],
  ["https://evil.example/api/websites/x/submit-form", "the path is ours but the HOST is not"],
  ["https://evil.example/collect", "a plain third-party collector"],
  ["https://evil.example/api/websites/x/submit-form?a=b#/api/websites/", "path and fragment both dressed up"],
]) {
  check(`flags it when ${why}`, formFlagged(action), true);
}

console.log("\n   ...and a real submission still works:");
check("a relative action to our endpoint", formFlagged("/api/websites/abc/submit-form"), false);
check("an absolute action to OUR host", formFlagged(`https://${APP_HOST}/api/websites/abc/submit-form`), false);
// A relative action is not an external target and never was — it posts to
// whatever origin the page is served from, which is the site's own.
check("an ordinary relative action is not an external target", formFlagged("/contact"), false);
check("an empty action is not an external target", formFlagged(""), false);
check("a fragment action is not an external target", formFlagged("#"), false);

// Without a known host the check still refuses anything whose PATH is not
// ours — the pure/unit-testable path, and what the old check could not do.
check(
  "with no appHost, a query-string disguise is still flagged",
  scan
    .scanWebsiteHtmlForSecurityIssues('<form action="https://evil.example/c?x=/api/websites/y/submit-form"></form>')
    .some((i) => i.type === "external_form_target"),
  true
);

// ---------------------------------------------------------------------
console.log("\n== 3. the scan and the CSP cannot disagree ==");
// ---------------------------------------------------------------------
// They used to be two hand-written lists with a comment saying they could
// not — and the scan allowed "youtube.com" with no subdomain, which the
// CSP's https://www.youtube.com blocks. A page passed the scan, got
// published, and failed to render its own video with no error anywhere.
const serving = await loadTs("src/lib/publishing/public-serving.ts");
const headers = serving.publishedSiteHeaders();
const csp = String(headers["Content-Security-Policy"] ?? "");
const frameSrc = (csp.split(";").find((d) => d.trim().startsWith("frame-src")) ?? "").trim();
check(
  "every scan-allowed host is in frame-src",
  scan.ALLOWED_IFRAME_EMBEDS.filter((e) => !frameSrc.includes(`https://${e.host}`)).map((e) => e.host),
  []
);
check(
  "frame-src names no host the scan would flag",
  frameSrc
    .replace("frame-src", "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((origin) => !scan.ALLOWED_IFRAME_EMBEDS.some((e) => origin === `https://${e.host}`)),
  []
);
check("form-action is still locked to self", /form-action 'self'/.test(csp), true);

// ---------------------------------------------------------------------
console.log("\n== 4. \\w is ASCII: the Greek rule alternatives ==");
// ---------------------------------------------------------------------
const kindsFor = (text) => rules.parseRulesFromText(text).map((r) => r.params.kind);
const paramsFor = (text) => rules.parseRulesFromText(text).map((r) => r.params);

// These three parsed as NOTHING while the English equivalent worked.
for (const text of ["ζημιά την ημέρα 500", "μέγιστη ζημιά την ημέρα 500", "ζημιά τη μέρα 250"]) {
  check(`"${text}" parses`, kindsFor(text), ["max_daily_loss"]);
}
check("the amount is the one written", paramsFor("ζημιά την ημέρα 500"), [{ kind: "max_daily_loss", amount: 500 }]);
// The English half must not have been traded away for it.
check('"max daily loss 500" still parses', paramsFor("max daily loss 500"), [{ kind: "max_daily_loss", amount: 500 }]);
check("a Greek size rule parses", kindsFor("μέγιστο μέγεθος 2 λοτ"), ["max_position_size"]);
check("a mixed-language minutes rule parses", kindsFor("no trade for 30 λεπτά after a ζημιά"), ["no_trade_after_loss"]);

// ---------------------------------------------------------------------
console.log("\n== 5. a decimal point is not a sentence end ==");
// ---------------------------------------------------------------------
// The worst of the four: not a rule lost, a rule DOUBLED.
check(
  "2.5% risk is 2.5, not 5",
  paramsFor("max 2.5% risk"),
  [{ kind: "max_risk_percent", percent: 2.5 }]
);
check("Greek 2.5% risk is 2.5", paramsFor("ρίσκο max 2.5%"), [{ kind: "max_risk_percent", percent: 2.5 }]);
check("cents survive a daily loss", paramsFor("max daily loss 1500.50"), [{ kind: "max_daily_loss", amount: 1500.5 }]);
check("a fractional lot size parses", paramsFor("max size 0.5 lots"), [{ kind: "max_position_size", size: 0.5 }]);
check("a Greek fractional lot size parses", paramsFor("μέγιστο μέγεθος 0.5 λοτ"), [
  { kind: "max_position_size", size: 0.5 },
]);
check("a fractional risk-reward parses", kindsFor("RR at least 1.5:2"), ["min_risk_reward"]);

// AND REAL SENTENCE BREAKS STILL BREAK. A guard that stops splitting
// altogether would pass every check above and lose the feature.
check("two sentences are still two rules", kindsFor("Max 2% risk. Only London."), [
  "max_risk_percent",
  "allowed_sessions",
]);
check("a trailing full stop does not swallow the rule", kindsFor("max 2% risk."), ["max_risk_percent"]);
check("semicolons still split", kindsFor("max 2% risk; only London"), ["max_risk_percent", "allowed_sessions"]);

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
