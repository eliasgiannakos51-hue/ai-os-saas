/*
 * WHERE EACH LARGE ACTION'S PRICE IS ON SCREEN BEFORE THE BUTTON.
 *
 * Written out by hand because measuring it did not work: a scan for
 * "a screen that names this profile and calls an estimator" found 11 of
 * 30 on 2026-10-02 and missed the two it mattered most for — Deep
 * Research's number is computed by api/research and rendered from the
 * response, and an agent's per-run price reaches components/agents/
 * depth-picker.tsx through lib/agents/execute-agent.ts's DEPTH_PROFILE.
 * Neither screen contains the profile's name.
 *
 * So the list is explicit and scripts/tests/cost-before.test.mjs holds
 * it BOTH ways: every action the estimator says is large has an entry
 * here, every entry names an action that exists, and every `renders`
 * is found in its file with the comments stripped.
 *
 * `renders` is the expression that puts the number on the screen — the
 * code a careless edit would delete, not a sentence about it.
 */
export const SHOWN_BEFORE = {
  websiteGenerate: {
    file: "src/components/website-builder/website-builder-workspace.tsx",
    renders: 't("estimatedCost", { count: estimatedCost })',
  },
  deepResearch: {
    file: "src/components/research/research-workspace.tsx",
    renders: 't("estimate", { credits: draft.credits })',
  },
  // The three depths are one picker, every option priced side by side —
  // the comparison is the decision (see the comment above the number).
  agentRunDeep: {
    file: "src/components/agents/depth-picker.tsx",
    renders: "formatNumber(fact.credits, locale)",
  },
  agentRunStandard: {
    file: "src/components/agents/depth-picker.tsx",
    renders: "formatNumber(fact.credits, locale)",
  },
  agentRunSimple: {
    file: "src/components/agents/depth-picker.tsx",
    renders: "formatNumber(fact.credits, locale)",
  },
};
