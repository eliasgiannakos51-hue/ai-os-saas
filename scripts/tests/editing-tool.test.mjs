// Editing — "18. EDITING: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΜΗΧΑΝΗ REMOTION" (owner,
// 2026-10-30), Κομμάτι 2 ONLY.
//
// The owner's own stop-gate sits right after this piece: "ΜΟΝΟ ΕΔΩ:
// στιγμιότυπο και σταματάς μέχρι να γράψω «εγκρίνω»." So this file holds
// the screen ONLY — a tools rail (Zoom, Graphics), both inert — behind the
// new "editing-tool" switch, independent of all-tools.ts's own `ready`
// flag (which stays false until every piece of the directive passes, the
// same rule Apps' own screen-only piece followed).
//
// Run: node scripts/tests/editing-tool.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const shell = readFileSync("src/components/editing/editing-shell.tsx", "utf8");
const page = readFileSync("src/app/dashboard/editing/page.tsx", "utf8");
const flags = readFileSync("src/lib/flags/flags.ts", "utf8");
const allTools = readFileSync("src/lib/nav/all-tools.ts", "utf8");
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const ed = en.dashboard.editing;

console.log("== 1. the switch — a new one, independent of `ready` ==");
check("'editing-tool' is declared in FLAGS", /"editing-tool":/.test(flags));
check("the page reads it, not `ready`", /isFeatureOn\("editing-tool", user\)/.test(page));
check("anyone it is not open to gets the Coming Soon screen", /isFeatureOn\("editing-tool", user\)\)\)\s*\{\s*return \(\s*<div[\s\S]{0,200}<ComingSoonShell/.test(page));
check("the real shell is behind that same check, not a separate one", /<EditingShell \/>/.test(page) && (page.match(/isFeatureOn\("editing-tool", user\)/g) ?? []).length === 1);
check("all-tools.ts keeps `ready: false` for editing — this piece is screen-only, not the whole directive", /name: "editing"[\s\S]{0,80}ready: false/.test(allTools));
check("...and its waitingFor text no longer promises the old ffmpeg decision", !/waitingFor:[\s\S]{0,300}ffmpeg/.test(allTools.match(/name: "editing"[\s\S]{0,400}\},/)?.[0] ?? ""));

console.log("\n== 2. the tools rail: Zoom and Graphics, chrome only ==");
check("the rail is there", /data-testid="editing-tools-rail"/.test(shell));
check("Zoom is inert — disabled, no route behind it", /disabled data-testid="editing-tool-zoom"/.test(shell));
check("Graphics is inert too", /disabled data-testid="editing-tool-graphics"/.test(shell));
check("no model/provider call wired to either yet", !/data-testid="editing-tool-(?:zoom|graphics)"[\s\S]{0,400}fetch\(/.test(shell));
check("in fact there is no fetch( anywhere in this piece — nothing is wired yet", !/fetch\(/.test(shell));
check("no third tool beyond the two the directive names (pieces 5-9 are not drawn here)", (shell.match(/data-testid="editing-tool-/g) ?? []).length === 2);

console.log("\n== 3. the workspace opens by default, but is never a dead end ==");
check("the workspace is the initial pane, matching a real editor opening straight in", /useState<"workspace" \| null>\("workspace"\)/.test(shell));
check("it can be closed back to the composer", /onCloseWork=\{\(\) => setPane\(null\)\}/.test(shell));
check("...and reopened from a visible option, so the composer is never unreachable on mobile", /data-testid="editing-workspace-open"/.test(shell) && /setPane\("workspace"\)/.test(shell));
check("the empty/composer landing is real, not dead code behind an always-open work panel", /empty=\{\{/.test(shell) && /heading: t\("empty\.heading"\)/.test(shell));
check("the empty examples reuse the Coming Soon ones already written for Editing, not a near-duplicate", /useTranslations\("dashboard\.comingSoon\.examples\.editing"\)/.test(shell));

console.log("\n== 4. the negative space the stop-gate requires — NOT built yet ==");
check("send() only echoes a 'not built' reply — no plan, no AI edit (piece 3+)", /function send\(text: string\) \{\s*say\("user", text\);\s*say\("tool", t\("notBuilt"\)\);\s*\}/.test(shell));
check("sending never reaches `work`/pane state — words and the workspace stay unconnected, exactly matching the directive's own un-approved pieces 3-9", !/send\([\s\S]{0,300}setPane/.test(shell));

console.log("\n== 5. there is nothing to type into but the shell's own field ==");
check("no second typable field (file pickers would be allowed, none used here)", !/<textarea\b|<input\b(?![^>]*type="(?:checkbox|radio|file)")/.test(shell));

console.log("\n== 6. every new string is translated, never hardcoded ==");
const NEW_KEYS_OK = (m) =>
  typeof m?.notBuilt === "string" &&
  m.notBuilt.length > 0 &&
  typeof m?.placeholder === "string" &&
  m.placeholder.length > 0 &&
  typeof m?.workspaceTitle === "string" &&
  m.workspaceTitle.length > 0 &&
  typeof m?.tools?.zoom === "string" &&
  m.tools.zoom.length > 0 &&
  typeof m?.tools?.graphics === "string" &&
  m.tools.graphics.length > 0 &&
  typeof m?.noMaterial === "string" &&
  m.noMaterial.length > 0 &&
  typeof m?.empty?.heading === "string" &&
  m.empty.heading.length > 0;
check("en: every new dashboard.editing.* string exists", NEW_KEYS_OK(ed));
for (const locale of ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"]) {
  const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).dashboard.editing;
  check(`${locale}: every new dashboard.editing.* string exists`, NEW_KEYS_OK(m));
}
for (const locale of ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"]) {
  const examples = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).dashboard.comingSoon.examples.editing;
  check(`${locale}: the comingSoon.examples.editing strings this shell reuses are still there`, ["a", "b", "c"].every((k) => typeof examples?.[k] === "string" && examples[k].length > 0));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
