#!/usr/bin/env node
/*
 * CAN greeting-name.test.mjs SEE THE GREETING GO BACK TO ENGLISH, OR THE
 * NAME GO BACK TO THE EMAIL?
 *
 * Each mutation is a way the V6 1.10a fix could quietly undo itself: the
 * English literal returning, the email becoming the source again, the
 * person's own choice losing to Google's, a locale losing its words, the
 * home page or the settings field disconnected.
 *
 * Run: node scripts/tests/greeting-name.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/greeting-name.test.mjs";
const LIB = "src/lib/greeting.ts";
const HEADER = "src/components/overview/greeting-header.tsx";
const OVERVIEW = "src/app/dashboard/overview/page.tsx";
const FIELD = "src/components/settings/display-name-settings.tsx";
const EL = "messages/el.json";
const TARGETS = [GATE, LIB, HEADER, OVERVIEW, FIELD, EL];

const MUTANTS = [
  {
    name: "the morning greeting is English again",
    file: LIB,
    from: 'if (hour < 12) return { part: "morning", emoji: "☀️" };',
    to: 'if (hour < 12) return { part: "Good morning", emoji: "☀️" };',
    expect: "08:00 Athens -> morning",
  },
  {
    name: "Google's name wins over the one the person typed",
    file: LIB,
    from: "  const chosen = text(metadata?.display_name);\n  if (chosen) return chosen;\n",
    to: "",
    expect: "what the person typed wins",
  },
  {
    name: "the email becomes a source again",
    file: LIB,
    from: "  if (full) return full.split(/\\s+/)[0];\n  return null;",
    to: "  if (full) return full.split(/\\s+/)[0];\n  return text(metadata?.email) || null;",
    expect: "the email is never the source",
  },
  {
    name: "the cap is dropped",
    file: LIB,
    from: 'typeof v === "string" ? v.trim().slice(0, MAX_DISPLAY_NAME_LENGTH) : ""',
    to: 'typeof v === "string" ? v.trim() : ""',
    expect: "a name is capped",
  },
  {
    name: "Greek loses its evening",
    file: EL,
    from: '"evening": "Καλησπέρα"',
    to: '"evening": ""',
    expect: "el: morning, afternoon, evening",
  },
  {
    name: "the header shows the key instead of the words",
    file: HEADER,
    from: "{tPromise(`greeting.${greeting.part}`)}",
    to: "{greeting.part}",
    expect: "the header renders the translated part",
  },
  {
    name: "home stops passing the name",
    file: OVERVIEW,
    from: "<GreetingHeader name={greetingName(user.user_metadata)} />",
    to: "<GreetingHeader name={null} />",
    expect: "home passes greetingName",
  },
  {
    name: "the settings field saves to the wrong key",
    file: FIELD,
    from: "data: { display_name: trimmed || null }",
    to: "data: { ai_persona_name: trimmed || null }",
    expect: "the settings field writes display_name",
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

console.log("greeting-name mutations\n");

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
