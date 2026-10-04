#!/usr/bin/env node
/*
 * CAN email-strings.test.mjs SEE THE EMAIL PACK LIE?
 *
 * The ways the V6 1.10d pack could mislead a reader or the owner: an email
 * group silently left out, a footer split into one "line" per character,
 * tier 1 swelling past an hour, the welcome email falling out of it, and
 * a translation changing while the pack keeps last week's wording.
 *
 * Run: node scripts/tests/email-strings.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/email-strings.test.mjs";
const SCRIPT = "scripts/email-strings.mjs";
const EL = "messages/el.json";
const TARGETS = [GATE, SCRIPT, EL];

const MUTANTS = [
  {
    name: "an email group is left out of the pack",
    file: SCRIPT,
    from: '  { group: "footer", likely: false, why: "the footer under every email" },\n',
    to: "",
    expect: "every email group is in the pack",
  },
  {
    name: "a one-string group is split into characters",
    file: SCRIPT,
    // The first count of this namespace made exactly this mistake: 59
    // "lines" of footer, one per character.
    from: '  if (node === null || typeof node !== "object") return [[prefix, String(node)]];',
    to: '  if (node === null || typeof node !== "object") return [...String(node)].map((ch, i) => [`${prefix}.${i}`, ch]);',
    expect: "is one line, not one per character",
  },
  {
    name: "every line of a likely email becomes a sentence",
    file: SCRIPT,
    from: "export const SENTENCE_WORDS = 5;",
    to: "export const SENTENCE_WORDS = 1;",
    expect: "tier 1 is about an hour",
  },
  {
    name: "the welcome email drops out of tier 1",
    file: SCRIPT,
    from: '{ group: "welcome", likely: true,',
    to: '{ group: "welcome", likely: false,',
    expect: "the welcome email is in tier 1",
  },
  {
    name: "a Greek email line changes and the pack is not rebuilt",
    file: EL,
    from: '"preheader": "Ο λογαριασμός σου στο Ionexa AI είναι έτοιμος."',
    to: '"preheader": "Ο λογαριασμός σου είναι έτοιμος."',
    expect: "docs/first-run/emails.el.md is up to date",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 60_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("email-strings mutations\n");

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
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git status`.",
);
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
