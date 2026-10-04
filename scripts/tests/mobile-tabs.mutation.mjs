#!/usr/bin/env node
/*
 * CAN mobile-tabs.test.mjs SEE THE PHONE'S BAR DRIFT?
 *
 * A tab dropped, a page lighting the wrong tab, the bar shown on a
 * desktop, a target under 44px, the current tab unannounced, and the
 * conversation's field sliding under the bar.
 *
 * Run: node scripts/tests/mobile-tabs.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/mobile-tabs.test.mjs";
const TABS = "src/lib/nav/tabs.ts";
const BAR = "src/components/dashboard/mobile-tab-bar.tsx";
const LAYOUT = "src/app/dashboard/layout.tsx";
const CHAT = "src/app/dashboard/chat/page.tsx";
const TARGETS = [GATE, TABS, BAR, LAYOUT, CHAT];

const MUTANTS = [
  {
    name: "the You tab is dropped",
    file: TABS,
    from: '  { key: "you", href: "/dashboard/settings" },\n',
    to: "",
    expect: "Home, Chat, Tools, You",
  },
  {
    name: "the account's pages light Tools",
    file: TABS,
    from: '    if (rail.key === "settings") return "you";\n',
    to: "",
    expect: "every page lights the right tab",
  },
  {
    name: "the bar shows on a desktop too",
    file: BAR,
    from: " md:hidden",
    to: "",
    expect: "on a phone only",
  },
  {
    name: "a tab shrinks under 44px",
    file: BAR,
    from: "min-h-[56px]",
    to: "min-h-[36px]",
    expect: "every target is at least 44px",
  },
  {
    name: "the current tab is not announced",
    file: BAR,
    from: '                aria-current={isActive ? "page" : undefined}\n',
    to: "",
    expect: "the current tab says so",
  },
  {
    name: "the page body ends under the bar",
    file: LAYOUT,
    from: '<main id="main-content" className="flex-1 pb-16 md:pb-0">',
    to: '<main id="main-content" className="flex-1">',
    expect: "leaves its height free below md",
  },
  {
    name: "the conversation's field slides under the bar",
    file: CHAT,
    from: '<div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">',
    to: '<div className="h-[calc(100vh-4rem)]">',
    expect: "keeps its field above the bar",
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

console.log("mobile-tabs mutations\n");

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
