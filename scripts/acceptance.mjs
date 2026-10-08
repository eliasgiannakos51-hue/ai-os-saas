#!/usr/bin/env node
/*
 * THE FINAL CHECK, RUN (MASTER «Η. Ο ΤΕΛΙΚΟΣ ΕΛΕΓΧΟΣ»; package 40).
 *
 * Reads docs/ACCEPTANCE.md, runs once every check a task names under
 * «Αυτόματα», and prints one line per task: ΠΕΡΝΑ, ΔΕΝ ΠΕΡΝΑ,
 * ΠΕΡΝΑ ΤΟ ΜΙΣΟ (a task «μισό» whose checks pass), ΔΕΝ ΦΤΙΑΧΤΗΚΕ (the task
 * says so under «Σήμερα»), or ΧΩΡΙΣ ΑΥΤΟΜΑΤΟ
 * (its «Αυτόματα» says «χειροκίνητο»). A check named by two tasks runs
 * once. Exits 1 when any task that is built has a check that failed.
 *
 * Every *.prodtest.mjs makes its own production build over a stand-in
 * database, so the whole run takes hours; --only=36,39 runs those tasks,
 * --list prints what would run and runs nothing.
 *
 * Its parser is the one scripts/tests/acceptance.test.mjs holds the
 * document to, so the two read the same tasks.
 *
 * Run: node scripts/acceptance.mjs [--list] [--only=1,2,3]
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const STATES = ["φτιαγμένο", "μισό", "δεν φτιάχτηκε"];
export const FIELDS = ["Πακέτο", "Κάνω", "Βλέπω", "Χρόνος", "Αυτόματα", "Σήμερα"];

/** The tasks of docs/ACCEPTANCE.md: number, title, each field, and the checks that run it. */
export function parseAcceptance(text) {
  const tasks = [];
  const blocks = text.split(/\n(?=### Α\d+\. )/).slice(1);
  for (const block of blocks) {
    const head = block.match(/^### Α(\d+)\. (.+)$/m);
    if (!head) continue;
    const fields = {};
    for (const name of FIELDS) {
      const m = block.match(new RegExp(`^- ${name}: (.+)$`, "m"));
      fields[name] = m ? m[1].trim() : null;
    }
    const auto = fields["Αυτόματα"] ?? "";
    const manual = auto.startsWith("χειροκίνητο");
    const checks = manual ? [] : [...auto.matchAll(/`([^`]+\.mjs)`/g)].map((m) => m[1]);
    const state = STATES.find((s) => (fields["Σήμερα"] ?? "").startsWith(s)) ?? null;
    tasks.push({ number: Number(head[1]), title: head[2].trim(), fields, manual, checks, state });
  }
  return tasks;
}

function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",").map(Number) ?? null;
  const listOnly = args.includes("--list");
  const tasks = parseAcceptance(readFileSync("docs/ACCEPTANCE.md", "utf8")).filter((t) => !only || only.includes(t.number));

  const toRun = [...new Set(tasks.filter((t) => t.state !== "δεν φτιάχτηκε").flatMap((t) => t.checks))];
  console.log(`acceptance: ${tasks.length} task(s), ${toRun.length} check(s) to run`);
  const result = new Map();
  for (const file of toRun) {
    if (!existsSync(file)) {
      result.set(file, "missing");
      continue;
    }
    if (listOnly) {
      console.log(`  would run ${file}`);
      continue;
    }
    console.log(`--- ${file}`);
    const run = spawnSync(process.execPath, [file], { stdio: "inherit", timeout: 45 * 60_000 });
    result.set(file, run.status === 0 ? "pass" : "fail");
  }
  if (listOnly) return 0;

  let failed = 0;
  console.log("\n== the tasks ==");
  for (const t of tasks) {
    let verdict;
    if (t.state === "δεν φτιάχτηκε") verdict = "ΔΕΝ ΦΤΙΑΧΤΗΚΕ";
    else if (t.manual || t.checks.length === 0) verdict = "ΧΩΡΙΣ ΑΥΤΟΜΑΤΟ";
    // A half-built task whose checks pass has passed its HALF: said so, so
    // the table never reads as the whole line of Part 16 being done.
    else if (t.checks.every((c) => result.get(c) === "pass")) verdict = t.state === "μισό" ? "ΠΕΡΝΑ ΤΟ ΜΙΣΟ" : "ΠΕΡΝΑ";
    else {
      verdict = "ΔΕΝ ΠΕΡΝΑ";
      failed++;
    }
    const bad = t.checks.filter((c) => result.get(c) && result.get(c) !== "pass");
    console.log(`  Α${String(t.number).padEnd(3)} ${verdict.padEnd(15)} ${t.title}${bad.length ? `  (${bad.join(", ")})` : ""}`);
  }
  const passing = (t) => t.state !== "δεν φτιάχτηκε" && !t.manual && t.checks.length > 0 && t.checks.every((c) => result.get(c) === "pass");
  const whole = tasks.filter((t) => passing(t) && t.state === "φτιαγμένο").length;
  const half = tasks.filter((t) => passing(t) && t.state === "μισό").length;
  console.log(`\n${whole} pass, ${half} pass their half, ${failed} fail, ${tasks.filter((t) => t.state === "δεν φτιάχτηκε").length} not built, ${tasks.filter((t) => t.state !== "δεν φτιάχτηκε" && (t.manual || !t.checks.length)).length} by hand only`);
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
