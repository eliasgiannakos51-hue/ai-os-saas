// Website Builder — custom design (colours, background, own photos).
//
// REQUESTED: "choose the background: template / animated / my own photos",
// "choose colours: primary / secondary", "uploading my own images exists —
// make it obvious".
//
// The property that matters most here is the LAST one asserted: a user who
// touches none of these controls must send byte-for-byte the description
// they sent before the controls existed. A design feature that silently
// changes every generation for everyone is a regression wearing a feature's
// clothes.
//
// Run: node scripts/tests/website-design.test.mjs
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

const { loadTs } = await import("./load-ts.mjs");
const d = await loadTs("src/lib/website-design-brief.ts");
const workspace = readFileSync("src/components/website-builder/website-builder-workspace.tsx", "utf8");
const controls = readFileSync("src/components/website-builder/design-controls.tsx", "utf8");
const builder = readFileSync("src/lib/website-builder.ts", "utf8");

const base = "A website for a café in Thessaloniki";

console.log("== 1. defaults change nothing at all ==");
check("the default brief is empty", d.buildDesignBrief(d.DEFAULT_DESIGN_CHOICES) === "");
check(
  "so the description is unchanged, byte for byte",
  d.applyDesignBrief(base, d.DEFAULT_DESIGN_CHOICES) === base
);
check(
  "and an empty colour with images attached still adds nothing about colour",
  !d.buildDesignBrief({ ...d.DEFAULT_DESIGN_CHOICES, imageCount: 2 }).includes("COLOUR")
);

console.log("\n== 2. colours are stated as exact values, not suggestions ==");
const coloured = d.buildDesignBrief({
  ...d.DEFAULT_DESIGN_CHOICES,
  primaryColor: "#1D4ED8",
  secondaryColor: "#F59E0B",
});
check("the primary hex appears literally", coloured.includes("#1d4ed8"));
check("the secondary hex appears literally", coloured.includes("#f59e0b"));
check("the model is told not to substitute its own taste", /override your own aesthetic judgement/.test(coloured));
check("and specifically not to swap the colour", /Do not substitute a colour you consider more tasteful/.test(coloured));
check(
  "contrast is fixed by moving a neutral, not the chosen colours",
  /darken or lighten a NEUTRAL/.test(coloured)
);
check(
  "one colour alone still works",
  d.buildDesignBrief({ ...d.DEFAULT_DESIGN_CHOICES, primaryColor: "#1d4ed8" }).includes("#1d4ed8")
);
check(
  "and does not claim a two-colour scheme",
  !d.buildDesignBrief({ ...d.DEFAULT_DESIGN_CHOICES, primaryColor: "#1d4ed8" }).includes("SECONDARY COLOUR")
);

console.log("\n== 3. invalid colours are ignored, never passed through ==");
for (const bad of ["blue", "#fff", "#12345", "#gggggg", "", "   ", "#1d4ed8; rm -rf"]) {
  check(
    `"${bad}" is rejected`,
    !d.isValidHexColor(bad) &&
      d.buildDesignBrief({ ...d.DEFAULT_DESIGN_CHOICES, primaryColor: bad }) === ""
  );
}
check("a valid one is accepted", d.isValidHexColor("#1d4ed8"));
check("case does not matter", d.isValidHexColor("#1D4ED8"));

console.log("\n== 4. every background option produces a real instruction ==");
for (const style of d.BACKGROUND_STYLES) {
  const brief = d.buildDesignBrief({ ...d.DEFAULT_DESIGN_CHOICES, background: style, imageCount: 3 });
  if (style === "auto") {
    // Only the BACKGROUND line is absent — the image-use line still
    // applies, because imageCount is 3 here.
    check("auto adds no background instruction", !brief.includes("BACKGROUND:"));
    check("but still says what to do with the uploads", brief.includes("UPLOADED PHOTOS:"));
    continue;
  }
  check(`${style} produces an instruction`, brief.includes("BACKGROUND:"));
}
// Each option should reference a pattern the system prompt already
// defines, so the model reproduces known-good CSS rather than inventing it.
const gradient = d.buildDesignBrief({ ...d.DEFAULT_DESIGN_CHOICES, background: "gradient" });
check("the gradient option names the prompt's own class", gradient.includes(".gradient-bg"));
check("and that class really exists in the system prompt", builder.includes(".gradient-bg"));
const photo = d.buildDesignBrief({ ...d.DEFAULT_DESIGN_CHOICES, background: "photo" });
check("the photo option names the parallax pattern", photo.includes(".parallax-section"));
check("and that class really exists in the system prompt", builder.includes(".parallax-section"));
check("the photo option uses the PLACEHOLDER convention", photo.includes("PLACEHOLDER"));
check("and asks for a readability overlay", /dark overlay/.test(photo));

console.log("\n== 5. 'my own photo' degrades instead of demanding one that does not exist ==");
const ownNoImages = d.buildDesignBrief({ ...d.DEFAULT_DESIGN_CHOICES, background: "own-photo", imageCount: 0 });
check("with no uploads it falls back to a stock photo hero", ownNoImages.includes(".parallax-section"));
check("and never asks for the user's own image", !ownNoImages.includes("user's own uploaded reference images"));
const ownWithImages = d.buildDesignBrief({ ...d.DEFAULT_DESIGN_CHOICES, background: "own-photo", imageCount: 2 });
check("with uploads it really asks for their photo", ownWithImages.includes("uploaded reference images"));
check("the UI disables the option with nothing uploaded", /style === "own-photo" && imageCount === 0/.test(controls));

console.log("\n== 6. 'use my photos' triggers the prompt's existing MANDATORY rule ==");
const inSite = d.buildDesignBrief({ ...d.DEFAULT_DESIGN_CHOICES, referenceImageUse: "in-site", imageCount: 4 });
check("it says EVERY listed URL must appear", /EVERY listed reference-image URL must appear/.test(inSite));
check("and asks the model to count them", /Count them before you finish/.test(inSite));
check(
  "which matches the rule already in the system prompt",
  /EVERY listed reference-image URL MUST appear in the output/.test(builder)
);
const styleOnly = d.buildDesignBrief({ ...d.DEFAULT_DESIGN_CHOICES, referenceImageUse: "style-only", imageCount: 4 });
check("style-only says the opposite, explicitly", /do NOT embed them in the page/.test(styleOnly));
check(
  "neither is emitted with no images attached",
  d.buildDesignBrief({ ...d.DEFAULT_DESIGN_CHOICES, referenceImageUse: "in-site", imageCount: 0 }) === ""
);

console.log("\n== 7. it is wired into the real submit path ==");
check("the workspace imports the brief builder", /applyDesignBrief/.test(workspace));
check("and applies it to the description that is submitted", /applyDesignBrief\(trimmedDescription/.test(workspace));
check(
  "with the real uploaded-image count, not the form's file list",
  /imageCount: referenceImagePaths\.length/.test(workspace)
);
check("the controls are rendered in the form", /<DesignControls/.test(workspace));
check("not hidden behind a collapsed section", !/Advanced[\s\S]{0,80}<DesignControls/.test(workspace));
check("and reset with the rest of the form", /setDesign\(DEFAULT_DESIGN_CHOICES\)/.test(workspace));

console.log("\n== 8. the upload control tells the user what it is for ==");
check("the label is a heading, not a neutral field name", /text-xs font-medium text-foreground[\s\S]{0,120}imageLabel/.test(workspace));
check("with an explanatory line under it", /imageIntro/.test(workspace));
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
check("which is translated, not hardcoded", Boolean(en.dashboard.websiteBuilder.imageIntro));
check("and names concrete things to upload", /logo/i.test(en.dashboard.websiteBuilder.imageIntro));

console.log("\n== 9. the brief cannot swamp the user's own words ==");
const everything = d.buildDesignBrief({
  primaryColor: "#1d4ed8",
  secondaryColor: "#f59e0b",
  background: "own-photo",
  referenceImageUse: "in-site",
  imageCount: 20,
});
check(`the maximum brief stays small (${everything.length} chars)`, everything.length < 2500);
check("and is clearly separated from the user's text", everything.startsWith("\n\nDESIGN BRIEF"));
check(
  "the whole thing still fits the description limit",
  (base + everything).length < 20000
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
