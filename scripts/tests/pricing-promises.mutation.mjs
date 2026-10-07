#!/usr/bin/env node
/*
 * CAN pricing-promises.test.mjs SEE THE PRICING PAGE PROMISE MORE THAN
 * THE CODE DOES AGAIN?
 *
 * NEEDS 31 (2026-10-05): agents, team and automation are written as they
 * really are. Each mutant puts one of the old promises back.
 *
 * Run: node scripts/tests/pricing-promises.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/pricing-promises.test.mjs";
const EN = "messages/en.json";

const MUTANTS = [
  {
    name: "Professional sells agent teams again",
    file: EN,
    from: '"upTo15AiAgentsTeams": "Up to 15 scheduled web-research agents",',
    to: '"upTo15AiAgentsTeams": "Up to 15 AI agents & teams",',
    expect: "no locale sells agent \"teams\" that do not exist",
  },
  {
    name: "Starter sells an Automation Builder again",
    file: EN,
    from: '"websiteAutomationBuilderAccess": "Website Builder, and automations that run once a day",',
    to: '"websiteAutomationBuilderAccess": "Website & Automation Builder access",',
    expect: "no locale's pricing text names an Automation Builder",
  },
  {
    name: "the team banner stops saying nothing is shared",
    file: EN,
    from: "Work is not shared between accounts yet — each person keeps their own. ",
    to: "",
    expect: "teamBannerBody says work is not shared yet",
  },
  {
    name: "the roadmap counts record lists the hub does not serve",
    file: EN,
    from: '"title": "13 Business Entry Lists",',
    to: '"title": "12 Business Entry Lists",',
    expect: "record lists, the number the hub serves",
  },
];

runMutations({ name: "pricing-promises", gate: GATE, targets: [EN], mutants: MUTANTS });
