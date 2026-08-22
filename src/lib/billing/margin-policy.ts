import type { PlanSlug } from "@/lib/billing/plans";
import {
  MARGIN_MULTIPLIER_MIN,
  MARGIN_MULTIPLIER_MAX,
  resolvePricingConfig,
  type PricingConfig,
} from "@/lib/billing/pricing-config";

// Margin POLICY: which multiplier a given settlement uses, beyond the
// single global CREDIT_MARGIN_MULTIPLIER.
//
// Two independent override axes, both env-tunable without a deploy:
//
//   per FEATURE  CREDIT_MARGIN_<FEATURE>   e.g. CREDIT_MARGIN_DEEP_RESEARCH=8
//   per PLAN     CREDIT_MARGIN_<PLAN>      e.g. CREDIT_MARGIN_FREE=6
//
// THE COMBINATION RULE, stated once and enforced in resolveMarginFor:
//
//   applied = max(general, plan margin, feature override)
//   and never below MARGIN_MULTIPLIER_MIN (4).
//
// max(), not "feature beats plan" or vice versa: each axis exists to
// guarantee a floor (a feature that must earn more; a plan that must earn
// more), and taking anything but the highest floor would let one override
// silently cancel the other's guarantee. The same reasoning as
// effectiveCreditPriceEurForAccount taking the MINIMUM price: always
// combine in the direction that cannot under-charge.
//
// Values outside [4, 10] are ignored with a warning and the general
// default used instead — same policy as CREDIT_MARGIN_MULTIPLIER itself:
// below 4 can lose money, above 10 is almost certainly a typo, and a
// silent clamp would look like the setting worked.

/**
 * Per-plan margin DEFAULTS — these apply even with no env set.
 *
 * EVERY PAID PLAN IS 5, and the reason is the combined ceiling rather than
 * anything about the plans themselves.
 *
 * The credit subsystem's worst case is exactly 1/M of revenue. At M = 4
 * that is 25% — the WHOLE ceiling — which leaves nothing at all for the
 * free quotas that also spend real Anthropic money outside credits. That
 * is not a theoretical objection: Professional and Ultimate sat at M = 4
 * while free chat burned a further 18.8%, for a combined 43.8% and a real
 * margin of 2.28x against a stated 4x target.
 *
 * M = 5 hands the credit half exactly 20% and leaves 5% for the quota
 * registry (see DECLARED_ALLOWANCE_SHARES in lib/billing/ceiling.ts).
 * 20 + 5 = 25, and scripts/tests/combined-ceiling.test.mjs fails the build
 * if that ever stops adding up.
 *
 * Free stays at 6, higher than the paid plans rather than lower: it has no
 * revenue to take a share of, so its allowance is a flat acquisition cost
 * and a higher multiplier makes that cost smaller. Lowering it to 5 for
 * symmetry would have INCREASED what the free tier spends.
 */
export const PLAN_MARGIN_DEFAULTS: Record<PlanSlug, number> = {
  free: 6,
  starter: 5,
  growth: 5,
  professional: 5,
  ultimate: 5,
  enterprise: 5,
};

const PLAN_MARGIN_ENV_KEYS: Record<PlanSlug, string> = {
  free: "CREDIT_MARGIN_FREE",
  starter: "CREDIT_MARGIN_STARTER",
  growth: "CREDIT_MARGIN_GROWTH",
  professional: "CREDIT_MARGIN_PROFESSIONAL",
  ultimate: "CREDIT_MARGIN_ULTIMATE",
  enterprise: "CREDIT_MARGIN_ENTERPRISE",
};

/**
 * Related settlement feature strings that share one documented env var —
 * so CREDIT_MARGIN_CHAT covers both the paid and the free-allowance
 * settlement rows, and CREDIT_MARGIN_WEBSITE_GENERATE covers the pre-check
 * route as well as the worker. An exact per-feature key
 * (CREDIT_MARGIN_<FEATURE, uppercased>) always wins over the group key, so
 * every individual feature stays tunable.
 */
export const FEATURE_MARGIN_GROUPS: Record<string, string> = {
  chat_message: "CREDIT_MARGIN_CHAT",
  chat_free: "CREDIT_MARGIN_CHAT",
  website_generate: "CREDIT_MARGIN_WEBSITE_GENERATE",
  website_generate_precheck: "CREDIT_MARGIN_WEBSITE_GENERATE",
  deep_research: "CREDIT_MARGIN_DEEP_RESEARCH",
  research_plan: "CREDIT_MARGIN_DEEP_RESEARCH",
  agent_run: "CREDIT_MARGIN_AGENT_RUN",
  scheduled_agent_run: "CREDIT_MARGIN_AGENT_RUN",
  // The clarifying-questions pre-check rounds, split out of their parent
  // feature so a €0.001 row and a €0.03 row stop being averaged together
  // (see lib/jobs/handlers/agent-build.ts). Grouped back onto the parent's
  // env var so tuning a feature's margin still means one variable, not
  // one per round.
  agent_build_precheck: "CREDIT_MARGIN_AGENT_BUILD",
  create_precheck: "CREDIT_MARGIN_CREATE",
};

export function featureMarginEnvKeys(feature: string): string[] {
  const exact = `CREDIT_MARGIN_${feature.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  const group = FEATURE_MARGIN_GROUPS[feature];
  return group && group !== exact ? [exact, group] : [exact];
}

// Warned once per (variable, value) per process — margin envs are read on
// every settlement, and a misconfigured one would otherwise write the same
// line thousands of times.
const warned = new Set<string>();

function readMarginEnv(
  variable: string,
  env: Record<string, string | undefined>
): number | null {
  const raw = env[variable];
  if (raw === undefined || raw.trim() === "") return null;
  const parsed = Number(raw);
  const key = `${variable}=${raw}`;
  if (!Number.isFinite(parsed)) {
    if (!warned.has(key)) {
      warned.add(key);
      // eslint-disable-next-line no-console
      console.warn(`[margin-policy] ${variable}="${raw}" ignored (not a finite number) — using the general margin.`);
    }
    return null;
  }
  if (parsed < MARGIN_MULTIPLIER_MIN || parsed > MARGIN_MULTIPLIER_MAX) {
    if (!warned.has(key)) {
      warned.add(key);
      // eslint-disable-next-line no-console
      console.warn(
        `[margin-policy] ${variable}="${raw}" ignored (outside the allowed range ` +
          `${MARGIN_MULTIPLIER_MIN}-${MARGIN_MULTIPLIER_MAX}) — using the general margin.`
      );
    }
    return null;
  }
  return parsed;
}

export type MarginSource = "general" | "plan" | "feature";

export type MarginResolution = {
  /** The multiplier settlement actually applies. */
  margin: number;
  /** Which axis produced the winning value. */
  source: MarginSource;
  /** The inputs, for the cost log — so a row explains its own multiplier. */
  general: number;
  planMargin: number | null;
  planMarginFromEnv: boolean;
  featureMargin: number | null;
};

function isPlanSlug(slug: string): slug is PlanSlug {
  return slug in PLAN_MARGIN_DEFAULTS;
}

/**
 * The one place the combination rule lives. Settlement AND estimation both
 * call this, so the multiplier a user is quoted and the one they are
 * charged cannot drift apart.
 */
export function resolveMarginFor(
  feature: string | null | undefined,
  planSlug: string | null | undefined,
  config?: PricingConfig,
  env: Record<string, string | undefined> = process.env
): MarginResolution {
  const c = config ?? resolvePricingConfig();
  const general = c.marginMultiplier;

  let planMargin: number | null = null;
  let planMarginFromEnv = false;
  if (planSlug && isPlanSlug(planSlug)) {
    const fromEnv = readMarginEnv(PLAN_MARGIN_ENV_KEYS[planSlug], env);
    planMarginFromEnv = fromEnv !== null;
    planMargin = fromEnv ?? PLAN_MARGIN_DEFAULTS[planSlug];
  }

  let featureMargin: number | null = null;
  if (feature) {
    for (const key of featureMarginEnvKeys(feature)) {
      const value = readMarginEnv(key, env);
      if (value !== null) {
        featureMargin = value;
        break;
      }
    }
  }

  // max() of everything present, floored at the business minimum. The
  // floor is belt-and-braces: every input is already validated ≥ 4, so it
  // only matters if a future edit weakens one of the inputs.
  let margin = Math.max(general, MARGIN_MULTIPLIER_MIN);
  let source: MarginSource = "general";
  if (planMargin !== null && planMargin > margin) {
    margin = planMargin;
    source = "plan";
  }
  // `>=` so an explicit feature override wins the tie for attribution —
  // the applied number is identical either way.
  if (featureMargin !== null && featureMargin >= margin) {
    margin = featureMargin;
    source = "feature";
  }

  return { margin, source, general, planMargin, planMarginFromEnv, featureMargin };
}

/**
 * Maps ACTION_PROFILES keys (what estimation sites know) onto settlement
 * feature strings (what the margin env vars are named after), so an
 * estimate resolves the same multiplier its settlement will.
 */
export const ACTION_TO_FEATURE: Record<string, string> = {
  websiteGenerate: "website_generate",
  websiteEdit: "website_edit",
  chatMessage: "chat_message",
  createAnything: "create_anything",
  missionPlan: "mission_plan",
  createStudioDetect: "create_studio_detect",
  automationCreate: "automation_run",
  agentBuild: "agent_build",
  agentRun: "agent_run",
  // Voice. Both settle under one feature so CREDIT_MARGIN_VOICE governs
  // speech in and speech out together — they are the same product
  // decision, and a per-direction key would let one drift.
  voiceTranscribe: "voice",
  voiceSpeak: "voice",
  // The three depth tiers settle under the SAME feature as the untiered
  // profile, so CREDIT_MARGIN_AGENT_RUN still governs all of them — a
  // per-tier margin key would let one tier quietly drop below the floor
  // while the feature it belongs to looked configured.
  agentRunSimple: "agent_run",
  agentRunStandard: "agent_run",
  agentRunDeep: "agent_run",
  // Adopting a template is a build, not a run: it produces an agent.
  agentTemplateFill: "agent_build",
  recordAsk: "ask_ai_record",
  textAction: "text_action",
  weeklyReflection: "weekly_reflection",
  importMap: "import_map",
  importPaste: "import_paste",
  insightNarrate: "insight_narrate",
  fileAsk: "file_ask",
  deepResearch: "deep_research",
};
