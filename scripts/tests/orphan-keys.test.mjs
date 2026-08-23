// The i18n gap that neither check-i18n.js NOR i18n-coverage.test.mjs could
// see — and the reason it matters is a pattern, not a one-off.
//
// THREE TIMES on this project the same thing was found: a message key that
// existed, correctly translated into all ten locales, next to a hardcoded
// English string doing its job.
//
//   1. sidebar-label-keys.ts    — nine nav items had no entry in the map,
//                                 so the sidebar rendered their English
//                                 labels in all ten languages.
//   2. moduleConfig.title       — twenty-one module pages printed the
//                                 English state key as their heading while
//                                 sidebar.items.* held the translation.
//   3. settings quick links +   — the upgrade wall's sentence and the
//      the upgrade wall           settings jump-nav were typed in English
//                                 beside keys nobody called.
//
// In every case the translation existed FIRST and the code never reached
// it. That is a specific, detectable shape: an orphan key. If a key is
// present and translated in all ten locales but no t() call anywhere in
// src can reach it, one of exactly two things is true —
//
//   (a) something nearby is hardcoded in English and should be calling it,
//   (b) the key is dead and should be deleted.
//
// Both are bugs. This file fails the build on either, which is what makes
// the pattern impossible to reintroduce rather than merely fixed again.
//
// WHY THE OTHER TWO GUARDS CANNOT DO THIS.
//   - check-i18n.js compares messages/*.json against each other. It never
//     opens a source file, so "is this key used?" is outside its universe.
//   - i18n-coverage.test.mjs scans source, but only inside addToast /
//     setError / setMessage calls, and only for keys that ARE referenced.
//     It answers "does this t() call resolve?", the mirror question. An
//     orphan has no call to inspect.
//
// Run: node scripts/tests/orphan-keys.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const lookup = (obj, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);

const leaves = [];
(function walkKeys(node, prefix) {
  for (const k of Object.keys(node)) {
    const v = node[k];
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") walkKeys(v, path);
    else leaves.push(path);
  }
})(messages.en, "");

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const sources = walk("src");

// Comments first. Several files in this repo document a bug by quoting the
// OLD code, and a scanner that reads its own documentation as evidence of
// reachability would let the very keys it describes stay orphaned.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/** The text between a "(" and its matching ")". Brace-matched, not a lazy
 *  regex: `t(cond ? a(1) : b)` has a nested call in its argument. */
function argsAt(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return "";
}

/** The first argument of a call, split at the first TOP-LEVEL comma. */
function firstArg(args) {
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if ("([{`".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) return args.slice(0, i);
  }
  return args;
}

const reached = new Set(); // exact key paths
const reachedPrefixes = new Set(); // string prefixes: "ns.hints.", "ns.status"
const blanketNamespaces = new Set(); // namespaces a fully dynamic call covers

for (const file of sources) {
  const src = stripComments(readFileSync(file, "utf8"));

  // 1. Which variable holds which namespace. Every translator in this repo
  //    is named t / tCommon / tModule / ..., declared with const.
  const namespaces = new Map();
  const declRe =
    /const\s+(t[A-Za-z0-9_]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(/g;
  let m;
  while ((m = declRe.exec(src))) {
    const arg = argsAt(src, declRe.lastIndex - 1).trim();
    if (/^"[^"]*"$/.test(arg) || /^'[^']*'$/.test(arg)) {
      namespaces.set(m[1], arg.slice(1, -1));
    } else if (arg === "") {
      // Root namespace: callers pass whole key paths as literals, which
      // the literal sweep at the bottom of this loop picks up.
      namespaces.set(m[1], "");
    } else if (arg.startsWith("`")) {
      // useTranslations(`aiExamples.${surface}`) — the namespace itself is
      // computed, so everything under its static part is reachable.
      reachedPrefixes.add(arg.slice(1).split("${")[0]);
      namespaces.set(m[1], null);
    } else {
      namespaces.set(m[1], null);
    }
  }

  // 2. Every call on those variables.
  for (const [variable, namespace] of namespaces) {
    if (namespace === null) continue;
    const callRe = new RegExp(`\\b${variable}(?:\\.(?:rich|raw|has|markup))?\\s*\\(`, "g");
    let c;
    while ((c = callRe.exec(src))) {
      const arg = firstArg(argsAt(src, callRe.lastIndex - 1)).trim();
      const literals = [...arg.matchAll(/"([^"]*)"|'([^']*)'/g)].map((x) => x[1] ?? x[2]);
      const templates = [...arg.matchAll(/`([^`]*)`/g)].map((x) => x[0].slice(1, -1));

      for (const tpl of templates) {
        if (!tpl.includes("${")) {
          literals.push(tpl);
          continue;
        }
        // A STRING prefix, not a path prefix. `status${x}` reaches
        // statusResearching, which is not under any "status." subtree —
        // treating it as one is how the first draft of this file reported
        // a live key as an orphan.
        const staticPart = tpl.split("${")[0];
        if (!staticPart) {
          // t(`${x}`) — nothing static to anchor on, so this reaches
          // anything in the namespace. Counted as a BLANKET mark rather
          // than added as an empty prefix: an empty prefix silently makes
          // every key in the namespace look reached while section 3, which
          // exists to watch exactly how much coverage the blanket rule
          // eats, goes on reporting that it ate nothing.
          if (namespace !== "") {
            reachedPrefixes.add(namespace);
            blanketNamespaces.add(namespace);
          }
          continue;
        }
        reachedPrefixes.add(namespace ? `${namespace}.${staticPart}` : staticPart);
      }

      for (const lit of literals) reached.add(namespace ? `${namespace}.${lit}` : lit);

      // Anything left after removing the literals means the key is at
      // least partly computed at runtime — t(module.emptyKey ?? "x"),
      // t(someKey). The whole namespace has to count as reachable, because
      // a static scanner cannot know which leaf it lands on.
      const residue = arg.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "").replace(/[\s?:|&()]/g, "");
      const dynamic = residue.length > 0 || (literals.length === 0 && templates.length === 0);
      // ...unless the namespace is the ROOT one, where "the whole
      // namespace" is the entire catalogue. page-metadata.ts does exactly
      // this, and honouring it would switch this whole test off.
      if (dynamic && namespace !== "") {
        reachedPrefixes.add(namespace);
        blanketNamespaces.add(namespace);
      }
    }
  }

  // 3. Keys held as data rather than passed inline: sidebar-label-keys.ts's
  //    map, a page's pageTitleMetadata("sidebar.items.files"), a config's
  //    titleKey. Any literal that IS a full key path counts.
  for (const lit of src.matchAll(/"([a-zA-Z][\w.]*\.[\w.]+)"|'([a-zA-Z][\w.]*\.[\w.]+)'/g)) {
    const s = lit[1] ?? lit[2];
    if (lookup(messages.en, s) !== undefined) reached.add(s);
  }
}

function isReached(key) {
  if (reached.has(key)) return true;
  for (const prefix of reachedPrefixes) {
    if (key === prefix || key.startsWith(prefix)) return true;
  }
  return false;
}

// THE ORPHANS THAT ALREADY EXIST, pinned as a set rather than a count.
//
// There are 199 of them on the branch this gate first ran against. Each is
// translated into all ten locales and reached by nothing, so each is one
// of the two bugs in the header — a hardcoded English string standing next
// to its own translation, or a dead key. Triaging 199 by hand is real work
// and it is not done yet; what this list does is stop the number growing
// while that work happens.
//
// PINNED AS A SET, NOT A COUNT, and the difference matters. A count-based
// ratchet passes when one orphan is fixed and one is introduced, which is
// exactly the state it exists to prevent. With a set, a NEW orphan fails
// the build by name even on the same day another is removed.
//
// Removing an entry from this list is the only way it may change. If a key
// here stops being an orphan, delete its line — the test fails if a listed
// key is no longer orphaned, so the list cannot silently rot into fiction.
const KNOWN_ORPHANS = new Set([
  "common.saving",
  "common.remove",
  "common.continue",
  "common.backToHome",
  "common.whatIsThis",
  "sidebar.comingSoon",
  "dashboard.overview.mostActiveModule",
  "dashboard.overview.acrossAllModules",
  "dashboard.overview.entry",
  "dashboard.createAnything.askPlaceholder",
  "dashboard.files.empty",
  "module.emptyWhat",
  "module.emptyWhy",
  "module.emptyExample",
  "module.examples.competitors",
  "module.examples.research",
  "module.examples.finance",
  "module.examples.learning",
  "module.examples.trading",
  "module.examples.decisions",
  "module.examples.products",
  "module.examples.content",
  "module.examples.sales",
  "module.examples.feedback",
  "module.examples.analytics",
  "module.examples.automation",
  "module.examples.websites",
  "module.examples.apps",
  "module.examples.images",
  "module.examples.videos",
  "module.examples.coding",
  "module.examples.data-analysis",
  "module.examples.campaigns",
  "module.examples.presentations",
  "module.examples.ideas",
  "module.emptyWebsitePlans",
  "module.emptyApps",
  "module.emptyImages",
  "module.emptyVideos",
  "module.emptyCoding",
  "module.emptyDataAnalysis",
  "module.emptyCampaigns",
  "askAi.subtitle",
  "moduleData.options.active",
  "moduleData.options.android",
  "moduleData.options.archived",
  "moduleData.options.completed",
  "moduleData.options.content",
  "moduleData.options.crossPlatform",
  "moduleData.options.desktop",
  "moduleData.options.done",
  "moduleData.options.draft",
  "moduleData.options.email",
  "moduleData.options.event",
  "moduleData.options.expense",
  "moduleData.options.final",
  "moduleData.options.inProgress",
  "moduleData.options.inReview",
  "moduleData.options.income",
  "moduleData.options.ios",
  "moduleData.options.live",
  "moduleData.options.other",
  "moduleData.options.paidAds",
  "moduleData.options.paused",
  "moduleData.options.planned",
  "moduleData.options.requested",
  "moduleData.options.seo",
  "moduleData.options.social",
  "moduleData.options.web",
  "moduleData.deleteConfirm.competitors",
  "moduleData.deleteConfirm.research",
  "moduleData.deleteConfirm.finance",
  "moduleData.deleteConfirm.learning",
  "moduleData.deleteConfirm.trading",
  "moduleData.deleteConfirm.decisions",
  "moduleData.deleteConfirm.products",
  "moduleData.deleteConfirm.content",
  "moduleData.deleteConfirm.sales",
  "moduleData.deleteConfirm.feedback",
  "moduleData.deleteConfirm.analytics",
  "moduleData.deleteConfirm.automation",
  "moduleData.deleteConfirm.websites",
  "moduleData.deleteConfirm.apps",
  "moduleData.deleteConfirm.images",
  "moduleData.deleteConfirm.videos",
  "moduleData.deleteConfirm.coding",
  "moduleData.deleteConfirm.data-analysis",
  "moduleData.deleteConfirm.presentations",
  "moduleData.deleteConfirm.campaigns",
  "moduleData.empty.competitors.title",
  "moduleData.empty.competitors.why",
  "moduleData.empty.competitors.example",
  "moduleData.empty.sales.title",
  "moduleData.empty.sales.why",
  "moduleData.empty.sales.example",
  "moduleData.empty.finance.title",
  "moduleData.empty.finance.why",
  "moduleData.empty.finance.example",
  "moduleData.empty.trading.title",
  "moduleData.empty.trading.why",
  "moduleData.empty.trading.example",
  "moduleData.empty.research.title",
  "moduleData.empty.research.why",
  "moduleData.empty.research.example",
  "moduleData.empty.learning.title",
  "moduleData.empty.learning.why",
  "moduleData.empty.learning.example",
  "moduleData.empty.decisions.title",
  "moduleData.empty.decisions.why",
  "moduleData.empty.decisions.example",
  "moduleData.empty.products.title",
  "moduleData.empty.products.why",
  "moduleData.empty.products.example",
  "moduleData.empty.content.title",
  "moduleData.empty.content.why",
  "moduleData.empty.content.example",
  "moduleData.empty.feedback.title",
  "moduleData.empty.feedback.why",
  "moduleData.empty.feedback.example",
  "moduleData.empty.analytics.title",
  "moduleData.empty.analytics.why",
  "moduleData.empty.analytics.example",
  "moduleData.empty.automation.title",
  "moduleData.empty.automation.why",
  "moduleData.empty.automation.example",
  "moduleData.empty.websites.title",
  "moduleData.empty.websites.why",
  "moduleData.empty.websites.example",
  "moduleData.empty.apps.title",
  "moduleData.empty.apps.why",
  "moduleData.empty.apps.example",
  "moduleData.empty.images.title",
  "moduleData.empty.images.why",
  "moduleData.empty.images.example",
  "moduleData.empty.videos.title",
  "moduleData.empty.videos.why",
  "moduleData.empty.videos.example",
  "moduleData.empty.coding.title",
  "moduleData.empty.coding.why",
  "moduleData.empty.coding.example",
  "moduleData.empty.dataAnalysis.title",
  "moduleData.empty.dataAnalysis.why",
  "moduleData.empty.dataAnalysis.example",
  "moduleData.empty.presentations.title",
  "moduleData.empty.presentations.why",
  "moduleData.empty.presentations.example",
  "moduleData.empty.campaigns.title",
  "moduleData.empty.campaigns.why",
  "moduleData.empty.campaigns.example",
  "problem.out_of_credits.what",
  "problem.out_of_credits.next",
  "problem.rate_limited.what",
  "problem.rate_limited.next",
  "problem.timeout.what",
  "problem.timeout.next",
  "problem.network.what",
  "problem.network.next",
  "problem.credits.untouched",
  "problem.credits.refunded",
  "problem.credits.charged",
  "help.agents.is",
  "help.agents.does",
  "help.agents.doesNot",
  "help.websiteBuilder.is",
  "help.websiteBuilder.does",
  "help.websiteBuilder.doesNot",
  "help.published.is",
  "help.published.does",
  "help.published.doesNot",
  "help.files.is",
  "help.files.does",
  "help.files.doesNot",
  "help.deepResearch.is",
  "help.deepResearch.does",
  "help.deepResearch.doesNot",
  "help.memory.is",
  "help.memory.does",
  "help.memory.doesNot",
  "help.mission.is",
  "help.mission.does",
  "help.mission.doesNot",
  "help.integrations.is",
  "help.integrations.does",
  "help.integrations.doesNot",
  "help.team.is",
  "help.team.does",
  "help.team.doesNot",
  "help.timeline.is",
  "help.timeline.does",
  "help.timeline.doesNot",
  "help.favorites.is",
  "help.favorites.does",
  "help.favorites.doesNot",
  "help.marketplace.is",
  "help.marketplace.does",
  "help.marketplace.doesNot",
  "help.settings.is",
  "help.settings.does",
  "help.settings.doesNot",
]);

console.log("== 1. no translated key is unreachable from src ==");
const translatedEverywhere = (k) => LOCALES.every((l) => typeof lookup(messages[l], k) === "string");
const allOrphans = leaves.filter((k) => translatedEverywhere(k) && !isReached(k));
const orphans = allOrphans.filter((k) => !KNOWN_ORPHANS.has(k));
// The other direction: a key on the list that is no longer an orphan must
// come OFF the list. Without this the baseline drifts into a list of
// things that used to be true, and the next person reads it as a survey of
// current work when it is a survey of old work.
const fixedButStillListed = [...KNOWN_ORPHANS].filter((k) => !allOrphans.includes(k));
if (orphans.length) {
  console.log(
    "\n  Each of these is translated into all ten locales and reached by\n" +
      "  nothing. Either a nearby string is hardcoded in English and should\n" +
      "  call it, or the key is dead and should be deleted:\n"
  );
  for (const k of orphans) console.log(`      ${k} = ${JSON.stringify(lookup(messages.en, k))}`);
  console.log("");
}
check("no NEW orphan key", orphans, []);
check("...and none of the known ones was fixed without updating the list", fixedButStillListed, []);
console.log(`  (${allOrphans.length} known orphans still to triage — this number may only go down)`);

console.log("== 2. the scan can actually see a key ==");
// A guard on the guard. If the namespace resolution above ever broke —
// a renamed hook, a changed declaration shape — every key would look
// unreachable and section 1 would go red for the wrong reason, or the
// prefix logic would go so broad that everything looks reached. These
// pin both directions against keys whose call sites are known.
checkTrue("a plain t(\"literal\") is seen", isReached("common.save"));
checkTrue("a key held in a map is seen", isReached("sidebar.items.files"));
checkTrue("a template-prefixed key is seen", isReached("sidebar.hints.chat"));
checkTrue(
  "a mid-segment template key is seen",
  isReached("dashboard.deepResearch.statusResearching")
);
checkTrue("an invented key is NOT seen", !isReached("common.thisKeyDoesNotExist"));
checkTrue(
  "an invented key under a real namespace is NOT seen",
  !isReached("settings.marginReport.colThisDoesNotExist")
);

console.log("== 3. the blanket rule stays narrow ==");
// A dynamic t(expr) marks its whole namespace reachable. That is the one
// unavoidable hole, so it must not be allowed to swallow the catalogue:
// if a future edit makes a top-level namespace blanket-reachable, most of
// the app stops being checked and nobody would notice.
const blanketLeafCount = leaves.filter((k) =>
  [...blanketNamespaces].some((ns) => k === ns || k.startsWith(`${ns}.`))
).length;
checkTrue(
  `blanket namespaces cover under half the catalogue (${blanketLeafCount}/${leaves.length})`,
  blanketLeafCount * 2 < leaves.length
);
checkTrue("the root namespace is never blanket-marked", !blanketNamespaces.has(""));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
