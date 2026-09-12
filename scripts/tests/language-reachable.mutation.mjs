#!/usr/bin/env node
/*
 * "I CANNOT FIND IT ON THE LAPTOP OR THE PHONE."
 *
 * Reported twice. The first time, top-nav.tsx wrapped the language control
 * in `hidden sm:contents` and the two phone-width copies were behind a tap
 * and below a fold. The fix for that produced the second report: a bare
 * globe icon among other bare icons on the laptop, and the drawer copy
 * sixteen rows down on the phone. RENDERED IS NOT REACHABLE, and both
 * arrangements were rendered.
 *
 * language-reachable.test.mjs is the premise written down: one control, in
 * the header, at every width, with the locale code beside the globe so it
 * reads as a word — and NOT a second one anywhere on the same screen. The
 * mutants below are each of those arrangements put back, one at a time:
 * the breakpoint wrapper, the bare globe, the drawer copy, the floating
 * cluster that no longer steps aside.
 *
 * Run: node scripts/tests/language-reachable.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/language-reachable.test.mjs";
const TOP_NAV = "src/components/dashboard/top-nav.tsx";
const SIDEBAR = "src/components/dashboard/sidebar.tsx";
const GLOBAL = "src/components/global-controls.tsx";
const SELECTOR = "src/components/i18n/language-selector.tsx";
const CARD = "src/components/settings/language-settings.tsx";
const SETTINGS = "src/app/dashboard/settings/page.tsx";

const MUTANTS = [
  {
    // THE FIRST REPORT, VERBATIM. `hidden sm:contents` is display:none
    // below the sm breakpoint — which is every phone — and it is what put
    // the control nowhere for the user who reported this.
    name: "the control goes back inside a `hidden sm:contents` wrapper",
    file: TOP_NAV,
    from: '        <LanguageSelector showCode testId="language-control" />',
    to: '        <span className="hidden sm:contents">\n          <LanguageSelector showCode testId="language-control" />\n        </span>',
    expect: "outside any `hidden` wrapper",
  },
  {
    // THE SECOND REPORT. A globe with no locale code beside it is one more
    // grey icon in a row of grey icons; the person looking for their
    // language does not recognise it.
    name: "the locale code disappears and the control is a bare globe again",
    file: TOP_NAV,
    from: '<LanguageSelector showCode testId="language-control" />',
    to: '<LanguageSelector testId="language-control" />',
    expect: "locale code beside the globe",
  },
  {
    // THE DRAWER COPY. It sat under sixteen rows, below the fold of every
    // phone, and was reported as absent — so a second control is not
    // redundancy, it is the thing that hid the first one.
    name: "a second selector reappears in the sidebar drawer",
    file: SIDEBAR,
    from: "export function Sidebar",
    to: 'import { LanguageSelector } from "@/components/i18n/language-selector";\n\nfunction DrawerLanguage() {\n  return <LanguageSelector />;\n}\n\nexport function Sidebar',
    expect: "does NOT render a second selector",
  },
  {
    // TWO CONTROLS ON ONE SCREEN. The floating cluster is for public
    // pages; on /dashboard the bar already has one, and both being present
    // is its own defect — a user changes one and the other still reads the
    // old value.
    name: "the floating cluster stops standing down on /dashboard",
    file: GLOBAL,
    from: '  if (pathname?.startsWith("/dashboard")) {\n    return null;\n  }',
    to: "",
    expect: "steps aside on /dashboard",
  },
  {
    // THE HOOK THE PRODTEST NEEDS. language-visible.prodtest.mjs finds
    // this control in a real browser by its testid; without it the live
    // half of this guarantee is measuring nothing.
    name: "the selector stops forwarding its test hook onto the button",
    file: SELECTOR,
    from: "        data-testid={testId}",
    to: "",
    expect: "forwards testId",
  },
  {
    // A COOKIE IS NOT A PREFERENCE. Writing only the cookie means the
    // language resets on the next device, which is the shape of "I set it
    // and it did not stick".
    name: "the settings card stops writing the account's own preference",
    file: CARD,
    from: "    const result = await persistLocalePreference(code);",
    to: "    const result = { ok: true } as const;",
    expect: "writes the ACCOUNT",
  },
  {
    // THE DEEP LINK. Settings links to #language from elsewhere in the
    // app; without the id the anchor lands at the top of a long page.
    name: "the settings card loses the #language anchor",
    file: CARD,
    from: '      id="language"',
    to: '      id="language-card"',
    expect: "addressable as #language",
  },
  {
    // THE CARD IMPORTED AND NEVER RENDERED — the shape where the control
    // exists, is wired, and is on no screen.
    name: "Settings imports the language card but stops rendering it",
    file: SETTINGS,
    from: "<LanguageSettings />",
    to: "<></>",
    expect: "and renders it",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"] };
  }
}

console.log("language-reachable mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [f, t] of originals) writeFileSync(f, t); };

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, m.all ? original.split(m.from).join(m.to) : original.replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restoreAll(); }
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
console.log(after.green ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("Neither arrangement that hid the language control can come back without this going red.");
