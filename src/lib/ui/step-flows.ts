/**
 * THE THREE FLOWS, DECLARED ONCE.
 *
 * Redesign phase 4 asked for a consistent step flow on the screens that
 * produce something over more than one move: "same button position, same
 * step names, same progress shape". The shape is
 * components/ui/step-flow.tsx, the names are the `stepFlow.steps.*`
 * message keys, and the flows are here so that no screen can invent a
 * fifth step of its own or call the same step a different word.
 *
 * A STEP NAME IS SHARED, NOT PER FLOW. `answer` is the same key on
 * research and on files. That is what "same step names" means and it is
 * why the keys are flat rather than nested under the flow — a translator
 * sees one word once, and two screens cannot drift into "Περίγραψε" and
 * "Περιέγραψε".
 *
 * CODING HAD A FOURTH FLOW HERE (Describe -> Generate -> Review), and
 * lost it on 2026-10-22: the owner's critical message asked every step
 * indicator off that screen, which is now a conversation, like Claude
 * Code itself, with no numbered stages to show. lib/coding/operations.ts
 * still declares the three absences (RUNS NOTHING, MAKES NO COMMITS,
 * DOES NOT BUILD A PROJECT) the removed three-step flow used to defer
 * to; they just no longer need a flow to defer FROM.
 */
export const STEP_FLOWS = {
  website: ["describe", "generate", "edit", "preview", "publish"],
  research: ["question", "research", "sources", "answer"],
  files: ["upload", "ask", "answer"],
} as const;

export type FlowName = keyof typeof STEP_FLOWS;

// THE GATE DERIVES ITS OWN LIST. `STEP_NAMES` stood here under the
// comment "every distinct step name, for the i18n gate to check against",
// and scripts/tests/step-flow.test.mjs does not import it: it reads this
// file as text, regex-parses STEP_FLOWS into its own object and builds
// `[...new Set(Object.values(FLOWS).flat())]` itself — the same
// expression, one file over. The export named a consumer that did not
// exist, which is the only reason it looked load-bearing.
