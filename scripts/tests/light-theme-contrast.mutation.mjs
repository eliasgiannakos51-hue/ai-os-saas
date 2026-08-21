#!/usr/bin/env node
/*
 * DOES THE CONTRAST TEST ACTUALLY CATCH ANYTHING?
 *
 * A green suite proves nothing about a suite that cannot go red. Every
 * defect this work fixed is re-introduced here, one at a time, against the
 * real files; the test is then run and REQUIRED to fail. A mutation the
 * test survives is reported as a hole, because that is what it is.
 *
 * The mutations are the actual historical bugs, not synthetic damage:
 * each one is the value that was shipping before it was measured.
 *
 * Run: node scripts/tests/light-theme-contrast.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TARGET = "scripts/tests/light-theme-contrast.test.mjs";
const CSS = "src/app/globals.css";
const CFG = "tailwind.config.ts";

const MUTANTS = [
  {
    name: "light --muted back to zinc-500 (4.32:1 on panel-hover)",
    file: CSS, from: "  --muted: #52525b;", to: "  --muted: #71717a;",
  },
  {
    name: "amber text ink back to amber-700 (4.49:1 on panel-hover)",
    file: CSS, from: "  --accent-amber-text: 146 64 14;", to: "  --accent-amber-text: 180 83 9;",
  },
  {
    name: "focus ring back to a 55% alpha wash",
    file: CSS,
    from: "    outline: 2px solid rgb(var(--accent-border));",
    to: "    outline: 2px solid rgba(249, 115, 22, 0.55);",
  },
  {
    name: "light backdrop back to dark's intensity",
    file: CSS, from: "  --backdrop-scale: 0.42;", to: "  --backdrop-scale: 1;",
  },
  {
    name: "light globe re-inked with dark's amber",
    file: CSS, from: "  --globe-ink: #9a3412;", to: "  --globe-ink: #f5a623;",
  },
  {
    name: "success ink back to emerald-400 (1.72:1)",
    file: CSS, from: "  --success-text: 4 120 87;", to: "  --success-text: 52 211 153;",
  },
  {
    name: "danger ink back to red-400 (2.47:1)",
    file: CSS, from: "  --danger-text: 185 28 28;", to: "  --danger-text: 248 113 113;",
  },
  {
    name: "corner pools back to dark's alphas",
    file: CSS,
    from: "    radial-gradient(60rem 40rem at 0% 0%, rgba(249, 115, 22, 0.013), transparent 60%),",
    to: "    radial-gradient(60rem 40rem at 0% 0%, rgba(249, 115, 22, 0.09), transparent 60%),",
  },
  {
    name: "the filled button's fill themed (label-vs-fill would move)",
    file: CFG,
    from: '        orange: { 950: "rgb(var(--accent-tint) / <alpha-value>)" },',
    to: '        orange: { 500: "rgb(var(--accent-tint) / <alpha-value>)" },',
  },
  {
    name: "a module hue dropped back to its dark-only value",
    file: CFG,
    from: '          400: "rgb(var(--module-cyan) / <alpha-value>)",',
    to: "",
  },
  {
    name: "the wordmark back to near-white in light (1.02:1)",
    file: CSS, from: "  --logo-ink: #18181b;", to: "  --logo-ink: #f5f5f5;",
  },
  {
    name: "a wordmark fill hardcoded back to a literal",
    file: "src/components/logo.tsx",
    from: '<rect x="255.6" y="252" width="2.9" height="18" rx="1" fill="var(--logo-ink, #f5f5f5)" />',
    to: '<rect x="255.6" y="252" width="2.9" height="18" rx="1" fill="#f5f5f5" />',
  },
  {
    name: "the hero orb back to its dark-theme wash",
    file: CSS, from: "    rgba(154, 52, 18, 0.018) 0%,", to: "    rgba(249, 115, 22, 0.45) 0%,",
  },
  {
    name: "the CTA pulse back to a 30px coloured bloom",
    file: CSS,
    from: "  --cta-glow-peak: 0 1px 3px rgba(24, 24, 27, 0.1), 0 4px 10px -3px rgba(124, 45, 18, 0.26);",
    to: "  --cta-glow-peak: 0 4px 30px 0 rgba(249, 115, 22, 0.75);",
  },
  {
    name: "a notice tint made heavy enough to swallow its own ink",
    file: CSS, from: "  --danger-tint: 254 226 226;", to: "  --danger-tint: 220 38 38;",
  },
  {
    name: "an alpha-neutralising rule removed",
    file: CSS,
    from: '[data-theme="light"] .text-orange-400\\/70,',
    to: "",
  },
];

let caught = 0, missed = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  if (!original.includes(m.from)) {
    missed.push({ ...m, why: "the mutation target no longer exists in the file" });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  writeFileSync(m.file, original.replace(m.from, m.to));
  let failed = false, detail = "";
  try {
    execFileSync("node", [TARGET], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "");
    const line = out.split("\n").filter((l) => l.includes("FAIL")).slice(0, 1)[0];
    detail = (line || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${detail}`);
  } else {
    missed.push({ ...m, why: "the suite stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}\n          the suite stayed green`);
  }
}

console.log(`\n${caught}/${MUTANTS.length} mutations caught`);
if (missed.length) {
  console.log("\nHOLES — these defects can ship without the suite noticing:");
  for (const m of missed) console.log(`  - ${m.name}: ${m.why}`);
  process.exit(1);
}
// The suite must also be green on the unmutated tree, or "caught" means
// nothing: a suite that is red already fails every mutation trivially.
try {
  execFileSync("node", [TARGET], { encoding: "utf8", stdio: "pipe" });
  console.log("baseline: the suite is green on the unmutated tree");
} catch (e) {
  console.log("BASELINE IS RED — every 'caught' above is meaningless");
  process.exit(1);
}
