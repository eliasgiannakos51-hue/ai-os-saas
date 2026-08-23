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
 * This script catches (1). It does NOT catch (2), despite an earlier
 * version of this comment claiming it did — it reads messages/*.json and
 * never opens a source file, so a literal in JSX is invisible to it by
 * construction. That stale claim is exactly why the gap went unnoticed:
 * 46 hardcoded English strings across 26 components shipped while both
 * i18n checks passed. (2) is now covered from the source side by
 * scripts/tests/i18n-coverage.test.mjs, which also catches the mirror
 * problem — a t("key") call whose key does not exist, which next-intl
 * renders to the user as the raw key path without failing any build.
 *
 * (3) and (4) are structural and are fixed in lib/format-time.ts and
 * components/ui/file-picker.tsx respectively.
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
  // Trading journal (V4 #14). Two classes, both checked by hand.
  //
  //   CITY NAMES. Sydney, Tokyo, London and New York are spelled the same
  //   in French, German, Italian and Portuguese as in English — they are
  //   proper nouns, not untranslated strings. The locales that DO have
  //   their own forms use them (Greek Σίδνεϊ/Τόκιο/Λονδίνο/Νέα Υόρκη,
  //   Spanish Sídney/Tokio/Londres/Nueva York, Arabic سيدني, Japanese
  //   シドニー, Chinese 悉尼), which is what makes these coincidences
  //   rather than a block somebody skipped.
  //
  //   TRADING LOANWORDS. "Trades", "Sessions", "Instruments" and
  //   "Profit factor" are the words traders in those languages actually
  //   use — a French trader says "les trades" and "profit factor", not
  //   "les opérations" and "facteur de profit". Every other string in the
  //   same block DOES differ (Taux de réussite, Trefferquote,
  //   Percentuale di successo; Gain moyen, Durchschnittsgewinn), so this
  //   is vocabulary rather than an untranslated section. German "Name" is
  //   simply the German word.
  "el:dashboard.trading.stats.profitFactor",
  "el:dashboard.trading.ruleKinds.allowed_sessions",
  "fr:dashboard.trading.sessions.sydney",
  "fr:dashboard.trading.sessions.tokyo",
  "fr:dashboard.trading.sessions.new_york",
  "fr:dashboard.trading.stats.trades",
  "fr:dashboard.trading.ruleKinds.allowed_sessions",
  "fr:dashboard.trading.ruleKinds.allowed_instruments",
  "de:dashboard.trading.table.key",
  "de:dashboard.trading.sessions.sydney",
  "de:dashboard.trading.sessions.london",
  "de:dashboard.trading.sessions.new_york",
  "de:dashboard.trading.stats.trades",
  "de:dashboard.trading.ruleKinds.allowed_sessions",
  "it:dashboard.trading.sessions.sydney",
  "it:dashboard.trading.sessions.tokyo",
  "it:dashboard.trading.sessions.new_york",
  "it:dashboard.trading.stats.profitFactor",
  "pt:dashboard.trading.sessions.sydney",
  // Voice (V4 #19/#23/#2). Four cognates, each checked against the rest
  // of its own block:
  //
  //   "Pause" is the French and German word for the playback control.
  //   French has "faire une pause" as a verb but the button on a media
  //   player is "Pause" in both languages, and the sibling keys in the
  //   same block DO differ everywhere (Écouter/Anhören,
  //   Vitesse de lecture/Wiedergabetempo, Voix/Stimme).
  //
  //   "Neutral" and "Warm" are the German words for those two voice
  //   timbres. The other two in the same list differ (Tief, Hell), which
  //   is what makes these two coincidences rather than a skipped block.
  "fr:voice.pause",
  "de:voice.pause",
  "de:voice.voices.neutral",
  "de:voice.voices.warm",
  // Agent depth tiers (V4 #21). "Simple" is the Spanish and French word;
  // "Standard" is the French, German and Italian one. Checked against the
  // rest of the same block, which DOES differ in every one of those
  // languages (Profundo/Approfondi/Tief/Approfondito, and Greek
  // Απλό/Κανονικό/Βαθύ), so these are cognates rather than a locale
  // somebody skipped.
  "es:dashboard.agents.depth.simple.title",
  "fr:dashboard.agents.depth.simple.title",
  "fr:dashboard.agents.depth.standard.title",
  "de:dashboard.agents.depth.standard.title",
  "it:dashboard.agents.depth.standard.title",
  // Form submissions (V4 #4). Two coincidences, both checked by hand:
  //
  //   "Newsletter" is the word Greek, German, Italian and Portuguese all
  //   use for this. Greek's own alternative, "ενημερωτικό δελτίο", is
  //   what a formal document says; a sign-up box on a bakery's website
  //   says Newsletter, and this file's Greek already uses the loanword
  //   elsewhere. Every other string in the same block DOES differ in all
  //   four languages (Επικοινωνία, Kontakt, Contatto, Contato;
  //   Αίτημα προσφοράς, Angebotsanfrage, Richiesta di preventivo,
  //   Pedido de orçamento), which is what makes this one a coincidence
  //   rather than a skipped locale.
  //
  //   "Contact" is spelled identically in French.
  "el:dashboard.formSubmissions.types.newsletter",
  "de:dashboard.formSubmissions.types.newsletter",
  "it:dashboard.formSubmissions.types.newsletter",
  "pt:dashboard.formSubmissions.types.newsletter",
  "fr:dashboard.formSubmissions.types.contact",
  // Unified search (V4 #17). The command palette's group headings and
  // filter labels. Each checked by hand against the language, not waved
  // through as a batch:
  //
  //   French spells "pages", "conversations", "agents", "missions",
  //   "type", "module" and "date" exactly as English does — they are the
  //   ordinary French words, not untranslated leftovers. Every other
  //   French string in this block (Enregistrements, Fichiers, Sites web,
  //   Recherche, Aide, Tout, "À tout moment") DOES differ, which is what
  //   makes these seven a coincidence rather than a skipped locale.
  //
  //   German uses "Websites" for websites; its own eight neighbours in
  //   the same block (Seiten, Einträge, Dateien, Unterhaltungen, Agenten,
  //   Recherche, Missionen, Hilfe) are all translated.
  "fr:dashboard.search.kinds.page",
  "fr:dashboard.search.kinds.chat",
  "fr:dashboard.search.kinds.agent",
  "fr:dashboard.search.kinds.mission",
  "fr:dashboard.search.filters.type",
  "fr:dashboard.search.filters.module",
  "fr:dashboard.search.filters.date",
  "de:dashboard.search.kinds.website",
  // The Home page of a generated multi-page website, in the page list.
  // Italian websites say "Home" — it is the word Italian uses for a
  // site's landing page, and the nine other locales here all translate it
  // (Αρχική, Inicio, Accueil, Startseite, Início, الرئيسية, ホーム, 首页),
  // which is what makes this one locale a genuine loanword rather than a
  // forgotten row.
  //
  // NOTE: this key shipped in commit 9fa79c1 without an allowance, which
  // left `npm run build` red on this branch from that commit until this
  // one. It was never a runtime defect — the Italian UI says the right
  // word — but the gate was failing and the failure was not reported.
  "it:dashboard.websiteBuilder.pageHome",
  // "Email" is the ordinary Italian word for it — Italian borrowed the
  // noun whole, and "posta elettronica" is what a government form says,
  // not what a person reading a settings panel expects. Scoped to Italian
  // because every other locale here has its own word and uses it.
  "it:dashboard.agents.delivery.channels.email",
  // Greek borrowed the noun too, and this app's own Greek already says
  // "Email" everywhere else it names the channel (settings.emailSupport,
  // the account section). Translating it here alone would make one screen
  // disagree with the rest of the Greek UI.
  "el:dashboard.agents.delivery.channels.email",
  // Margin report, owner-only. "Bypass" is the loanword these languages
  // actually use for this concept — and it is also the literal value
  // stored in ai_cost_log's metadata (bypassCharge), so translating the
  // column heading away from the field name it reports would make the
  // table harder to reconcile with the data, not easier.
  // Help Centre category headings that genuinely coincide with English in
  // one language: "Chat" is the word in five of them, "Credits",
  // "Missions" and "Websites" are the loanwords those languages use for
  // these product concepts, "AI Agents" is what the Greek UI already says
  // everywhere else, and "Account" is ordinary Italian. Scoped per locale
  // rather than globally, because a coincidence in Italian says nothing
  // about whether Greek was translated.
  "es:helpCentre.categories.chat",
  "fr:helpCentre.categories.chat",
  "de:helpCentre.categories.chat",
  "it:helpCentre.categories.chat",
  "pt:helpCentre.categories.chat",
  "de:helpCentre.categories.credits",
  "it:helpCentre.categories.credits",
  "pt:helpCentre.categories.credits",
  "de:helpCentre.categories.websites",
  "it:helpCentre.categories.websites",
  "fr:helpCentre.categories.missions",
  "it:helpCentre.categories.missions",
  "el:helpCentre.categories.agents",
  "el:helpCentre.categories.credits",
  "el:helpCentre.categories.websites",
  "el:helpCentre.categories.missions",
  "el:helpCentre.categories.chat",
  "it:helpCentre.categories.account",
  "el:settings.marginReport.colBypass",
  "es:settings.marginReport.colBypass",
  "fr:settings.marginReport.colBypass",
  "de:settings.marginReport.colBypass",
  "it:settings.marginReport.colBypass",
  "pt:settings.marginReport.colBypass",
  // "Credits" is the loanword the Greek and German UI already uses
  // verbatim everywhere else — see the existing entries below for
  // dashboard.files.creditsCharged.
  "el:settings.marginReport.sumCredits",
  "de:settings.marginReport.sumCredits",
  // Website Builder design controls. Each checked by hand: "Design" is
  // the ordinary word in French, German, Italian and Portuguese;
  // "optional" is genuine German; "Photo" is French. Substituting a
  // synonym to make the string differ would make those UIs worse, not
  // more translated — the same reasoning as the existing entries below.
  "fr:dashboard.websiteBuilder.design.title",
  "de:dashboard.websiteBuilder.design.title",
  "it:dashboard.websiteBuilder.design.title",
  "pt:dashboard.websiteBuilder.design.title",
  "de:dashboard.websiteBuilder.design.optional",
  "fr:dashboard.websiteBuilder.design.backgrounds.photo",
  // "Collaboration" is spelled identically in French — substituting a
  // synonym to make the string differ would make the French UI worse,
  // not more translated. Same reasoning as the entries below.
  "fr:settings.pushNotifications.collaboration",
  // File Workspace + Deep Research (V3 Task 4). Each checked by hand:
  // "credits" is the loanword the Greek UI already uses verbatim
  // everywhere else; "pages", "Collections", "questions" and "Sources"
  // are spelled identically in French, and substituting a synonym to make
  // the string differ would make the French UI worse, not more
  // translated.
  "el:dashboard.files.creditsCharged",
  "el:dashboard.deepResearch.creditsCharged",
  "fr:dashboard.files.pages",
  "fr:dashboard.files.collections",
  "fr:dashboard.deepResearch.questionCount",
  "fr:dashboard.deepResearch.sources",
  // "credits" is used verbatim in Greek — the same loanword the rest of the
  // Greek UI already uses ("Αγορά Credits", "Ιστορικό Credits").
  "el:credits.estimate.approx",
  // Autonomous Agents (V3). Same loanword/cognate cases as everywhere else
  // in this list, verified one by one rather than waved through:
  // "credits" is the word the Greek UI already uses verbatim; "Name" is
  // the German word, spelled identically; "Description" is French.
  "el:dashboard.agents.creditsPerRun",
  "el:dashboard.agents.runCredits",
  "de:dashboard.agents.previewName",
  "de:dashboard.agents.nameLabel",
  "fr:dashboard.agents.descriptionLabel",
  // Published Sites (V3 Task 2). Every one checked by hand:
  // "Website Builder" is the product's own name, used verbatim in the
  // Greek UI already (sidebar.items.websiteBuilder); "Version" is the
  // German and French word, spelled identically; "Live" and "Offline" are
  // the loanwords German and Italian actually use for a site being up or
  // down — "Offline" in particular has no natural German alternative.
  "el:dashboard.publishing.goToBuilder",
  "fr:dashboard.publishing.versionNumber",
  "de:dashboard.publishing.versionNumber",
  "de:dashboard.publishing.sitesUsedUnlimited",
  "de:dashboard.publishing.statusLive",
  "de:dashboard.publishing.statusUnpublished",
  "it:dashboard.publishing.statusUnpublished",
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
  // "min" is the standard minute abbreviation in every Romance language
  // too — the SI symbol, not an untranslated English word.
  "es:dashboard.mission.stepMinutes",
  "fr:dashboard.mission.stepMinutes",
  "it:dashboard.mission.stepMinutes",
  "pt:dashboard.mission.stepMinutes",
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
  // The singular, for the per-document page's browser tab. "Document" is
  // the French word, spelled identically — the same cognate already
  // allowed for the plural three lines above.
  "fr:pageTitle.document",
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
  // lib/modules.ts field labels and select options. Each checked by hand
  // against what the language actually calls the thing, not against
  // whether a synonym exists: "Marketing", "Budget", "Status", "Quiz",
  // "Hashtags", "Idea", "Sentiment", "Description", "Notes" and "Type"
  // really are spelled this way in these languages, and "email", "web",
  // "live", "final" and "social" are the loanwords their UIs already use
  // — the same reasoning as the Website Builder design controls above.
  // Substituting a rarer synonym to make the string differ would make
  // those UIs worse, not more translated.
  "de:moduleData.fields.budget",
  "de:moduleData.fields.hashtags",
  "de:moduleData.fields.marketing",
  "de:moduleData.fields.quiz",
  "de:moduleData.fields.status",
  "de:moduleData.options.final",
  "de:moduleData.options.live",
  "el:moduleData.options.email",
  "el:moduleData.options.web",
  "es:moduleData.fields.hashtags",
  "es:moduleData.fields.idea",
  "es:moduleData.fields.marketing",
  "es:moduleData.options.final",
  "es:moduleData.options.web",
  "fr:moduleData.fields.budget",
  "fr:moduleData.fields.description",
  "fr:moduleData.fields.marketing",
  "fr:moduleData.fields.notes",
  "fr:moduleData.fields.type",
  "fr:moduleData.options.final",
  "fr:moduleData.options.web",
  "it:moduleData.fields.budget",
  "it:moduleData.fields.idea",
  "it:moduleData.fields.marketing",
  "it:moduleData.fields.quiz",
  "it:moduleData.fields.sentiment",
  "it:moduleData.options.email",
  "it:moduleData.options.social",
  "it:moduleData.options.web",
  "pt:moduleData.fields.marketing",
  "pt:moduleData.options.final",
  "pt:moduleData.options.web",
  // V4 #18. Three real linguistic facts rather than three skipped
  // translations: "email" is the ordinary Greek and Italian word for
  // email (Greek's own "ηλεκτρονικό ταχυδρομείο" is what a government
  // form says, not what anybody labels a checkbox), and "Notifications"
  // is spelled identically in French. The other nine locales translate
  // all three and are not listed here — which is why this is an
  // allowance per locale rather than a rule about short words.
  "el:settings.notifications.channels.email",
  "it:settings.notifications.channels.email",
  "fr:settings.notifications.title",
]);

const INTENTIONALLY_IDENTICAL = new Set([
  // The placeholder in a URL field. "https://..." is a FORMAT, not prose:
  // the scheme is the same eight characters in every written language,
  // including the two that do not use the Latin alphabet at all.
  "moduleData.placeholders.httpsUrl",
  // "Logo" is the word for logo in French (le logo), German (das Logo)
  // and Italian (il logo) — the same loanword, not an untranslated
  // leftover. Greek, Arabic, Japanese and Chinese DO translate it and do.
  "dashboard.websiteBuilder.design.logoTitle",
  // The three delivery destinations that are BRAND NAMES. "Slack",
  // "Telegram" and "Discord" are what those products are called in every
  // locale — including Arabic and Japanese, whose own interfaces use the
  // Latin wordmark — and a user hunting for the Discord button is hunting
  // for the word Discord. The label above them, the help text and every
  // error message around them ARE translated; only the names are not.
  "dashboard.agents.delivery.channels.slack",
  "dashboard.agents.delivery.channels.telegram",
  "dashboard.agents.delivery.channels.discord",
  // The same two brand names in the V4 #18 notification matrix, for the
  // same reason. The column headers next to them ("In-app", "Email") ARE
  // translated everywhere, which is why those two are not on this list.
  "settings.notifications.channels.telegram",
  "settings.notifications.channels.discord",
  // A Discord webhook URL shown as a placeholder. A FORMAT, not prose —
  // and unlike most placeholders this one is copied literally, so a
  // "translated" version would be a wrong example.
  "settings.notifications.chat.discord.placeholder",
  // A hex colour code shown as the placeholder in the Website Builder's
  // colour field. It is a FORMAT example, not prose — "#1d4ed8" is the
  // same six characters in every language, and translating it would mean
  // showing a different colour per locale for no reason.
  "dashboard.websiteBuilder.design.hexPlaceholder",
  // "(1/3)" next to an AI action's current step. Two numbers, a slash and
  // a pair of brackets — there is no word in it to translate. The two
  // locales that DO differ (zh, ja, which use full-width brackets) are
  // translated and are not on this list, which is the whole reason this
  // is an allowance per key rather than a rule about digits.
  "aiSteps.counter",
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
  // Help Centre category headings. These are the SAME WORD in the
  // languages listed, not an untranslated string: "Chat" is chat in
  // Italian and Portuguese, "Credits"/"Missions"/"Websites" are the
  // loanwords those languages actually use for these product concepts,
  // and "Account" is the ordinary Italian word. Scoped per locale on
  // purpose — "Chat" coinciding in Italian says nothing about Greek,
  // which translates the ones it has words for (Αρχεία, Συνδέσεις,
  // Λογαριασμός) and keeps the loanwords it does not.
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
