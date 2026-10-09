// DO THE OWNER'S ALERTS REACH THE OWNER, AND CAN HE FIND OUT IN ONE PRESS?
// (docs/SECURITY-AUDIT.md ΑΣ-8.5, 2026-10-08)
//
// ΑΣ-8.5 read "fine in the code, if ADMIN_EMAILS and RESEND_API_KEY are
// set". Checking that sentence found three things the code got wrong
// around the two variables:
//
//   1. A refusal from Resend was read as delivered. The SDK RETURNS
//      `{ error }` instead of throwing, and the four owner alerts never
//      read it — the cost alert even marked itself delivered. All four now
//      send through src/lib/email/owner-alert.ts, which reads it
//      (email-silence.test.mjs holds every send in src/ to that).
//   2. System Health told the owner that an unset ADMIN_EMAILS fell back
//      to "the hardcoded owner address" (src/lib/env-check.ts). There has
//      been no such address since 2026-10-04: unset means no admin and no
//      alert.
//   3. Nothing let the owner check the two variables without waiting for
//      an outage. /dashboard/system-health now says how many addresses
//      receive alerts and whether mail can leave, and sends a real test
//      through the same path (src/app/api/system-health/test-alert/route.ts).
//
// Whether the variables are SET in production cannot be checked from
// here; that is NEEDS 4 and 8 in docs/NEEDS-FROM-ELIAS.md, and the button
// is how the owner closes it. scripts/tests/security-open-edges.prodtest.mjs
// presses the button in a production build, in Greek and English, on a
// desktop and a phone, against a stand-in Resend.
//
// Every source check runs on the file WITH ITS COMMENTS STRIPPED.
//
// Run: node scripts/tests/owner-alerts.test.mjs
import { existsSync, readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
// A missing file reads as empty, so its checks fail by name instead of the
// gate stopping on the first absent path.
const src = (f) => (existsSync(f) ? stripComments(readFileSync(f, "utf8")) : "");

const HELPER = "src/lib/email/owner-alert.ts";
const ROUTE = "src/app/api/system-health/test-alert/route.ts";
const PAGE = "src/app/dashboard/system-health/page.tsx";
const PANEL = "src/components/system-health/owner-alerts.tsx";
const SENDERS = {
  "error-alert": "src/lib/email/error-alert.ts",
  "login-failure-alert": "src/lib/email/login-failure-alert.ts",
  "margin-alert": "src/lib/email/margin-alert.ts",
  "cost-alerts:email": "src/lib/billing/cost-alert-delivery.ts",
};

console.log("== 1. every owner alert goes one way, and that way reads Resend's answer ==");
{
  const helper = src(HELPER);
  ok("the helper sends to ADMIN_EMAILS only, from the one sender", /to: ADMIN_EMAILS,/.test(helper) && /from: senderAddress\(\),/.test(helper));
  ok("...reads the error Resend returns", /const \{ error \} = await createResendClient\(\)\.emails\.send\(/.test(helper) && /outcome = error\s*\?/.test(helper));
  ok("...and says nothing is sent when there is no key or nobody to send to", /reason: "no_recipients"/.test(helper) && /reason: "not_configured"/.test(helper));
  for (const [tag, file] of Object.entries(SENDERS)) {
    const code = src(file);
    ok(`${tag}: sends through it`, code.includes(`sendOwnerAlert("${tag}",`) && !/emails\.send\(/.test(code));
  }
  const cost = src(SENDERS["cost-alerts:email"]);
  ok("the cost alert is delivered only when Resend took it", /return sent\.ok;/.test(cost) && /if \(!sent\.ok\) logApiError\(/.test(cost));
}

console.log("\n== 2. what System Health says about ADMIN_EMAILS is what the code does ==");
{
  const { ENV_REQUIREMENTS } = await loadTs("src/lib/env-check.ts");
  const row = ENV_REQUIREMENTS.find((r) => r.name === "ADMIN_EMAILS");
  // Unset HERE, whatever this machine has: the gate must answer the same
  // on a laptop and in CI (CLAUDE.md, «The build that matters is the one
  // in CI»).
  delete process.env.ADMIN_EMAILS;
  const { ADMIN_EMAILS } = await loadTs("src/lib/auth/admin-emails.ts");
  ok("unset, the code has no admin at all (run, not read)", Array.isArray(ADMIN_EMAILS) && ADMIN_EMAILS.length === 0);
  ok("...so the row names no fallback address", Boolean(row) && !/hardcoded|owner address/i.test(String(row?.fallback)), String(row?.fallback));
  ok("...says nobody is an admin and no alert is sent", /nobody is an admin/.test(String(row?.fallback)) && /no alert/.test(String(row?.fallback)));
  ok("...and is not filed as optional", row?.level !== "optional", row?.level);
}

console.log("\n== 3. the test button: owner-only, and it chooses nobody ==");
{
  const route = src(ROUTE);
  ok("a stranger gets the same 404 as the page", /if \(!isAdminEmail\(user\.email\)\) return NextResponse\.json\(\{ ok: false \}, \{ status: 404 \}\);/.test(route));
  ok("...before anything is sent", route.indexOf("isAdminEmail(") > 0 && route.indexOf("isAdminEmail(") < route.indexOf("sendOwnerAlert("));
  ok("at most five an hour per owner", /checkRateLimit\(\{ scope: "owner_test_alert", identifier: user\.id, maxAttempts: 5, windowMinutes: 60 \}\)/.test(route));
  ok("the request body is never read, so no recipient comes from it", !/request\.json|request\.text|formData/.test(route) && /export async function POST\(\)/.test(route));
  ok("the same path a real alert takes", /await sendOwnerAlert\("test-alert",/.test(route));
  ok("Resend's own words come back only for a refusal", /detail: outcome\.reason === "refused" \? outcome\.detail : undefined/.test(route));

  const page = src(PAGE);
  ok("System Health shows the panel with a count and a state, never an address", /<OwnerAlerts readiness=\{\{ recipients: ADMIN_EMAILS\.length, mailer: senderStatus\(\) \}\} \/>/.test(page));
  const panel = src(PANEL);
  ok("the panel's words are the reader's language", /useTranslations\("dashboard\.systemHealth\.alerts"\)/.test(panel) && !/>[A-Za-z][a-z]+ [a-z]+[^<{]*</.test(panel));
  ok("...and its button is a 44px target", /min-h-\[44px\][^"]*"\s*>\s*\{sending \? t\("sending"\) : t\("send"\)\}/.test(panel));
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
