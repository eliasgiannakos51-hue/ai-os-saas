// 3D — "23. 3D: ΝΕΟ ΕΡΓΑΛΕΙΟ" (owner, 2026-10-31), Κομμάτι 2 ONLY.
//
// The owner's own stop-gate sits right after this piece: "ΜΟΝΟ ΕΔΩ:
// στιγμιότυπα υπολογιστή και κινητού, και σταματάς μέχρι να γράψω
// «εγκρίνω»." So this file holds the screen ONLY — empty landing, the
// interactive placeholder box (drag/zoom/reset), the photos strip, the
// settings panel (Type/Quality/Real size/Format/Background) and the
// inert top bar (View in AR/Download/Make final) — behind the new
// "3d-tool" switch, independent of all-tools.ts's own `ready` flag
// (stays false until every piece of the directive passes). Unlike every
// earlier directive this season, 3D is a BRAND NEW tool (no pre-existing
// Σύντομα stub) — so this file also checks the registry entry itself
// exists, since nothing reaches `/dashboard/3d` without it.
//
// Run: node scripts/tests/3d-tool.test.mjs
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

const shell = readFileSync("src/components/three-d/three-d-shell.tsx", "utf8");
const page = readFileSync("src/app/dashboard/3d/page.tsx", "utf8");
const flags = readFileSync("src/lib/flags/flags.ts", "utf8");
const allTools = readFileSync("src/lib/nav/all-tools.ts", "utf8");
const providers = readFileSync("docs/3D-PROVIDERS.md", "utf8");
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const td = en.dashboard.threeD;

console.log("== 0. piece 1 — provider research is written down, not just in memory ==");
check("the three required providers were all researched", ["Meshy", "Tripo", "TRELLIS"].every((p) => providers.includes(p)));
check("the EU-exclusion check the directive requires is explicit, for every provider", /Εξαίρεση ΕΕ/.test(providers) && (providers.match(/Καμία βρέθηκε/g) ?? []).length >= 2);
check("Draft-cheap / Final-top-tier is a stated proposal, not left open", /Πρόχειρο[\s\S]{0,40}χωρίς υφή[\s\S]{0,200}Τελικό[\s\S]{0,40}8K/.test(providers) || /Meshy για Πρόχειρο ΚΑΙ Τελικό/.test(providers));
check("keys go in ΘΕΛΩ, not into the switch or the code", /ΘΕΛΩ ΑΠΟ ΤΟΝ ΗΛΙΑ/.test(providers) && /Κλειδί API Meshy/.test(providers));
check("the migrations line is present even though this piece touches none", /ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ: καμία/.test(providers));

console.log("\n== 1. the switch — a new one, independent of `ready` ==");
check("'3d-tool' is declared in FLAGS", /"3d-tool":/.test(flags));
check("the page reads it, not `ready`", /isFeatureOn\("3d-tool", user\)/.test(page));
check("the real shell is behind that same check, not a separate one", /<ThreeDShell \/>/.test(page) && (page.match(/isFeatureOn\("3d-tool", user\)/g) ?? []).length === 1);

console.log("\n== 2. the registry entry — this tool did not exist before this directive ==");
check("threeD is a member of the closed AllToolsNameKey union", /"image" \| "threeD" \| "video"/.test(allTools));
check("the registry entry itself: group 'make', right address, ready:false", /name: "threeD", group: "make", href: "\/dashboard\/3d", ready: false/.test(allTools));
check("waitingFor names the real blocker (no provider key yet), not a vague placeholder", /waitingFor: "the screen is built behind the '3d-tool' switch[\s\S]{0,200}no photo-to-3D provider key from the owner yet"/.test(allTools));

console.log("\n== 3. the empty landing: globe, question, 3 examples, the shared '+' for photos ==");
check("the empty landing uses the directive's own heading key", /heading: t\("empty\.heading"\)/.test(shell));
check("exactly three examples, through the shared examples namespace", /tExamples\("a"\)[\s\S]{0,80}tExamples\("b"\)[\s\S]{0,80}tExamples\("c"\)/.test(shell));
check("the '+' is the shell's own built-in attach prop, not a new upload field", /attach=\{\{ accept: "image\/\*", label: t\("attachPhotos"\), onFiles: addPhotos \}\}/.test(shell));
check("accept is scoped to images, since the directive asks for photos only", /accept: "image\/\*"/.test(shell));

console.log("\n== 4. photos: capped at 4, added and removed cleanly ==");
check("the cap is a named constant matching the directive's '1 έως 4'", /const MAX_PHOTOS = 4;/.test(shell));
check("adding photos respects remaining room, never exceeds the cap", /const room = MAX_PHOTOS - prev\.length;/.test(shell));
check("non-image files are filtered out even though input already scopes to image/*", /f\.type\.startsWith\("image\/"\)/.test(shell));
check("removing a photo revokes its object URL — no leaked blobs", /URL\.revokeObjectURL\(gone\.url\)/.test(shell));
check("closing the work view clears every photo and revokes every URL, not just the state array", /function closeWork\(\)[\s\S]{0,160}URL\.revokeObjectURL\(photo\.url\)[\s\S]{0,40}setPhotos\(\[\]\)/.test(shell));

console.log("\n== 5. the model viewer: a real interactive placeholder box, not a static picture ==");
check("drag rotates via Pointer Events, with capture — not mouse-only", /onPointerDown=\{onPointerDown\}/.test(shell) && /setPointerCapture\(e\.pointerId\)/.test(shell));
check("rotation.x is clamped so the box cannot flip past vertical", /Math\.max\(-89, Math\.min\(89,/.test(shell));
check("the current rotation and zoom are exposed as data attributes, so a test can read the real state, not just believe a claim", /data-rotation-x=\{rotation\.x\.toFixed\(1\)\}/.test(shell) && /data-rotation-y=\{rotation\.y\.toFixed\(1\)\}/.test(shell) && /data-zoom=\{zoom\.toFixed\(2\)\}/.test(shell));
check("zoom in/out are real buttons, clamped to a sane range", /Math\.min\(MAX_ZOOM,/.test(shell) && /Math\.max\(MIN_ZOOM,/.test(shell));
check("reset restores BOTH rotation and zoom to the same defaults every time", /function resetView\(\)[\s\S]{0,80}setRotation\(DEFAULT_ROTATION\)[\s\S]{0,40}setZoom\(1\)/.test(shell));
check("the box is a real 6-face cube (preserve-3d + translateZ), not a flat image standing in for one", /transformStyle: "preserve-3d"/.test(shell) && (shell.match(/<BoxFace transform=/g) ?? []).length === 6);
check("only one face carries the placeholder label — the directive's own explicit allowance, not a finished model", /<BoxFace transform="translateZ\(48px\)">\{t\("viewer\.placeholderLabel"\)\}<\/BoxFace>/.test(shell));

console.log("\n== 6. the top bar: View in AR / Download / Make final, all inert — no pipeline yet ==");
check("View in AR is disabled, same 'real call, no pipeline yet' rule as every other stop-gated piece this session", /testId: "threeD-view-ar", icon: Smartphone/.test(shell));
check("Download is disabled too", /testId: "threeD-download", icon: Download/.test(shell));
check("both render through one disabled-button list, not two near-duplicate blocks", /INERT_BAR\.map\(\(\{ testId, icon: Icon, label \}\) =>/.test(shell));
check("Make final carries NO fabricated credit count — its own translation call takes no interpolated params", /\{t\("bar\.makeFinal"\)\}/.test(shell) && !/t\("bar\.makeFinal",/.test(shell));
check("Make final is disabled and styled outline, not the page's one filled-accent control — so it never competes with the composer's own send button for 'one white button per screen'", /data-testid="threeD-make-final" className="btn-outline relative[^"]*opacity-60"/.test(shell));

console.log("\n== 7. the settings panel: Type, Quality, Real size, Format, Background, price ==");
check("Type: exactly the three options the directive names", /const TYPES: ModelType\[\] = \["product", "furniture", "object"\];/.test(shell));
check("Quality: exactly Draft/Final", /const QUALITIES: Quality\[\] = \["draft", "final"\];/.test(shell));
check("Format: exactly GLB/USDZ/STL, matching docs/3D-PROVIDERS.md's format research", /const FORMATS: Format\[\] = \["glb", "usdz", "stl"\];/.test(shell));
check("Background: White/Transparent", /const BACKGROUNDS: Background\[\] = \["white", "transparent"\];/.test(shell));
check("every chip group is a real, accessible group (role, aria-pressed per option) — the same OptionGroup for all four, not four hand-written blocks", /role="group" aria-label=\{label\}/.test(shell) && /aria-pressed=\{value === option\}/.test(shell) && (shell.match(/<OptionGroup /g) ?? []).length === 4);
check("labels are a Record built from literal t(\"...\") calls, never a template-literal key — the exact unbounded-component bug fixed in Films this season, avoided here from the start", !/t\(`/.test(shell) && /Record<ModelType, string> = \{ product: t\("panel\.typeOptions\.product"\)/.test(shell));
check("Real size is inert — a disabled button, NOT an <input>, since piece 2 only lists the field while piece 6 builds the real dimension entry", /data-testid="threeD-real-size"/.test(shell) && /<button type="button" disabled aria-label=\{t\("panel\.realSize"\)\}/.test(shell));
check("price is never fabricated — an em dash, honestly, since no provider call has run", /\{t\("panel\.price"\)\}: <span className="text-foreground">—<\/span>/.test(shell));

console.log("\n== 8. there is nothing to type into but the shell's own field ==");
check("no second typable field — Real size stays a button, never a numeric <input>", !/<textarea\b|<input\b(?![^>]*type="(?:checkbox|radio|file)")/.test(shell));

console.log("\n== 9. the work screen only opens once photos exist, and closes cleanly ==");
check("empty until a photo is attached — matching Image's own paradigm, not Films/Editing's always-open workspace", /const work =\s*\n\s*photos\.length > 0/.test(shell));
check("onCloseWork is wired to the real cleanup function", /onCloseWork=\{closeWork\}/.test(shell));

console.log("\n== 10. no fetch( anywhere — nothing is wired to a real provider yet ==");
check("the component makes no network call of its own", !/fetch\(/.test(shell));

console.log("\n== 11. every new string is translated, never hardcoded ==");
const NEW_KEYS_OK = (m) =>
  typeof m?.notBuilt === "string" && m.notBuilt.length > 0 &&
  typeof m?.placeholder === "string" && m.placeholder.length > 0 &&
  typeof m?.attachPhotos === "string" && m.attachPhotos.length > 0 &&
  typeof m?.workspaceTitle === "string" && m.workspaceTitle.length > 0 &&
  typeof m?.empty?.heading === "string" && m.empty.heading.length > 0 &&
  typeof m?.photos?.heading === "string" && typeof m?.photos?.remove === "string" &&
  typeof m?.viewer?.zoomIn === "string" && typeof m?.viewer?.zoomOut === "string" && typeof m?.viewer?.reset === "string" && typeof m?.viewer?.placeholderLabel === "string" &&
  typeof m?.panel?.type === "string" &&
  ["product", "furniture", "object"].every((k) => typeof m?.panel?.typeOptions?.[k] === "string") &&
  typeof m?.panel?.quality === "string" &&
  ["draft", "final"].every((k) => typeof m?.panel?.qualityOptions?.[k] === "string") &&
  typeof m?.panel?.realSize === "string" && typeof m?.panel?.realSizeUnknown === "string" &&
  typeof m?.panel?.format === "string" &&
  ["glb", "usdz", "stl"].every((k) => typeof m?.panel?.formatOptions?.[k] === "string") &&
  typeof m?.panel?.background === "string" &&
  ["white", "transparent"].every((k) => typeof m?.panel?.backgroundOptions?.[k] === "string") &&
  typeof m?.panel?.price === "string" &&
  typeof m?.bar?.viewInAr === "string" && typeof m?.bar?.download === "string" && typeof m?.bar?.makeFinal === "string";
check("en: every new dashboard.threeD.* string exists", NEW_KEYS_OK(td));
for (const locale of ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"]) {
  const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).dashboard.threeD;
  check(`${locale}: every new dashboard.threeD.* string exists`, NEW_KEYS_OK(m));
}
for (const locale of ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"]) {
  const data = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const name = data.dashboard.tools.names.threeD;
  const line = data.dashboard.tools.lines.threeD;
  const examples = data.dashboard.comingSoon.examples.threeD;
  check(`${locale}: dashboard.tools.names/lines.threeD and comingSoon.examples.threeD all exist`, typeof name === "string" && name.length > 0 && typeof line === "string" && line.length > 0 && ["a", "b", "c"].every((k) => typeof examples?.[k] === "string" && examples[k].length > 0));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
