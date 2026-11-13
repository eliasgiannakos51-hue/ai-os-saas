// Apps — "ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ" (owner, 2026-10-30), Κομμάτι 2:
// screens left, a live app on a phone center, data + "Who sees what"
// right, tabs Preview/Data/Plan.
//
// apps-tool.test.mjs already holds the box-list-and-approve mechanism
// (now under the "Plan" tab) to its own 78 checks, so this file is the
// NEW surface only: the tab bar, the phone mockup, and that it reuses
// Motion from the same shared file Site extracted it to — never a copy.
//
// Run: node scripts/tests/apps-preview-screen.test.mjs
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

const shell = readFileSync("src/components/app-builder/app-builder-shell.tsx", "utf8");
const phone = readFileSync("src/components/app-builder/phone-frame.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const ab = en.dashboard.appBuilder;

console.log("== 1. three tabs, Preview first ==");
check("a tablist with three tabs is drawn from one list", /\(\["preview", "data", "plan"\] as const\)\.map/.test(shell));
check("each is a real tab (role, aria-selected)", /role="tab"/.test(shell) && /aria-selected=\{tab === kind\}/.test(shell));
check("Preview is the default tab", /useState<AppTab>\("preview"\)/.test(shell));
check("tab labels are a static lookup, not a template-literal key (message-slices)", /tabLabels: Record<AppTab, string> = \{\s*preview: t\("tabs\.preview"\),\s*data: t\("tabs\.data"\),\s*plan: t\("tabs\.plan"\),/.test(shell));
check("no dynamic t(`tabs.${...}`) key anywhere", !/t\(`tabs\./.test(shell));

console.log("\n== 2. the Plan tab is today's box-list-and-approve mechanism, just moved under a tab ==");
check("the box list still lives behind tab === \"plan\"", /tab === "plan" && \([\s\S]{0,400}data-testid="app-plan"/.test(shell));
check("the approve button is still there, unmoved in behaviour", /data-testid="app-approve"/.test(shell) && /data-testid="app-approved"/.test(shell));

console.log("\n== 3. the Preview tab: screens left, a phone center, data+access right ==");
check("screens are listed and pressable", /data-testid="app-preview-screen"/.test(shell) && /aria-pressed=\{activeScreenKey === s\.key\}/.test(shell));
check("choosing one sets local state, not a server call", /onClick=\{\(\) => setSelectedScreenKey\(s\.key\)\}/.test(shell));
check("an empty plan says so rather than drawing nothing", /t\("noScreensYet"\)/.test(shell));
check("the phone frame wraps the mocked screen", /<PhoneFrame>[\s\S]{0,300}renderScreenMock\(activeScreen, activeCollection\)/.test(shell));
check("the right column shows data and who-sees-what for the SELECTED screen's collection only", /boxNames\.data/.test(shell) && /boxNames\.access/.test(shell) && /activeCollection\.visibility === "own" \? t\("seesOwn"\) : t\("seesOwner"\)/.test(shell));
check("there is an honest caption that this is a live preview, not a working app yet", /t\("previewCaption"\)/.test(shell));

console.log("\n== 4. the mockup invents nothing and opens no second field ==");
check("a form screen renders each field's own LABEL and type, never a fabricated value", /\{typeNames\[f\.type\]\}/.test(shell));
check("the mock field uses the shared .input look as a plain div, not a real field", /className="input flex items-center text-muted" data-testid="app-mock-field"/.test(shell));
check("the mock submit is inert — a styled div, not a button wired to anything", /className="btn-outline w-full justify-center font-semibold" data-testid="app-mock-submit"/.test(shell) && !/data-testid="app-mock-submit"[^>]*onClick/.test(shell));
check("a list screen shows ONE row and says it is a sample, never several invented rows", (shell.match(/data-testid="app-mock-row"/g) ?? []).length === 1 && /t\("sampleRow"\)/.test(shell));

console.log("\n== 5. Motion here is the SAME shared component Site uses, not a copy ==");
check("imported from the shared path, not re-declared", /import \{ MotionButton \} from "@\/components\/shell\/motion-button"/.test(shell));
check("rendered once, in the Preview tab's phone toolbar", /<MotionButton \/>/.test(shell));
check("no Motion state is duplicated locally (motionOpen/MOTION_STYLES absent here)", !/motionOpen|MOTION_STYLES/.test(shell));

console.log("\n== 6. the phone frame's chrome is declared once, not per screen (design-density) ==");
check("the component uses the shared .phone-frame class, no raw border utility", /className="phone-frame"/.test(phone) && !/className="[^"]*\bborder\b/.test(phone));
check("that shared class is declared exactly once in globals.css", (css.match(/^\s*\.phone-frame\s*\{/gm) ?? []).length === 1);
check("no shadow, gradient or blur was introduced for it", !/\.phone-frame[^}]*\{[^}]*(?:shadow|gradient|blur)/.test(css));

console.log("\n== 7. every new string is translated, never hardcoded ==");
check("tab labels are translated keys", Boolean(ab.tabs?.preview) && Boolean(ab.tabs?.data) && Boolean(ab.tabs?.plan));
check("the empty-screens, caption, mock-submit and sample-row strings are all translated keys", [ab.noScreensYet, ab.previewCaption, ab.formSubmit, ab.sampleRow].every((v) => typeof v === "string" && v.length > 0));
for (const locale of ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"]) {
  const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).dashboard.appBuilder;
  check(`${locale}: the new tab/preview strings are all there`, [m.tabs?.preview, m.tabs?.data, m.tabs?.plan, m.noScreensYet, m.previewCaption, m.formSubmit, m.sampleRow].every((v) => typeof v === "string" && v.length > 0));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
