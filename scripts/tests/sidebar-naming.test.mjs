// What the sidebar promises, and whether the app delivers it.
//
// TWO FAULTS, and the second is the one that reaches a user.
//
// 1. FOUR GROUP HEADINGS WERE NEVER TRANSLATED. sidebar-label-keys.ts
//    mapped Create / My Business / Track / Insights while sidebar-nav.ts
//    rendered Workspace / Build / Business / Strategy — so
//    translatedHeading() fell through and printed raw English in all ten
//    locales, with correct translations sitting unreachable beside them.
//    The comment above the map described a rename that was never made in
//    the file it claimed to describe, which is why the map looked fine.
//
// 2. "BUILD" HELD EIGHT THINGS THAT BUILD NOTHING. lib/build-modules.ts
//    says it in its own words — "no real AI generation happens yet" —
//    and the sidebar filed them under Build with names like "AI Coding"
//    and "Images". Somebody who opens AI Coding expecting code and finds
//    a form for describing code they will write themselves has not met a
//    limitation; they have met a claim that was not true. That is the
//    sentence they then apply to the features that DO work.
//
// Run: node scripts/tests/sidebar-naming.test.mjs
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

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const lookup = (obj, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);

const navSrc = readFileSync("src/lib/sidebar-nav.ts", "utf8");
const keysSrc = readFileSync("src/lib/sidebar-label-keys.ts", "utf8");
const buildModules = readFileSync("src/lib/build-modules.ts", "utf8");

/** Every heading the sidebar actually renders. */
const headings = [...navSrc.matchAll(/heading: "([^"]+)"/g)].map((m) => m[1]);
/** The heading -> message-key map, as the code really holds it. */
const headingKeys = Object.fromEntries(
  keysSrc
    .slice(keysSrc.indexOf("GROUP_HEADING_KEYS"), keysSrc.indexOf("ITEM_LABEL_KEYS"))
    .split("\n")
    .map((line) => line.trim().match(/^"?([\w ]+?)"?:\s*"(\w+)",$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]])
);
const itemKeys = Object.fromEntries(
  keysSrc
    .slice(keysSrc.indexOf("ITEM_LABEL_KEYS"))
    .split("\n")
    .map((line) => line.trim().match(/^"?([\w &.']+?)"?:\s*"(\w+)",$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]])
);

// ---------------------------------------------------------------------
console.log("== 1. every heading the sidebar renders can be translated ==");
console.log(`        renders: ${headings.join(", ")}`);
const unmapped = headings.filter((h) => !headingKeys[h]);
check(
  `all ${headings.length} headings have a message key`,
  unmapped.length === 0,
  unmapped.length ? `RAW ENGLISH in all 10 locales: ${unmapped.join(", ")}` : ""
);
for (const heading of headings) {
  const key = headingKeys[heading];
  if (!key) continue;
  const missing = LOCALES.filter((l) => typeof lookup(messages[l], `sidebar.groups.${key}`) !== "string");
  check(`"${heading}" is translated in all 10 locales`, missing.length === 0, missing.join(", "));
}
// The mirror fault: a key here that no heading uses is dead weight, and
// dead entries are exactly what hid the four missing ones.
const deadHeadingKeys = Object.keys(headingKeys).filter((h) => !headings.includes(h));
check("no heading key points at a heading that does not exist", deadHeadingKeys.length === 0, deadHeadingKeys.join(", "));

console.log("\n== 2. every ITEM the sidebar renders can be translated ==");
const labels = [...navSrc.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
const unmappedItems = labels.filter((l) => !itemKeys[l] && l !== "Create Studio");
check(`all ${labels.length} item labels have a message key`, unmappedItems.length === 0, unmappedItems.join(", "));

console.log("\n== 3. NOTHING IN 'BUILD' THAT DOES NOT BUILD ==");
// The rule, stated so it survives the next feature: an item filed under
// Build must be a feature that actually produces something. The tracking
// tables declare themselves in build-modules.ts; anything listed there is
// a log, by its own file's admission.
const trackingSlugs = [...buildModules.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);
console.log(`        tracking tables (no AI generation): ${trackingSlugs.join(", ")}`);
const groupOf = (heading) => {
  const start = navSrc.indexOf(`heading: "${heading}"`);
  const end = navSrc.indexOf("heading: \"", start + 10);
  return navSrc.slice(start, end === -1 ? undefined : end);
};
const buildGroup = groupOf("Build");
const trackingGroup = groupOf("Tracking");
check("a Tracking group exists", trackingGroup.length > 0);

const offenders = trackingSlugs.filter((slug) => {
  const href = `/dashboard/${slug}`;
  return buildGroup.includes(`"${href}"`);
});
check(
  "no tracking-only module is filed under Build",
  offenders.length === 0,
  offenders.length ? `these produce nothing but sit under "Build": ${offenders.join(", ")}` : ""
);
const misfiled = trackingSlugs.filter((slug) => !trackingGroup.includes(`/dashboard/${slug}`));
check("and every one of them IS under Tracking", misfiled.length === 0, misfiled.join(", "));

// The other direction: what is left in Build must really build.
const buildHrefs = [...buildGroup.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
console.log(`        Build now holds: ${buildHrefs.join(", ")}`);
check("Build still holds the agent builder", buildHrefs.includes("/dashboard/agents"));
check("...the website builder", buildHrefs.includes("/dashboard/website-builder"));
check("...and what it published", buildHrefs.includes("/dashboard/published"));
check(
  "and nothing else — every remaining item generates something",
  buildHrefs.length === 3,
  buildHrefs.join(", ")
);

console.log("\n== 4. each tracking page says, on screen, that it produces nothing ==");
// A comment in a source file is not a disclosure. The person who needed
// this sentence is the one who opened the page.
// Read per MODULE BLOCK, not by assuming emptyKey is the line after
// slug. Presentations has an eight-line comment between the two — the
// adjacency version reported it as having no empty state at all, which
// was a fact about the regex rather than about the file.
const emptyKeys = {};
{
  const blocks = buildModules.split(/\n  \{\n/);
  for (const block of blocks) {
    const slug = block.match(/slug: "([^"]+)"/)?.[1];
    const key = block.match(/emptyKey: "(\w+)"/)?.[1];
    if (slug && key) emptyKeys[slug] = key;
  }
}
for (const slug of trackingSlugs) {
  const key = emptyKeys[slug];
  check(`${slug} has its own empty state`, Boolean(key), "falls back to the generic 'No entries yet'");
  if (!key) continue;
  for (const locale of ["en", "el"]) {
    const text = lookup(messages[locale], `module.${key}`);
    check(`${slug} (${locale}): says what it does NOT do`, typeof text === "string" && /—|--/.test(text) && text.length > 60);
  }
  const missing = LOCALES.filter((l) => typeof lookup(messages[l], `module.${key}`) !== "string");
  check(`${slug}: present in all 10 locales`, missing.length === 0, missing.join(", "));
}
// The English wording is checked for the negation itself, because "this
// is a place to track images" without the "it does not create images"
// half is the sentence that was already there and did not work.
const NEGATIONS = {
  websites: /does not build/i,
  apps: /does not build apps/i,
  images: /does not create images/i,
  videos: /does not create videos/i,
  coding: /does not write code/i,
  "data-analysis": /does not analyse/i,
  campaigns: /does not run campaigns/i,
  presentations: /does not generate slides/i,
};
for (const [slug, pattern] of Object.entries(NEGATIONS)) {
  const key = emptyKeys[slug];
  const text = key ? lookup(messages.en, `module.${key}`) : "";
  check(`${slug}: names the thing it will not do`, pattern.test(String(text)), String(text).slice(0, 90));
}

console.log("\n== 5. the approved renames landed everywhere the name is shown ==");
// A name changed in the sidebar but not on the page it opens gives the
// user two names for one thing, which is worse than the old name.
const RENAMED = [
  ["AI Memory", "sidebar.items.memory", "dashboard.memory.title"],
  ["Mission Control", "sidebar.items.missionControl", "dashboard.mission.title"],
  ["Create Studio", "common.createStudio", "dashboard.createStudio.title"],
  ["Timeline", "sidebar.items.timeline", "dashboard.timeline.title"],
  ["Website Builder", "sidebar.items.websiteBuilder", "dashboard.websiteBuilder.title"],
  ["Published Sites", "sidebar.items.published", "dashboard.publishing.title"],
];
for (const [was, sidebarKey, titleKey] of RENAMED) {
  const sidebarValue = lookup(messages.en, sidebarKey);
  const titleValue = lookup(messages.en, titleKey);
  check(`"${was}" is gone from the sidebar`, sidebarValue !== was, String(sidebarValue));
  check(`...and from the page it opens`, titleValue !== was, String(titleValue));
  check(`...and the two agree ("${sidebarValue}")`, sidebarValue === titleValue, `${sidebarValue} vs ${titleValue}`);
}
// EN/EL disagreement was its own bug: one module, two different products
// depending on the language.
for (const key of ["sidebar.items.research", "sidebar.items.finance"]) {
  const en = lookup(messages.en, key);
  const el = lookup(messages.el, key);
  check(`${key}: no longer says "agent" in Greek only`, !/Πράκτορας/.test(String(el)), `${en} / ${el}`);
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
