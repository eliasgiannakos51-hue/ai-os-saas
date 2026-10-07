#!/usr/bin/env node
/*
 * CAN integrations.test.mjs SEE A CONNECTION OFFERED THAT CANNOT BE MADE?
 *
 * Two texts promised what no deployment could deliver: the integrations
 * empty state offered "your calendar" with no calendar provider in the
 * registry, and onboarding showed "Connect Gmail or Drive" whether or not
 * the Google OAuth client was configured. The last section of the gate
 * reads both; these put each one back.
 *
 * Run: node scripts/tests/integrations-copy.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/integrations.test.mjs";
const EN = "messages/en.json";
const FLOW = "src/components/onboarding/onboarding-flow.tsx";
const PAGE = "src/app/onboarding/page.tsx";

const MUTANTS = [
  {
    name: "the empty state offers a calendar again",
    file: EN,
    from: "your mail, your files",
    to: "your mail, your calendar, your files",
    expect: "en: the empty state does not offer a calendar",
  },
  {
    name: "onboarding shows the Gmail card unconditionally",
    file: FLOW,
    from: "{integrationsAvailable ? (",
    to: "{true ? (",
    expect: "shows the card only then",
  },
  {
    name: "onboarding is told integrations are always available",
    file: PAGE,
    from: 'integrationsAvailable={providerConfigured("gmail") || providerConfigured("google_drive")}',
    to: "integrationsAvailable={true}",
    expect: "onboarding is told whether Gmail or Drive can be connected",
  },
];

runMutations({ name: "integrations-copy", gate: GATE, targets: [EN, FLOW, PAGE], mutants: MUTANTS });
