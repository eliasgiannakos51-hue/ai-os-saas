// EVERY CLAUSE OF email-silence.test.mjs, BROKEN ON PURPOSE.
//
// The gate says "a deployment with no mail key says so". That sentence is
// two mechanisms — a pure function whose branches are RUN, and a scan of
// thirteen senders whose catch blocks are read — and the scan half is the
// one that can report "all pass" over nothing.
//
// Both bugs it was written for are mutations here: an empty catch in the
// error alerter, and an empty catch in the margin alerter. Those two are
// the mail that would have reported the problem.
//
// EVERY MUTATION IS A DELETION OR AN EDIT OF REAL CODE, never an
// `if (false)`.
//
// Run: node scripts/tests/email-silence.mutation.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/email-silence.test.mjs";
const CONFIG = "src/lib/email/resend-config.ts";
const CLIENT = "src/lib/resend.ts";
const ERROR_ALERT = "src/lib/email/error-alert.ts";
const MARGIN_ALERT = "src/lib/email/margin-alert.ts";
const ENV = "src/lib/env-check.ts";

function gateIsGreen() {
  try {
    execFileSync("node", [GATE], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// THE SIDECAR. A restore that only exists inside the running process is a
// restore that a kill deletes; this directory has lost that bet three
// times. Originals go to disk BEFORE anything is touched.
const SIDECAR = "scripts/tests/.email-silence-mutation-sidecar.json";
function healFromSidecar() {
  let saved;
  try {
    saved = JSON.parse(readFileSync(SIDECAR, "utf8"));
  } catch {
    return;
  }
  for (const [file, text] of Object.entries(saved)) writeFileSync(file, text);
  execFileSync("rm", ["-f", SIDECAR]);
  console.log(`healed ${Object.keys(saved).length} file(s) from a killed run\n`);
}
healFromSidecar();

const MUTATIONS = [
  // ---- the decision itself ----
  {
    name: "a missing key stops being an error at all",
    file: CONFIG,
    from: "  if (!resendIsConfigured(env)) throw new ResendNotConfiguredError();",
    to: '  if (!resendIsConfigured(env)) return "";',
  },
  {
    name: "the error goes back to being anonymous",
    file: CONFIG,
    from: '    this.name = "ResendNotConfiguredError";',
    to: '    this.name = "Error";',
  },
  {
    name: "the message stops naming the variable",
    file: CONFIG,
    from: '    super("RESEND_API_KEY is not set on this deployment, so no email can be sent.");',
    to: '    super("Email is not available.");',
  },
  {
    name: "a key pasted with a trailing newline counts as configured",
    file: CONFIG,
    from: "  return typeof env.RESEND_API_KEY === \"string\" && env.RESEND_API_KEY.trim().length > 0;",
    to: "  return typeof env.RESEND_API_KEY === \"string\" && env.RESEND_API_KEY.length > 0;",
  },
  {
    name: "the key is handed on with its whitespace, so the SDK fails on the wire instead",
    file: CONFIG,
    from: "  return (env.RESEND_API_KEY as string).trim();",
    to: "  return env.RESEND_API_KEY as string;",
  },

  // ---- the client constructs around it ----
  {
    name: "the client goes back to reading the variable itself, so the SDK throws first",
    file: CLIENT,
    from: "  return new Resend(requireResendKey());",
    to: "  return new Resend(process.env.RESEND_API_KEY);",
  },

  // ---- the two silences this file was written for ----
  {
    name: "the error alerter goes back to swallowing its own failure",
    file: ERROR_ALERT,
    from: "    console.error(\n      \"[error-alert] could not send the alert:\",\n      err instanceof Error ? err.message : String(err)\n    );",
    to: "",
    expect: "no sender swallows it in an empty catch",
  },
  {
    name: "...and reports it through logApiError instead, which re-enters the alert path",
    file: ERROR_ALERT,
    from: '    console.error(\n      "[error-alert] could not send the alert:",',
    to: '    logApiError("email:error-alert", err);\n    console.error(\n      "[error-alert] could not send the alert:",',
    expect: "does NOT do it through logApiError",
  },
  {
    name: "the margin alerter goes back to swallowing its own failure",
    file: MARGIN_ALERT,
    from: "    console.error(\n      \"[margin-alert] could not send the alert:\",\n      err instanceof Error ? err.message : String(err)\n    );",
    to: "",
    expect: "no sender swallows it in an empty catch",
  },

  // ---- the operator's own warning ----
  {
    name: "RESEND_API_KEY drops off the boot check, so nothing says it at startup",
    file: ENV,
    from: '    name: "RESEND_API_KEY",',
    to: '    name: "RESEND_API_KEY_UNLISTED",',
  },

  // ---- THE INSTRUMENT'S OWN CLAUSES ----
  {
    name: "the sender scan finds nothing, so 'every sender records it' is vacuous",
    file: GATE,
    from: '  (f) => f !== "src/lib/resend.ts" && stripComments(readFileSync(f, "utf8")).includes("createResendClient()")',
    to: '  (f) => f === "no-such-file"',
    expect: "the scan found the senders",
  },
  {
    // WHAT THIS MUTATES, AND WHY IT IS NOT THE OBVIOUS LINE.
    //
    // The obvious mutation is the scan's own call:
    //     const code = stripComments(readFileSync(file, "utf8"));
    //           ->    const code = readFileSync(file, "utf8");
    // That was tried and it SURVIVED, and the reason is worth recording
    // rather than papering over. Removing comment-stripping from the scan
    // flips a verdict only for a sender that is SILENT and whose prose
    // MENTIONS logging — and no sender in src/ is silent today, because
    // this file's own fixes closed the last two. It is a composite: two
    // things have to be wrong at once, and a suite that edits one file at
    // a time cannot express it. Reporting it as CAUGHT by pairing it with
    // something else would be a count made to look complete.
    //
    // So the mutation goes at the stripper itself, where section 3b hands
    // it the hazard directly instead of hoping src/ contains one.
    name: "comment stripping stops working, so prose about logging reads as logging",
    file: GATE,
    from: '  return src.replace(/\\/\\*[\\s\\S]*?\\*\\//g, "").replace(/(^|[^:])\\/\\/.*$/gm, "$1");',
    to: "  return src;",
    expect: "stripComments removes prose that merely MENTIONS logging",
  },
  {
    name: "the empty-catch pattern stops matching a catch with a bound parameter",
    file: GATE,
    from: "const EMPTY_CATCH = /catch\\s*(?:\\([^)]*\\))?\\s*\\{\\s*\\}/;",
    to: "const EMPTY_CATCH = /catch\\s*\\{\\s*\\}/;",
    // `catch (err) {}` is the shape a half-done fix leaves behind: the
    // parameter is bound and then ignored — and NO SENDER IN src/ HAS
    // ONE TODAY, which is why this survived until section 3b handed the
    // pattern the hazard directly instead of hoping the corpus contained
    // it.
    expect: "catch (err) {} is too",
  },
];

console.log("email-silence mutations\n");
if (!gateIsGreen()) {
  console.log("baseline: the gate is RED on the unmutated tree — fix that first.");
  process.exit(1);
}
console.log("baseline: the gate is GREEN on the unmutated tree");

const originals = new Map();
let caught = 0;
const survivors = [];
const missed = [];

for (const m of MUTATIONS) {
  const before = readFileSync(m.file, "utf8");
  if (!before.includes(m.from)) {
    missed.push(`${m.name} — ANCHOR NOT FOUND in ${m.file}; the mutation never applied`);
    continue;
  }
  if (before.split(m.from).length - 1 !== 1) {
    missed.push(`${m.name} — anchor appears more than once in ${m.file}, so the edit is ambiguous`);
    continue;
  }
  originals.set(m.file, before);
  writeFileSync(SIDECAR, JSON.stringify(Object.fromEntries(originals)));
  writeFileSync(m.file, before.replace(m.from, () => m.to));

  const red = !gateIsGreen();

  writeFileSync(m.file, before);
  originals.delete(m.file);
  execFileSync("rm", ["-f", SIDECAR]);

  if (red) {
    caught++;
    console.log(`  CAUGHT  ${m.name}${m.expect ? `\n          -> by ${m.expect}` : ""}`);
  } else {
    survivors.push(`${m.name} (${m.file}) — the gate stayed GREEN`);
    console.log(`  SURVIVED  ${m.name}`);
  }
}

console.log("");
if (!gateIsGreen()) {
  console.log("baseline: the gate is RED on the restored tree — a mutation was not put back.");
  process.exit(1);
}
console.log("baseline: the gate is green again on the restored tree\n");

console.log(`${caught} of ${MUTATIONS.length} mutations caught.`);
if (missed.length > 0) {
  console.log("\nMISSED ANCHORS (these mutations never ran):");
  for (const s of missed) console.log(`  - ${s}`);
}
if (survivors.length > 0) {
  console.log("\nSURVIVORS:");
  for (const s of survivors) console.log(`  - ${s}`);
}
if (missed.length > 0 || survivors.length > 0) process.exit(1);
console.log("Every clause of email-silence.test.mjs is load-bearing.");
