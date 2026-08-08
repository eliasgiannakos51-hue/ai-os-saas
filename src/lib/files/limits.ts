import type { PlanSlug } from "@/lib/billing/plans";

// Fair use for the File Workspace and Deep Research, per plan.
//
// Three separate ceilings, because they bound three different costs and
// collapsing them into one number would let any of the three run away:
//
//   FILE COUNT   — how many documents an account may hold. Bounds the
//                  size of the list, the picker, and the "ask everything"
//                  case.
//   STORAGE      — bytes in the private bucket. This is the one that
//                  costs money every month whether anyone reads it or
//                  not, so it is the ceiling that must not be soft.
//   RESEARCH RUNS— Deep Research per calendar month. The expensive one:
//                  a single run is 3-6 web searches plus a synthesis
//                  pass over everything they returned.
//
// Free gets 3 files and 50MB, which is enough to genuinely try the
// feature on real documents, and ZERO research runs — a research run is
// the most expensive single action in the product and it would be the
// first thing a throwaway account is used for.

export const UNLIMITED = Number.POSITIVE_INFINITY;

export const DEFAULT_FILE_COUNT_LIMITS: Record<PlanSlug, number> = {
  free: 3,
  starter: 20,
  growth: 100,
  professional: 500,
  ultimate: UNLIMITED,
  enterprise: UNLIMITED,
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const DEFAULT_STORAGE_LIMITS: Record<PlanSlug, number> = {
  free: 50 * MB,
  starter: 500 * MB,
  growth: 2 * GB,
  professional: 10 * GB,
  ultimate: 50 * GB,
  // Enterprise is negotiated, and "negotiated" cannot mean "unbounded"
  // for the one resource that bills monthly forever. Same as Ultimate
  // until a contract says otherwise.
  enterprise: 50 * GB,
};

export const DEFAULT_RESEARCH_LIMITS: Record<PlanSlug, number> = {
  free: 0,
  starter: 2,
  growth: 10,
  professional: 50,
  ultimate: 200,
  enterprise: 200,
};

export const FILE_LIMIT_ENV_VARS: Record<PlanSlug, string> = {
  free: "FILE_LIMIT_FREE",
  starter: "FILE_LIMIT_STARTER",
  growth: "FILE_LIMIT_GROWTH",
  professional: "FILE_LIMIT_PROFESSIONAL",
  ultimate: "FILE_LIMIT_ULTIMATE",
  enterprise: "FILE_LIMIT_ENTERPRISE",
};

export const STORAGE_LIMIT_ENV_VARS: Record<PlanSlug, string> = {
  free: "FILE_STORAGE_MB_FREE",
  starter: "FILE_STORAGE_MB_STARTER",
  growth: "FILE_STORAGE_MB_GROWTH",
  professional: "FILE_STORAGE_MB_PROFESSIONAL",
  ultimate: "FILE_STORAGE_MB_ULTIMATE",
  enterprise: "FILE_STORAGE_MB_ENTERPRISE",
};

export const RESEARCH_LIMIT_ENV_VARS: Record<PlanSlug, string> = {
  free: "RESEARCH_LIMIT_FREE",
  starter: "RESEARCH_LIMIT_STARTER",
  growth: "RESEARCH_LIMIT_GROWTH",
  professional: "RESEARCH_LIMIT_PROFESSIONAL",
  ultimate: "RESEARCH_LIMIT_ULTIMATE",
  enterprise: "RESEARCH_LIMIT_ENTERPRISE",
};

export type LimitWarning = { variable: string; value: string; reason: string };

/**
 * Parse one family of per-plan overrides.
 *
 * A bad value WARNS and falls back to the default rather than throwing.
 * The alternative — refusing to boot on a typo in an optional tuning
 * variable — turns a cosmetic mistake into an outage, and the default is
 * always the safe number anyway.
 *
 * `max` is a sanity ceiling, not a policy: an override of 10^9 files is
 * a fat finger, not an intention, and honouring it would remove the only
 * thing standing between one account and the whole bucket.
 */
function parseFamily(
  env: Record<string, string | undefined>,
  defaults: Record<PlanSlug, number>,
  vars: Record<PlanSlug, string>,
  max: number,
  scale = 1,
  allowUnlimited = true
): { limits: Record<PlanSlug, number>; warnings: LimitWarning[] } {
  const warnings: LimitWarning[] = [];
  const limits = { ...defaults };

  for (const slug of Object.keys(defaults) as PlanSlug[]) {
    const variable = vars[slug];
    const raw = env[variable];
    if (raw === undefined || raw.trim() === "") continue;

    if (raw.trim().toLowerCase() === "unlimited") {
      if (!allowUnlimited) {
        warnings.push({ variable, value: raw, reason: "unlimited is not allowed for this limit" });
        continue;
      }
      limits[slug] = UNLIMITED;
      continue;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
      warnings.push({ variable, value: raw, reason: 'not a whole number (or "unlimited")' });
      continue;
    }
    if (parsed < 0 || parsed > max) {
      warnings.push({ variable, value: raw, reason: `outside the allowed range 0-${max}` });
      continue;
    }
    limits[slug] = parsed * scale;
  }

  return { limits, warnings };
}

export function parseFileLimits(env: Record<string, string | undefined>) {
  return parseFamily(env, DEFAULT_FILE_COUNT_LIMITS, FILE_LIMIT_ENV_VARS, 100_000);
}

export function parseStorageLimits(env: Record<string, string | undefined>) {
  // Expressed in MEGABYTES in the environment, because nobody wants to
  // write 53687091200 and nobody wants to read it back and check it.
  // "unlimited" is refused here specifically: storage is the one that
  // bills forever.
  return parseFamily(env, DEFAULT_STORAGE_LIMITS, STORAGE_LIMIT_ENV_VARS, 500_000, MB, false);
}

export function parseResearchLimits(env: Record<string, string | undefined>) {
  return parseFamily(env, DEFAULT_RESEARCH_LIMITS, RESEARCH_LIMIT_ENV_VARS, 10_000);
}

export function maxFilesForPlan(slug: PlanSlug | null | undefined): number {
  if (!slug) return DEFAULT_FILE_COUNT_LIMITS.free;
  return parseFileLimits(process.env).limits[slug] ?? DEFAULT_FILE_COUNT_LIMITS.free;
}

export function maxStorageBytesForPlan(slug: PlanSlug | null | undefined): number {
  if (!slug) return DEFAULT_STORAGE_LIMITS.free;
  return parseStorageLimits(process.env).limits[slug] ?? DEFAULT_STORAGE_LIMITS.free;
}

export function maxResearchRunsForPlan(slug: PlanSlug | null | undefined): number {
  if (!slug) return DEFAULT_RESEARCH_LIMITS.free;
  return parseResearchLimits(process.env).limits[slug] ?? DEFAULT_RESEARCH_LIMITS.free;
}

/** Uploads per hour, per user. Bounds extraction CPU and bucket writes
 *  independently of the plan's total-file ceiling — an account with 500
 *  files remaining should still not be able to spend them all in a
 *  minute. */
export function maxUploadsPerHour(): number {
  const raw = Number(process.env.FILE_MAX_UPLOADS_PER_HOUR);
  return Number.isInteger(raw) && raw > 0 && raw <= 500 ? raw : 30;
}

/** Grounded questions per hour, per user. Each one is a real AI call
 *  over potentially hundreds of KB of document text. */
export function maxFileQuestionsPerHour(): number {
  const raw = Number(process.env.FILE_MAX_QUESTIONS_PER_HOUR);
  return Number.isInteger(raw) && raw > 0 && raw <= 500 ? raw : 40;
}
