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
 * Three of those five do not exist and drawing them would be the exact
 * defect lib/coding/operations.ts spends its header on: that screen RUNS
 * NOTHING, MAKES NO COMMITS and DOES NOT BUILD A PROJECT — it writes
 * text into a box from text in another box. A progress bar with a
 * greyed-out "Deploy" at the end is a promise, not a state, and the
 * previous version of that page was renamed precisely because its name
 * promised more than the screen delivered. So coding's flow is the three
 * steps it has. The other three flows are the brief's, unchanged.
 */
export const STEP_FLOWS = {
  website: ["describe", "generate", "edit", "preview", "publish"],
  research: ["question", "research", "sources", "answer"],
  files: ["upload", "ask", "answer"],
  coding: ["describe", "generate", "review"],
} as const;

export type FlowName = keyof typeof STEP_FLOWS;

/** Every distinct step name, for the i18n gate to check against. */
export const STEP_NAMES = [...new Set(Object.values(STEP_FLOWS).flat())].sort();
