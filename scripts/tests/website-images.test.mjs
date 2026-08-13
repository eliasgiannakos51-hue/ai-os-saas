// "Ο χρήστης ζήτησε ΡΗΤΑ 'κάνε έρευνα στο διαδίκτυο και πάρε εικόνες από
//  αυτήν την περιοχή' — δεν έγινε."
//
// THE ROOT CAUSE, and it was in the prompt rather than in the plumbing.
//
// The Unsplash integration was wired correctly the whole time. What the
// IMAGES section told the model was:
//
//   "never a city name unless the shot is genuinely of that skyline
//    (a place name inside a subject query usually returns tourist
//    postcards instead of the subject)"
//
// So a brief that said "ταβέρνα στη Νάξο" produced the query "greek taverna
// interior" — obediently, correctly by the rule it was given, and with the
// one word that made it about NAXOS deliberately removed. The reasoning
// behind the rule was not wrong (a place name on a close-up of a dish does
// return postcards); it was applied to every photo instead of to the photos
// it was true of.
//
// The rule is now per-photo and ordered, which matters mechanically:
// broadenImageQuery retries a failed query by dropping TRAILING words, so
// a place at the front of an establishing shot survives every retry, and a
// place at the back of a detail shot is the first thing dropped. Both are
// what you want, and they are opposite ends of the string.
//
// Runs in the build gate; needs no API key and makes no network call.
//
// Run: node scripts/tests/website-images.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

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
function eq(name, actual, expected) {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const brief = await loadTs("src/lib/website-image-brief.ts");
const placeholders = await loadTs("src/lib/website-image-placeholders.ts");
const budget = await loadTs("src/lib/unsplash-budget.ts");
const builder = readFileSync("src/lib/website-builder.ts", "utf8");
const imageRules = builder.slice(
  builder.indexOf("const IMAGE_RULES_HEADER = `"),
  builder.indexOf("`;", builder.indexOf("const IMAGE_RULES_HEADER = `"))
);

// ---------------------------------------------------------------------
console.log("== 1. the prompt no longer removes the place from the query ==");

check(
  "the blanket ban on a place name is gone",
  !/never a city name/i.test(imageRules),
  "the rule that produced 'greek taverna interior' for a brief about Naxos"
);
check("an establishing shot is told to put the place FIRST", /PLACE FIRST/.test(imageRules));
check("a detail shot is told to put the place LAST", /SUBJECT FIRST and the place LAST/.test(imageRules));
check(
  "and the reason is stated, because it is not obvious",
  /TRAILING words/.test(imageRules),
  "a rule with no reason is a rule that gets dropped at the next edit"
);
check(
  "an explicit request for photos of a place is called a requirement",
  /is a REQUIREMENT, not a preference/.test(imageRules)
);
check(
  "and the Greek phrasing the user actually typed is one of the examples",
  /φωτογραφίες από/.test(imageRules)
);
check(
  "a generic industry photo is named as an unacceptable substitute",
  /generic industry photo is not an acceptable substitute/.test(imageRules)
);
// The rule the ban existed to protect is still there, because it was right
// about the case it was about.
check("the trading name is still forbidden", /NEVER the trading name/.test(imageRules));
check("queries are still required to be in English", /ALWAYS IN ENGLISH/.test(imageRules));

const research = builder.slice(
  builder.indexOf("const WEB_SEARCH_SECTION = `"),
  builder.indexOf("`;", builder.indexOf("const WEB_SEARCH_SECTION = `"))
);
check(
  "the research step is told to find what the place LOOKS like, not just what it is",
  /Search what the place LOOKS like/.test(research),
  "'Santorini' is a name; 'whitewashed cave houses' is a findable photo query"
);

// ---------------------------------------------------------------------
console.log("\n== 2. the broadening ladder degrades the way the rule assumes ==");

// The whole two-ended rule rests on this behaviour. If broadenImageQuery
// dropped LEADING words, both halves of the prompt rule would be backwards.
const establishing = placeholders.broadenImageQuery("Santorini Greece caldera village whitewashed");
check(
  "an establishing shot keeps its place through every retry",
  establishing.every((q) => q.startsWith("Santorini Greece")),
  establishing.join(" | ")
);
const detail = placeholders.broadenImageQuery("grilled octopus mezze plate Santorini");
// Four words dropped one at a time: the place is gone by the second retry
// and the subject is the last thing standing.
eq("a detail shot loses its place as soon as it is retried", detail[1], "grilled octopus mezze plate");
check("...and never gets it back", !detail.slice(1).some((q) => /Santorini/.test(q)), detail.join(" | "));
check(
  "...and keeps the subject to the end",
  detail[detail.length - 1].startsWith("grilled octopus"),
  detail.join(" | ")
);
check("the ladder is still bounded", placeholders.broadenImageQuery("a b c d e f g h i j").length <= 4);

// ---------------------------------------------------------------------
console.log("\n== 3. an explicit request is recognised, in every locale ==");

// The exact sentence from the report, and its equivalents. A user writing
// Greek gets the same treatment as a user writing English — the whole point
// of the app being in ten languages.
const EXPLICIT = [
  ["el (the reported sentence)", "Ταβέρνα στη Σαντορίνη, βάλε φωτογραφίες από Σαντορίνη"],
  ["el (unaccented, as people type)", "βαλε φωτογραφιες απο τη Ναξο"],
  ["el (the area)", "Θέλω φωτογραφίες της περιοχής"],
  ["el (real photos)", "Βάλε πραγματικές φωτογραφίες, όχι γενικές"],
  ["en (from the area)", "use photos from the area, not stock ones"],
  ["en (real)", "I want real photographs of the place"],
  ["en (from a named place)", "please take photos from Santorini"],
  ["de", "bitte echte Fotos verwenden"],
  ["de (region)", "Bilder aus der Region einfügen"],
  ["fr", "je veux de vraies photos"],
  ["fr (region)", "des photos de la région s'il vous plaît"],
  ["es", "quiero fotos reales"],
  ["es (zone)", "pon fotos de la zona"],
  ["it", "usa foto reali"],
  ["pt", "quero fotos reais"],
  ["zh", "请使用真实的照片"],
  ["ja", "実際の写真を使ってください"],
  ["ar", "استخدم صور حقيقية من فضلك"],
];
for (const [label, text] of EXPLICIT) {
  check(`${label}: recognised as an explicit request`, brief.requestsRealPhotos(text), text);
}

// The other half, and the half that decides whether the notice is trusted:
// an ordinary brief that merely mentions photographs must NOT trip this, or
// every site gets a warning and the warning stops meaning anything.
const NOT_EXPLICIT = [
  "A landing page for my coaching business with a hero section and a contact form",
  "Καφετέρια στα Λαδάδικα. Θέλω να φαίνεται ο κατάλογος και οι ώρες λειτουργίας.",
  "add a photo gallery of our menu items",
  "Φωτογράφος γάμων στην Κρήτη, θέλω να κυριαρχεί το portfolio",
  "eine Seite für meine Kanzlei mit Kontaktformular",
  "",
];
for (const text of NOT_EXPLICIT) {
  eq(`not an explicit request: "${text.slice(0, 45)}"`, brief.requestsRealPhotos(text), false);
}

// ---------------------------------------------------------------------
console.log("\n== 4. the outcome is classified honestly ==");

const report = (over) => ({
  total: 6,
  fromLibrary: 6,
  fromPlaceholder: 0,
  halted: null,
  configured: true,
  requestedRealPhotos: false,
  ...over,
});

eq("every photo real", brief.classifyImageOutcome(report()), "all-real");
eq("no photos at all", brief.classifyImageOutcome(report({ total: 0 })), "none-requested");
eq(
  "some fell back",
  brief.classifyImageOutcome(report({ fromLibrary: 4, fromPlaceholder: 2 })),
  "some-placeholder"
);
eq(
  "none resolved",
  brief.classifyImageOutcome(report({ fromLibrary: 0, fromPlaceholder: 6 })),
  "all-placeholder"
);
eq(
  "no key configured",
  brief.classifyImageOutcome(report({ configured: false, fromLibrary: 0, fromPlaceholder: 6 })),
  "not-configured"
);
eq(
  "quota — distinguished from a bad key, because the fix is different",
  brief.classifyImageOutcome(report({ halted: "rate-limited", fromLibrary: 2, fromPlaceholder: 4 })),
  "quota"
);
eq(
  "a rejected key is its own outcome",
  brief.classifyImageOutcome(report({ halted: "unauthorised", fromLibrary: 0, fromPlaceholder: 6 })),
  "credentials"
);
// A rejected key is a problem with our configuration whether or not one was
// present, so it outranks "not configured".
eq(
  "credentials outrank configuration",
  brief.classifyImageOutcome(report({ halted: "unauthorised", configured: false, fromPlaceholder: 6 })),
  "credentials"
);

console.log("\n== 5. how loudly it is said ==");
eq("a page with every photo real says nothing", brief.imageReportSeverity(report()), "none");
eq("a page with no photos says nothing", brief.imageReportSeverity(report({ total: 0 })), "none");
eq(
  "placeholders nobody asked about are a quiet note",
  brief.imageReportSeverity(report({ fromLibrary: 4, fromPlaceholder: 2 })),
  "info"
);
// The case from the report: it was asked for, in writing, and it did not
// happen. That is a broken promise, not a detail.
eq(
  "placeholders on a brief that asked for real photos are a warning",
  brief.imageReportSeverity(report({ fromLibrary: 4, fromPlaceholder: 2, requestedRealPhotos: true })),
  "warning"
);
eq(
  "and a page whose photos all worked stays silent even then",
  brief.imageReportSeverity(report({ requestedRealPhotos: true })),
  "none"
);

// ---------------------------------------------------------------------
console.log("\n== 6. the budget guarantees every photo a turn ==");
for (const n of [1, 3, 6, 10, 14, 20]) {
  check(
    `${n} photos: the budget (${budget.unsplashBudgetForPlaceholders(n)}) leaves room for ${n} first searches`,
    budget.unsplashBudgetForPlaceholders(n) >= n
  );
}
check(
  "and it is capped so one page cannot spend the whole hour",
  budget.unsplashBudgetForPlaceholders(500) === budget.UNSPLASH_MAX_REQUESTS_PER_GENERATION
);
check(
  "the halt message names the real ceiling, not the shared allowance",
  budget.describeUnsplashHalt("budget-exhausted", 32, 32).includes("32")
);

// ---------------------------------------------------------------------
console.log("\n== 7. would the user actually SEE it? ==");
// Render is not the same as reachable. Each of these is a separate way the
// chain could be broken while every unit test above still passed.
const workspace = readFileSync("src/components/website-builder/website-builder-workspace.tsx", "utf8");
const notice = readFileSync("src/components/website-builder/website-image-notice.tsx", "utf8");
const processRoute = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
const editRoute = readFileSync("src/app/api/websites/edit/route.ts", "utf8");
const types = readFileSync("src/types/user-website.ts", "utf8");

check("the generation route measures the photos", /resolveWebsiteImagePlaceholders\(htmlContent, \{/.test(processRoute));
check("...reading the user's own words for an explicit request", /requestsRealPhotos\(description\)/.test(processRoute));
check("...and writes the report to the row", /image_report: imageReport/.test(processRoute));
check("the edit route does the same", /requestsRealPhotos\(changeRequest\)/.test(editRoute));
check("...and saves it too", /image_report: imageReport/.test(editRoute));
check("the row type carries it", /image_report: WebsiteImageReport \| null/.test(types));
check(
  "...and null means 'not recorded', not 'all real'",
  /not the same[\s\S]{0,20}claim as/.test(types),
  "an unmeasured generation must not be reported as a clean one"
);
check("the workspace imports the notice", /import \{ WebsiteImageNotice \}/.test(workspace));
check("and renders it under the finished page", /<WebsiteImageNotice report=\{previewWebsite\.image_report\} \/>/.test(workspace));
check(
  "but not for an old version, whose photos a different run resolved",
  /!viewingVersion && <WebsiteImageNotice/.test(workspace)
);
// The gap that would make every assertion above true and the feature still
// invisible: a column the client is never sent. Both routes that deliver a
// website to the browser — the first page load and the poll that follows a
// generation — must return the whole row.
const builderPage = readFileSync("src/app/dashboard/website-builder/page.tsx", "utf8");
const statusRoute = readFileSync("src/app/api/websites/status/route.ts", "utf8");
check(
  "the first page load returns the whole row, so the report arrives with it",
  /from\("user_websites"\)\s*\.select\("\*"\)/.test(builderPage) ||
    /select\("\*"\)/.test(builderPage.slice(builderPage.indexOf('from("user_websites")'))),
  "a named column list here would silently drop image_report and the notice would never render"
);
check(
  "and so does the poll the client runs after a generation",
  /select\("\*"\)/.test(statusRoute)
);
check("the notice is announced to a screen reader", /aria-live="polite"/.test(notice));
check("it renders nothing when there is nothing to say", /if \(severity === "none"\) return null;/.test(notice));
check(
  "and nothing when the generation was never measured",
  /if \(!report\) return null;/.test(notice)
);

console.log("\n== 8. it can say it in every language ==");
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const KEYS = [
  "photosPlaceholderTitle",
  "photosMissingTitle",
  "photosPlaceholderBody",
  "photosQuotaBody",
  "photosNotConfiguredBody",
  "photosCredentialsBody",
];
for (const locale of LOCALES) {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const wb = messages?.dashboard?.websiteBuilder ?? {};
  const missing = KEYS.filter((k) => typeof wb[k] !== "string" || !wb[k].trim());
  check(`${locale}: all six strings exist`, missing.length === 0, missing.join(", "));
}
// ICU rather than "photo(s)": Arabic has six plural forms and "(s)" is
// wrong in five of them.
const en = JSON.parse(readFileSync("messages/en.json", "utf8")).dashboard.websiteBuilder;
check("the counted strings use ICU plurals", /\{placeholder, plural,/.test(en.photosPlaceholderBody));
const ar = JSON.parse(readFileSync("messages/ar.json", "utf8")).dashboard.websiteBuilder;
for (const form of ["zero", "one", "two", "few", "many", "other"]) {
  check(`ar: the ${form} plural form is written`, ar.photosPlaceholderBody.includes(`${form} {`));
}

console.log("\n== 9. the column has a migration, and it is safe ==");
const migration = readFileSync("website_image_report_migration.sql", "utf8");
check("it adds the column idempotently", /ADD COLUMN IF NOT EXISTS image_report jsonb/.test(migration));
check("it drops nothing", !/\bDROP\s+TABLE\b/i.test(migration) && !/\bTRUNCATE\b/i.test(migration));
check("it deletes nothing", !/\bDELETE\s+FROM\b/i.test(migration));
check("it rewrites no existing row", !/\bUPDATE\s+public\./i.test(migration));
check("and it refuses to run against a table without row-level security", /rowsecurity = true/.test(migration));

// ---------------------------------------------------------------------
console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILED:\n" + failures.map((f) => "  - " + f).join("\n"));
}
process.exit(failures.length === 0 ? 0 : 1);
