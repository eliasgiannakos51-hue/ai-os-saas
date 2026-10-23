import { TIER_MODELS } from "@/lib/ai/routing/tiers";

/**
 * «ΙΣΧΥΣ» (the owner's message, 2026-10-23): three choices under the
 * field, no model name on screen anywhere — not here, not in the
 * network tab, not in a cost breakdown. Each choice IS one of the
 * router's own tiers (lib/ai/routing/tiers.ts) rather than a second
 * scale invented for this screen, so "Μέγιστη" and "expert" can never
 * end up naming two different models for the same request.
 *
 * Pure — no SDK, no env, no clock — same as tiers.ts itself, so both the
 * client (the credit estimate beside each option) and the server (which
 * model actually runs) read the one mapping below.
 */
export const POWER_LEVELS = ["fast", "normal", "max"] as const;
export type PowerLevel = (typeof POWER_LEVELS)[number];

export function isPowerLevel(value: unknown): value is PowerLevel {
  return typeof value === "string" && (POWER_LEVELS as readonly string[]).includes(value);
}

const POWER_TIER: Record<PowerLevel, "simple" | "complex" | "expert"> = {
  fast: "simple",
  // UNCHANGED FROM BEFORE THIS SCREEN EXISTED: every coding turn ran on
  // TIER_MODELS.complex already (api/coding/run/route.ts's own constant
  // MODEL) — "Κανονική" is the same model a user who never touches this
  // control already got, not a new default.
  normal: "complex",
  max: "expert",
};

export function modelForPower(power: PowerLevel): string {
  return TIER_MODELS[POWER_TIER[power]];
}
