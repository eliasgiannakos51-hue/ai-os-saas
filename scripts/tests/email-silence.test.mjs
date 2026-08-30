// A FEATURE THAT DOES NOT WORK AND DOES NOT SAY SO IS WORSE THAN ONE
// THAT DOES NOT EXIST.
//
// V4.6 #13's critical clause, applied to email. Fourteen files construct
// a Resend client and send something: the welcome mail, an agent's
// result, a team invite, a new-device warning, the weekly digest, the
// cost alert, the error alert. On a deployment with no RESEND_API_KEY
// every one of them fails — correctly, since there is nothing to send
// with — and the question this file answers is whether ANYTHING says so.
//
// It did not. `new Resend(undefined)` throws from inside the SDK, each
// caller caught it, and eleven of the fourteen wrote a log line reading
// `stage: "unhandled"`. Two of those eleven are the error alert and the
// cost alert, which means the mail that would have reported the problem
// was part of the problem.
//
// Run: node scripts/tests/email-silence.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// THE SHAPE THAT HID BOTH BUGS, defined once so that the scan below and
// the test of the scan in section 3b cannot disagree about it. The
// optional parameter group is the load-bearing half: `catch (err) {}` is
// what a half-finished fix leaves behind — the error is bound and then
// ignored — and a pattern written as /catch\s*\{\s*\}/ walks straight
// past it.
const EMPTY_CATCH = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/;

const { loadTs } = await import("./load-ts.mjs");
const cfg = await loadTs("src/lib/email/resend-config.ts");

// ---------------------------------------------------------------------
console.log("== 1. the decision, RUN on both branches ==");
// Not a regex over the source: the function is called, with an
// environment supplied as an argument, and the answer is read.
check("an unset key is not configured", cfg.resendIsConfigured({}) === false);
check("an empty string is not configured", cfg.resendIsConfigured({ RESEND_API_KEY: "" }) === false);
// A VALUE PASTED WITH A TRAILING NEWLINE IS SET as far as Boolean() is
// concerned, and then fails on the wire as an AUTH error rather than at
// the door as a CONFIGURATION one — which sends the operator looking at
// their Resend account instead of at their environment.
check("whitespace only is not configured", cfg.resendIsConfigured({ RESEND_API_KEY: "  \n" }) === false);
check("a real key is configured", cfg.resendIsConfigured({ RESEND_API_KEY: "re_abc123" }) === true);

let thrown = null;
try {
  cfg.requireResendKey({});
} catch (err) {
  thrown = err;
}
check("requireResendKey THROWS when there is no key", thrown !== null);
check("...and the error has a name of its own", thrown?.name === "ResendNotConfiguredError", thrown?.name);
check("...and it is an Error, so logApiError records its message",
  thrown instanceof Error);
// THE SENTENCE IS THE POINT OF THE WHOLE FILE.
check("...and the message names the variable",
  /RESEND_API_KEY/.test(thrown?.message ?? ""), thrown?.message);
check("...and says what the consequence is",
  /no email can be sent/i.test(thrown?.message ?? ""), thrown?.message);
check("a whitespace-padded key comes back trimmed",
  cfg.requireResendKey({ RESEND_API_KEY: " re_abc123 " }) === "re_abc123");

// ---------------------------------------------------------------------
console.log("\n== 2. the client cannot construct around it ==");
const client = stripComments(readFileSync("src/lib/resend.ts", "utf8"));
// ORDER IS THE FIX. Checking after constructing would let the SDK throw
// first and the named error never be reached.
check("createResendClient gets its key through requireResendKey",
  /new Resend\(requireResendKey\(\)\)/.test(client), client.match(/new Resend\([^)]*\)/)?.[0]);
check("...and does not read process.env.RESEND_API_KEY itself",
  !/process\.env\.RESEND_API_KEY/.test(client));

// ---------------------------------------------------------------------
console.log("\n== 3. every sender says something when it cannot send ==");
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}
const sources = walk("src");
const callers = sources.filter(
  (f) => f !== "src/lib/resend.ts" && stripComments(readFileSync(f, "utf8")).includes("createResendClient()")
);
// A FLOOR ON THE SCAN, on the variable the emptiness is asserted over —
// "every caller logs" is trivially true of no callers.
check(`the scan found the senders (${callers.length})`, callers.length >= 12, callers.join(", "));

const silent = [];
for (const file of callers) {
  const code = stripComments(readFileSync(file, "utf8"));
  // Either it is inside a try (so the named error is caught and logged),
  // or it records a status of its own — which is the better shape and is
  // what form-delivery and dispatch already do.
  const guarded = /try\s*\{/.test(code) && /catch/.test(code);
  // console.error COUNTS, and it has to. lib/email/error-alert.ts runs
  // INSIDE logApiError, so reporting its own failure that way would
  // re-enter the alert path — which is why its catch was written empty in
  // the first place. Empty was the wrong conclusion from a right premise:
  // console.error reaches the same runtime log and re-enters nothing.
  const says =
    /logApiError\(/.test(code) ||
    /email_status/.test(code) ||
    /suppressed/.test(code) ||
    /record\(/.test(code) ||
    /console\.error\(/.test(code);
  if (!guarded || !says) silent.push(`${file}${guarded ? "" : " (no try/catch)"}${says ? "" : " (says nothing)"}`);
}
check("every sender catches the failure AND records it", silent.length === 0, silent.join("\n        "));

// AND NO EMPTY CATCH ANYWHERE AMONG THEM. The predicate above is a
// file-level one — a file that logs somewhere else would satisfy it while
// swallowing this particular failure — so the specific shape that hid the
// bug is named separately.
const emptyCatch = callers.filter((f) => EMPTY_CATCH.test(stripComments(readFileSync(f, "utf8"))));
check("no sender swallows it in an empty catch", emptyCatch.length === 0, emptyCatch.join(", "));

// THE ONE THAT MAY NOT USE logApiError, said out loud. sendErrorAlertEmail
// is called BY logApiError; using it here would re-enter the alert path
// on every failure of a persistent fault.
const alert = stripComments(readFileSync("src/lib/email/error-alert.ts", "utf8"));
check("the error alert reports its own failure", /console\.error\(/.test(alert));
check("...and does NOT do it through logApiError, which would recurse",
  !/logApiError/.test(alert));

// ---------------------------------------------------------------------
console.log("\n== 3b. the scanner, asked about samples rather than about src/ ==");
// WHY THIS SECTION EXISTS. email-silence.mutation.mjs broke the two
// scanners above — comment stripping, and the empty-catch pattern — and
// the gate stayed GREEN both times. Not because the clauses are dead:
// because no sender in src/ TODAY has a `catch (err) {}`, and none has a
// comment that would flip its verdict. The scan is correct only for as
// long as the corpus happens not to contain the hazard, which is not
// what correct means. Same lesson as the global-regex filter in
// chart-datakeys.test.mjs: give the instrument the hazard directly.
check("catch {} is recognised as empty", EMPTY_CATCH.test("try { a(); } catch {}"));
check("catch (err) {} is too — a bound error that is then ignored",
  EMPTY_CATCH.test("try { a(); } catch (err) {}"));
check("catch (err) { console.error(err) } is NOT empty",
  !EMPTY_CATCH.test("try { a(); } catch (err) { console.error(err); }"));
check("a catch holding only a comment IS empty, once comments are stripped",
  EMPTY_CATCH.test(stripComments("try { a(); } catch { /* handled elsewhere */ }")));
check("stripComments removes prose that merely MENTIONS logging",
  !/logApiError/.test(stripComments("// we used to call logApiError here\nconst x = 1;")));
check("...and prose in a block comment too",
  !/console\.error/.test(stripComments("/* console.error would recurse */\nconst x = 1;")));

// ---------------------------------------------------------------------
console.log("\n== 4. the operator is told before any of that happens ==");
const env = readFileSync("src/lib/env-check.ts", "utf8");
check("RESEND_API_KEY is on the boot check", /name: "RESEND_API_KEY"/.test(env));
const capability = readFileSync("src/components/system-health/capability-status.tsx", "utf8");
check("...and the capability screen is built from that same list",
  /ENV_REQUIREMENTS/.test(capability));

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`${pass} checks passed. A deployment with no mail key says so, in ${callers.length} places and at boot.`);
