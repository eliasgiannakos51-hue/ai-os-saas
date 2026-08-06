import "server-only";
import { AI_QUALITY_CHECKLIST_EL } from "@/lib/ai-quality-checklist";
import Anthropic from "@anthropic-ai/sdk";
import type { CostAccumulator } from "@/lib/billing/cost-accumulator";
import type { WeeklyReflectionStats } from "@/lib/reflection";

// Exported so the route prices the SAME model this file calls.
export const REFLECTION_MODEL = "claude-sonnet-4-6";

const REFLECTION_SYSTEM_PROMPT = `Δώσε σύντομη, ειλικρινή ανασκόπηση της βδομάδας — τι πήγε καλά, τι έμεινε ημιτελές, ΧΩΡΙΣ να είσαι υπερβολικά θετικός αν τα δεδομένα δείχνουν στασιμότητα. Βασίσου ΑΠΟΚΛΕΙΣΤΙΚΑ στα δεδομένα που σου δίνονται — μην υποθέτεις ή εφευρίσκεις πράγματα που δεν αναφέρονται. 3-6 σύντομες προτάσεις ή bullet points. Απάντα στα ελληνικά, εκτός αν κάτι στα δεδομένα υποδεικνύει άλλη γλώσσα.
${AI_QUALITY_CHECKLIST_EL}`;

// Turns the computed stats (lib/reflection.ts) into the plain-text user
// message the Reflection Agent actually reasons over — kept separate from
// the Claude call itself so the exact numbers being reported are easy to
// audit/test independent of the API call.
export function buildReflectionUserMessage(stats: WeeklyReflectionStats): string {
  const activeModules = stats.moduleStats.filter((m) => m.thisWeek > 0 || m.lastWeek > 0);
  const moduleLines = activeModules
    .map((m) => `- ${m.moduleTitle}: ${m.thisWeek} νέες εγγραφές αυτή τη βδομάδα (ήταν ${m.lastWeek} την προηγούμενη)`)
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
  apiKey: string,
  userMessage: string,
  // This call recorded nothing at all — the route charged a flat 2
  // credits and the tokens never reached a cost log. See CREDITS.md.
  costs?: CostAccumulator
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: REFLECTION_MODEL,
    max_tokens: 700,
    system: REFLECTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });
  // Before the parse below, which can still bail out on an empty reply.
  costs?.record("generation", response.usage, REFLECTION_MODEL);

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const text = textBlock?.text.trim();
  if (!text) {
    throw new Error("The model did not return a reflection.");
  }

  return text;
}
