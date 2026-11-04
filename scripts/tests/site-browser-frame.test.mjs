// Site — "ΝΕΑ ΟΘΟΝΗ ΚΑΙ ΣΤΥΛ ΚΙΝΗΣΗΣ" (owner, 2026-10-30), Κομμάτι 1.
//
// "Σήμερα δουλεύει: κρατάς κάθε λειτουργία, αλλάζεις την οθόνη" — this is
// a screen change on a tool that already works, so the first half of this
// file is a REGRESSION GUARD: every existing testid the shell already had
// (generate, change, undo, download, translate, history, boxes, pages,
// design, page-count) must still be there, untouched, after the chrome
// goes in around the preview.
//
// The second half is the new chrome: BrowserFrame (desktop/mobile) and the
// Motion button — BUT the owner's own directive has a hard stop-gate on
// Motion: "ΜΟΝΟ ΕΔΩ: φτιάχνεις πρώτα το κουμπί και τη λίστα... και
// σταματάς μέχρι να γράψω «εγκρίνω»." So this file also asserts the
// NEGATIVE: no scope choice (whole-site/section), no wording-based change,
// nothing written to a real site yet — only the button, the list of
// eight, and a decorative hover preview.
//
// Run: node scripts/tests/site-browser-frame.test.mjs
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

const shell = readFileSync("src/components/website-builder/website-shell.tsx", "utf8");
const frame = readFileSync("src/components/website-builder/browser-frame.tsx", "utf8");
const motion = readFileSync("src/components/shell/motion-button.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const wb = en.dashboard.websiteBuilder;
const tShellMsgs = en.dashboard.toolShell;

console.log("== 1. every existing feature is untouched (κρατάς κάθε λειτουργία) ==");
check("generation still goes through startSiteGeneration", /startSiteGeneration/.test(shell));
check("changes still go through requestSiteChange", /requestSiteChange/.test(shell));
check("undo is still there", /data-testid="site-undo"/.test(shell));
check("download is still there", /data-testid="site-download"/.test(shell));
check("translate button is still conditionally rendered", /<TranslateButton/.test(shell));
check("history toggle is still there", /data-testid="site-history-open"/.test(shell));
check("the box picker (press a section, outline it) is still there", /data-testid="site-box"/.test(shell) && /outlineBoxes/.test(shell));
check("page tabs are still there", /data-testid="site-page"/.test(shell));
check("the design popover is still there", /data-testid="site-design"/.test(shell));
check("the page-count popover is still there", /data-testid="site-page-count"/.test(shell));
check("publish is still there", /<PublishControl/.test(shell));
check("reference photos are still attachable", /data-testid="site-photos"/.test(shell));
check("unfilled/invented-number warnings are still shown", /unfilledTitle/.test(shell) && /inventedTitle/.test(shell));

console.log("\n== 2. the browser frame wraps BOTH previews (live and an old version) ==");
check("the live preview is wrapped in BrowserFrame", /<BrowserFrame[\s\S]{0,400}data-testid="site-live-preview"[\s\S]{0,200}<\/BrowserFrame>/.test(shell));
check("the old-version preview is wrapped in BrowserFrame too", /<BrowserFrame[\s\S]{0,400}data-testid="site-version-preview"[\s\S]{0,200}<\/BrowserFrame>/.test(shell));
check("both share the one viewport toggle, not two", (shell.match(/viewport=\{viewport\}/g) ?? []).length === 2);
check(
  "the address shown is the site's own name, never a fabricated domain",
  /<BrowserFrame address=\{current\.name\}/.test(shell) && !/https?:\/\//.test(frame)
);

console.log("\n== 3. the desktop/mobile toggle ==");
check("a desktop button exists", /data-testid="site-viewport-desktop"/.test(shell));
check("a mobile button exists", /data-testid="site-viewport-mobile"/.test(shell));
check("each reflects its own pressed state", /aria-pressed=\{viewport === "desktop"\}/.test(shell) && /aria-pressed=\{viewport === "mobile"\}/.test(shell));
check("mobile narrows the simulated page, not the frame itself", /viewport === "mobile" \? "w-full max-w-\[390px\]" : "w-full"/.test(frame));

console.log("\n== 4. BrowserFrame's chrome is declared once, not counted per use (design-density) ==");
check("the component uses the shared .browser-frame class, no raw border utility", /className="browser-frame"/.test(frame) && !/className="[^"]*\bborder\b/.test(frame));
check("that shared class is declared exactly once in globals.css", (css.match(/^\s*\.browser-frame\s*\{/gm) ?? []).length === 1);

console.log("\n== 5. Motion is a SHARED component, not inline/copied code (Apps directive, 2026-10-30) ==");
check("Site imports the shared MotionButton, does not re-declare it", /import \{ MotionButton \} from "@\/components\/shell\/motion-button"/.test(shell));
check("...and renders it in the same actions bar as the viewport toggle", /data-testid="site-viewport-mobile"[\s\S]{0,1200}<MotionButton \/>/.test(shell));
check("no Motion state/markup is left inline in website-shell.tsx (fully extracted)", !/motionOpen|motionPreview|MOTION_STYLES/.test(shell));

console.log("\n== 6. the Motion button and list themselves — the owner's stop-gate, in the shared file ==");
check("it opens a popover, not a new field", /aria-expanded=\{motionOpen\}/.test(motion));
check(
  "all eight named styles are offered, in the owner's own order",
  /MOTION_STYLES = \["none", "softFade", "slideUp", "parallax", "glass", "holographic", "typewriter", "hoverLift"\]/.test(motion)
);
check("each choice is a button (menuitemradio), never a typable field", /role="menuitemradio"/.test(motion));
check(
  "no typable field anywhere in the shared component (tool-shell's own hard rule)",
  !/<textarea\b|<input\b(?![^>]*type="(?:checkbox|radio|file)")/.test(motion)
);
check("hovering or focusing a choice drives the small preview, nothing else", /onMouseEnter={\(\) => setMotionPreview\(style\)}/.test(motion) && /onFocus={\(\) => setMotionPreview\(style\)}/.test(motion));

console.log("\n== 7. the negative space the stop-gate requires — NOT built yet ==");
check("no whole-site-vs-section scope choice exists for motion", !/motionScope|motion.{0,20}(whole|section)/i.test(motion) && !/motionScope/i.test(shell));
check("no wording-based motion change ('βάλε πιο ήρεμη κίνηση') is wired", !/motion.{0,40}(wording|words|change\(|requestMotion)/i.test(motion));
check("no motion style is ever sent to a real site generation/change route", !/(requestSiteChange|startSiteGeneration)\([^)]*motion/i.test(shell));
check("no motion value is persisted (no save/insert/update naming it)", !/\bmotion_style\b|\bmotionStyle\b.{0,30}(save|insert|update|persist)/i.test(motion));

console.log("\n== 8. the preview swatches respect reduced motion, same as the real feature will have to (ΚΡΙΤΗΡΙΟ 8) ==");
for (const style of ["softFade", "slideUp", "parallax", "glass", "holographic", "typewriter", "hoverLift"]) {
  check(
    `.motion-demo-${style} only animates under (prefers-reduced-motion: no-preference)`,
    new RegExp(`@media \\(prefers-reduced-motion: no-preference\\)\\s*\\{[\\s\\S]*?\\.motion-demo-${style}\\s*\\{[\\s\\S]{0,350}animation`).test(css)
  );
}
check("'none' has no demo animation defined at all (nothing to disable)", !new RegExp("\\.motion-demo-none\\s*\\{[^}]*animation").test(css));

console.log("\n== 9. every new string is translated, never hardcoded ==");
check("viewport group/labels are translated keys (Site's own, not shared)", Boolean(wb.viewportGroup) && Boolean(wb.viewportDesktop) && Boolean(wb.viewportMobile));
check("Motion's strings live under the SHARED toolShell namespace, not websiteBuilder (so Apps reads the same keys)", wb.motion === undefined);
check("the Motion button label is a translated key", Boolean(tShellMsgs.motion?.button));
check("all eight style names are translated keys, same order as MOTION_STYLES", ["none", "softFade", "slideUp", "parallax", "glass", "holographic", "typewriter", "hoverLift"].every((k) => Boolean(tShellMsgs.motion?.styles?.[k])));
check("the hover-preview sample text is a translated key, not literal JSX text", /\{tShell\("motion\.previewSample"\)\}/.test(motion));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
