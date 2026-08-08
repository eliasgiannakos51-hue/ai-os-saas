import { ACTION_PROFILES, estimateForAction, type ActionProfileKey } from "@/lib/billing/estimate";
import type { PricingConfig } from "@/lib/billing/pricing-config";
import { WEBSITE_BUILDER_MODEL } from "@/lib/ai-models";
import type { AutomationFrequency } from "@/lib/automation-schedule";

/**
 * The five things Create Studio can make.
 *
 * Deliberately the five that already exist as real features — a website
 * the Website Builder generates, a mission Mission Control plans, an
 * entry in one of the 18 modules, a scheduled automation, a document.
 * Nothing here is a placeholder for a feature that hasn't been built.
 */
export const CREATE_STUDIO_TYPES = [
  "website",
  "mission",
  "moduleEntry",
  "automation",
  "document",
] as const;

export type CreateStudioType = (typeof CREATE_STUDIO_TYPES)[number];

export function isCreateStudioType(value: unknown): value is CreateStudioType {
  return typeof value === "string" && (CREATE_STUDIO_TYPES as readonly string[]).includes(value);
}

export type CreateStudioDetection = {
  type: CreateStudioType;
  /** Short name for the thing being created — becomes its title. */
  title: string;
  /** The "Κατάλαβα: …" line — the system's restatement of the request. */
  understanding: string;
  /** Only set when type is "moduleEntry": which module it routes to. */
  moduleSlug?: string | null;
  /**
   * Only set when type is "automation". The recurrence is the whole
   * reason a request is an automation rather than a mission, so it is
   * read out of the sentence the user already wrote ("every Monday…")
   * instead of being asked for again in a second form.
   */
  frequency?: AutomationFrequency | null;
};

/**
 * Which billing profile each type's creation actually runs on.
 *
 * `null` means the action makes no AI call at all, so it costs nothing —
 * that's the honest answer for a document, which is user-authored
 * freeform text (see api/documents/route.ts), not a generated artifact.
 */
export const STUDIO_ACTION_PROFILE: Record<CreateStudioType, ActionProfileKey | null> = {
  website: "websiteGenerate",
  mission: "missionPlan",
  moduleEntry: "createAnything",
  automation: "automationCreate",
  document: null,
};

// Both the detection route and the preview UI price against the same
// model the creating route will call, so the number shown before "Create"
// and the number actually held are the same calculation.
export const STUDIO_MODEL = WEBSITE_BUILDER_MODEL;

/**
 * How long a creation takes, as a coarse bucket rather than a number.
 *
 * Derived from the expected OUTPUT size the cost estimator already uses
 * for that action — the same figure, read a second way — because output
 * length is what actually dominates wall-clock time on a streamed
 * generation. It is reported as a range ("a few minutes"), never as a
 * countdown or a percentage, because a specific number here would be
 * invented: nothing measures per-request latency ahead of time.
 */
export type CreateStudioTimeBucket = "instant" | "seconds" | "aMinute" | "fewMinutes" | "manyMinutes";

export function timeBucketFor(type: CreateStudioType, inputChars: number): CreateStudioTimeBucket {
  const profileKey = STUDIO_ACTION_PROFILE[type];
  if (!profileKey) return "instant";

  const profile = ACTION_PROFILES[profileKey];
  const expectedOutputChars =
    profile.baseOutputChars + Math.max(0, inputChars) * profile.outputCharsPerInputChar;

  if (expectedOutputChars < 1000) return "seconds";
  if (expectedOutputChars < 8000) return "aMinute";
  if (expectedOutputChars < 30000) return "fewMinutes";
  return "manyMinutes";
}

/**
 * The credit estimate shown in the preview, for a given detected type.
 *
 * Runs through the SAME estimateForAction the creating route reserves
 * against, so the preview and the hold can't drift apart. A type with no
 * AI call estimates at zero rather than at some nominal floor.
 */
export function estimateCreditsFor(
  type: CreateStudioType,
  inputChars: number,
  config: PricingConfig,
  accountCreditPriceEur?: number,
  planSlug?: string | null
): number {
  const profileKey = STUDIO_ACTION_PROFILE[type];
  if (!profileKey) return 0;
  return estimateForAction(
    profileKey,
    { model: STUDIO_MODEL, inputChars, planSlug: planSlug ?? null },
    config,
    accountCreditPriceEur
  ).estimatedCredits;
}
