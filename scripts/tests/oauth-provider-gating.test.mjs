// The "Continue with Google" button that could only ever fail.
//
// REPORTED, from production:
//
//   {"code":400,"error_code":"validation_failed",
//    "msg":"Unsupported provider: provider is not enabled"}
//
// That message comes from GoTrue, and it means one thing: the Supabase
// project has Google switched off. The request was correct — this suite's
// first section proves the app sends the exact provider slug GoTrue
// expects, so there is no client-side bug to fix and no amount of retrying
// or error-message polish makes the button work.
//
// What was broken was that the button existed at all. A control whose only
// possible outcome is a 400 is not a feature with a bug in it; it is a
// dead end on the first screen a new user sees. The fix asks the auth
// server which providers it will accept (GET /auth/v1/settings) and renders
// nothing for the ones it will not.
//
// The three things that can go wrong with THAT, and are checked below:
//   1. Reading the answer wrong — GoTrue has shipped both booleans and
//      strings in `external`, and treating the string "false" as truthy
//      turns a fail-closed check into a fail-open one, i.e. straight back
//      to the reported bug.
//   2. Failing open when the probe itself fails. A timeout must hide the
//      button, not show it hopefully.
//   3. Rendering the button anyway — the component ignoring the list, or a
//      caller forgetting to pass it.
//
// Run: node scripts/tests/oauth-provider-gating.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

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
  if (!cond && detail !== undefined) console.log(`        ${detail}`);
}

const mod = await loadTs("src/lib/auth/oauth-providers.ts");
const { parseEnabledProviders, getEnabledOAuthProviders, resetOAuthProviderCache } = mod;

console.log("== 1. the app asks for the provider GoTrue actually names ==");
// (α) of the report: is the code sending the right provider name? The slug
// in signInWithOAuth has to be the literal GoTrue key — "google", not
// "Google", not "google.com", not "oauth_google". Asserted against the
// source rather than trusted, because this is the one thing that would
// make the 400 the app's fault instead of the project's.
const buttons = readFileSync("src/components/auth/social-auth-buttons.tsx", "utf8");
checkTrue(
  'signInWithOAuth is called with provider: "google"',
  /signInWithOAuth\(\{\s*\n?\s*provider:\s*"google"/.test(buttons),
  buttons.match(/provider:\s*"[^"]*"/)?.[0]
);
// The same slug has to be what the enabled-list is keyed on, or the button
// could be hidden for a provider that is on (or shown for one that is off)
// purely because two spellings drifted apart.
checkTrue('the enabled-list is keyed on the same slug', /providers\.includes\("google"\)/.test(buttons));
const lib = readFileSync("src/lib/auth/oauth-providers.ts", "utf8");
checkTrue(
  "the probe reads GoTrue's own settings endpoint",
  /\/auth\/v1\/settings/.test(lib)
);

console.log("\n== 2. reading GoTrue's answer ==");
// The real response shape, as GoTrue serves it.
check(
  "google: true -> enabled",
  parseEnabledProviders({ external: { google: true, github: false } }),
  ["google"]
);
check("google: false -> not enabled", parseEnabledProviders({ external: { google: false } }), []);
// The fail-open trap. Both of these are truthy in JavaScript.
check('google: "false" (string) -> not enabled', parseEnabledProviders({ external: { google: "false" } }), []);
check('google: "true" (string) -> not enabled', parseEnabledProviders({ external: { google: "true" } }), []);
check("google absent -> not enabled", parseEnabledProviders({ external: { github: true } }), []);
check("no external block -> not enabled", parseEnabledProviders({ disable_signup: false }), []);
check("garbage -> not enabled", parseEnabledProviders("nope"), []);
check("null -> not enabled", parseEnabledProviders(null), []);
// A provider the UI has no button for must never appear, even switched on.
check(
  "a provider with no button is not reported",
  parseEnabledProviders({ external: { google: true, apple: true, azure: true } }),
  ["google"]
);

console.log("\n== 3. the probe, against an auth server that answers ==");
// fetch is the boundary between this app and the Supabase auth server, so
// the auth server is what is stood in for here — nothing about the module
// under test is replaced. The bodies below are GoTrue's real ones.
const realFetch = globalThis.fetch;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

let lastRequest = null;
function serveSettings(body, { status = 200, throws = null } = {}) {
  globalThis.fetch = async (url, init) => {
    lastRequest = { url: String(url), init };
    if (throws) throw throws;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
}

resetOAuthProviderCache();
serveSettings({ external: { google: true } });
check("provider on -> button is allowed", await getEnabledOAuthProviders(), ["google"]);
checkTrue(
  "the probe hits /auth/v1/settings on the project URL",
  lastRequest?.url === "https://proj.supabase.co/auth/v1/settings",
  lastRequest?.url
);
// Newer GoTrue rejects an unauthenticated call to this endpoint outright,
// which would look exactly like "provider disabled" and silently hide a
// working button.
checkTrue("the probe sends the anon key", lastRequest?.init?.headers?.apikey === "anon-key");

resetOAuthProviderCache();
serveSettings({ external: { google: false } });
check("provider off -> no button", await getEnabledOAuthProviders(), []);

console.log("\n== 4. the probe fails CLOSED ==");
// Every one of these must hide the button. Showing it "just in case" is
// the reported bug: the user clicks and gets a raw 400.
resetOAuthProviderCache();
serveSettings(null, { status: 500 });
check("auth server 500 -> no button", await getEnabledOAuthProviders(), []);

resetOAuthProviderCache();
serveSettings(null, { throws: Object.assign(new Error("timed out"), { name: "TimeoutError" }) });
check("probe times out -> no button", await getEnabledOAuthProviders(), []);

resetOAuthProviderCache();
serveSettings(null, { throws: new TypeError("fetch failed") });
check("network unreachable -> no button", await getEnabledOAuthProviders(), []);

resetOAuthProviderCache();
const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
check("no project configured -> no button", await getEnabledOAuthProviders(), []);
process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;

console.log("\n== 5. the answer is memoised, not re-asked per page view ==");
resetOAuthProviderCache();
let calls = 0;
globalThis.fetch = async () => {
  calls++;
  return { ok: true, status: 200, json: async () => ({ external: { google: true } }) };
};
await getEnabledOAuthProviders();
await getEnabledOAuthProviders();
await getEnabledOAuthProviders();
check("three renders, one probe", calls, 1);
globalThis.fetch = realFetch;

console.log("\n== 6. the button is gone, not disabled ==");
// "Doesn't blow up" is not the requirement. The requirement is that the
// control is not on the page at all — a greyed-out button still tells the
// visitor the product has a broken Google sign-in.
checkTrue(
  "SocialAuthButtons renders nothing when the provider is off",
  /if \(!googleEnabled\) return null;/.test(buttons)
);
checkTrue(
  "there is no disabled-but-visible fallback",
  !/disabled=\{!googleEnabled\}/.test(buttons) && !/googleEnabled \?/.test(buttons)
);
// The divider lives inside the component, so it disappears with it. An
// "or continue with email" left behind with nothing above it is the
// leftover this catches.
checkTrue(
  "the 'or continue with email' divider is inside the same component",
  buttons.indexOf("orContinueWithEmail") > buttons.indexOf("if (!googleEnabled) return null;")
);

console.log("\n== 7. both callers pass the real list ==");
// A component that gates correctly is no use if a caller forgets to pass
// the prop — TypeScript catches a missing prop, but not a caller that
// hardcodes one.
for (const [label, file] of [
  ["login", "src/app/login/login-form.tsx"],
  ["signup", "src/app/signup/signup-flow.tsx"],
]) {
  const src = readFileSync(file, "utf8");
  checkTrue(
    `${label}: passes the probed list through`,
    /<SocialAuthButtons providers=\{oauthProviders\}/.test(src),
    src.match(/<SocialAuthButtons[^>]*>/)?.[0]
  );
}
for (const [label, file] of [
  ["login", "src/app/login/page.tsx"],
  ["signup", "src/app/signup/page.tsx"],
]) {
  const src = readFileSync(file, "utf8");
  checkTrue(`${label} page probes the auth server`, /getEnabledOAuthProviders\(\)/.test(src));
  // A prerendered page would freeze the answer into the build's HTML and
  // keep serving it after the toggle is flipped — the same bug, inverted.
  checkTrue(`${label} page is not prerendered`, /export const dynamic = "force-dynamic"/.test(src));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
