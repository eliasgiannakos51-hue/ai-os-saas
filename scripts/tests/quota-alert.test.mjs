// THE 80%-OF-QUOTA ALERT (Βήμα 2, CI for a private repository, 2026-10-21).
//
// scripts/ci/quota-alert.mjs reaches the network twice — once unauthenticated
// to classify the account, once with ACTIONS_BILLING_PAT to read billing —
// and neither is available to this gate. What IS checked here is the part
// that decides anything: quotaVerdict(), the comparison the whole script
// reduces to, and the two network functions against a faked `fetch` so a
// wrong URL, a wrong header, or a flipped Bearer/Basic auth is still caught
// without a real token.
//
// Run: node scripts/tests/quota-alert.test.mjs
import { accountType, billing, quotaVerdict } from "../ci/quota-alert.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

console.log("== 1. quotaVerdict is the comparison the whole script rests on ==");
{
  const under = quotaVerdict(1000, 2000, 80);
  ok("50% of quota is not over an 80% threshold", under.over === false && Math.abs(under.pct - 50) < 1e-9, JSON.stringify(under));
  const at = quotaVerdict(1600, 2000, 80);
  ok("exactly at the threshold counts as over (>=), not just past it", at.over === true, JSON.stringify(at));
  const over = quotaVerdict(1900, 2000, 80);
  ok("95% of quota is over an 80% threshold", over.over === true, JSON.stringify(over));
  const uncapped = quotaVerdict(500, 0, 80);
  ok("an included-minutes of 0 is read as uncapped, not a 0% or a division error", uncapped.uncapped === true && uncapped.over === false);
  let threw = false;
  try { quotaVerdict(NaN, 2000, 80); } catch { threw = true; }
  ok("a billing response missing a field throws rather than silently comparing NaN", threw);
}

console.log("\n== 2. accountType picks the endpoint family from GitHub's own answer ==");
{
  const originalFetch = globalThis.fetch;
  try {
    let seenUrl = null;
    globalThis.fetch = async (url) => {
      seenUrl = url;
      return { ok: true, json: async () => ({ type: "User" }) };
    };
    const kind = await accountType("eliasgiannakos51-hue");
    ok("a User account maps to the users/ billing path", kind === "users", kind);
    ok("...and it asked about the right account", String(seenUrl).includes("/users/eliasgiannakos51-hue"), String(seenUrl));

    globalThis.fetch = async () => ({ ok: true, json: async () => ({ type: "Organization" }) });
    const orgKind = await accountType("some-org");
    ok("an Organization account maps to the orgs/ billing path", orgKind === "orgs", orgKind);

    globalThis.fetch = async () => ({ ok: false, status: 404 });
    let threw = false;
    try { await accountType("nobody"); } catch { threw = true; }
    ok("a failed lookup throws instead of guessing a billing path", threw);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log("\n== 3. billing() sends the PAT as a Bearer token, not query string or Basic auth ==");
{
  const originalFetch = globalThis.fetch;
  try {
    let seenUrl = null;
    let seenAuth = null;
    globalThis.fetch = async (url, opts) => {
      seenUrl = url;
      seenAuth = opts?.headers?.Authorization;
      return { ok: true, json: async () => ({ total_minutes_used: 42, included_minutes: 2000 }) };
    };
    const data = await billing("users", "eliasgiannakos51-hue", "fake-pat-value");
    ok("it calls the users/ billing endpoint for the right account",
      String(seenUrl) === "https://api.github.com/users/eliasgiannakos51-hue/settings/billing/actions", String(seenUrl));
    ok("the PAT never appears in the URL itself", !String(seenUrl).includes("fake-pat-value"), String(seenUrl));
    ok("the PAT is sent as a Bearer token", seenAuth === "Bearer fake-pat-value", String(seenAuth));
    ok("the real response shape round-trips", data.total_minutes_used === 42 && data.included_minutes === 2000, JSON.stringify(data));

    globalThis.fetch = async () => ({ ok: false, status: 401 });
    let threw = false;
    let message = "";
    try { await billing("users", "x", "bad-pat"); } catch (e) { threw = true; message = e.message; }
    ok("an unauthorized billing call throws, naming the likely cause", threw && /ACTIONS_BILLING_PAT/.test(message), message);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
