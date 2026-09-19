#!/usr/bin/env node
/*
 * WHICH GATES DEPEND ON SOMETHING NOBODY PROMISED?
 *
 * THE QUESTION, 2026-09-19: "you ran build:ci and it passed locally,
 * and CI broke. What ELSE differs between your machine and Vercel,
 * beyond the env vars? Find the GENERAL case."
 *
 * The env half already has an answer: build:ci runs the build under a
 * deployed environment, and env-independence.test.mjs forbids handing a
 * gate the machine's environment. This is the other half — everything
 * that differs and is NOT an environment variable:
 *
 *   FILE ORDER   readdirSync promises nothing. ext4 returns hash order;
 *                a fresh clone laid down in another sequence returns
 *                another. A gate that reports "the first offender", or
 *                compares two lists position by position, is reading an
 *                order nobody guaranteed.
 *   UNTRACKED    .next/, node_modules/, prod-audit/, tsconfig.tsbuildinfo
 *                exist here and not in a clone. A gate that walks a
 *                directory and meets them sees a tree the builder does
 *                not have.
 *   NODE         a different minor, a different ICU build, a different
 *                default timezone.
 *
 * WHAT THIS DOES. It runs every gate twice — once normally, once with
 * every directory listing REVERSED — and reports the ones whose verdict
 * or output changes. Reversed rather than shuffled so a disagreement
 * reproduces: the same run twice gives the same answer.
 *
 * WHAT IT CANNOT SEE. A gate that is order-dependent in a way reversal
 * happens not to disturb, and any difference that is not file order.
 * The untracked and Node facts are reported separately, from the
 * filesystem and from process, because they are answerable directly.
 *
 * Run: node scripts/scan-order-dependence.mjs
 *      node scripts/scan-order-dependence.mjs --only <substring>
 */
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const DIR = "scripts/tests";
export const PRELOAD = "./scripts/tests/lib/reverse-readdir.cjs";

/** Everything present here that a fresh clone would not have. */
export function untrackedPaths() {
  try {
    const out = execFileSync("git", ["status", "--ignored", "--short"], { encoding: "utf8" });
    return out
      .split("\n")
      .filter((l) => l.startsWith("!!") || l.startsWith("??"))
      .map((l) => l.slice(3).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Run one gate, optionally with listings reversed. Returns pass/fail and output. */
export function runGate(file, { reversed = false } = {}) {
  const args = reversed ? ["--require", PRELOAD, path.join(DIR, file)] : [path.join(DIR, file)];
  const r = spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: 240_000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return {
    green: r.status === 0,
    // The pass/fail names only — line numbers and counts move for
    // innocent reasons and would drown the signal.
    verdicts: [...out.matchAll(/^ {2}(PASS|FAIL)\s{2}(.+)$/gm)].map((m) => `${m[1]} ${m[2]}`),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const gates = readdirSync(DIR)
    .filter((f) => f.endsWith(".test.mjs"))
    .filter((f) => !only || f.includes(only))
    .sort();
  // SLICED, because 280 gates run twice is about twenty minutes and a
  // run that cannot be resumed is a run nobody finishes.
  const sliceArg = process.argv.includes("--slice")
    ? process.argv[process.argv.indexOf("--slice") + 1]
    : null;
  const [from, count] = sliceArg ? sliceArg.split(":").map(Number) : [0, gates.length];
  const window = gates.slice(from, from + count);

  console.log("== what differs between this machine and the builder, apart from env ==\n");
  console.log(`  node            ${process.version}`);
  console.log(`  engines         ${JSON.parse(readFileSync("package.json", "utf8")).engines?.node ?? "(none)"}`);
  console.log(`  icu             ${process.config.variables.icu_small ? "small-icu" : "full-icu"}`);
  console.log(`  timezone        ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  const untracked = untrackedPaths();
  console.log(`  here, not in a clone: ${untracked.join(", ") || "(nothing)"}\n`);

  console.log(`-- running ${window.length} of ${gates.length} gates three times: twice normally (the control), once with every listing reversed --\n`);
  const differs = [];
  let ran = 0;
  for (const file of window) {
    // A CONTROL RUN FIRST, and the scan was wrong without it. Some
    // checks print a value that changes every run whatever the file
    // order — prodtest-hygiene prints the pid it just killed — so
    // comparing one normal run with one reversed run reported it as
    // order-dependent on 2026-09-19. It is not; it is volatile.
    //
    // So: two NORMAL runs establish which lines move on their own, and
    // only differences beyond those count. A scan that cannot tell
    // "changed because of the order" from "changes every time" is a
    // scan whose findings nobody can act on.
    const a = runGate(file);
    const control = runGate(file);
    const b = runGate(file, { reversed: true });
    ran += 1;
    const volatileAt = new Set(
      a.verdicts.map((v, i) => (control.verdicts[i] === v ? -1 : i)).filter((i) => i >= 0)
    );
    const same =
      a.verdicts.length === b.verdicts.length &&
      a.verdicts.every((v, i) => volatileAt.has(i) || b.verdicts[i] === v);
    if (a.green !== b.green || !same) {
      const changed = a.verdicts
        .map((v, i) => (volatileAt.has(i) || b.verdicts[i] === v ? null : v))
        .filter(Boolean)
        .slice(0, 2);
      differs.push({ file, a: a.green, b: b.green, changed });
      console.log(`   DIFFERS  ${file.padEnd(38)} ${a.green ? "green" : "RED"} -> ${b.green ? "green" : "RED"}`);
      for (const c of changed) console.log(`            ${c}`);
    }
  }

  console.log(`\n  ${ran} gates run · ${differs.length} disagree with themselves under a different file order`);
  console.log(
    "\n  A DISAGREEMENT IS A DEFECT, and a red-to-green one is the worse\n" +
      "  direction: the gate passes here and fails on a builder whose\n" +
      "  filesystem hands the files back in another sequence. Sort the\n" +
      "  listing, or stop depending on which one came first."
  );
  if (differs.length > 0) process.exitCode = 1;
}
