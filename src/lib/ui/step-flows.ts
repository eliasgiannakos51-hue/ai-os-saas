/**
 * THE FOUR FLOWS, DECLARED ONCE.
 *
 * Redesign phase 4 asked for a consistent step flow on the four screens
 * that produce something over more than one move: "same button position,
 * same step names, same progress shape". The shape is
 * components/ui/step-flow.tsx, the names are the `stepFlow.steps.*`
 * message keys, and the flows are here so that no screen can invent a
 * fifth step of its own or call the same step a different word.
 *
 * A STEP NAME IS SHARED, NOT PER FLOW. `describe` is the same key on the
 * website builder and on coding, `answer` the same on research and on
 * files. That is what "same step names" means and it is why the keys are
 * flat rather than nested under the flow — a translator sees one word
 * once, and two screens cannot drift into "Περίγραψε" and "Περιέγραψε".
 *
 * WHERE THIS DIFFERS FROM THE BRIEF, AND WHY.
 *
 * The brief named Coding as Describe -> Build -> Test -> Fix -> Deploy.
 * Three of those five did not exist and drawing them would have been
 * the exact defect lib/coding/operations.ts's header spends itself on:
 * that screen RUNS NOTHING, MAKES NO COMMITS and DOES NOT BUILD A
 * PROJECT. From 2026-10-05 to 2026-10-18 coding kept a three-step flow
 * of its own — Describe, Generate, Review — for the same reason the
 * other three screens have one: a single form, one submission, one
 * result, same shape as the others with steps.
 *
 * ON 2026-10-18 CODING STOPPED HAVING A FORM AT ALL. The owner's own
 * words: «Το Coding καταλαβαίνει μόνο του τι ζητάω» — it is a
 * conversation now, the same shell as Ionexa Chat, and a conversation
 * has no "step 2 of 3": a reply can ask a question, write one file,
 * change three, or answer in prose with no file at all, in any order,
 * any number of times. There is no progress to draw a bar across — Chat
 * itself draws none, for the identical reason — so coding has no entry
 * here, and src/components/coding/coding-workspace.tsx has no
 * <StepFlow>. The other three flows are the brief's, unchanged.
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
