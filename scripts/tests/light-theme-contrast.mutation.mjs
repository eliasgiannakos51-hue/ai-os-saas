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
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const TARGET = "scripts/tests/light-theme-contrast.test.mjs";
const CSS = "src/app/globals.css";
const CFG = "tailwind.config.ts";

const MUTANTS = [
  // ------------------------------------------------------------------
  // THE ELEVATION HALF, which arrived with PR #33 and shipped with no
  // mutants of its own. The glow guard, the .focus-glow ring and the
  // variable-following scanner were all undefended until here.
  // ------------------------------------------------------------------
  {
    // THIS ONE ALREADY HAPPENED. `.cta-amber` moved its glow behind
    // `var(--cta-glow-rest)` on the trunk and the line-scanner went blind
    // to it — ten glows became nine. Disabling the expansion puts that
    // blindness back.
    name: "the glow scanner stops following var() (a glow one hop away becomes invisible)",
    file: TARGET,
    from: "  for (let hop = 0; hop < 4 && /var\\(--/.test(out); hop += 1) {",
    to: "  for (let hop = 0; hop < 0 && /var\\(--/.test(out); hop += 1) {",
  },
  // A MUTANT WAS WRITTEN HERE AND WITHDRAWN, recorded rather than quietly
  // dropped. It deleted the LIGHT value of --cta-glow-rest, on the theory
  // that the variable is what covers `.cta-amber` in light. It is not:
  // `[data-theme="light"] .cta-amber` sets box-shadow directly, and the
  // pulse is answered by re-pointing `animation`. The mutation left every
  // assertion green because it changes nothing — an equivalent mutant,
  // and one that would have read as a caught bug. The dead code path it
  // was written to defend has been removed from the test instead.
  {
    // The light answer that IS load-bearing for the button.
    name: "the direct light override on the CTA is dropped (the button keeps its dark bloom on white)",
    file: CSS,
    from: "  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1), 0 4px 10px -3px rgba(194, 65, 12, 0.3);",
    to: "  box-shadow: 0 4px 18px -4px rgba(249, 115, 22, 0.45);",
  },
  {
    name: "a selector-level light override is dropped (the eleventh glow ships unanswered)",
    file: CSS,
    from: '[data-theme="light"] .card-lift:hover',
    to: '[data-theme="light"] .card-lift-removed:hover',
  },
  {
    name: "the .focus-glow ring goes back to a 45% orange (1.60:1 on white)",
    file: CSS,
    from: "  box-shadow: 0 0 0 2px rgb(var(--accent-border))",
    to: "  box-shadow: 0 0 0 1px rgba(249, 115, 22, 0.45)",
  },
  {
    name: "light --muted back to zinc-500 (4.32:1 on panel-hover)",
    file: CSS, from: "  --muted: 82 82 91;", to: "  --muted: 113 113 122;",
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
  // ------------------------------------------------------------------
  // The structural border, and the bare-var() class of bug.
  // ------------------------------------------------------------------
  {
    name: "light --border back to zinc-200 (1.13:1 on panel-hover, 157 measured failures)",
    file: CSS, from: "  --border: 134 134 143;", to: "  --border: 228 228 231;",
  },
  {
    name: "dark --border back to #242424 (1.12:1 on panel-hover)",
    file: CSS, from: "  --border: 106 106 113;", to: "  --border: 36 36 36;",
  },
  {
    name: "midnight's border left at its dark-only value",
    file: CSS, from: "  --border: 99 105 131;", to: "  --border: 31 39 64;",
  },
  {
    name: "carbon's border left at its dark-only value",
    file: CSS, from: "  --border: 122 122 130;", to: "  --border: 56 56 60;",
  },
  {
    name: "--border loses its headroom (3.02:1 — passes, but nothing left for the next backdrop)",
    file: CSS, from: "  --border: 134 134 143;", to: "  --border: 139 139 148;",
  },
  {
    name: "the border token goes back to a bare var() (every border-border/N dies)",
    file: CFG,
    from: 'border: "rgb(var(--border) / <alpha-value>)"',
    to: 'border: "var(--border)"',
  },
  {
    name: "--muted goes back to a bare var() (22 alpha usages emit nothing)",
    file: CFG,
    from: 'muted: "rgb(var(--muted) / <alpha-value>)"',
    to: 'muted: "var(--muted)"',
  },
  {
    name: "--panel goes back to a bare var() (34 alpha usages emit nothing)",
    file: CFG,
    from: 'panel: "rgb(var(--panel) / <alpha-value>)"',
    to: 'panel: "var(--panel)"',
  },
  {
    name: "a channel variable left as hex in ONE theme (rgb(#86868f / .5) is invalid)",
    file: CSS, from: "  --border: 134 134 143;", to: "  --border: #86868f;",
  },
  {
    name: "Recharts reads the raw channel variable again (invalid stroke colour)",
    file: "src/components/settings/ai-usage-settings.tsx",
    from: 'stroke="rgb(var(--border))"', to: 'stroke="var(--border)"',
  },
  {
    name: "a gradient reads the raw channel variable again",
    file: "src/components/ui/entity-card.tsx",
    from: "rgb(var(--panel))_0%", to: "var(--panel)_0%",
  },
  {
    name: "the border alpha-neutralising rule for the accent is removed",
    file: CSS,
    from: '[data-theme="light"] .border-orange-500\\/40',
    to: '[data-theme="light"] .border-orange-500\\/40-removed',
  },
  {
    name: "a module hue's border edge left on the raw palette (cyan-500 is 1.40:1 at 40%)",
    file: CFG,
    from: 'cyan: { 500: "rgb(var(--module-cyan) / <alpha-value>)", 600: "rgb(var(--module-cyan) / <alpha-value>)" },',
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
