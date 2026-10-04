#!/usr/bin/env node
/*
 * CAN design-tokens.test.mjs SEE THE DESIGN BEING UNDONE?
 *
 * One mutant per rule of ΣΥΣΤΗΜΑ DESIGN (docs/CONTEXT.md) that the gate
 * claims to hold: the palette reopened, a palette class or a hex written
 * into a component, the signal colour used outside the globe and the
 * logo, a token dimmed below 4.5:1, the light theme or a stored choice
 * coming back, a shadow or a gradient returning, the focus ring changing
 * colour, a variable losing its channel form or used bare, and the
 * dotted background put back on a page.
 *
 * Run: node scripts/tests/design-tokens.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/design-tokens.test.mjs";
const TW = "tailwind.config.ts";
const CSS = "src/app/globals.css";
const STEP = "src/components/ui/step-flow.tsx";
const EMPTY = "src/components/empty-state.tsx";
const PREFS = "src/lib/theme-prefs.ts";
const LAYOUT = "src/app/layout.tsx";
const MENU = "src/components/ui/card-menu.tsx";
const CHART = "src/components/data-analysis/analysis-chart.tsx";
const HEADER = "src/components/dashboard/page-header.tsx";
const TARGETS = [GATE, TW, CSS, STEP, EMPTY, PREFS, LAYOUT, MENU, CHART, HEADER, "src/components/chat/chat-composer.tsx"];

const MUTANTS = [
  {
    name: "a component goes back to Tailwind's own radius scale",
    file: MENU,
    from: "overflow-hidden rounded-card border border-border bg-panel p-1\"",
    to: "overflow-hidden rounded-lg border border-border bg-panel p-1\"",
    expect: "every radius is one of the design's",
  },
  {
    name: "a stylesheet rule applies a radius the design does not have",
    file: "src/app/globals.css",
    from: "@apply min-h-[44px] w-full rounded-item border border-border bg-input",
    to: "@apply min-h-[44px] w-full rounded-t-2xl border border-border bg-input",
    expect: "every radius is one of the design's",
  },
  {
    name: "a bare rounded, Tailwind's 4px, comes back",
    file: MENU,
    from: "overflow-hidden rounded-card border border-border bg-panel p-1\"",
    to: "overflow-hidden rounded border border-border bg-panel p-1\"",
    expect: "every radius is one of the design's",
  },
  {
    name: "the conversation's field loses the 18px radius",
    file: "src/components/chat/chat-composer.tsx",
    from: "overflow-y-auto rounded-field border",
    to: "overflow-y-auto rounded-card border",
    expect: "the main field",
  },
  {
    name: "the palette is reopened with an orange",
    file: TW,
    from: '      muted: "rgb(var(--muted) / <alpha-value>)",',
    to: '      muted: "rgb(var(--muted) / <alpha-value>)",\n      orange: "rgb(249 115 22 / <alpha-value>)",',
    expect: "it holds the design's names and nothing else",
  },
  {
    name: "a Tailwind palette colour is written into a component",
    file: STEP,
    from: '"bg-panel-hover text-muted"',
    to: '"bg-orange-500/10 text-muted"',
    expect: "no Tailwind palette colour anywhere in src",
  },
  {
    name: "a hex is written straight into a component",
    file: EMPTY,
    from: '          <Icon className="h-6 w-6 text-foreground" aria-hidden="true" />',
    to: '          <Icon className="h-6 w-6" style={{ color: "#f97316" }} aria-hidden="true" />',
    expect: "no hex or rgb() literal",
  },
  {
    name: "the signal colour is used on something that is not the globe or the logo",
    file: STEP,
    from: '"bg-panel-hover text-muted"',
    to: '"bg-panel-hover text-signal"',
    expect: "no other source file names the signal colour",
  },
  {
    name: "the secondary text is dimmed below 4.5:1",
    file: CSS,
    from: "  --muted: 141 150 168;",
    to: "  --muted: 70 78 96;",
    expect: "muted on background",
  },
  {
    name: "the light theme comes back into the list",
    file: PREFS,
    from: 'export const THEMES: Theme[] = ["dark"];',
    to: 'export const THEMES: Theme[] = ["dark", "light" as Theme];',
    expect: "the theme list is [dark]",
  },
  {
    name: "an old stored choice is honoured instead of cleared",
    file: LAYOUT,
    from: "if(localStorage.getItem('theme')!==null){localStorage.removeItem('theme');}\n",
    to: "",
    expect: "the first-paint script sets dark and clears an old choice",
  },
  {
    name: "a shadow comes back on a menu",
    file: MENU,
    from: "overflow-hidden rounded-card border border-border bg-panel p-1\"",
    to: "overflow-hidden rounded-card border border-border bg-panel p-1 shadow-lg\"",
    expect: "no shadow, gradient or glow utility",
  },
  {
    name: "a gradient comes back on the card",
    file: CSS,
    from: "  border-radius: var(--radius-card);\n  background: rgb(var(--panel));\n  transition-property: border-color, background-color;",
    to: "  border-radius: var(--radius-card);\n  background: linear-gradient(150deg, rgb(var(--panel)), rgb(var(--panel-hover)));\n  transition-property: border-color, background-color;",
    expect: "no shadow, gradient or blur in the stylesheet",
  },
  {
    name: "the focus ring is drawn in the signal colour",
    file: CSS,
    from: "    outline: 2px solid rgb(var(--foreground));",
    to: "    outline: 2px solid rgb(var(--signal));",
    expect: "the focus ring is the text colour",
  },
  {
    name: "a token loses its channel form, so its alpha classes emit nothing",
    file: TW,
    from: '      muted: "rgb(var(--muted) / <alpha-value>)",',
    to: '      muted: "var(--muted)",',
    expect: "every colour is written in channel form",
  },
  {
    name: "a chart axis takes a channel variable bare",
    file: CHART,
    from: '  const axis = { stroke: "rgb(var(--muted))", fontSize: 11 };',
    to: '  const axis = { stroke: "var(--muted)", fontSize: 11 };',
    expect: "no channel variable is used bare",
  },
  {
    name: "the dotted background is put back on a page",
    file: HEADER,
    from: '<div className="relative mb-6 flex items-center gap-3">',
    to: '<div className="bg-dot-grid relative mb-6 flex items-center gap-3">',
    expect: "the dotted background is used nowhere",
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

console.log("design-tokens mutations\n");

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
