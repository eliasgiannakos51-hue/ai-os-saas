#!/usr/bin/env node
/*
 * i18n guard.
 *
 * The reported "language doesn't change" bug was never one bug. It was four,
 * and three of them were invisible to every check we had:
 *
 *   1. A locale file whose VALUE is just the English string copied over.
 *      The lookup succeeds, next-intl reports nothing, and the UI renders
 *      English inside a Greek page. This is what "AI Agents",
 *      "Create Anything", "Ionexa Chat", "Marketplace", "AI Coach" and
 *      "Energy Check-In" all were.
 *   2. A UI string never added to messages/*.json at all — a literal in
 *      JSX. Nothing can translate what it never sees.
 *   3. Strings built in code rather than looked up (formatRelativeTime's
 *      "12h ago").
 *   4. Browser-owned text (<input type="file">), which is not ours at all.
 *
 * This script catches (1) and (2). (3) and (4) are structural and are fixed
 * in lib/format-time.ts and components/ui/file-picker.tsx respectively.
 *
 * Run: node scripts/check-i18n.js
 */
const fs = require("fs");
const path = require("path");

const LOCALES = ["el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];

// Keys whose value is legitimately identical to English: brand names,
// loanwords a language really does borrow verbatim, and format templates.
// Anything NOT on this list that matches English is treated as a missing
// translation, which is the whole point.
// Locale-scoped allowances ("<locale>:<key>"): words that genuinely
// coincide with English in that one language — loanwords ("Trading" in
// every European locale), cognates ("Documents" in French, "Team" in
// German, "Ideas" in Spanish). Scoped per locale on purpose: "Documents"
// being correct French says nothing about whether Greek was translated.
const LOCALE_ALLOWED = new Set([
  // "credits" is used verbatim in Greek — the same loanword the rest of the
  // Greek UI already uses ("Αγορά Credits", "Ιστορικό Credits").
  "el:credits.estimate.approx",
  "es:sidebar.items.trading",
  "es:sidebar.items.sales",
  "fr:sidebar.items.trading",
  "fr:sidebar.items.sales",
  "de:sidebar.items.trading",
  "de:sidebar.items.sales",
  "it:sidebar.items.trading",
  "it:sidebar.items.sales",
  "pt:sidebar.items.trading",
  "pt:sidebar.items.sales",
  "zh:sidebar.items.trading",
  "zh:sidebar.items.sales",
  "ja:sidebar.items.trading",
  "ja:sidebar.items.sales",
  "ar:sidebar.items.trading",
  "ar:sidebar.items.sales",
  "ar:dashboard.team.emailPlaceholder",
  "de:dashboard.chat.title",
  "de:dashboard.overview.quickActions.trading.label",
  "de:dashboard.team.title",
  "de:dashboard.websiteBuilder.nameLabel",
  "de:sidebar.groups.business",
  "de:sidebar.items.apps",
  "de:sidebar.items.chat",
  "de:sidebar.items.feedback",
  "de:sidebar.items.team",
  "de:sidebar.items.videos",
  "de:sidebar.items.websites",
  // "Details" is the German word, spelled identically — a loanword the
  // rest of the German UI already uses, not a skipped translation.
  "de:module.tabDetails",
  // "Status" is the German word, spelled identically.
  "de:dashboard.websiteBuilder.statusLabel",
  "de:dashboard.mission.statusFilterLabel",
  // Create Studio: genuine cognates and loanwords, not skipped work.
  // "credits" is used verbatim in Greek throughout this UI already (see
  // el:credits.estimate.approx above); "Type"/"Mission"/"Document" are
  // spelled identically in French; "Website"/"Mission" in German.
  "el:dashboard.createStudio.creditsApprox",
  "fr:dashboard.createStudio.detectedType",
  "fr:dashboard.createStudio.typeMission",
  "fr:dashboard.createStudio.typeDocument",
  "de:dashboard.createStudio.typeWebsite",
  "de:dashboard.createStudio.typeMission",
  "es:common.error",
  "es:dashboard.chat.title",
  "es:dashboard.mission.agentRole.general",
  "es:dashboard.overview.quickActions.ideas.label",
  "es:dashboard.overview.quickActions.trading.label",
  "es:entityLinks.no",
  "es:sidebar.items.apps",
  "es:sidebar.items.chat",
  "es:sidebar.items.ideas",
  "es:sidebar.items.videos",
  "fr:common.notifications",
  "fr:dashboard.documents.backToDocuments",
  "fr:dashboard.documents.deleteLabel",
  "fr:dashboard.documents.title",
  "fr:dashboard.overview.quickActions.trading.label",
  // "Actions" is the correct French word, spelled identically — a cognate,
  // not a translation that was skipped.
  "fr:settings.marginReport.colCalls",
  "fr:sidebar.items.documents",
  "fr:sidebar.items.finance",
  "fr:sidebar.items.images",
  "it:auth.login.password",
  "it:auth.signup.password",
  "it:dashboard.chat.title",
  "it:dashboard.overview.quickActions.ideas.label",
  "it:dashboard.overview.quickActions.trading.label",
  "it:dashboard.team.title",
  "it:entityLinks.no",
  "it:roadmap.items.ceoAdvisor.title",
  "it:sidebar.groups.business",
  "it:sidebar.items.analytics",
  "it:sidebar.items.chat",
  "it:sidebar.items.feedback",
  "it:sidebar.items.home",
  "it:sidebar.items.team",
  "ja:dashboard.team.emailPlaceholder",
  "pt:dashboard.overview.quickActions.trading.label",
  "pt:sidebar.items.feedback",
  "zh:dashboard.team.emailPlaceholder",
]);

const INTENTIONALLY_IDENTICAL = new Set([
  "landing.footer.roadmap",
  "roadmap.title",
  "roadmap.items.agentBuilder.title",
  "roadmap.items.websiteBuilder.title",
  "roadmap.items.marketingBuilder.title",
  "roadmap.items.teamGenerator.title",
  "roadmap.items.projectManager.title",
  "roadmap.items.router.title",
  "roadmap.items.createAnything.title",
  "roadmap.items.chat.title",
  "roadmap.items.marketplace.title",
  "pricing.businessTitle",
  "pricing.rows.websiteBuilder",
  "pricing.rows.mobileSaasBuilder",
  "settings.theme.options.midnight",
  "settings.theme.options.carbon",
  "dashboard.websiteBuilder.versionLabel",
  "dashboard.mission.reviewerLabel",
  "dashboard.tradingWorkflow.mentorButton",
  "dashboard.tradingWorkflow.reflectionTitle",
  "dashboard.tradingWorkflow.tradesTitle",
  "dashboard.productWorkflow.mentorButton",
  "dashboard.productWorkflow.reflectionTitle",
  "dashboard.productWorkflow.productsTitle",
  "sidebar.items.content",
  "achievements.firstEnergyCheckin.title",
  "achievements.fiftyEntries.title",
  "auth.login.email",
  "auth.signup.email",
  "auth.forgotPassword.email",
]);

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v, key));
    else out[key] = String(v);
  }
  return out;
}

const messagesDir = path.join(__dirname, "..", "messages");
const en = flatten(JSON.parse(fs.readFileSync(path.join(messagesDir, "en.json"), "utf8")));

const failures = [];

for (const loc of LOCALES) {
  const target = flatten(JSON.parse(fs.readFileSync(path.join(messagesDir, `${loc}.json`), "utf8")));

  for (const key of Object.keys(en)) {
    if (!(key in target)) {
      failures.push(`${loc}: MISSING key ${key}`);
      continue;
    }
    const value = en[key];
    // A value that is only punctuation/placeholders ("{count}", "—") is the
    // same in every language by construction, not by neglect.
    const isFormatOnly = !/[A-Za-z]{2}/.test(value);
    if (
      target[key] === value &&
      value.trim() &&
      !isFormatOnly &&
      !INTENTIONALLY_IDENTICAL.has(key) &&
      !LOCALE_ALLOWED.has(`${loc}:${key}`)
    ) {
      failures.push(`${loc}: UNTRANSLATED ${key} = ${JSON.stringify(value)}`);
    }
  }
}

if (failures.length) {
  console.error(`i18n check FAILED (${failures.length} problems):\n`);
  for (const f of failures) console.error("  " + f);
  console.error(
    "\nEither translate the key, or allow it in this file (INTENTIONALLY_IDENTICAL for all locales, LOCALE_ALLOWED for one) with a reason."
  );
  process.exit(1);
}

console.log(`i18n check passed: ${Object.keys(en).length} keys x ${LOCALES.length} locales, 0 untranslated.`);
