#!/usr/bin/env node
/*
 * COPY, AND THE SILENCE THAT MAKES A PERSON PRESS IT AGAIN.
 *
 * navigator.clipboard does not exist on an insecure origin and throws
 * without a user gesture. A button that only tries it does nothing, says
 * nothing, and looks exactly like a button that worked — so people press
 * it two or three times and paste whatever was there before.
 *
 * The parts that stop that are all small and all deletable: the fallback,
 * the label that changes, the timer that puts it back, the live region
 * that says so out loud, and the toast when it genuinely failed. None of
 * them breaks a render when it goes.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal, so a
 * mutation written that way is "caught" by the marker gate without any
 * behavioural check having looked at it.
 *
 * Run: node scripts/tests/copy-to-clipboard.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/copy-to-clipboard.test.mjs";
const BUTTON = "src/components/ui/copy-button.tsx";
const TARGETS = [...new Set([BUTTON])];

const MUTANTS = [
  {
    // 1. THE FALLBACK GOES. On an insecure origin — a phone on a local
    // network, an embedded webview — the button becomes decoration.
    name: "the execCommand fallback is removed",
    file: BUTTON,
    from: 'document.execCommand("copy")',
    to: "false",
    expect: "and its absence is survivable",
  },
  {
    // 2. THE FALLBACK TEXTAREA IS HIDDEN INSTEAD OF MOVED OFF-SCREEN. A
    // display:none element cannot be selected, so the copy silently
    // copies nothing — the one failure that looks identical to success.
    name: "the fallback element is hidden rather than moved off-screen",
    file: BUTTON,
    from: 'area.style.top = "-1000px";',
    to: 'area.style.display = "none";',
    expect: "the fallback element is off-screen, not hidden",
  },
  {
    // 3. THE TEXTAREA IS LEFT IN THE DOCUMENT, one per press, for ever.
    name: "the fallback element is never removed",
    file: BUTTON,
    from: "removeChild(area)",
    to: "contains(area)",
    expect: "and it is cleaned up either way",
  },
  {
    // 4. THE LABEL STOPS CHANGING. Nothing on screen distinguishes a
    // copy that worked from one that did nothing.
    name: "the label no longer confirms the copy",
    file: BUTTON,
    from: 'copied ? t("copied") : shown',
    to: "shown",
    all: true,
    expect: "the label changes after a copy",
  },
  {
    // 5. THE CONFIRMATION STOPS BEING ANNOUNCED, so a screen reader user
    // gets no feedback at all — the same silence, one audience over.
    name: "the confirmation stops being announced",
    file: BUTTON,
    from: 'role="status" aria-live="polite"',
    to: 'role="presentation"',
    expect: "the confirmation is announced",
  },
  {
    // 6. AND A REFUSED COPY SAYS NOTHING. This is the case the whole file
    // exists for: the browser said no, and the product did not pass it on.
    name: "a refused copy stops saying so",
    file: BUTTON,
    // TWO CALL SITES — the refusal and the thrown error — so removing
    // one leaves the check satisfied by the other. Both go.
    from: 'addToast(t("copyFailed"), "error")',
    to: "undefined",
    all: true,
    expect: "a refused copy says so",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("copy-to-clipboard mutations\n");

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
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    // An 'all' flag REPLACES EVERY OCCURRENCE. A defect that exists twice in one
    // file — the webhook returns early on a replay in two places — is not
    // re-introduced by changing the first, and the gate stays green for a
    // reason that is about the mutation rather than the code.
    const mutated = m.all
      ? originals.get(m.file).split(m.from).join(m.to)
      : originals.get(m.file).replace(m.from, m.to);
    writeFileSync(m.file, mutated);
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
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
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
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("A copy button that fails silently turns this red.");
