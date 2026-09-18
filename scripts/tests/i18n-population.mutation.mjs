#!/usr/bin/env node
/*
 * CAN i18n-population.test.mjs SEE AN ENGLISH SCREEN NOBODY DECLARED?
 *
 * check-i18n.js stays green through every one of these: its population is
 * the keys a file ASKS FOR, and a file that asks for none is not a failing
 * case there, it is not a case.
 *
 *   1. a customer-facing component stops translating and renders English.
 *   2. the same, through a rendered prop rather than a text node — the
 *      half of the detector a text-only scan would miss.
 *   3. a declared file starts translating, so its entry has become a
 *      sentence that is no longer true.
 *   4. the Unsplash credit is "translated", which breaks the API term
 *      that lets the product use the photographs at all.
 *   5. the sender walk narrows back to one folder, which is how two
 *      modules that send real mail were outside every i18n instrument.
 *   6. a template stops taking the locale its sender resolves — the shape
 *      that looks converted and renders English for everybody.
 *   7. the footer comes back as a literal, which is how it survived four
 *      conversions.
 *   8. a catalogue loses a plural form, or copies its plural into its
 *      singular, or drops the second number out of a sentence.
 *
 * Run: node scripts/tests/i18n-population.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/i18n-population.test.mjs";
const LOGO = "src/components/logo.tsx";
const DECK = "src/lib/pdf/deck.tsx";
const APPS = "src/app/dashboard/apps/page.tsx";
const TEMPLATES = "src/lib/email/templates.ts";
const DIGEST = "src/lib/notify/digest.ts";

const MUTANTS = [
  {
    // A TEMPLATE THAT ACCEPTS A LOCALE NOBODY PASSES renders English for
    // everybody and reads as converted. Three things have to line up —
    // template, sender, call site — and this removes the last one.
    name: "the signup route stops handing over the language it knows",
    file: "src/app/api/signup/route.ts",
    from: "sendWelcomeEmail(email, null, signupLocale)",
    to: "sendWelcomeEmail(email)",
    expect: "caller supplies the account",
  },
  {
    name: "a first-contact sender stops resolving a locale",
    file: "src/lib/email/send-delete-account-confirmation-email.ts",
    from: "    const locale = await emailLocaleFor(userId);",
    to: '    const locale = "en";',
    expect: "resolves a language",
  },
  {
    name: "an email string is dropped from one of the ten catalogues",
    file: "messages/el.json",
    from: '"title": "επιβεβαίωση διαγραφής λογαριασμού"',
    to: '"title": ""',
    expect: "exists in all ten locales",
  },
  {
    // THE POPULATION THAT WALKS .tsx CANNOT SEE A .ts EMAIL. Fourteen
    // senders, every one English, none of them in any list until this
    // file existed.
    name: "an email sender drops out of the register",
    file: GATE,
    from: '  "src/lib/email/error-alert.ts": "an operator alert to ADMIN_EMAILS. The reader is the owner, and the subject carries a route name and a provider message that do not translate.",\n',
    to: "",
    expect: "says why it is English",
  },
  {
    // THE WALK THAT NARROWS BACK TO ONE FOLDER. This is how
    // notify/dispatch.ts and billing/cost-alert-delivery.ts were outside
    // every i18n instrument in the project: not by anybody deciding, but
    // by a directory name in a scan.
    name: "the sender walk goes back to src/lib/email only",
    file: GATE,
    from: '})("src/lib");',
    to: '})("src/lib/email");',
    expect: "reaches outside src/lib/email",
  },
  {
    // A TEMPLATE THAT TAKES NO LOCALE while its sender resolves one. The
    // sender passes, the call site passes, and every word is English.
    name: "a template stops accepting the language its sender resolved",
    file: TEMPLATES,
    from: "  billingUrl,\n  locale = \"en\",\n}: {\n  agentName: string;\n  agentsUrl: string;\n  billingUrl: string;\n  locale?: string;\n}",
    to: "  billingUrl,\n}: {\n  agentName: string;\n  agentsUrl: string;\n  billingUrl: string;\n}",
    expect: "takes a language",
  },
  {
    // THE FOOTER, WHICH SURVIVED FOUR CONVERSIONS AS A LITERAL because it
    // sits below the panel and every eye reading a diff is above it.
    name: "the footer sentence comes back into layout() as English",
    file: TEMPLATES,
    from: "                  ${footer}",
    to: "                  You're receiving this because you have a Ionexa AI account.",
    expect: "no footer sentence of its own",
  },
  {
    // A CATALOGUE THAT LOSES A PLURAL FORM. Arabic's `many` covers 11-99
    // and 340; falling back to `other` is the designed behaviour, but
    // falling back to nothing is a raw key in somebody's inbox.
    name: "a locale loses the plural form a real week would ask for",
    file: "messages/ar.json",
    from: '          "many": "{count} \u0639\u0645\u064a\u0644\u064b\u0627 \u0645\u062d\u062a\u0645\u0644\u064b\u0627 \u062f\u0648\u0646 \u0645\u062a\u0627\u0628\u0639\u0629 \u0645\u0633\u062c\u0651\u0644\u0629",\n          "other": "{count} \u0639\u0645\u064a\u0644 \u0645\u062d\u062a\u0645\u0644 \u062f\u0648\u0646 \u0645\u062a\u0627\u0628\u0639\u0629 \u0645\u0633\u062c\u0651\u0644\u0629"',
    to: '          "many": "{count} \u0639\u0645\u064a\u0644\u064b\u0627 \u0645\u062d\u062a\u0645\u0644\u064b\u0627 \u062f\u0648\u0646 \u0645\u062a\u0627\u0628\u0639\u0629 \u0645\u0633\u062c\u0651\u0644\u0629",\n          "other": ""',
    expect: "renders at every count",
  },
  {
    // COPYING `other` INTO `one` is how a language gets "1 new records" —
    // the exact sentence the old `n === 1 ? ... : ...` prevented,
    // reintroduced one catalogue at a time where no compiler looks.
    name: "a language's singular is replaced by its plural",
    file: "messages/el.json",
    from: '          "one": "{count} \u03b5\u03c0\u03b1\u03c6\u03ae \u03c7\u03c9\u03c1\u03af\u03c2 \u03ba\u03b1\u03c4\u03b1\u03b3\u03b5\u03b3\u03c1\u03b1\u03bc\u03bc\u03ad\u03bd\u03b7 \u03c3\u03c5\u03bd\u03ad\u03c7\u03b5\u03b9\u03b1",',
    to: '          "one": "{count} \u03b5\u03c0\u03b1\u03c6\u03ad\u03c2 \u03c7\u03c9\u03c1\u03af\u03c2 \u03ba\u03b1\u03c4\u03b1\u03b3\u03b5\u03b3\u03c1\u03b1\u03bc\u03bc\u03ad\u03bd\u03b7 \u03c3\u03c5\u03bd\u03ad\u03c7\u03b5\u03b9\u03b1",',
    expect: "actually uses one",
  },
  {
    // THE SECOND NUMBER IN A LINE is not what the plural form was chosen
    // from, so no category licenses dropping it — and a line that loses it
    // still reads as a sentence, which is why a human proof-read would
    // pass it.
    name: "a plural form drops the second number in its sentence",
    file: "messages/fr.json",
    from: '"other": "{runs} ex\u00e9cutions d\u2019agents, {found} avec un r\u00e9sultat"',
    to: '"other": "{runs} ex\u00e9cutions d\u2019agents"',
    expect: "renders at every count",
  },
  {
    // The reason given for every English email rests on two facts about
    // OTHER files. If either stops being true the reason is the wrong
    // sentence, and a reason nobody re-checks is how a limitation note
    // outlives its limitation.
    name: "the catalogue stops loading outside a request, so the stated reason stops being true",
    file: "src/lib/ai/module-vocabulary.ts",
    from: 'import en from "../../../messages/en.json";',
    to: "const en = {} as Record<string, unknown>;",
    expect: "catalogue is still loaded outside a request",
  },
  {
    name: "a declared file starts translating, so its entry is now false",
    file: LOGO,
    from: "export function Logo",
    to: 'const _t = useTranslations("logo");\nexport function Logo',
    expect: "gone stale",
  },
  {
    name: "the Unsplash credit is translated, breaking the API term",
    file: DECK,
    from: "      Photo by <Link",
    to: '      {"\\u03a6\\u03c9\\u03c4\\u03bf\\u03b3\\u03c1\\u03b1\\u03c6\\u03af\\u03b1 \\u03b1\\u03c0\\u03cc "}<Link',
    expect: "gone stale",
  },
  {
    name: "an owner-only screen loses its declaration and nothing says it is English",
    file: GATE,
    from: '  "src/components/system-health/db-exposure.tsx": "the same owner-only screen: which tables each database role can reach, listed by their SQL names, which are not words in any language.",\n',
    to: "",
    expect: "says why",
  },
  {
    // THE HALF A TEXT-ONLY SCAN WOULD MISS. This page translates nothing
    // and renders no text today; a placeholder is English a customer
    // reads, in a position no JSX text-node regex looks at.
    name: "a customer-facing page gains an English placeholder nobody declared",
    file: APPS,
    from: "export default",
    to: 'export function Search() { return <input placeholder="Search every app" />; }\nexport default',
    expect: "says why",
  },
];

runMutations({
  name: "i18n-population",
  gate: GATE,
  targets: [
    LOGO,
    DECK,
    APPS,
    GATE,
    TEMPLATES,
    DIGEST,
    "src/lib/ai/module-vocabulary.ts",
    "src/app/api/signup/route.ts",
    "src/lib/email/send-delete-account-confirmation-email.ts",
    "messages/el.json",
    "messages/ar.json",
    "messages/fr.json",
  ],
  mutants: MUTANTS,
});
