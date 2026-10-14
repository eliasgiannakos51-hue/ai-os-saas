#!/usr/bin/env node
/*
 * CAN first-sign-in.test.mjs SEE THE SECURITY EMAIL GO QUIET, OR COME BACK
 * ON A FIRST SIGN-IN?
 *
 * Mutants that would silence the «new sign-in» email for sign-ins that
 * must be told (an older account, a second device, a count that could not
 * be read, the email no longer sent at all), and ones that would send it
 * on the account's first sign-in again.
 *
 * Run: node scripts/tests/first-sign-in.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/first-sign-in.test.mjs";
const RULE = "src/lib/auth/first-sign-in.ts";
const ROUTE = "src/app/api/auth/device-check/route.ts";
const TARGETS = [GATE, RULE, ROUTE];

const MUTANTS = [
  {
    name: "any account with no device on record is silent, however old",
    file: RULE,
    from: "  return age >= 0 && age < FIRST_SIGN_IN_WINDOW_MS;",
    to: "  return age >= 0 || age < FIRST_SIGN_IN_WINDOW_MS;",
    expect: "an account older than the day",
  },
  {
    name: "a count that could not be read is taken as zero",
    file: RULE,
    from: "  if (input.devicesOnRecord !== 0) return false;",
    to: "  if ((input.devicesOnRecord ?? 0) !== 0) return false;",
    expect: "a count that could not be read is not zero",
  },
  {
    name: "a second device on a new account is silent too",
    file: RULE,
    from: "  if (input.devicesOnRecord !== 0) return false;",
    to: "  if ((input.devicesOnRecord ?? 1) > 1) return false;",
    expect: "a new account's SECOND device",
  },
  {
    name: "a clock behind the account's creation counts as new",
    file: RULE,
    from: "  return age >= 0 && age < FIRST_SIGN_IN_WINDOW_MS;",
    to: "  return age < FIRST_SIGN_IN_WINDOW_MS;",
    expect: "a creation time ahead of the clock",
  },
  {
    name: "the window grows to a week",
    file: RULE,
    from: "export const FIRST_SIGN_IN_WINDOW_MS = 24 * 60 * 60 * 1000;",
    to: "export const FIRST_SIGN_IN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;",
    expect: "the window is one day",
  },
  {
    name: "the first sign-in sends the email again",
    file: RULE,
    from: "  if (input.devicesOnRecord !== 0) return false;",
    to: "  if (input.devicesOnRecord !== -1) return false;",
    expect: "its first sign-in, no email",
  },
  {
    name: "the route reads an unreadable count as zero",
    file: ROUTE,
    from: "      devicesOnRecord: countError ? null : (devicesOnRecord ?? null),",
    to: "      devicesOnRecord: devicesOnRecord ?? 0,",
    expect: "the devices are counted, and the rule asked",
  },
  {
    name: "the route sends the email on the first sign-in after all",
    file: ROUTE,
    from: "    if (firstSignIn) return NextResponse.json({ ok: true, newDevice: true, firstSignIn: true });\n\n",
    to: "",
    expect: "only then is the email skipped",
  },
  {
    name: "the email is never sent",
    file: ROUTE,
    from: "    await sendNewDeviceLoginEmail(user.email, {",
    to: "    void (user.email, {",
    expect: "every other new device is still told",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 120_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("first-sign-in mutations\n");
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(after.green ? "\nbaseline: the gate is green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored. Check `git status`.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
