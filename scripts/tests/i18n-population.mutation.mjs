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
 *
 * Run: node scripts/tests/i18n-population.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/i18n-population.test.mjs";
const LOGO = "src/components/logo.tsx";
const DECK = "src/lib/pdf/deck.tsx";
const APPS = "src/app/dashboard/apps/page.tsx";

const MUTANTS = [
  {
    // THE POPULATION THAT WALKS .tsx CANNOT SEE A .ts EMAIL. Twelve
    // senders, every one English, none of them in any list until today.
    name: "an email sender drops out of the register",
    file: GATE,
    from: '  "src/lib/email/send-welcome-email.ts": EMAIL_REASON,\n',
    to: "",
    expect: "says why it is English",
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
  targets: [LOGO, DECK, APPS, GATE, "src/lib/ai/module-vocabulary.ts"],
  mutants: MUTANTS,
});
