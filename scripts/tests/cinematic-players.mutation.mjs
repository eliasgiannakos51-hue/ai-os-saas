#!/usr/bin/env node
/*
 * CAN cinematic-players.test.mjs SEE THE ALLOWLIST GOING LOOSE, THE
 * STRIP AND THE SCAN DISAGREEING, THE SWITCH BEING READ TWICE, OR THE
 * FLAG QUIETLY DISAPPEARING?
 *
 * This is Phase 1a: no cinematic STYLE is wired into generation yet, so
 * every mutation here is about the one thing this slice actually ships —
 * the allowlisted path a published page may load its own player script
 * from, and the switch that gates it. Eight mutations, one per
 * load-bearing clause:
 *
 *   1. the scan's && guard loosens to || — fails open regardless of flag (scan)
 *   2. the exact-match check becomes a substring check               (scan)
 *   3. scanWebsiteHtmlForSecurityIssues's default flips to fail OPEN (scan)
 *   4. stripDisallowedExternalScripts ignores the switch entirely   (scan)
 *   5. the generate route reads the switch TWICE                 (process)
 *   6. the generate route passes a hardcoded true to the scan call (process)
 *   7. the edit route passes a hardcoded false, not the variable     (edit)
 *   8. the flag quietly loses its key                               (flags)
 *
 * Run: node scripts/tests/cinematic-players.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/cinematic-players.test.mjs";
const SCAN = "src/lib/website-html-security-scan.ts";
const PROCESS = "src/app/api/websites/generate/process/route.ts";
const EDIT = "src/app/api/websites/edit/route.ts";
const FLAGS = "src/lib/flags/flags.ts";
const TARGETS = [GATE, SCAN, PROCESS, EDIT, FLAGS];

const MUTANTS = [
  {
    name: "the scan's && guard loosens to || — fails open regardless of the switch",
    file: SCAN,
    from: "if (options.cinematicSitesEnabled && isAllowedOwnScriptSrc(match[1])) continue;",
    to: "if (options.cinematicSitesEnabled || isAllowedOwnScriptSrc(match[1])) continue;",
    expect: "with the switch OFF, our own script is still flagged — fails closed",
  },
  {
    name: "the exact-match check becomes a substring check — a path AFTER the allowed one gets through",
    file: SCAN,
    from: "return (ALLOWED_OWN_SCRIPT_SRCS as readonly string[]).includes(raw);",
    to: "return (ALLOWED_OWN_SCRIPT_SRCS as readonly string[]).some((s) => raw.startsWith(s));",
    expect: "path traversal after it is rejected",
  },
  {
    name: "scanWebsiteHtmlForSecurityIssues's default flips to fail OPEN",
    file: SCAN,
    from: "options: { appHost?: string; cinematicSitesEnabled?: boolean } = {}",
    to: 'options: { appHost?: string; cinematicSitesEnabled?: boolean } = { cinematicSitesEnabled: true }',
    expect: "with no options object at all (the old call shape), it is still flagged and stripped",
  },
  {
    name: "stripDisallowedExternalScripts ignores the switch entirely — our own script survives even when it is OFF",
    file: SCAN,
    from: "(cinematicSitesEnabled && isAllowedOwnScriptSrc(src) ? tag : \"\")",
    to: "(isAllowedOwnScriptSrc(src) ? tag : \"\")",
    expect: "and stripped",
  },
  {
    name: "the generate route reads the switch TWICE — strip and scan could silently disagree",
    file: PROCESS,
    // Anchored on the flag's own declaration line plus the strip call
    // alone (not the hero-parallax lines 2026-11-09 now inserted between
    // them, which would make this anchor go stale the next time THAT
    // block's own wording changes — see cinematic-hero.mutation.mjs for
    // the mutant that owns the hero step's own position in this file).
    from: 'const cinematicSitesEnabled = await isFeatureOn("cinematic-sites", user);',
    to: 'const cinematicSitesEnabled = await isFeatureOn("cinematic-sites", user);\n      const cinematicSitesEnabledAgain = await isFeatureOn("cinematic-sites", user); void cinematicSitesEnabledAgain;',
    expect: "the switch is read exactly once per request",
  },
  {
    name: "the generate route passes a hardcoded true to the scan call, not the flag variable",
    file: PROCESS,
    from: "scanWebsiteHtmlForSecurityIssues(doc, { appHost: getSiteHostname() ?? undefined, cinematicSitesEnabled })",
    to: "scanWebsiteHtmlForSecurityIssues(doc, { appHost: getSiteHostname() ?? undefined, cinematicSitesEnabled: true })",
    expect: "generate: passes it to scanWebsiteHtmlForSecurityIssues",
  },
  {
    name: "the edit route passes a hardcoded false to the strip call, not the flag variable",
    file: EDIT,
    from: "updatedHtml = stripDisallowedExternalScripts(updatedHtml, cinematicSitesEnabled);",
    to: "updatedHtml = stripDisallowedExternalScripts(updatedHtml, false);",
    expect: "edit: passes it to stripDisallowedExternalScripts",
  },
  {
    name: "the flag quietly loses its declared key",
    file: FLAGS,
    from: '  "cinematic-sites":',
    to: '  "cinematic-sites-renamed":',
    expect: "is a declared key",
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

console.log("cinematic-players mutations\n");
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
      missed.push({ ...m, why: `the gate went red, but on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}
const after = runGate();
console.log(after.green ? "\nbaseline: the gate is green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause in cinematic-players.test.mjs is load-bearing.");
