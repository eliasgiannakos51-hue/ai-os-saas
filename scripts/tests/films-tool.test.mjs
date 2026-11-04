// Films — "20. FILMS: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΕΛΕΓΧΟ ΑΝΑ ΠΛΑΝΟ" (owner,
// 2026-10-30), Κομμάτι 2 ONLY.
//
// The owner's own stop-gate sits right after this piece: "ΜΟΝΟ ΕΔΩ:
// στιγμιότυπο και σταματάς μέχρι να γράψω «εγκρίνω»." So this file holds
// the screen ONLY — stage bar, credits, Characters & places (inert),
// storyboard grid (sample shots), and the per-shot inspector panel —
// behind the new "films-tool" switch, independent of all-tools.ts's own
// `ready` flag (stays false until every piece of the directive passes).
//
// Run: node scripts/tests/films-tool.test.mjs
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

const shell = readFileSync("src/components/films/films-shell.tsx", "utf8");
const page = readFileSync("src/app/dashboard/films/page.tsx", "utf8");
const flags = readFileSync("src/lib/flags/flags.ts", "utf8");
const allTools = readFileSync("src/lib/nav/all-tools.ts", "utf8");
const honesty = readFileSync("docs/FILMS-HONESTY.md", "utf8");
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const fl = en.dashboard.films;

console.log("== 0. piece 1 — honesty before every charge — is still answered ==");
check("the doc exists and answers the exact four durations the directive names", ["1 λεπτό", "10 λεπτά", "1 ώρα", "3 ώρες"].every((d) => honesty.includes(d)));
check("character stability is answered honestly, not promised", /δεν θυμούνται τίποτα/.test(honesty) && /δεν μπορεί να υποσχεθεί σήμερα/.test(honesty));
check("the numbers are reproducible, not hand-typed", /node scripts\/film-cost\.mjs/.test(honesty));

console.log("\n== 1. the switch — a new one, independent of `ready` ==");
check("'films-tool' is declared in FLAGS", /"films-tool":/.test(flags));
check("the page reads it, not `ready`", /isFeatureOn\("films-tool", user\)/.test(page));
check("the real shell is behind that same check, not a separate one", /<FilmsShell \/>/.test(page) && (page.match(/isFeatureOn\("films-tool", user\)/g) ?? []).length === 1);
check("all-tools.ts keeps `ready: false` for films — this piece is screen-only, not the whole directive", /name: "films"[\s\S]{0,80}ready: false/.test(allTools));
check("...and its waitingFor text no longer promises the old 'just needs keys' story", /pieces 5-9 still need Video\/Audio\/Editing's own generators/.test(allTools));

console.log("\n== 2. the stage bar: five stages, traced to the directive's own pieces ==");
check("the bar is there", /data-testid="films-stage-bar"/.test(shell));
check("exactly five stages, matching pieces 3/4/5/8/9, drawn from one list not five hand-written blocks", /data-testid="films-stage"/.test(shell) && /const STAGES: StageKey\[\] = \["script", "characters", "storyboard", "shooting", "edit"\];/.test(shell));
check("every stage shows its own status (waiting/working/done), not a fixed label", /STAGE_STATUS\[stage\]/.test(shell) && /stageStatusLabels\[STAGE_STATUS\[stage\]\]/.test(shell));
check("the mechanism really handles all three statuses, not just the one it shows today", /waiting: "text-muted"/.test(shell) && /working: "text-warning"/.test(shell) && /done: "text-success"/.test(shell));
check("today every stage honestly reads waiting — nothing past this screen is wired yet", /script: "waiting"[\s\S]{0,120}characters: "waiting"[\s\S]{0,120}storyboard: "waiting"[\s\S]{0,120}shooting: "waiting"[\s\S]{0,120}edit: "waiting"/.test(shell));

console.log("\n== 3. credits — shown, never invented ==");
check("the credits line is there", /data-testid="films-credits"/.test(shell));
check("no fabricated number — an em dash, with an honest reason why", /<span className="text-foreground">—<\/span>/.test(shell) && /credits\.unknown/.test(shell));

console.log("\n== 4. Characters & places — inert today, piece 4 is not built ==");
check("the section is there", /data-testid="films-characters-places"/.test(shell));
check("add-character is inert — disabled, no route behind it", /disabled data-testid="films-add-character"/.test(shell));
check("add-place is inert too", /disabled data-testid="films-add-place"/.test(shell));
check("no fetch( anywhere in this piece — nothing is wired yet", !/fetch\(/.test(shell));

console.log("\n== 5. the storyboard grid: sample frames, never pretending to be real output ==");
check("the grid is there", /data-testid="films-storyboard-grid"/.test(shell));
check("exactly three sample shots, explicitly labeled as a sample — never claimed as real generation", /const SAMPLE_SHOT_IDS = \["1", "2", "3"\];/.test(shell) && /storyboard\.sampleCaption/.test(shell));
check("pressing a shot gets the white ring the directive asks for (the same ring-foreground idiom Image's own chosen-variant already uses)", /selectedShot === id \? "ring-2 ring-foreground" : ""/.test(shell));
check("pressing the same shot again closes the panel (press = toggle, not a one-way door)", /setSelectedShot\(\(prev\) => \(prev === id \? null : id\)\)/.test(shell));

console.log("\n== 6. the shot inspector — real, per-shot, local-only state ==");
check("the panel only exists once a shot is selected", /\{current && selectedShot && \(/.test(shell));
check("Camera angle: exactly the five options the directive names", /const ANGLES: Angle\[\] = \["wide", "medium", "closeUp", "fromAbove", "low"\];/.test(shell));
check("Light: exactly the four options", /const LIGHTS: Light\[\] = \["day", "goldenHour", "night", "warmInside"\];/.test(shell));
check("Camera move: exactly the four options", /const MOVES: CameraMove\[\] = \["still", "slowPush", "pan", "handheld"\];/.test(shell));
check("each picker is a real, accessible group (role, aria-pressed per option)", /role="group" aria-label=\{label\}/.test(shell) && /aria-pressed=\{value === option\}/.test(shell));
check("settings are kept per shot, not one shared global choice", /Record<string, ShotSettings>/.test(shell) && /settingsFor\(shotId\)/.test(shell));
check("Continue from previous shot is a real switch (role, aria-checked), not a styled checkbox", /role="switch"[\s\S]{0,400}data-testid="films-panel-continue"/.test(shell));
check("none of the panel's own state ever reaches fetch( — still nothing wired", !/updateShot[\s\S]{0,200}fetch\(/.test(shell));

console.log("\n== 7. Reshoot — inert, and its credit number is NOT invented ==");
check("Reshoot is disabled — the same 'real call, no pipeline yet' rule as Product ad/Animate/Zoom/Graphics this session", /disabled data-testid="films-panel-reshoot"/.test(shell));
check("its label carries no fabricated credit count — the translation call takes no interpolated params", /\{t\("panel\.reshoot"\)\}/.test(shell) && !/t\("panel\.reshoot",/.test(shell));

console.log("\n== 8. the workspace opens by default, but is never a dead end ==");
check("the workspace is the initial pane, matching a real production tool opening straight in", /useState<"workspace" \| null>\("workspace"\)/.test(shell));
check("it can be closed back to the composer", /onCloseWork=\{\(\) => setPane\(null\)\}/.test(shell));
check("...and reopened from a visible option", /data-testid="films-workspace-open"/.test(shell) && /setPane\("workspace"\)/.test(shell));
check("the empty/composer landing is real, reusing the two Coming Soon examples already written for Films, not a near-duplicate", /useTranslations\("dashboard\.comingSoon\.examples\.films"\)/.test(shell));

console.log("\n== 9. there is nothing to type into but the shell's own field ==");
check("no second typable field", !/<textarea\b|<input\b(?![^>]*type="(?:checkbox|radio|file)")/.test(shell));

console.log("\n== 10. every new string is translated, never hardcoded ==");
const NEW_KEYS_OK = (m) =>
  typeof m?.notBuilt === "string" && m.notBuilt.length > 0 &&
  typeof m?.workspaceTitle === "string" && m.workspaceTitle.length > 0 &&
  ["script", "characters", "storyboard", "shooting", "edit"].every((k) => typeof m?.stages?.[k] === "string" && m.stages[k].length > 0) &&
  ["waiting", "working", "done"].every((k) => typeof m?.stageStatus?.[k] === "string" && m.stageStatus[k].length > 0) &&
  typeof m?.credits?.label === "string" && typeof m?.credits?.unknown === "string" &&
  typeof m?.charactersPlaces?.addCharacter === "string" && typeof m?.charactersPlaces?.addPlace === "string" &&
  typeof m?.storyboard?.heading === "string" && typeof m?.storyboard?.shot === "string" && typeof m?.storyboard?.sampleCaption === "string" &&
  ["wide", "medium", "closeUp", "fromAbove", "low"].every((k) => typeof m?.panel?.angleOptions?.[k] === "string") &&
  ["day", "goldenHour", "night", "warmInside"].every((k) => typeof m?.panel?.lightOptions?.[k] === "string") &&
  ["still", "slowPush", "pan", "handheld"].every((k) => typeof m?.panel?.moveOptions?.[k] === "string") &&
  typeof m?.panel?.continueFromPrevious === "string" && typeof m?.panel?.reshoot === "string";
check("en: every new dashboard.films.* string exists", NEW_KEYS_OK(fl));
for (const locale of ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"]) {
  const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).dashboard.films;
  check(`${locale}: every new dashboard.films.* string exists`, NEW_KEYS_OK(m));
}
for (const locale of ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"]) {
  const examples = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).dashboard.comingSoon.examples.films;
  check(`${locale}: the comingSoon.examples.films strings this shell reuses are still there`, ["a", "b"].every((k) => typeof examples?.[k] === "string" && examples[k].length > 0));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
