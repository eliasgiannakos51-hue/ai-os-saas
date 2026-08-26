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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

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
check(`the headings scan found ${headings.length}`, headings.length >= 8, "a filter of an empty list is empty, and every check below it would pass");
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
check(`the heading key map was read (${Object.keys(headingKeys).length})`,
  Object.keys(headingKeys).length >= 5,
  "an empty key map makes the dead-key check below pass on nothing");
const deadHeadingKeys = Object.keys(headingKeys).filter((h) => !headings.includes(h));
check("no heading key points at a heading that does not exist", deadHeadingKeys.length === 0, deadHeadingKeys.join(", "));

console.log("\n== 2. every ITEM the sidebar renders can be translated ==");
const labels = [...navSrc.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
const unmappedItems = labels.filter((l) => !itemKeys[l] && l !== "Create Studio");
// `labels.filter(...).length === 0` is true of an empty list, so the floor
// is what makes the line above a statement about the sidebar rather than
// about the regex that reads it. Forty items today.
check(
  `the sidebar label scan found items (${labels.length})`,
  labels.length >= 40,
  `the nav source yielded ${labels.length} labels`
);
check(`all ${labels.length} item labels have a message key`, unmappedItems.length === 0, unmappedItems.join(", "));

console.log("\n== 3. NOTHING IN 'BUILD' THAT DOES NOT BUILD ==");
// The rule, stated so it survives the next feature: an item filed under
// Build must be a feature that actually produces something. The tracking
// tables declare themselves in build-modules.ts; anything listed there is
// a log, by its own file's admission.
const trackingSlugs = [...buildModules.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);
console.log(`        tracking tables (no AI generation): ${trackingSlugs.join(", ")}`);

// A FLOOR, BECAUSE THIS ONE ARRAY DRIVES FOUR SECTIONS OF THIS FILE.
//
// `offenders`, `misfiled` and `secretlyProducing` are all
// `trackingSlugs.filter(...)`, each asserted `.length === 0`, and section 4
// is `for (const slug of trackingSlugs)`. Every one of them is satisfied by
// an EMPTY array — filtering nothing yields nothing, and looping over
// nothing runs no checks at all. So a rename of `slug:` to `id:` in
// build-modules.ts, or a move to a JSON manifest, or a switch to single
// quotes, would take this file from 120 assertions to about 90 and print
// ALL PASS while checking none of the thing it exists for.
//
// Six today: websites, apps, images, videos, presentations, campaigns.
// If a tracking module legitimately leaves — because it grew a generator
// and moved under Build, which section 3 is watching for — lower this
// number in the same commit that moves it. That is the point: the move
// should be visible, not silent.
check(
  `the tracking-module scan found modules (${trackingSlugs.length})`,
  trackingSlugs.length >= 6,
  `build-modules.ts yielded ${trackingSlugs.length} slugs — the four checks below all pass vacuously on an empty list`
);
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
// Same reasoning, other direction: the three `buildHrefs.includes(...)`
// checks below would each go red on an empty list, so those are safe — but
// the allowlist check further down is `buildHrefs.filter(...)`, which is
// not. Six today.
check(
  `the Build group scan found hrefs (${buildHrefs.length})`,
  buildHrefs.length >= 6,
  `groupOf("Build") yielded ${buildHrefs.length} hrefs`
);
check("Build still holds the agent builder", buildHrefs.includes("/dashboard/agents"));
check("...the website builder", buildHrefs.includes("/dashboard/website-builder"));
check("...and what it published", buildHrefs.includes("/dashboard/published"));
// AN ALLOWLIST, NOT A COUNT. This was `buildHrefs.length === 3`, which
// passes just as happily if somebody swaps one entry for another — the
// number is the same and the group now contains a tracker again, which
// is the single thing this section exists to prevent. Naming them makes
// a new entry a decision somebody has to write down.
const BUILD_ALLOWED = {
  "/dashboard/agents": "the agent builder — really builds agents",
  "/dashboard/website-builder": "the site builder — really builds sites",
  "/dashboard/published": "what the builder put live",
  // Not a generator itself, and here on purpose: these are what a
  // published site PRODUCED. Filing the leads a site brings in anywhere
  // other than beside the site would make "where did my enquiries go" a
  // navigation question — which it already was, for as long as the table
  // had no screen at all.
  "/dashboard/form-submissions": "what the published sites produced",
  // V4 #19 + #20. Both were trackers and both stopped being one: the
  // analysis page parses a real uploaded spreadsheet, profiles every
  // column in TypeScript and draws charts from the real rows; the coding
  // page runs five operations that return code, an explanation, a bug
  // list, a conversion or tests. Neither is in build-modules.ts any more,
  // and section 3b below proves the claim from the CODE rather than from
  // this comment.
  "/dashboard/data-analysis": "parses, profiles and charts a real uploaded file",
  "/dashboard/coding": "five operations that really produce code",
};
const unexpected = buildHrefs.filter((href) => !(href in BUILD_ALLOWED));
check(
  "and nothing else — every remaining Build item is one somebody justified",
  unexpected.length === 0,
  unexpected.length ? `not in the allowlist: ${unexpected.join(", ")}` : ""
);
const missing = Object.keys(BUILD_ALLOWED).filter((href) => !buildHrefs.includes(href));
check("...and every justified item is still there", missing.length === 0, missing.join(", "));

console.log("\n== 3b. BUILD IS PROVEN FROM THE CODE, NOT FROM A LIST ==");
// The rule this file has always been reaching for is "an item under Build
// produces something". Until now that was an ALLOWLIST — a list somebody
// edits, which cannot tell you whether the thing behind the entry is real.
// A tracker moved into Build with a justification string next to it would
// have passed.
//
// So it is checked mechanically, in BOTH directions:
//
//   FORWARD: every Build item must have an API route that actually calls
//   a model, or be declared as downstream of one that does.
//   BACKWARD: every module in build-modules.ts must have NO such route.
//   That is the one that catches the real drift — a tracker that quietly
//   gained a generator and stayed filed under Tracking, which is the
//   mirror image of the fault this whole file was written for.
{
  // A CALL, NOT A DEFINITION. `/runCompletion\(/` matched
  // lib/ai/providers/complete.ts's own `export async function
  // runCompletion(` — so any file that merely IMPORTED the entry point
  // counted as producing, and a route that stopped calling it stayed
  // green. Requiring `await` in front is what distinguishes the two, and
  // it is the shape every real call site has: the function returns a
  // promise carrying the outcome, so nothing useful is done with it
  // unawaited.
  const AI_CALL = /await\s+runCompletion\(|anthropic\.messages\.(create|stream)\(|\.messages\.(create|stream)\(/;

  // Downstream of a producer rather than a producer: these two show what
  // something else made. Declared here, in the check, so adding a third
  // is a decision rather than a quiet exemption.
  const DOWNSTREAM = {
    "/dashboard/published": "shows what the website builder put live",
    "/dashboard/form-submissions": "shows what a published site received",
  };

  const ALL_ROUTES = (() => {
    const out = [];
    const walk = (path) => {
      let entries = [];
      try {
        entries = readdirSync(path);
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = `${path}/${entry}`;
        if (statSync(full).isDirectory()) walk(full);
        else if (entry === "route.ts") out.push(full);
      }
    };
    walk("src/app/api");
    return out;
  })();

  /** Resolves a `@/lib/...` import to a file on disk. */
  const resolveLib = (spec) => {
    const base = `src/${spec.slice(2)}`;
    for (const ext of [".ts", ".tsx", "/index.ts"]) if (existsSync(base + ext)) return base + ext;
    return null;
  };

  /**
   * Does this file, or anything it imports from @/lib (two levels), call a
   * model? Two levels is what it takes to reach the real callers: the
   * agent route calls lib/agents/agent-runner, and the website route calls
   * lib/websites/*, neither of which has the SDK in the route file itself.
   */
  const callsModel = (file, depth = 0, seen = new Set()) => {
    if (!file || seen.has(file) || depth > 2 || !existsSync(file)) return false;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    if (AI_CALL.test(src)) return true;
    for (const m of src.matchAll(/from "(@\/lib\/[\w./[\]-]+)"/g)) {
      // THE PROVIDER LAYER IS A LEAF, NEVER A STEP. Recursing into
      // lib/ai/providers reaches the adapter that really calls the SDK —
      // so every file that merely IMPORTED the entry point counted as
      // producing, and a route that stopped calling it stayed green. A
      // file produces only if IT (or an ordinary lib it uses) awaits the
      // entry point itself.
      if (m[1].startsWith("@/lib/ai/providers") || m[1].startsWith("@/lib/ai/batch")) continue;
      if (callsModel(resolveLib(m[1]), depth + 1, seen)) return true;
    }
    return false;
  };

  /** The API routes a page (or its components) actually fetches. */
  const routesFetchedBy = (slug) => {
    const roots = [`src/app/dashboard/${slug}`, `src/components/${slug}`];
    const files = [];
    const walk = (path) => {
      let entries = [];
      try {
        entries = readdirSync(path);
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = `${path}/${entry}`;
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry)) files.push(full);
      }
    };
    for (const root of roots) walk(root);

    const paths = new Set();
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/["`](\/api\/[\w/[\]$.{}-]+)/g)) {
        paths.add(m[1].split("?")[0]);
      }
    }
    // MATCHED BY WHAT THE PAGE FETCHES, never by "the API folder has the
    // same name". /dashboard/websites is the TRACKER (Website plans) and
    // /api/websites belongs to the website BUILDER: a name-prefix rule
    // reported the tracker as a generator, which is the exact false
    // positive that would have taught somebody to loosen this check.
    const matched = ALL_ROUTES.filter((route) => {
      const routePath = route.replace("src/app/api/", "/api/").replace("/route.ts", "");
      return [...paths].some((p) => {
        const normalised = routePath.replace(/\[[^\]]+\]/g, "*");
        const wanted = p.replace(/\$\{[^}]*\}/g, "*");
        return wanted === normalised || wanted.startsWith(`${normalised}/`);
      });
    });
    return matched;
  };

  const producesFor = (slug) => {
    const sources = [
      ...routesFetchedBy(slug),
      ...(existsSync(`src/app/dashboard/${slug}/page.tsx`) ? [`src/app/dashboard/${slug}/page.tsx`] : []),
    ];
    return sources.some((file) => callsModel(file));
  };

  for (const href of buildHrefs) {
    const slug = href.replace("/dashboard/", "");
    if (href in DOWNSTREAM) {
      check(`${href} is downstream of a producer: ${DOWNSTREAM[href]}`, true);
      continue;
    }
    check(
      `${href} really produces something (a route it calls reaches a model)`,
      producesFor(slug),
      `no runCompletion/anthropic call reachable from the routes ${slug} fetches`
    );
  }

  // THE OTHER DIRECTION. A tracker with a producing route behind it is a
  // feature filed under the heading that says it does nothing.
  const secretlyProducing = trackingSlugs.filter((slug) => producesFor(slug));
  check(
    "no tracking module has quietly grown a generator",
    secretlyProducing.length === 0,
    secretlyProducing.length ? `these produce something but sit under "Tracking": ${secretlyProducing.join(", ")}` : ""
  );
}

console.log("\n== 4. each tracking page says, on screen, that it produces nothing ==");
// A comment in a source file is not a disclosure. The person who needed
// this sentence is the one who opened the page.
// Read per MODULE BLOCK, not by assuming emptyKey is the line after
// slug. Presentations has an eight-line comment between the two — the
// adjacency version reported it as having no empty state at all, which
// was a fact about the regex rather than about the file.
//
// THE KEY IS A FULL DOTTED PATH TO A GROUP, not a bare leaf under
// `module.*`. It was `emptyKey: "emptyApps"` -> one sentence; it is now
// `emptyKey: "moduleData.empty.apps"` -> { title, why, example }, where
// `why` carries the disclosure this section is about and `example` is a
// pressable row that fills the form. The claim being checked is unchanged
// — the page says on screen that it produces nothing — so only where the
// sentence is read from moves.
const emptyKeys = {};
{
  const blocks = buildModules.split(/\n  \{\n/);
  for (const block of blocks) {
    const slug = block.match(/slug: "([^"]+)"/)?.[1];
    const key = block.match(/emptyKey: "([\w.]+)"/)?.[1];
    if (slug && key) emptyKeys[slug] = key;
  }
}
for (const slug of trackingSlugs) {
  const key = emptyKeys[slug];
  check(`${slug} has its own empty state`, Boolean(key), "falls back to the generic 'No entries yet'");
  if (!key) continue;
  check(`${slug}: and it is its own group, not a shared one`, key.startsWith("moduleData.empty."), key);
  for (const locale of ["en", "el"]) {
    const why = lookup(messages[locale], `${key}.why`);
    check(
      `${slug} (${locale}): says what it does NOT do`,
      typeof why === "string" && /\bnot\b|δεν |ne |non |nicht |不|ありません|لا /i.test(why) && why.length > 60,
      String(why).slice(0, 90)
    );
  }
  // All three parts, in all ten. A group missing `example` renders an
  // empty state with nothing to press, which is the half of this that
  // gets a user from reading to having started.
  for (const part of ["title", "why", "example"]) {
    const missing = LOCALES.filter((l) => typeof lookup(messages[l], `${key}.${part}`) !== "string");
    check(`${slug}.${part}: present in all 10 locales`, missing.length === 0, missing.join(", "));
  }
}
// The English wording is checked for the negation itself, because "this
// is a place to track images" without the "it does not create images"
// half is the sentence that was already there and did not work.
const NEGATIONS = {
  websites: /does not build/i,
  apps: /does not build apps/i,
  images: /does not create images/i,
  videos: /does not create videos/i,
  campaigns: /does not run campaigns/i,
  presentations: /does not generate slides/i,
};
for (const [slug, pattern] of Object.entries(NEGATIONS)) {
  const key = emptyKeys[slug];
  const text = key ? lookup(messages.en, `${key}.why`) : "";
  check(`${slug}: names the thing it will not do`, pattern.test(String(text)), String(text).slice(0, 90));
}

console.log("\n== 4b. the page heading agrees with the sidebar ==");
// A module page rendered `config.title` verbatim, which is the ENGLISH
// state key the classifier matches on — so the sidebar said
// "Σημειώσεις εικόνων" and the heading two inches away said "Images", in
// all ten locales, on all twenty-one module pages. Renaming only the
// sidebar would have made that worse, not better.
const modulesSrc = readFileSync("src/lib/modules.ts", "utf8");
const buildPage = readFileSync("src/components/modules/build-module-page.tsx", "utf8");
const modulePage = readFileSync("src/app/dashboard/[module]/page.tsx", "utf8");
// Resolved through the ROOT translator against the config's own
// `titleKey`, which is a full dotted path ("sidebar.items.images"), rather
// than through a `sidebar.items` namespace and a bare leaf. Same one
// display name per module; the key simply carries its whole path, so the
// same field also feeds generateMetadata and cannot be pointed at a
// different namespace by accident.
check("the tracking pages render a translated heading", /title=\{title\}/.test(buildPage) && /const title = t\(config\.titleKey\)/.test(buildPage));
check("...and so do the business module pages", /title=\{t\(moduleConfig\.titleKey\)\}/.test(modulePage));
check("...including the upgrade wall, which also showed the English name", /featureName=\{title\}/.test(buildPage));
// COMMENTS STRIPPED FIRST. Both files explain the fix by quoting the bug
// — "this rendered `config.title` verbatim" — and a scan that cannot tell
// prose from code is failed by the sentence recording that it passes.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check(
  "no page renders the raw English title any more",
  !/config\.title\b(?!Key)/.test(stripComments(buildPage)) &&
    !/moduleConfig\.title\b(?!Key)/.test(stripComments(modulePage))
);
// The browser tab reads the SAME field. It was the third place a module
// could disagree with itself, and it is the one that survives the page
// being scrolled away.
check("and the browser tab takes it from the same field", /pageTitle\(moduleConfig\.titleKey\)/.test(modulePage));

// Every module must declare which name to show, and it must be the
// sidebar's own key — one display name per module, by construction.
function blocksOf(src) {
  return src.split(/\n  \{\n/).map((block) => ({
    slug: block.match(/slug: "([^"]+)"/)?.[1],
    titleKey: block.match(/titleKey: "([\w.]+)"/)?.[1],
  })).filter((b) => b.slug);
}
const allModules = [...blocksOf(modulesSrc), ...blocksOf(buildModules)];
const noTitleKey = allModules.filter((m) => !m.titleKey);
check(`all ${allModules.length} modules declare a display name`, noTitleKey.length === 0, noTitleKey.map((m) => m.slug).join(", "));
// The key is the whole path, so it is looked up as written — and it must
// still BE a sidebar key, or "one display name per module" would be a
// convention rather than a fact.
const notSidebar = allModules.filter((m) => m.titleKey && !m.titleKey.startsWith("sidebar.items."));
check("every display name is the sidebar's own key", notSidebar.map((m) => `${m.slug}->${m.titleKey}`), []);
const badKey = allModules.filter((m) => m.titleKey && LOCALES.some((l) => typeof lookup(messages[l], m.titleKey) !== "string"));
check("and every one resolves in all 10 locales", badKey.length === 0, badKey.map((m) => `${m.slug}->${m.titleKey}`).join(", "));

console.log("\n== 4c. the eight trackers no longer promise generation ==");
// The approved names. "AI Coding" was the worst of them: it is a table
// of rows the user types by hand.
// V4 #19 + #20: `coding` and `dataAnalysis` are NOT here any more,
// because they are not trackers any more — they are tools, they sit under
// Build, and section 3b proves it from the code. Their names are checked
// below under their own rule: a tool MAY promise what it does, and must.
const TRACKER_NAMES = {
  images: ["Image notes", "Σημειώσεις εικόνων"],
  videos: ["Video notes", "Σημειώσεις βίντεο"],
  apps: ["App notes", "Σημειώσεις εφαρμογών"],
  campaigns: ["Campaign notes", "Σημειώσεις καμπανιών"],
  websites: ["Website plans", "Σχέδια ιστότοπων"],
};
for (const [key, [en, el]] of Object.entries(TRACKER_NAMES)) {
  check(`${key}: EN is "${en}"`, lookup(messages.en, `sidebar.items.${key}`) === en, String(lookup(messages.en, `sidebar.items.${key}`)));
  check(`${key}: EL is "${el}"`, lookup(messages.el, `sidebar.items.${key}`) === el, String(lookup(messages.el, `sidebar.items.${key}`)));
}
// The word that was doing the damage.
check(
  'no tracker is still called "AI" anything',
  !Object.keys(TRACKER_NAMES).some((k) => /\bAI\b/.test(String(lookup(messages.en, `sidebar.items.${k}`))))
);
// Presentation Notes was already honest and must not have been churned.
check("Presentation Notes is unchanged", lookup(messages.en, "sidebar.items.presentations") === "Presentation Notes");

console.log("\n== 4d. the browser tab is the third place the name appears ==");
// It was the one piece of UI still in English: 31 pages declaring
// `export const metadata = { title: "Mission Control" }`, plus the module
// catch-all. A Greek user's tab strip read Timeline / Files /
// Integrations above pages that were entirely in Greek — and after the
// renaming pass it read the OLD names, so one thing had three names at
// once.
function walkPages(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = `${dir}/${entry}`;
    if (statSync(p).isDirectory()) out.push(...walkPages(p));
    else if (entry === "page.tsx") out.push(p);
  }
  return out;
}
const dashboardPages = walkPages("src/app/dashboard");
const hardcodedTabs = dashboardPages.filter((file) => {
  const src = readFileSync(file, "utf8");
  const m = src.match(/export const metadata: Metadata = \{[\s\S]*?\};/);
  // A literal English title is the fault. A page with no metadata at all
  // inherits the layout's, which is fine.
  return m && /title:\s*"/.test(m[0]);
});
check(
  `no dashboard page hardcodes its tab title (${dashboardPages.length} pages)`,
  hardcodedTabs.length <= 2,
  hardcodedTabs.join(", ")
);
// The two that legitimately keep theirs, named so the allowance cannot
// quietly grow: System Health is an owner-only diagnostic page, and a
// document's tab is the document's own name rather than a nav label.
check(
  "and the two that do are the two that should",
  hardcodedTabs.every((f) => /system-health|documents\/\[id\]/.test(f)),
  hardcodedTabs.join(", ")
);
// ONE HELPER, NOT TWO. Two branches each wrote one — lib/page-metadata.ts
// and lib/page-title.ts — for the same job, which is how a tab ends up
// translated on thirty pages and English on sixteen. page-title.ts is the
// survivor: it also serves the legal pages (title AND description) and it
// takes the key as a WHOLE dotted path, so a module page passes
// `CONFIG.titleKey` straight through instead of the helper rebuilding a
// `sidebar.items.` prefix that only module pages want.
check("there is exactly one tab-title helper", !existsSync("src/lib/page-metadata.ts"));
const metadataHelper = readFileSync("src/lib/page-title.ts", "utf8");
check("it reads the locale per request, not once at module load", /getTranslations/.test(metadataHelper));
check("and it is server-only, so a client import fails at build", /^import "server-only";/m.test(metadataHelper));
// The module pages hand it the config's own key, so tab, heading and nav
// are one string.
const modulePages = ["apps", "campaigns", "coding", "data-analysis", "images", "presentations", "videos", "websites"];
const notFromConfig = modulePages.filter(
  (slug) => !/pageTitle\(CONFIG\.titleKey\)/.test(readFileSync(`src/app/dashboard/${slug}/page.tsx`, "utf8"))
);
check("every tracking page's tab reads the config's key", notFromConfig, []);

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
