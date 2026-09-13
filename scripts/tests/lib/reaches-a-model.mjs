import { readFileSync, existsSync } from "node:fs";

/**
 * DOES THIS FILE ACTUALLY PRODUCE SOMETHING?
 *
 * ONE DEFINITION, TWO CALLERS. `sidebar-naming.test.mjs` §3b asks it of
 * a nav row under "Make"; `pricing-truth.test.mjs` asks it of a row
 * under MAKE on the comparison table. They are the same question — "is
 * there a model behind this promise" — asked at the two surfaces where
 * the promise is made, and a copy of the pattern in each file is a copy
 * that drifts. Widening it here widens it for both, which is the
 * property that keeps it honest: sidebar-naming ALSO asserts that every
 * tracking module matches NOTHING, so a pattern loose enough to call a
 * notes form a generator fails that file rather than passing this one.
 */

/**
 * A CALL, NOT A DEFINITION.
 *
 * `/runCompletion\(/` on its own matches lib/ai/providers/complete.ts's
 * own `export async function runCompletion(` and every file that merely
 * IMPORTS the entry point — so a route that stopped calling it stayed
 * green. `await` in front is what separates the two, and it is the shape
 * every real call site has: the function returns a promise carrying the
 * outcome, so nothing useful is done with it unawaited.
 *
 * AND "A MODEL" IS NOT ONLY A TEXT MODEL. Voice is two paid providers —
 * one synthesises speech, one reads it back — and both reserve and
 * settle credits exactly like a chat message. A rule that recognised
 * only `anthropic.messages` would say "this produces nothing" about a
 * feature that bills by the minute, which is the same untruth pointing
 * the other way.
 */
export const AI_CALL =
  /await\s+runCompletion\(|anthropic\.messages\.(create|stream)\(|\.messages\.(create|stream)\(|await\s+synthesiseSpeech\(|await\s+transcribeAudio\(/;

/** Resolves a `@/lib/...` import to a file on disk. */
function resolveLib(spec) {
  const base = `src/${spec.slice(2)}`;
  for (const ext of [".ts", ".tsx", "/index.ts"]) if (existsSync(base + ext)) return base + ext;
  return null;
}

/**
 * Does this file, or anything it imports from `@/lib` (two levels), call
 * a model?
 *
 * TWO LEVELS is what it takes to reach the real callers: the agent route
 * calls lib/agents/agent-runner and the website route calls
 * lib/websites/*, neither of which has the SDK in the route file itself.
 *
 * THE PROVIDER LAYER IS A LEAF, NEVER A STEP. Recursing into
 * lib/ai/providers reaches the adapter that really calls the SDK, so
 * every file that merely imported the entry point would count as
 * producing. A file produces only if IT — or an ordinary lib it uses —
 * awaits the entry point itself.
 */
export function callsModel(file, depth = 0, seen = new Set()) {
  if (!file || seen.has(file) || depth > 2 || !existsSync(file)) return false;
  seen.add(file);
  const src = readFileSync(file, "utf8");
  if (AI_CALL.test(src)) return true;
  for (const m of src.matchAll(/from "(@\/lib\/[\w./[\]-]+)"/g)) {
    if (m[1].startsWith("@/lib/ai/providers") || m[1].startsWith("@/lib/ai/batch")) continue;
    if (callsModel(resolveLib(m[1]), depth + 1, seen)) return true;
  }
  return false;
}
