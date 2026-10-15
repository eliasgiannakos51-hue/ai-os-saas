#!/usr/bin/env node
/*
 * CAN owner-alerts.test.mjs SEE AN OWNER ALERT GO QUIET, OR THE TEST
 * BUTTON OPEN UP?
 *
 *   1. the helper stops reading what Resend returns
 *   2. one alert goes back to a send of its own
 *   3. the cost alert calls a refusal delivered again
 *   4. System Health goes back to promising a fallback admin
 *   5. the test route lets a non-owner through
 *   6. ...takes a recipient from the request
 *   7. ...loses its hourly cap
 *   8. the page hands the panel the addresses themselves
 *
 * Run: node scripts/tests/owner-alerts.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/owner-alerts.test.mjs";
const HELPER = "src/lib/email/owner-alert.ts";
const LOGIN_ALERT = "src/lib/email/login-failure-alert.ts";
const COST = "src/lib/billing/cost-alert-delivery.ts";
const ENV = "src/lib/env-check.ts";
const ROUTE = "src/app/api/system-health/test-alert/route.ts";
const PAGE = "src/app/dashboard/system-health/page.tsx";

const MUTANTS = [
  {
    name: "the helper stops reading what Resend returns",
    file: HELPER,
    from: "      const { error } = await createResendClient().emails.send({",
    to: "      const error = null;\n      await createResendClient().emails.send({",
    expect: "...reads the error Resend returns",
  },
  {
    name: "the sign-in alert goes back to a send of its own",
    file: LOGIN_ALERT,
    from: '  await sendOwnerAlert("login-failure-alert", {',
    to: '  await sendAlertDirectly("login-failure-alert", {',
    expect: "login-failure-alert: sends through it",
  },
  {
    name: "the cost alert calls a refusal delivered again",
    file: COST,
    from: "  return sent.ok;",
    to: "  return true;",
    expect: "the cost alert is delivered only when Resend took it",
  },
  {
    name: "System Health promises a fallback admin again",
    file: ENV,
    from: '    fallback: "nobody is an admin: the admin pages answer 404, and no alert is sent to anyone",',
    to: '    fallback: "the hardcoded owner address",',
    expect: "...so the row names no fallback address",
  },
  {
    name: "the test route lets a non-owner through",
    file: ROUTE,
    from: "  if (!isAdminEmail(user.email)) return NextResponse.json({ ok: false }, { status: 404 });\n",
    to: "",
    expect: "a stranger gets the same 404 as the page",
  },
  {
    name: "the test route takes a recipient from the request",
    file: ROUTE,
    from: "export async function POST() {",
    to: "export async function POST(request: Request) {\n  void (await request.json().catch(() => null));",
    expect: "the request body is never read",
  },
  {
    name: "the test route loses its hourly cap",
    file: ROUTE,
    from: "maxAttempts: 5, windowMinutes: 60",
    to: "maxAttempts: 500, windowMinutes: 1",
    expect: "at most five an hour per owner",
  },
  {
    name: "the page hands the panel the addresses themselves",
    file: PAGE,
    from: "readiness={{ recipients: ADMIN_EMAILS.length, mailer: senderStatus() }}",
    to: "readiness={{ recipients: ADMIN_EMAILS.length, mailer: senderStatus(), addresses: ADMIN_EMAILS } as never}",
    expect: "never an address",
  },
];

runMutations({ name: "owner-alerts", gate: GATE, targets: [GATE, HELPER, LOGIN_ALERT, COST, ENV, ROUTE, PAGE], mutants: MUTANTS });
