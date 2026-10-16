import "server-only";
import { AI_QUALITY_CHECKLIST_EL } from "@/lib/ai-quality-checklist";
import { AI_CONDUCT_EL } from "@/lib/ai-conduct";
import { runCompletion } from "@/lib/ai/providers/complete";
import type { CostAccumulator } from "@/lib/billing/cost-accumulator";
import type { WeeklyReflectionStats } from "@/lib/reflection";
import { enModuleTitle } from "@/lib/module-labels";

// Exported so the route prices the SAME model this file calls.
export const REFLECTION_MODEL = "claude-sonnet-4-6";

// LANGUAGE IS A PARAMETER, not a default. This used to end "Απάντα στα
// ελληνικά, εκτός αν κάτι στα δεδομένα υποδεικνύει άλλη γλώσσα" — answer
// in Greek unless the data suggests otherwise. A weekly reflection is
// mostly NUMBERS, so nothing in the data suggests anything, and every
// user in all ten locales got Greek. The caller knows the language; it
// says so here.
function reflectionSystemPrompt(language: string): string {
  return `Δώσε σύντομη, ειλικρινή ανασκόπηση της βδομάδας — τι πήγε καλά, τι έμεινε ημιτελές, ΧΩΡΙΣ να είσαι υπερβολικά θετικός αν τα δεδομένα δείχνουν στασιμότητα. Βασίσου ΑΠΟΚΛΕΙΣΤΙΚΑ στα δεδομένα που σου δίνονται — μην υποθέτεις ή εφευρίσκεις πράγματα που δεν αναφέρονται. 3-6 σύντομες προτάσεις ή bullet points. Απάντησε ΑΠΟΚΛΕΙΣΤΙΚΑ στη γλώσσα του χρήστη (${language}) — ΠΟΤΕ σε άλλη.
${AI_CONDUCT_EL}${AI_QUALITY_CHECKLIST_EL}`;
}

// Turns the computed stats (lib/reflection.ts) into the plain-text user
// message the Reflection Agent actually reasons over — kept separate from
// the Claude call itself so the exact numbers being reported are easy to
// audit/test independent of the API call.
export function buildReflectionUserMessage(stats: WeeklyReflectionStats): string {
  const activeModules = stats.moduleStats.filter((m) => m.thisWeek > 0 || m.lastWeek > 0);
  const moduleLines = activeModules
    .map((m) => `- ${enModuleTitle({ titleKey: m.moduleTitleKey })}: ${m.thisWeek} νέες εγγραφές αυτή τη βδομάδα (ήταν ${m.lastWeek} την προηγούμενη)`)
    .join("\n");

  const missionLine =
    stats.missionStats.activeMissions > 0
      ? `Ενεργές Missions αυτή τη στιγμή: ${stats.missionStats.activeMissions}. Βήματα ολοκληρωμένα: ${stats.missionStats.stepsCompleted}, βήματα σε εκκρεμότητα: ${stats.missionStats.stepsPending}. Missions με κάποια πρόοδο αυτή τη βδομάδα: ${stats.missionStats.missionsTouchedThisWeek} (την προηγούμενη βδομάδα: ${stats.missionStats.missionsTouchedLastWeek}).`
      : "Δεν υπάρχουν ενεργές Missions αυτή τη στιγμή.";

  return `Σύνολο νέων εγγραφών σε όλα τα modules αυτή τη βδομάδα: ${stats.totalThisWeek} (την προηγούμενη βδομάδα: ${stats.totalLastWeek}).

Ανά module (μόνο όσα είχαν δραστηριότητα τις τελευταίες 2 βδομάδες):
${moduleLines || "(καμία δραστηριότητα σε κανένα module τις τελευταίες 2 βδομάδες)"}

${missionLine}`;
}

export async function generateWeeklyReflection(
  userMessage: string,
  /** The user's language, e.g. "el" / "en" / "de". */
  language: string,
  // This call recorded nothing at all — the route charged a flat 2
  // credits and the tokens never reached a cost log. See CREDITS.md.
  costs?: CostAccumulator,
  /** For the provider log only. Never sent to any provider. */
  userId?: string
): Promise<string> {
  // THROUGH THE ROUTER, NOT THE SDK (step 1.4). No tool here — the
  // reflection is prose — so only the prompt travels. A provider with
  // no key is not in the chain (lib/ai/providers/registry.ts).
  const outcome = await runCompletion(
    {
      purpose: "summarisation",
      model: REFLECTION_MODEL,
      maxTokens: 700,
      system: [{ type: "text", text: reflectionSystemPrompt(language) }],
      messages: [{ role: "user", content: userMessage }],
    },
    { userId }
  );
  // A THROW, BECAUSE THAT IS WHAT THIS FUNCTION ALWAYS DID. The route
  // settles only after this returns, and its catch is what releases the
  // hold; returning an empty string instead would be settled as a
  // reflection the person never got.
  if (!outcome.ok) throw new Error(`reflection: ${outcome.kind} ${outcome.detail}`);
  // Before the parse below, which can still bail out on an empty reply.
  costs?.record("generation", outcome.usage, outcome.reportedModel || outcome.model);

  const text = outcome.text.trim();
  if (!text) {
    throw new Error("The model did not return a reflection.");
  }

  return text;
}
