// check-i18n.js VALIDATES THE KEYS A FILE USES. A FILE THAT USES NONE IS
// NOT IN ITS POPULATION.
//
// That gate is thorough about what it covers: nine locales, every key
// resolved, ICU placeholders, the `'{query}'` escaping trap that ships the
// literal braces in every language, translations identical to English
// flagged unless registered. All of it starts from the keys the tree
// asks for.
//
// So a component that calls no translation function at all — that simply
// writes English into the JSX — is not a failing case. It is not a case.
// Measured on 2026-09-16: 310 .tsx files, 225 use next-intl, and 13 of the
// remaining 85 render user-visible literal text. Not one of them is a
// defect, and that is exactly why this needed writing down:
//
//   five public legal and transparency pages, English by policy
//   six owner-only diagnostic screens, which no customer sees
//   the wordmark, which is a name
//   the Unsplash credit, whose wording their API terms fix verbatim
//
// Thirteen correct decisions and nowhere recording that any of them was a
// decision. The fourteenth — a customer-facing screen someone writes in
// English on a Friday — would look exactly the same to every instrument
// here. docs/shapes.md, "The check covers the participants, not the ones
// who stayed out".
//
// Run: node scripts/tests/i18n-population.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0,
  fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".tsx")) files.push(full.replace(/\\/g, "/"));
  }
})("src");

// JSX comments as well as the two JavaScript forms: `{/* ... */}` is the
// one a component actually uses, and its contents sit in JSX text
// position — exactly where the scan below looks.
const strip = (t) =>
  t
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const SOURCE = new Map(files.map((f) => [f, strip(readFileSync(f, "utf8"))]));

// THE SENTENCE THAT USED TO BE HERE IS GONE, AND THAT IS THE POINT.
// `EMAIL_REASON` said the same thing against six senders: "English today,
// and that is a decision rather than a limit — the plumbing is missing,
// this function takes an address rather than an account". Six of them are
// plumbed now, and a shared constant is exactly the kind of text that
// outlives the reason it states: one edit would have had to be right
// about six files at once. Each remaining entry argues for itself, which
// is what makes a stale one visible.

const TRANSLATES = /useTranslations\s*\(|getTranslations\s*\(|\bt\(|useFormatter|<FormattedMessage/;

// USER-VISIBLE means one of two things and deliberately not a third.
// A JSX text node of at least two words starting with a capital, or a
// prop the browser renders. NOT every quoted string: className, a route,
// a table name and a key are all strings, and a scan that counted them
// would be the near-zero-precision kind this project deletes rather than
// commits (docs/shapes.md on the line-versus-structure scan).
const JSX_TEXT = />\s*([A-Z][A-Za-z][^<>{}\n]{6,})</g;
const RENDERED_PROP = /\b(title|label|placeholder|alt|aria-label)\s*=\s*"([^"]{6,})"/g;

function visibleLiterals(src) {
  const text = [...src.matchAll(new RegExp(JSX_TEXT.source, "g"))]
    .map((m) => m[1].trim())
    .filter((s) => /[A-Za-z]{3}/.test(s) && /\s/.test(s));
  const props = [...src.matchAll(new RegExp(RENDERED_PROP.source, "g"))].map((m) => `${m[1]}="${m[2]}"`);
  return [...text, ...props];
}

const translating = files.filter((f) => TRANSLATES.test(SOURCE.get(f)));
const untranslated = files
  .filter((f) => !TRANSLATES.test(SOURCE.get(f)))
  .map((f) => ({ file: f, literals: visibleLiterals(SOURCE.get(f)) }))
  .filter((r) => r.literals.length > 0);

check(`.tsx files walked (${files.length})`, files.length >= 250, "the walk found almost nothing");
check(`files that translate (${translating.length})`, translating.length >= 180, "the next-intl detector matched almost nothing, and every file below would be reported as English");
check(
  `files that render literal text without it (${untranslated.length})`,
  untranslated.length >= 5,
  "the literal detector matched nothing, so the register below is checked against an empty set and passes vacuously"
);

// ---------------------------------------------------------------------
// ENGLISH ON PURPOSE. Four reasons, and each entry says which.
// ---------------------------------------------------------------------
const ENGLISH_ON_PURPOSE = {
  "src/app/terms/page.tsx": "legal text. A translated contract is a second contract, and the one that governs is the one that was written.",
  "src/app/privacy/page.tsx": "the same: the policy that binds is the English one, and a paraphrase in nine languages is nine documents nobody has reviewed.",
  "src/app/cookies/page.tsx": "the same, and it is the page a consent banner links to.",
  "src/app/acceptable-use/page.tsx": "the same: a rule enforced in English is published in English.",
  "src/app/ai-transparency/page.tsx": "what the product does with a model and which provider is on. It names providers, models and column names that do not translate, and it is read alongside the policy pages above.",
  "src/app/dashboard/system-health/page.tsx": "owner-only (isAdminEmail), and the words on it are column names and provider errors.",
  "src/components/system-health/pwa-adoption.tsx": "the same screen: install and push-permission counts for the owner.",
  "src/components/system-health/db-exposure.tsx": "the same owner-only screen: which tables each database role can reach, listed by their SQL names, which are not words in any language.",
  "src/components/system-health/capability-status.tsx": "the same screen: which provider keys are configured.",
  "src/components/system-health/storage-diagnostics.tsx": "the same owner-only screen: bucket names and storage policy names, which are identifiers rather than prose.",
  "src/components/costs/cost-dashboard.tsx": "the owner's spend dashboard, reached from /dashboard/costs, which is owner-gated in the page above it.",
  "src/components/logo.tsx": "the wordmark. A brand name is not translated into nine languages; it is the same string everywhere.",
  "src/lib/pdf/deck.tsx":
    "the Unsplash photographer credit. Their API terms fix the wording — 'Photo by <name> on Unsplash', both halves linked — and scripts/unsplash-attribution-proof.mjs exists to prove it renders. Translating it would break the term that lets the product use the photographs at all.",
};

const undeclared = untranslated.filter((r) => !ENGLISH_ON_PURPOSE[r.file]);
check(
  "every file that renders English without next-intl says why",
  undeclared.length === 0,
  undeclared.length
    ? undeclared
        .map((r) => `${r.file} (${r.literals.length}): ${r.literals.slice(0, 2).join(" | ").slice(0, 110)}`)
        .join("\n        ") +
      "\n        Translate it, or add it to ENGLISH_ON_PURPOSE with the reason a person reading nine languages may not have this one."
    : ""
);

// BOTH WAYS. An entry whose file has been translated, or has stopped
// rendering text, or has left the tree, is a sentence that has stopped
// being true.
const stale = Object.keys(ENGLISH_ON_PURPOSE).filter((f) => !untranslated.some((r) => r.file === f));
check(
  "no English-on-purpose entry has gone stale",
  stale.length === 0,
  stale
    .map((f) => (!files.includes(f) ? `${f}: no such file` : TRANSLATES.test(SOURCE.get(f) ?? "") ? `${f}: it translates now — drop the entry` : `${f}: it renders no literal text any more`))
    .join("\n        ")
);
const shortReasons = Object.entries(ENGLISH_ON_PURPOSE).filter(([, why]) => why.length < 50);
check("every reason is an argument", shortReasons.length === 0, shortReasons.map(([f]) => f).join(", "));

// ---------------------------------------------------------------------
// AND THE TEXT THAT IS NOT IN A COMPONENT AT ALL.
//
// Everything above walks .tsx. Not one outbound email is a .tsx file, so
// not one of them was in that population — and every one of them was
// English, for an app whose interface ships in ten languages. Fourteen
// subjects: "welcome to Ionexa AI", "New sign-in to your Ionexa AI
// account", "your subscription is set to end", and the rest.
//
// TWO OF THEM EXPLAINED WHY, AND THE REASON WAS NOT TRUE.
// send-subscription-cancelled-email.ts said "the messages/*.json
// catalogue is not loaded outside a request's locale context, and an
// email is not rendered inside one"; send-agent-emails.ts said "this
// module has no locale". But src/lib/ai/module-vocabulary.ts imports
// messages/en.json, messages/el.json and the rest DIRECTLY, at module
// scope, outside any request — so the catalogue plainly does load there.
// And the language was on the ACCOUNT the whole time:
// src/lib/locale-preference.ts writes
// raw_user_meta_data.preferred_locale and src/middleware.ts reads it
// back.
//
// What was actually true was narrower: the send functions took an
// ADDRESS, not an account, so the locale was not in scope AT THE SEND
// SITE. A plumbing decision and a reversible one — which is what it
// turned out to be. src/lib/email/email-locale.ts is that plumbing, and
// nine of the fourteen senders now resolve a language through it.
//
// WHAT IS LEFT IS FIVE, AND EACH ONE ARGUES FOR ITSELF BELOW. Three are
// operator mail that no customer reads. One goes to an address that may
// have no account. One — the notification dispatcher — is English because
// its sentences are composed in English by modules further up, and that
// is the next job rather than this one.
// ---------------------------------------------------------------------
// AND THE POPULATION IS "WHAT SENDS MAIL", NOT "WHAT LIVES IN
// src/lib/email". This walked that one directory, which is the same
// mistake one level up from the one this file is about: where a thing is
// filed is not the question. src/lib/notify/dispatch.ts calls
// resend.emails.send directly — it is the email face of every
// notification, the most-sent message in the product, and it was outside
// the population by folder name alone.
const emailModules = [];
(function walkLib(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walkLib(full);
    else if (entry.endsWith(".ts")) emailModules.push(full.replace(/\\/g, "/"));
  }
})("src/lib");
const SENDS = /resend\.emails\.send\s*\(|\bsendEmail\s*\(/;
const senders = emailModules.filter((f) => SENDS.test(strip(readFileSync(f, "utf8"))));
check(`modules that send mail (${senders.length})`, senders.length >= 9, "the email-send detector matched almost nothing");
check(
  "…and the population reaches outside src/lib/email",
  senders.some((f) => !f.startsWith("src/lib/email/")),
  "every sender found sits in one folder — either the walk narrowed again or dispatch.ts stopped sending, and one of those is a gap"
);

const EMAIL_ENGLISH_ON_PURPOSE = {
  "src/lib/email/error-alert.ts": "an operator alert to ADMIN_EMAILS. The reader is the owner, and the subject carries a route name and a provider message that do not translate.",
  "src/lib/email/margin-alert.ts": "the same: a margin figure and a feature name, sent to the owner and to nobody else.",
  // FOUND BY WIDENING THE WALK, not by anybody remembering it. It sends
  // to ADMIN_EMAILS with a subject that begins "[Ionexa cost alert]" and
  // it sat outside every i18n instrument this project has, purely because
  // it lives under src/lib/billing. Harmless — and the point is that
  // nothing said so.
  "src/lib/billing/cost-alert-delivery.ts":
    "an operator alert, addressed to ADMIN_EMAILS (the constant, not a user's address) and subject-prefixed [Ionexa cost alert]. Same class as the two above: the reader is the owner, and the body carries a cost figure and an alert type.",
  "src/lib/email/send-team-invite-email.ts":
    "it goes to an address that may have no account at all, so there is no raw_user_meta_data.preferred_locale to read — the plumbing every other sender now uses has nothing to read FROM here. The inviter's language is the only guess available, and it is a guess about a third party. The footer still comes out of the catalogue so it moves with the other nine when somebody decides what an invite should do.",
  "src/lib/notify/dispatch.ts":
    "its title and body are composed in English by the CALLERS — lib/publishing/badge-renewal.ts writes the badge warning, lib/billing/overage-store.ts writes the overage-cap warning. Translating the button and the footer around them would put a Greek frame on an English notice, which reads worse than an honestly English email. And it is one job rather than this one: the same two strings go to Telegram, to Discord and onto notification_events for the in-app bell, so the language has to be chosen where the notification is BUILT, not where it is mailed.",
};
// A SENDER COUNTS AS TRANSLATED WHEN IT RESOLVES A LOCALE. The .tsx rule
// above looks for useTranslations/getTranslations, which are React hooks
// an email module has no business calling — it reads the catalogue
// directly through lib/email/email-locale.ts. Same question, different
// mechanism, and using the component test here would report four
// translated emails as English.
const RESOLVES_A_LOCALE = /emailLocaleFor\s*\(|emailTranslator\s*\(/;
const untranslatedSenders = senders.filter(
  (f) => !RESOLVES_A_LOCALE.test(strip(readFileSync(f, "utf8"))) && !EMAIL_ENGLISH_ON_PURPOSE[f]
);
check(
  "every email that sends is translated, or says why it is English",
  untranslatedSenders.length === 0,
  untranslatedSenders.join("\n        ") + "\n        An email is the one place this product speaks to somebody who is not looking at the interface."
);
// THE FOUR A PERSON MEETS FIRST, and they are no longer on the list
// above. Signup, a sign-in from a new device, cancelling a subscription
// and deleting an account: the four moments where somebody who chose
// Greek in the interface was read English by the product.
//
// Each is held to three things, because a translated email is not one
// change but three: the template must take a locale, the SENDER must
// resolve one, and the call site must hand over the account — a template
// that accepts a locale nobody passes renders English for everybody and
// looks converted.
const TRANSLATED_EMAILS = {
  "src/lib/email/send-welcome-email.ts": "src/app/api/signup/route.ts",
  "src/lib/email/send-new-device-login-email.ts": "src/app/api/auth/device-check/route.ts",
  "src/lib/email/send-delete-account-confirmation-email.ts": "src/app/api/delete-account/request/route.ts",
  "src/lib/email/send-subscription-cancelled-email.ts": "src/app/api/billing/cancel/route.ts",
  // AND THE FIVE A PERSON MEETS AFTERWARDS. These are not first contact:
  // they are the product working — an agent finishing, an agent giving up,
  // a site collecting a lead, a week summarised, a generation that hung.
  // Over an account's life they outnumber the four above by an order of
  // magnitude, and every one of them was English.
  "src/lib/email/send-scheduled-run-complete-email.ts": "src/app/api/cron/scheduled-runs/route.ts",
  "src/lib/email/send-stuck-generation-email.ts": "src/app/api/cron/scheduled-runs/route.ts",
  "src/lib/email/send-website-form-submission-email.ts": "src/app/api/websites/[id]/submit-form/route.ts",
  "src/lib/email/send-weekly-digest-email.ts": "src/app/api/weekly-digest/route.ts",
  "src/lib/email/send-agent-emails.ts": "src/lib/agents/deliver.ts",
};
const brokenTranslations = [];
for (const [sender, callSite] of Object.entries(TRANSLATED_EMAILS)) {
  const src = strip(readFileSync(sender, "utf8"));
  if (!/emailLocaleFor\s*\(|knownLocale/.test(src)) brokenTranslations.push(`${sender}: resolves no locale`);
  if (!/\blocale\b/.test(src)) brokenTranslations.push(`${sender}: never passes a locale to its template`);
  // THE CALL EXPRESSION, not the file. Every one of these routes mentions
  // user.id somewhere — that is what a route does — so "the file contains
  // user.id" was true with the argument removed, and a mutant that took
  // the language back out of the signup call stayed green.
  const caller = strip(readFileSync(callSite, "utf8"));
  const fnName = /export async function (\w+)/.exec(strip(readFileSync(sender, "utf8")))?.[1] ?? "";
  const callAt = caller.indexOf(`${fnName}(`);
  const callExpr = callAt === -1 ? "" : caller.slice(callAt, callAt + 300);
  if (callAt === -1) {
    brokenTranslations.push(`${callSite}: does not call ${fnName} any more`);
  } else if (!/user\.id|userId|signupLocale|Locale/.test(callExpr)) {
    brokenTranslations.push(`${callSite}: calls ${fnName} without handing over the account or the locale`);
  }
}
check(
  `every translated sender resolves a language, and its caller supplies the account (${Object.keys(TRANSLATED_EMAILS).length})`,
  brokenTranslations.length === 0,
  brokenTranslations.join("\n        ")
);
// ---------------------------------------------------------------------
// THE TEMPLATES THEMSELVES, which is the population one level in.
//
// A sender that resolves a locale and hands it to a template that ignores
// it is the shape this whole file is about, wearing the costume of the
// fix. So: every exported *EmailHtml function either takes a `locale`, or
// is named here with the reason it does not.
// ---------------------------------------------------------------------
const TEMPLATES_SRC = readFileSync("src/lib/email/templates.ts", "utf8");
const exportedTemplates = [...TEMPLATES_SRC.matchAll(/export function (\w*EmailHtml)\(/g)].map((m) => m[1]);
check(
  `email templates exported (${exportedTemplates.length})`,
  exportedTemplates.length >= 10,
  "the template scan matched almost nothing, so the register below is checked against an empty set"
);
const TEMPLATES_ENGLISH_ON_PURPOSE = {
  teamInviteEmailHtml: "its sender has no account to read a language from — see send-team-invite-email.ts above.",
  notificationEmailHtml: "its title and body are composed in English by the callers — see src/lib/notify/dispatch.ts above.",
};
const templatesIgnoringLocale = exportedTemplates.filter((name) => {
  const at = TEMPLATES_SRC.indexOf(`export function ${name}(`);
  // The signature only — a `locale` mentioned 80 lines down in the body of
  // the NEXT function would otherwise clear this one.
  const signature = TEMPLATES_SRC.slice(at, TEMPLATES_SRC.indexOf("): string {", at));
  return !/\blocale\b/.test(signature) && !TEMPLATES_ENGLISH_ON_PURPOSE[name];
});
check(
  "every email template takes a language, or says why it does not",
  templatesIgnoringLocale.length === 0,
  templatesIgnoringLocale.join(", ") + "\n        A sender that resolves a locale and passes it to a template that does not take one renders English for everybody and looks converted."
);
const staleTemplate = Object.keys(TEMPLATES_ENGLISH_ON_PURPOSE).filter((n) => !exportedTemplates.includes(n));
check("no template declaration outlives its template", staleTemplate.length === 0, staleTemplate.join(", "));

// AND THE LAST ENGLISH SENTENCE IN A TRANSLATED EMAIL. layout() carried
// "You're receiving this because you have a Ionexa AI account." as a
// literal, so four converted emails still closed in English and nothing
// noticed — the footer is below the panel, and every eye reading a diff
// is above it. It is a required argument now, with no default: a default
// that renders correctly is the kind that is never passed.
check(
  "layout() holds no footer sentence of its own",
  !/You're receiving this because/.test(TEMPLATES_SRC),
  "the footer is a literal in templates.ts again, which means it is English in all ten languages"
);
// COUNTED WITHOUT layout()'S OWN DECLARATION on both sides, which
// otherwise contributes one to each and makes the two numbers agree for a
// reason that has nothing to do with the call sites.
const BODY = TEMPLATES_SRC.slice(TEMPLATES_SRC.indexOf("export function welcomeEmailHtml"));
const layoutCalls = (BODY.match(/\blayout\(\{/g) ?? []).length;
const footerArgs = (BODY.match(/^\s*footer:/gm) ?? []).length;
check(
  `every layout() call supplies its footer (${layoutCalls} calls, ${footerArgs} footers)`,
  layoutCalls >= 10 && layoutCalls === footerArgs,
  "a layout() call with no footer would not compile — unless a default came back, which is what this counts"
);

// And the strings really exist in every locale, not just in English.
const EMAIL_KEYS = [
  "welcome.title",
  "deletion.title",
  "cancelled.title",
  "newDevice.title",
  "blurbs.ideas",
  "footer",
  "scheduledRun.titleFailed",
  "scheduledRun.details.noCreditsOnce",
  "stuck.body",
  "formSubmission.badges.spam",
  "agent.pausedBody",
  "digest.noticed",
];
const missingEmailStrings = [];
for (const loc of ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"]) {
  const cat = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
  for (const key of EMAIL_KEYS) {
    const value = key.split(".").reduce((node, part) => (node ? node[part] : undefined), cat.email);
    if (typeof value !== "string" || value.length < 2) missingEmailStrings.push(`${loc}: email.${key}`);
  }
}
check("every email string exists in all ten locales", missingEmailStrings.length === 0, missingEmailStrings.join(", "));

// ---------------------------------------------------------------------
// THE DIGEST LINES, WHICH ARE THE ONLY TRANSLATED STRING IN THIS PRODUCT
// THAT DEPENDS ON A NUMBER.
//
// buildDigest returns a key and a count; lib/email/email-locale.ts picks
// `.one` or `.other` — or, in Arabic, one of six — with Intl.PluralRules
// and reads that leaf. A form the catalogue does not carry falls back to
// `.other` IN THE SAME LANGUAGE, so a gap degrades to a slightly wrong
// inflection rather than to an English sentence in a Greek list.
//
// That fallback is also what makes this checkable rather than assertable:
// the question is not "does every locale have every category" (Arabic has
// six, Japanese has one, and demanding six of Japanese would be the
// English-shaped mistake again) but "does every count this code can
// produce render a real sentence". So it is asked by rendering, at the
// numbers a week can actually hold.
// ---------------------------------------------------------------------
const PLURAL_LINES = [
  "agents",
  "records",
  "site",
  "credits",
  "creditsWithAverage",
  "leads",
  "agentFailures",
];
// 0 and 1 for the boundaries, 2 for Arabic's dual, 3 and 7 for its `few`,
// 11 and 99 for its `many`, 100 and 1001 for the rest. A digest can hold
// any of them: siteViews is genuinely 0 for a published site nobody
// visited, and creditsSpent runs into the thousands.
const PLURAL_COUNTS = [0, 1, 2, 3, 7, 11, 99, 100, 1001];
// WHAT A LINE HAS TO SAY IS DECIDED IN ENGLISH, not per locale. Deriving
// it from the locale's own `other` was the first version of this, and it
// could not see the mutation it was written for: a French `other` that
// drops {found} leaves a French file whose every form agrees with a
// French `other` that lost the fact. The source of truth for which
// numbers a sentence carries is messages/en.json, because that is where
// the line was specified.
const EN_LINES = JSON.parse(readFileSync("messages/en.json", "utf8")).email.digest.lines;
const unrenderable = [];
for (const loc of ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"]) {
  const cat = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
  const lines = cat.email?.digest?.lines ?? {};
  for (const name of PLURAL_LINES) {
    const node = lines[name];
    if (!node || typeof node !== "object") {
      unrenderable.push(`${loc}: email.digest.lines.${name} is not a set of forms`);
      continue;
    }
    for (const count of PLURAL_COUNTS) {
      const form = new Intl.PluralRules(loc).select(count);
      const text = typeof node[form] === "string" ? node[form] : node.other;
      if (typeof text !== "string" || text.length < 2) {
        unrenderable.push(`${loc}: ${name} at ${count} wants "${form}" and there is no fallback either`);
        continue;
      }
      // A FORM THAT DROPPED A NUMBER IT STILL NEEDS.
      //
      // Two different rules, because two different things are going on.
      // The SECOND number in a line — {found} in "3 agent runs, 2 with a
      // result", {average} in the credits line — is not what the plural
      // form was chosen from, so no category licenses dropping it: a
      // catalogue that loses it loses a fact.
      const others = [...(EN_LINES[name].other.match(/\{(\w+)\}/g) ?? [])].filter((ph) => ph !== "{count}" && ph !== "{runs}");
      for (const ph of others) {
        if (!text.includes(ph)) unrenderable.push(`${loc}: ${name}.${form} dropped ${ph}`);
      }
      // The COUNT itself is different: `zero`, `one` and `two` each pin an
      // exact number, so Arabic's "سجلان جديدان" — two new records, no
      // numeral — says everything the numeral would. `few`, `many` and
      // `other` cover ranges, and a range with no number in it reports
      // nothing at all.
      if (!["zero", "one", "two"].includes(form) && !/\{(count|runs)\}/.test(text)) {
        unrenderable.push(`${loc}: ${name}.${form} covers a range and has no number in it: ${JSON.stringify(text)}`);
      }
    }
  }
}
check(
  `every digest line renders at every count, in all ten locales (${PLURAL_LINES.length} lines x ${PLURAL_COUNTS.length} counts x 10)`,
  unrenderable.length === 0,
  unrenderable.slice(0, 8).join("\n        ")
);
// AND THE FORMS ARE NOT ALL THE SAME STRING. Copying `other` into `one`
// is how a language gets "1 new records" — the exact sentence the old
// `n === 1 ? "record" : "records"` existed to prevent, reintroduced one
// catalogue at a time. Checked only where the language HAS a singular:
// Japanese and Chinese have one form and repeating it is correct there.
const noSingular = [];
for (const loc of ["en", "el", "es", "fr", "de", "it", "pt", "ar"]) {
  const lines = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8")).email.digest.lines;
  for (const name of PLURAL_LINES) {
    if (lines[name].one === lines[name].other) noSingular.push(`${loc}: ${name}`);
  }
}
check(
  "…and a language with a singular actually uses one",
  noSingular.length === 0,
  noSingular.join(", ") + "\n        `one` and `other` are the same string here, which renders the plural noun after the number 1."
);
// THE OTHER END, AND IT IS THE END THAT MAKES THE RULE ABOVE CORRECT
// RATHER THAN ENGLISH-SHAPED. 中文 and 日本語 have exactly one form:
// Intl.PluralRules("zh").select(1) and .select(1001) both answer "other",
// so the `one` a catalogue carries there is never read, and repeating
// `other` into it is the right thing rather than the copy-paste the check
// above refuses. Asserted, not assumed — if Node's tables ever disagreed
// with that, the loop above would start demanding a Chinese singular.
const oneFormLocales = ["zh", "ja"];
const wrongEnd = [];
for (const loc of oneFormLocales) {
  const forms = new Set([0, 1, 2, 5, 11, 100, 1001].map((n) => new Intl.PluralRules(loc).select(n)));
  if (forms.size !== 1 || !forms.has("other")) wrongEnd.push(`${loc}: ${[...forms].join("/")}`);
  const lines = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8")).email.digest.lines;
  // 记录 / 記録 — the approved counted noun for this concept in
  // docs/glossary.md, and the string a reader of either language actually
  // gets. Read rather than spelled here so the assertion is about the
  // catalogue, not about this line.
  if (!/[\u4e00-\u9fff\u3040-\u30ff]/.test(lines.records.other)) wrongEnd.push(`${loc}: its record line is not in its own script`);
}
check(
  "the one-form languages are treated as one-form, and say so in their own script",
  wrongEnd.length === 0,
  wrongEnd.join(", ")
);

const staleEmail = Object.keys(EMAIL_ENGLISH_ON_PURPOSE).filter((f) => !senders.includes(f));
check("no email declaration outlives its module", staleEmail.length === 0, staleEmail.join(", "));

// THE CORRECTED CLAIM IS ITSELF CHECKED, because the reason above rests
// on it: if module-vocabulary stops importing the catalogue at module
// scope, the old explanation becomes true again and this one becomes the
// wrong sentence.
const VOCAB = "src/lib/ai/module-vocabulary.ts";
check(
  "the catalogue is still loaded outside a request, which is what makes the reason above the true one",
  /import\s+\w+\s+from\s+["'][^"']*messages\/en\.json["']/.test(readFileSync(VOCAB, "utf8")),
  `${VOCAB} no longer imports messages/*.json at module scope — re-read the reason in EMAIL_ENGLISH_ON_PURPOSE before trusting it`
);
check(
  "...and the account still stores a preferred locale",
  /preferred_locale/.test(readFileSync("src/lib/locale-preference.ts", "utf8")),
  "if the account stops carrying a language, English email stops being a plumbing decision and becomes a constraint"
);

// ---------------------------------------------------------------------
// CONTROLS, driving visibleLiterals and TRANSLATES rather than restating.
// ---------------------------------------------------------------------
check("control: a two-word JSX text node is visible", visibleLiterals("<p>Settings saved successfully</p>").length === 1);
check("control: a className is not", visibleLiterals('<div className="flex items-center gap-2" />').length === 0, "the scan is matching attributes the browser never shows");
check("control: a key or a path is not", visibleLiterals('<Link href="/dashboard/settings">{t("open")}</Link>').length === 0);
check("control: a rendered prop is", visibleLiterals('<input placeholder="Search everything" />').length === 1);
check("control: a JSX comment is not", visibleLiterals(strip("<div>{/* Settings saved successfully */}</div>")).length === 0, "the comment stripper is not running, so a note about a string counts as the string");
check("control: a single capitalised word is not", visibleLiterals("<span>Settings</span>").length === 0, "one word is as likely to be an identifier as a sentence; the two-word rule is what keeps precision usable");
check("control: a file calling useTranslations is seen to translate", TRANSLATES.test('const t = useTranslations("dashboard");'));
check("control: a server file calling getTranslations is too", TRANSLATES.test('const t = await getTranslations("dashboard");'));

console.log(`\n        ${files.length} .tsx · ${translating.length} translate · ${untranslated.length} render English, all ${Object.keys(ENGLISH_ON_PURPOSE).length} of them declared`);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
