#!/usr/bin/env node
/*
 * CAN i18n-coverage.test.mjs SEE ENGLISH REACH A CUSTOMER AGAIN?
 *
 * That file went from a ratchet ("no file may get worse") to a zero for
 * every screen a customer can reach, plus a classified allowance for the
 * two sets that are English on purpose. A zero is only worth the name if
 * the ways around it are closed, and this suite re-opens them one at a
 * time:
 *
 *   · a hardcoded sentence back in a component;
 *   · an aria-label reached through an identifier, which is how four
 *     English words shipped for months UNDER a check that reported zero;
 *   · an owner-only panel that stops being owner-only, which is what the
 *     "the audience is one person" reason rests on;
 *   · a legal page that stops being a legal page, which is what the other
 *     reason rests on.
 *
 * EVERY MUTATION IS A PRODUCT MUTATION. Deleting one of the gate's own
 * assertions would also turn it red and would prove nothing — a check
 * cannot fail to notice its own absence. What has to be shown is that the
 * defect in the app is what makes it red.
 *
 * Run: node scripts/tests/i18n-coverage.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/i18n-coverage.test.mjs";
const TEXT_ACTIONS = "src/components/text-actions/text-actions-textarea.tsx";
const DANGER = "src/components/settings/danger-zone.tsx";
const COSTS_PAGE = "src/app/dashboard/costs/page.tsx";
const COOKIES = "src/app/cookies/page.tsx";
const UPGRADE = "src/components/billing/upgrade-required.tsx";

const MUTANTS = [
  {
    // 1. THE HOLE THIS ROUND FOUND. `aria-label={label}` is an EXPRESSION,
    // so section 1d — which holds literal aria attributes at zero and had
    // done since it landed — never resolved it to the four English words
    // sitting in the array above. On ICON-ONLY buttons, where the
    // aria-label IS the button.
    name: "a toolbar label goes back to a literal reached through an identifier",
    file: TEXT_ACTIONS,
    from: '  { id: "rewrite", labelKey: "textActions.rewrite", icon: Wand2 },',
    to: '  { id: "rewrite", label: "Rewrite", icon: Wand2 },',
    also: [
      { file: TEXT_ACTIONS, from: "aria-label={tCommon(labelKey)}", to: "aria-label={label}" },
      { file: TEXT_ACTIONS, from: "{ACTIONS.map(({ id, labelKey, icon: Icon }) => (", to: "{ACTIONS.map(({ id, label, icon: Icon }) => (" },
    ],
    expect: "no aria-* text attribute is a hardcoded string",
  },
  {
    // 2. A SENTENCE BACK IN A COMPONENT. The baseline has no room for it
    // now, so it can only arrive as a file with no entry at all.
    name: "an English error prefix returns to the delete-account panel",
    file: DANGER,
    from: '              {tCommon("errorWithMessage", { message: error })}',
    to: "              error: {error}",
    expect: "no file renders MORE bare English than its baseline",
  },
  {
    // 3. THE OWNER-ONLY REASON STOPS BEING TRUE. Twelve English labels on
    // the cost dashboard are defensible while one person can load the page
    // and indefensible the moment a customer can.
    name: "the cost dashboard stops being owner-only",
    file: COSTS_PAGE,
    from: "  if (!isAdminEmail(user.email)) notFound();",
    to: "  void isAdminEmail;",
    expect: "every owner-only file is only reachable behind isAdminEmail",
  },
  {
    // 4. THE LEGAL REASON STOPS BEING TRUE. 123 English hits are allowed
    // because these are contract texts; a page that is not one of those
    // has no claim on the allowance.
    name: "a legal page stops rendering LegalLayout",
    file: COOKIES,
    from: "<LegalLayout",
    to: "<PlainLayout",
    expect: "every legal-baselined file really renders LegalLayout",
  },
  {
    // 5. THE PAYWALL GOES BACK TO ENGLISH — the screen a customer meets
    // exactly when they are being asked for money.
    name: "the upgrade wall goes back to an English heading",
    file: UPGRADE,
    from: '{t("upgradeRequired.title")}',
    to: "Upgrade Required",
    expect: "no file renders MORE bare English than its baseline",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("i18n-coverage mutations\n");

const TARGETS = [...new Set(MUTANTS.flatMap((m) => [m.file, ...(m.also ?? []).map((a) => a.file)]))];
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
    const edits = [{ file: m.file, from: m.from, to: m.to }, ...(m.also ?? [])];
    const stale = edits.filter((e) => !originals.get(e.file).includes(e.from));
    if (stale.length > 0) {
      missed.push({ ...m, why: `the mutation target no longer exists: ${stale.map((e) => `${e.file} "${e.from.slice(0, 40)}"`).join("; ")}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const next = new Map(originals);
    for (const e of edits) next.set(e.file, next.get(e.file).replace(e.from, e.to));
    for (const [file, text] of next) if (text !== originals.get(file)) writeFileSync(file, text);

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
console.log("The zero holds, and both reasons in the allowance are load-bearing.");
