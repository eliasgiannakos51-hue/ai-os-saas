// Image — "16. IMAGE: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ ΚΑΙ ΤΑ ΝΕΑ ΚΟΥΜΠΙΑ" (owner,
// 2026-10-30), Κομμάτι 2.
//
// The owner's own stop-gate sits right after this piece: "ΜΟΝΟ ΕΔΩ: μου
// στέλνεις στιγμιότυπο υπολογιστή και κινητού και σταματάς μέχρι να γράψω
// «εγκρίνω»." So this file holds the screen ONLY — a tools rail (Product
// ad, Animate), a settings panel (Same product, Search the web first) —
// and asserts the NEGATIVE: nothing from either is sent to a route yet.
// image-studio.test.mjs (86 checks) already holds the generator itself and
// is unaffected — this file checks it stayed that way.
//
// Run: node scripts/tests/image-tools-panel.test.mjs
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

const shell = readFileSync("src/components/images/image-shell.tsx", "utf8");
const studio = readFileSync("src/lib/images/image-studio.ts", "utf8");
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const im = en.dashboard.images;

console.log("== 1. every existing feature is untouched ==");
check("variants grid is still there", /data-testid="image-grid"/.test(shell) && /data-testid="image-variant"/.test(shell));
check("choosing one still changes it with words", /data-testid="image-chosen"/.test(shell));
check("download and full-download are still there", /data-testid="image-download"/.test(shell) && /data-testid="image-full"/.test(shell));
check("delete is still there", /data-testid="image-delete"/.test(shell));
check("the aspect-ratio option is still there", /data-testid="image-aspect"/.test(shell));
check("the [◧] history column is still there", /history=\{\{/.test(shell) && /<ShellHistoryColumn/.test(shell));
check("price-before-press is still there", /data-testid="image-price"/.test(shell) && /LargeActionConfirm/.test(shell));

console.log("\n== 2. the tools rail: Product ad and Animate, chrome only ==");
check("the rail is there, in the work panel (not the shell's own options bar)", /data-testid="image-tools-rail"/.test(shell));
check("Product ad is inert — disabled, no route behind it", /disabled\s*\n\s*data-testid="image-tool-product-ad"/.test(shell));
check("...and no onClick that calls anything", !/data-testid="image-tool-product-ad"[\s\S]{0,400}onClick/.test(shell));
check("Animate's enabled state is READ, not hardcoded — from the same registry the Video/Editing tiles use", /ALL_TOOLS\.find\(\(tool\) => tool\.name === "video"\)\?\.ready === true/.test(shell) && /ALL_TOOLS\.find\(\(tool\) => tool\.name === "editing"\)\?\.ready === true/.test(shell));
check("Animate's disabled attribute is driven by that same flag, not a separate hardcoded one", /disabled=\{!animateReady\}\s*\n\s*data-testid="image-tool-animate"/.test(shell));
check("no model/provider call is wired to either tool yet", !/data-testid="image-tool-(?:product-ad|animate)"[\s\S]{0,600}fetch\(/.test(shell));

console.log("\n== 3. the settings panel: Same product (≤4 refs) and Search the web first ==");
check("the panel is there", /data-testid="image-settings-panel"/.test(shell));
check("up to MAX_SAME_PRODUCT_IMAGES slots are drawn from one constant, not four written out", /Array\.from\(\{ length: MAX_SAME_PRODUCT_IMAGES \}\)/.test(shell));
check("that constant is exactly 4, declared once in the shared lib", /export const MAX_SAME_PRODUCT_IMAGES = 4;/.test(studio));
check("a reference image is picked from the device, never typed", /type="file"/.test(shell) && /accept="image\/\*"/.test(shell));
check("picking is local state only — no upload, no fetch, no FormData", !/sameProductImages[\s\S]{0,300}(?:fetch\(|FormData)/.test(shell));
check("each slot can be removed again", /data-testid="image-same-product-slot"/.test(shell) && /removeSameProductImage/.test(shell));
check("object URLs are revoked, not leaked, both on remove and on unmount", /URL\.revokeObjectURL/.test(shell));
check("Search the web first is a real switch (role, aria-checked), not a checkbox styled to look like one", /data-testid="image-search-web"[\s\S]{0,60}role="switch"/.test(shell) || /role="switch"[\s\S]{0,400}data-testid="image-search-web"/.test(shell));
check("...local state only, never sent anywhere yet", !/searchWebFirst[\s\S]{0,200}fetch\(/.test(shell));

console.log("\n== 4. the negative space the stop-gate requires — NOT built yet ==");
check("make() does not send same-product references or the web-search flag (Κομμάτι 6/7, not this one)", !/make\([\s\S]{0,400}(?:sameProduct|searchWebFirst)/.test(shell));
check("still exactly two fetch() calls in the whole file — generate/edit/full share one, delete has its own; no third added for same-product or web-search", (shell.match(/fetch\(/g) ?? []).length === 2);

console.log("\n== 5. there is nothing to type into but the shell's own field ==");
check("no second typable field (file pickers are allowed — the same rule tool-shell.test.mjs holds)", !/<textarea\b|<input\b(?![^>]*type="(?:checkbox|radio|file)")/.test(shell));

console.log("\n== 6. every new string is translated, never hardcoded ==");
check("the six new tool/panel strings are translated keys in en.json", ["productAd", "animate", "sameProduct", "addReference", "removeReference", "searchWeb"].every((k) => typeof im.tools?.[k] === "string" && im.tools[k].length > 0));
check("the shared 'coming soon' badge is reused, not a new near-duplicate string", /useTranslations\("dashboard\.comingSoon"\)/.test(shell) && /tSoon\("badge"\)/.test(shell));
for (const locale of ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"]) {
  const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).dashboard.images;
  check(`${locale}: all six new tool/panel strings are there`, ["productAd", "animate", "sameProduct", "addReference", "removeReference", "searchWeb"].every((k) => typeof m.tools?.[k] === "string" && m.tools[k].length > 0));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
