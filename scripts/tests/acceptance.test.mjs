#!/usr/bin/env node
/*
 * THE FINAL CHECK COVERS EVERY LINE OF MASTER PART 16, AND EVERYTHING IT
 * SAYS RUNS, RUNS (MASTER «Η. Ο ΤΕΛΙΚΟΣ ΕΛΕΓΧΟΣ»; package 40).
 *
 * «Αυτές οι γραμμές γίνονται και οι εργασίες του docs/ACCEPTANCE.md.» So
 * the population is Part 16 itself: every number it lists has its task,
 * under the same number. Each task has every field; its state is one of
 * three words; every check it names is a file that exists; a task not
 * built names no check (nothing would be measured), and a built one names
 * one or says, after «χειροκίνητο:», why it cannot yet. A switch a task
 * names is a switch that exists. The runner, scripts/acceptance.mjs, reads
 * the document with the same parser this gate holds it to.
 *
 * Run: node scripts/tests/acceptance.test.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { parseAcceptance, STATES, FIELDS } from "../acceptance.mjs";

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

const DOC = process.env.ACCEPTANCE_DOC ?? "docs/ACCEPTANCE.md";
const tasks = parseAcceptance(readFileSync(DOC, "utf8"));
console.log("acceptance");

// ---------------------------------------------------------------------
console.log("\n== 1. every line of Part 16 is a task ==");
// ---------------------------------------------------------------------
const master = readFileSync("docs/MASTER.md", "utf8");
const part16 = master.slice(master.indexOf("ΜΕΡΟΣ 16."), master.indexOf("ΜΕΡΟΣ 17."));
const lines = [...new Set([...part16.matchAll(/(?:^|\s)(\d{1,2})\. (?=\S)/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
check(`Part 16 has ${lines.length} lines, 1 to ${lines.at(-1)}`, lines.length >= 40 && lines.every((n, i) => n === i + 1), lines.join(","));
const byPackage = new Map(tasks.map((t) => [t.fields["Πακέτο"], t]));
const uncovered = lines.filter((n) => byPackage.get(String(n))?.number !== n);
check("...and each is the task with its own number", uncovered.length === 0, uncovered.join(","));
check(`from sign-up to cancellation: at least 40 tasks (${tasks.length}), numbered without gaps`, tasks.length >= 40 && tasks.every((t, i) => t.number === i + 1));

// ---------------------------------------------------------------------
console.log("\n== 2. each task says everything ==");
// ---------------------------------------------------------------------
const incomplete = tasks.filter((t) => FIELDS.some((f) => !t.fields[f]));
check("every task: package, what I do, what I see, how long, how it runs, today", incomplete.length === 0, incomplete.map((t) => `Α${t.number}`).join(" "));
const stateless = tasks.filter((t) => !t.state);
check(`today is one of: ${STATES.join(", ")}`, stateless.length === 0, stateless.map((t) => `Α${t.number}`).join(" "));
const timeless = tasks.filter((t) => !/^\d+ (δευτερόλεπτα|λεπτό|λεπτά)$/.test(t.fields["Χρόνος"] ?? ""));
check("how long, in seconds or minutes", timeless.length === 0, timeless.map((t) => `Α${t.number}`).join(" "));

// ---------------------------------------------------------------------
console.log("\n== 3. what it says runs, runs ==");
// ---------------------------------------------------------------------
const named = tasks.flatMap((t) => [...(t.fields["Αυτόματα"] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1])).filter((p) => p.includes("/"));
const missing = named.filter((p) => !existsSync(p));
check(`every check named (${named.length}) is a file that exists`, named.length >= 20 && missing.length === 0, missing.join(" "));
const notBuiltButRun = tasks.filter((t) => t.state === "δεν φτιάχτηκε" && t.checks.length > 0);
check("a task not built names no check to run", notBuiltButRun.length === 0, notBuiltButRun.map((t) => `Α${t.number}`).join(" "));
const shapeless = tasks.filter((t) => !/^(`[^`]+`|χειροκίνητο: \S)/.test(t.fields["Αυτόματα"] ?? ""));
check("how it runs is a check, or «χειροκίνητο:» and why", shapeless.length === 0, shapeless.map((t) => `Α${t.number}`).join(" "));
const silent = tasks.filter((t) => t.state !== "δεν φτιάχτηκε" && t.checks.length === 0 && !/^χειροκίνητο: \S/.test(t.fields["Αυτόματα"] ?? ""));
check("a built task names its check, or says why it is by hand", silent.length === 0, silent.map((t) => `Α${t.number}`).join(" "));
const flags = readFileSync("src/lib/flags/flags.ts", "utf8");
const switches = tasks.flatMap((t) => [...(t.fields["Σήμερα"] ?? "").matchAll(/διακόπτη `([a-z-]+)`/g)].map((m) => m[1]));
const unknown = switches.filter((s) => !new RegExp(`\\n  (?:"${s}"|${s.includes("-") ? "(?!)" : s}): "`).test(flags));
check(`every switch named (${switches.length}) is declared`, switches.length >= 10 && unknown.length === 0, unknown.join(" "));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
check("npm run acceptance runs the runner", pkg.scripts?.acceptance === "node scripts/acceptance.mjs");

console.log(failures.length ? `\nFAILED: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
