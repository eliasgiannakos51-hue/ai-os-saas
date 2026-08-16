import type { FieldConfig } from "@/lib/modules";
import type { MissionStep } from "@/types/mission";
import { enFieldLabel } from "@/lib/module-labels";
import { enModuleTitle } from "@/lib/module-labels";
import type { ModuleTitleKey } from "@/lib/modules";

// "AI Company" real collaboration — pure functions with no I/O, shared by
// api/create/route.ts (server) and mission-card.tsx (client) so the exact
// same context-building algorithm runs on both sides and can be unit
// tested in isolation from Supabase/Anthropic.

// A short, plain-text summary of what a mission step actually created,
// stored on the step (see types/mission.ts's MissionStep.output) and fed
// back as context to every later step in the same mission. Deliberately a
// fresh helper rather than reusing entity-link-suggestions.ts's private
// textFor() — that one is tied to Smart Search and shouldn't be touched
// for this.
export function buildOutputSummary(
  moduleConfig: { titleKey: ModuleTitleKey; fields: FieldConfig[] },
  record: Record<string, unknown>,
  aiMessage: string
): string {
  const fieldSummary = moduleConfig.fields
    .map((f) => {
      const value = record[f.key];
      if (value === null || value === undefined || value === "") return null;
      return `${enFieldLabel(f)}: ${value}`;
    })
    .filter((s): s is string => s !== null)
    .join(", ");

  return `Created a ${enModuleTitle(moduleConfig)} entry — ${fieldSummary || "(no details)"}. ${aiMessage}`;
}

// Every earlier COMPLETED step's output, in mission order, up to (not
// including) `index` — pending/failed steps and steps after `index` are
// excluded so a step never sees output from work that hasn't happened yet
// (or never will).
export function buildPriorStepsContext(steps: MissionStep[], index: number): string {
  return steps
    .slice(0, index)
    .filter((s) => s.status === "completed" && s.output)
    .map((s) => `- ${s.text} → ${s.output}`)
    .join("\n");
}

// Wraps buildPriorStepsContext's output for the Builder's (/api/create)
// system prompt — empty string (no-op) when there's no prior context yet,
// same as every step before this feature existed.
export function buildMissionContextSystemPromptAddition(priorStepsContext: string): string {
  return priorStepsContext
    ? `\n\nContext from earlier steps already completed in this same AI Company mission (use any relevant numbers/facts from these, don't re-derive them):\n${priorStepsContext}`
    : "";
}

// Mission Control retry cap — a step that fails this many times shows a
// permanent failure message instead of a retry button (mission-card.tsx).
// Exported as a single source of truth for both the "can this step still
// be retried" decision and the UI's exhausted-state message.
export const MAX_STEP_ATTEMPTS = 3;

export function stepAttemptsExhausted(attempts: number | undefined): boolean {
  return (attempts ?? 0) >= MAX_STEP_ATTEMPTS;
}
