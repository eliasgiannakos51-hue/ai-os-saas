import {
  PLANS,
  TEAM_SEAT_PRICE,
  type Plan,
  type PlanSlug,
} from "@/lib/billing/plans";
import { freeChatAllowance } from "@/lib/billing/free-chat";
import { maxAgentsForPlan, maxAgentRunsPerHour } from "@/lib/agents/agent-limits";
import {
  maxFilesForPlan,
  maxResearchRunsForPlan,
  maxStorageBytesForPlan,
  maxUploadsPerHour,
  maxFileQuestionsPerHour,
} from "@/lib/files/limits";
import { maxIntegrationsForPlan, maxIntegrationReadsPerHour } from "@/lib/integrations/limits";
import {
  maxPublishedSitesForPlan,
  MAX_LIVE_EDITS_PER_SITE_PER_DAY,
  MAX_SITE_VERSIONS,
} from "@/lib/publishing/publish-limits";
import { pinLimitFor } from "@/lib/chat/pin-limits";
import { voiceMinutesForPlan, MAX_CLIP_SECONDS } from "@/lib/voice/voice-pricing";
import { RECORD_CAP } from "@/lib/record-cap";
import { STORAGE_LIMIT_BYTES } from "@/lib/websites/storage-quota";

/**
 * EVERY CAPABILITY THIS PRODUCT SELLS, WITH THE TIER IT BELONGS TO AND
 * THE CODE THAT ENFORCES IT.
 *
 * WHAT THIS EXISTS BECAUSE OF, counted on 2026-09-12 and re-derivable by
 * `node scripts/tests/feature-catalog.test.mjs`, which prints the same
 * figures it asserts:
 *
 *   136 API routes. 32 of them spend credits. THREE — api/chat,
 *   api/modules/create and api/team/invite — read a plan capability at
 *   all. 44 pages under /dashboard. EIGHT are plan-aware.
 *
 *   PlanCapabilities had six fields. Two of them (maxAiAgents,
 *   chatMemoryLimit) are the two the owner already knew about. The other
 *   four are real, and three of the four gate exactly one page each.
 *
 *   SIX per-plan ceilings lived OUTSIDE PlanCapabilities entirely —
 *   agents, files, storage, Deep Research runs, integrations, published
 *   sites — plus TWO the pricing page had never mentioned in any
 *   language: voice minutes (lib/voice/voice-pricing.ts) and pinned
 *   conversations (lib/chat/pin-limits.ts). Both are enforced. Both were
 *   invisible to a buyer, which makes them the exact shape of the thing
 *   the owner said he would not ship: a limit the customer discovers at
 *   the worst moment.
 *
 * THE RULE THIS FILE MAKES MECHANICAL. A feature that does not appear
 * here fails the build. Not "should appear" — `scripts/tests/
 * feature-catalog.test.mjs` derives the three surfaces a capability can
 * arrive through (a sidebar row, a page under /dashboard, a route that
 * charges credits) and requires every one of them to be named by an
 * entry below. Adding a page without a tier is a red build, which is the
 * difference between this and the comment that used to sit in plans.ts
 * saying features were all real.
 *
 * WHAT AN ENTRY IS NOT. It is not a promise that the feature is good, or
 * even finished — `pricing-truth.test.mjs` already holds the line that a
 * claim names code that exists. It is a declaration of WHO MAY USE IT
 * and WHAT BOUNDS IT, and those two are what a pricing page is.
 */

/**
 * The seven sections of the comparison table.
 *
 * THE SAME SIX VERBS AS THE SIDEBAR, plus two the sidebar has no reason
 * to have: the numbers, and what happens when you need help. A buyer who
 * has seen the product recognises the shape — lib/sidebar-nav.ts's
 * headings are Make / Ask / Run / See / Organise / Settings, and
 * `scripts/tests/feature-catalog.test.mjs` fails if the first five stop
 * matching it.
 */
export const FEATURE_GROUPS = [
  "make",
  "ask",
  "run",
  "see",
  "organise",
  "limits",
  "support",
] as const;
export type FeatureGroup = (typeof FEATURE_GROUPS)[number];

/** The sidebar headings the first five groups mirror, in order. */
export const SIDEBAR_HEADING_FOR_GROUP: Partial<Record<FeatureGroup, string>> = {
  make: "Make",
  ask: "Ask",
  run: "Run",
  see: "See",
  organise: "Organise",
};

/** What one plan's cell in the comparison table says. */
export type FeatureCell =
  | { type: "check" }
  | { type: "cross" }
  | { type: "value"; text: string }
  | { type: "unlimited" };

/** The words that appear inside cells, passed in so the builders stay
 *  pure and translatable — the same contract the old inline table had. */
export type CellWords = {
  unlimited: string;
  included: string;
  custom: string;
  perSeat: string;
  perHour: string;
  perDay: string;
  minutesPerMonth: string;
};

/**
 * WHY AN "UNLIMITED" CELL HAS TO CARRY A PROOF.
 *
 * "Απεριόριστο" που έχει κρυφό όριο είναι ψέμα που το ανακαλύπτει ο
 * πελάτης στη χειρότερη στιγμή. Three accessors in this product really
 * do return Infinity for some plan — files, integrations, published
 * sites — and one of the three is bounded by something else anyway:
 * an Ultimate account may create any number of files and still cannot
 * exceed 50 GB.
 *
 * So the word is allowed only with this object attached, and the gate
 * requires every id in `alsoBoundedBy` to be a row IN THE SAME TABLE
 * whose value for that plan is finite. The buyer therefore never reads
 * "Unlimited" without the real ceiling being visible on the same screen.
 *
 * `routes` is the second half: every route that enforces this resource,
 * scanned by the gate for a numeric ceiling the catalog does not know
 * about. A cap added there and not declared here is a red build.
 */
export type UnlimitedProof = {
  enforcedIn: string;
  alsoBoundedBy: string[];
  routes: string[];
};

export type FeatureEntry = {
  /** Stable id. Also the i18n key at `pricing.rows.<id>` in all ten
   *  locales, and the anchor `pricing-truth.test.mjs` matches on. */
  id: string;
  group: FeatureGroup;
  /**
   * THE LOWEST PLAN THAT MAY USE THIS AT ALL.
   *
   * "free" is a real answer and most entries have it — that is the
   * finding, not an oversight. It means: this capability is not what
   * separates the tiers, the NUMBER beside it is, or nothing is.
   */
  minPlan: PlanSlug;
  /** Sidebar hrefs this entry accounts for. The gate requires every row
   *  in lib/sidebar-nav.ts to be claimed by exactly one entry. */
  sidebar?: string[];
  /** Pages under /dashboard this entry accounts for, without the
   *  /dashboard prefix. "" is the overview itself. */
  pages?: string[];
  /** API routes this entry accounts for, as their path under api/. */
  routes?: string[];
  /** True when using it spends credits. The gate cross-checks this
   *  against which routes actually call reserveCredits/settleReservation
   *  — a `false` here over a charging route is a red build. */
  charges: boolean;
  /** The module that enforces the limit or capability, for the reader
   *  who wants to check. Must exist and must contain `enforcedSymbol`. */
  enforcedIn?: string;
  enforcedSymbol?: string;
  /** What this plan's cell says. */
  cell: (plan: Plan, locale: string, words: CellWords) => FeatureCell;
  /** Required whenever `cell` can return `{ type: "unlimited" }`. */
  unlimitedProof?: UnlimitedProof;
  /**
   * Kept out of the published comparison table, with the reason.
   * Owner-only operational screens are the only legitimate use: they are
   * not sold, so a row for them would be a row no buyer can ever buy.
   */
  notSold?: string;
};

// ---------------------------------------------------------------------
// Cell builders
// ---------------------------------------------------------------------

function formatStorage(bytes: number, locale: string): string {
  const MB = 1024 * 1024;
  const GB = 1024 * MB;
  return bytes >= GB
    ? `${formatCount(Math.round(bytes / GB), locale)} GB`
    : `${formatCount(Math.round(bytes / MB), locale)} MB`;
}

/**
 * Locale-aware digit grouping.
 *
 * Not `lib/format-number.ts`'s helper imported here on purpose — this
 * module is loaded by a gate through `load-ts.mjs`, and that loader
 * resolves `@/` imports itself. Keeping the dependency list to modules
 * the gate already loads is what lets the gate EXECUTE these builders
 * instead of reading them as text.
 */
function formatCount(n: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(n);
}

/** A count, where 0 means the plan does not have it at all and Infinity
 *  means unbounded — and the word for unbounded is only reachable with a
 *  proof attached (see UnlimitedProof). */
function countCell(n: number, locale: string): FeatureCell {
  if (!Number.isFinite(n)) return { type: "unlimited" };
  if (n <= 0) return { type: "cross" };
  return { type: "value", text: formatCount(n, locale) };
}

function boolCell(on: boolean): FeatureCell {
  return on ? { type: "check" } : { type: "cross" };
}

/**
 * A number with a UNIT after it — "30 min/month", "20 /hour".
 *
 * WHY THIS EXISTS RATHER THAN A TEMPLATE AT EACH CALL SITE. `countCell`
 * turns Infinity into `{ type: "unlimited" }`, which is what makes the
 * gate demand a proof; a cell that formatted the number itself skipped
 * that entirely and rendered the string "∞ min/month". Found by
 * scripts/tests/feature-catalog.mutation.mjs: setting Ultimate's voice
 * minutes to Infinity left the gate GREEN, because the word "unlimited"
 * was never produced — the page just showed a symbol. Every numeric
 * cell with a unit goes through here so there is one path to the word
 * and one path to the proof.
 */
function unitCell(n: number, locale: string, unit: string): FeatureCell {
  const base = countCell(n, locale);
  if (base.type !== "value") return base;
  return { type: "value", text: `${base.text} ${unit}` };
}

// ---------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------

export const FEATURE_CATALOG: FeatureEntry[] = [
  // === MAKE ==========================================================
  {
    id: "createStudio",
    group: "make",
    minPlan: "free",
    sidebar: ["/dashboard/create"],
    pages: ["create"],
    routes: ["create", "create/top-modules", "create-studio/detect", "text-actions"],
    charges: true,
    enforcedIn: "src/app/api/create/route.ts",
    enforcedSymbol: "reserveCredits",
    cell: () => ({ type: "check" }),
  },
  {
    id: "websiteBuilder",
    group: "make",
    minPlan: "starter",
    sidebar: ["/dashboard/website-builder", "/dashboard/websites"],
    pages: ["website-builder", "websites"],
    routes: [
      "websites/generate",
      "websites/generate/process",
      "websites/edit",
      "websites/status",
      "websites/[id]/cancel",
      "websites/[id]/regenerate",
    ],
    charges: true,
    enforcedIn: "src/lib/build-modules.ts",
    enforcedSymbol: "minPlanSlug",
    cell: (p) => boolCell(p.capabilities.websiteBuilder),
  },
  {
    id: "publishedSites",
    group: "make",
    minPlan: "starter",
    sidebar: ["/dashboard/published", "/dashboard/form-submissions"],
    pages: ["published", "form-submissions"],
    routes: [
      "websites/[id]/publish",
      "published/[id]/rollback",
      "publishing/badge",
      "websites/[id]/submit-form",
    ],
    charges: true,
    enforcedIn: "src/lib/publishing/publish-limits.ts",
    enforcedSymbol: "maxPublishedSitesForPlan",
    cell: (p, locale) => countCell(maxPublishedSitesForPlan(p.slug), locale),
    unlimitedProof: {
      enforcedIn: "src/lib/publishing/publish-limits.ts",
      // Enterprise alone is unbounded, and nothing else caps the COUNT
      // of live sites — the two other ceilings in that module bound
      // edits per day and versions per site, both of which are their own
      // rows below.
      alsoBoundedBy: [],
      routes: ["src/app/api/websites/[id]/publish/route.ts"],
    },
  },
  {
    id: "documents",
    group: "make",
    minPlan: "free",
    sidebar: ["/dashboard/documents"],
    pages: ["documents", "documents/[id]"],
    routes: ["documents", "documents/[id]", "documents/[id]/pdf", "documents/[id]/pdf-estimate"],
    charges: true,
    enforcedIn: "src/app/api/documents/[id]/pdf/route.ts",
    enforcedSymbol: "reserveCredits",
    cell: () => ({ type: "check" }),
  },
  {
    id: "coding",
    group: "make",
    minPlan: "free",
    sidebar: ["/dashboard/coding"],
    pages: ["coding"],
    routes: ["coding/run"],
    charges: true,
    enforcedIn: "src/app/api/coding/run/route.ts",
    enforcedSymbol: "reserveCredits",
    cell: () => ({ type: "check" }),
  },
  {
    id: "presentations",
    group: "make",
    minPlan: "free",
    sidebar: ["/dashboard/presentations"],
    pages: ["presentations"],
    routes: ["presentations/generate", "presentations/[id]/pdf", "presentations/[id]/pptx"],
    charges: true,
    enforcedIn: "src/app/api/presentations/generate/route.ts",
    enforcedSymbol: "reserveCredits",
    cell: () => ({ type: "check" }),
  },
  {
    id: "posts",
    group: "make",
    minPlan: "free",
    sidebar: ["/dashboard/posts"],
    pages: ["posts"],
    routes: ["posts/generate"],
    charges: true,
    enforcedIn: "src/app/api/posts/generate/route.ts",
    enforcedSymbol: "reserveCredits",
    cell: () => ({ type: "check" }),
  },
  {
    id: "voiceMinutes",
    group: "make",
    minPlan: "starter",
    sidebar: ["/dashboard/voice"],
    pages: ["voice"],
    routes: ["voice/transcribe", "voice/speak", "voice/usage"],
    charges: true,
    enforcedIn: "src/lib/voice/voice-pricing.ts",
    enforcedSymbol: "voiceMinutesForPlan",
    // THE FIRST OF THE TWO THE PRICING PAGE HAD NEVER MENTIONED.
    // api/voice/transcribe refuses with `not_included` at 0 minutes and
    // `out_of_minutes` at the cap; neither sentence had a number a buyer
    // could have read beforehand.
    cell: (p, locale, words) =>
      unitCell(voiceMinutesForPlan(p.slug), locale, words.minutesPerMonth),
  },

  // === ASK ===========================================================
  {
    id: "aiChat",
    group: "ask",
    minPlan: "free",
    sidebar: ["/dashboard/chat"],
    pages: ["chat"],
    routes: ["chat", "conversations/[id]"],
    charges: true,
    enforcedIn: "src/app/api/chat/route.ts",
    enforcedSymbol: "resolveEffectivePlan",
    cell: () => ({ type: "check" }),
  },
  {
    id: "freeChatMessages",
    group: "ask",
    minPlan: "free",
    charges: false,
    enforcedIn: "src/lib/billing/free-chat.ts",
    enforcedSymbol: "freeChatAllowance",
    cell: (p, locale) => countCell(freeChatAllowance(p.slug), locale),
  },
  {
    id: "chatMemory",
    group: "ask",
    minPlan: "free",
    charges: false,
    enforcedIn: "src/lib/billing/plans.ts",
    enforcedSymbol: "chatMemoryLimit",
    cell: (p, locale) => countCell(p.capabilities.chatMemoryLimit, locale),
  },
  {
    id: "chatPins",
    group: "ask",
    minPlan: "free",
    charges: false,
    enforcedIn: "src/lib/chat/pin-limits.ts",
    enforcedSymbol: "pinLimitFor",
    // THE SECOND ONE THE PRICING PAGE HAD NEVER MENTIONED. Enforced in
    // api/conversations/[id] since it was written.
    cell: (p, locale) => countCell(pinLimitFor(p.slug), locale),
  },
  {
    id: "deepResearch",
    group: "ask",
    minPlan: "starter",
    sidebar: ["/dashboard/deep-research", "/dashboard/research"],
    pages: ["deep-research"],
    routes: [
      "research",
      "research/[id]",
      "research/[id]/run",
      "research/[id]/cancel",
      "research/[id]/continue",
      "research/[id]/pdf",
    ],
    charges: true,
    enforcedIn: "src/lib/files/limits.ts",
    enforcedSymbol: "maxResearchRunsForPlan",
    cell: (p, locale) => countCell(maxResearchRunsForPlan(p.slug), locale),
  },
  {
    id: "predictions",
    group: "ask",
    minPlan: "free",
    sidebar: ["/dashboard/predictions"],
    pages: ["predictions"],
    routes: ["insights", "insights/[id]", "insights/generate"],
    charges: true,
    enforcedIn: "src/app/api/insights/generate/route.ts",
    enforcedSymbol: "reserveCredits",
    cell: () => ({ type: "check" }),
  },
  {
    id: "askYourData",
    group: "ask",
    minPlan: "free",
    sidebar: ["/dashboard/data-analysis"],
    pages: ["data-analysis"],
    routes: [
      "records/ask",
      "files/ask",
      "data-analysis/upload",
      "data-analysis/[id]/analyse",
      "data-analysis/[id]/ask",
      "data-analysis/[id]/export",
      "import/csv/analyse",
      "import/csv/apply",
      "import/paste",
      "search",
      "entity-links/suggest",
    ],
    charges: true,
    enforcedIn: "src/app/api/records/ask/route.ts",
    enforcedSymbol: "reserveCredits",
    cell: () => ({ type: "check" }),
  },
  {
    id: "customAiPersona",
    group: "ask",
    minPlan: "ultimate",
    charges: false,
    enforcedIn: "src/lib/billing/plans.ts",
    enforcedSymbol: "customAiPersona",
    cell: (p) => boolCell(p.capabilities.customAiPersona),
  },

  // === RUN ===========================================================
  {
    id: "aiAgents",
    group: "run",
    minPlan: "starter",
    sidebar: ["/dashboard/agents", "/dashboard/marketplace"],
    pages: ["agents", "marketplace"],
    routes: [
      "agents",
      "agents/[id]",
      "agents/[id]/run",
      "agents/build",
      "agents/templates",
      "agents/templates/adopt",
      "agents/templates/share",
      "cron/agent-runs",
      "cron/agent-batches",
      "cron/scheduled-runs",
    ],
    charges: true,
    enforcedIn: "src/lib/agents/agent-limits.ts",
    enforcedSymbol: "maxAgentsForPlan",
    cell: (p, locale) => countCell(maxAgentsForPlan(p.slug), locale),
  },
  {
    id: "automation",
    group: "run",
    minPlan: "free",
    sidebar: ["/dashboard/automation"],
    charges: true,
    routes: ["automations/create", "delivery-channels", "transitions/detect", "transitions/record"],
    enforcedIn: "src/app/api/automations/create/route.ts",
    enforcedSymbol: "reserveCredits",
    cell: () => ({ type: "check" }),
  },
  {
    id: "backgroundJobs",
    group: "run",
    minPlan: "free",
    charges: false,
    routes: ["jobs", "jobs/[id]", "jobs/[id]/cancel", "jobs/[id]/consume", "jobs/[id]/continue"],
    enforcedIn: "src/app/api/jobs/route.ts",
    enforcedSymbol: "export",
    cell: () => ({ type: "check" }),
  },

  // === SEE ===========================================================
  {
    id: "businessLogs",
    group: "see",
    minPlan: "free",
    sidebar: [
      "/dashboard",
      "/dashboard/overview",
      "/dashboard/records",
      "/dashboard/timeline",
      "/dashboard/content",
      "/dashboard/products",
      "/dashboard/learning",
      "/dashboard/competitors",
      "/dashboard/decisions",
      "/dashboard/feedback",
      "/dashboard/finance",
      "/dashboard/sales",
      "/dashboard/trading",
      "/dashboard/analytics",
      "/dashboard/trading-journal",
      "/dashboard/product-workflow",
      "/dashboard/trading-workflow",
      "/dashboard/campaigns",
      "/dashboard/favorites",
    ],
    pages: [
      "",
      "[module]",
      "overview",
      "records",
      "timeline",
      "trading-journal",
      "product-workflow",
      "trading-workflow",
      "campaigns",
      "favorites",
    ],
    routes: [
      "modules/create",
      "favorites/toggle",
      "home/seen",
      "achievements/check",
      "trading/rules",
      "trading/guardian",
      "templates/apply",
      "sample-data",
      "nav/track",
      "cron/nav-retention",
    ],
    charges: true,
    enforcedIn: "src/lib/modules.ts",
    enforcedSymbol: "minPlanSlug",
    cell: () => ({ type: "check" }),
  },
  {
    id: "buildLogs",
    group: "see",
    minPlan: "starter",
    // THE TRACKING LOGS WITH A REAL PAYWALL ON THEM, and the paywall is
    // the reason this is not folded into businessLogs above: websites,
    // images and videos are Starter+ and apps is Growth+, enforced in
    // components/modules/build-module-page.tsx via minPlanSlug. Four
    // pages nobody had ever listed as a paid thing.
    sidebar: ["/dashboard/images", "/dashboard/videos", "/dashboard/apps"],
    pages: ["images", "videos", "apps"],
    charges: false,
    enforcedIn: "src/lib/build-modules.ts",
    enforcedSymbol: "minPlanSlug",
    cell: (p) => boolCell(p.slug !== "free"),
  },
  {
    id: "aiMemory",
    group: "see",
    minPlan: "starter",
    sidebar: ["/dashboard/memory"],
    pages: ["memory"],
    charges: false,
    enforcedIn: "src/app/dashboard/memory/page.tsx",
    enforcedSymbol: "planMeetsMinimum",
    cell: (p) => boolCell(p.capabilities.aiMemory),
  },
  {
    id: "files",
    group: "see",
    minPlan: "free",
    sidebar: ["/dashboard/files"],
    pages: ["files"],
    routes: [
      "files",
      "files/upload",
      "files/register",
      "files/[id]",
      "files/[id]/download",
      "files/collections",
      "files/collections/[id]",
    ],
    charges: false,
    // NOT A CHARGING FEATURE. Uploading and reading a file spends no
    // credits — asking a QUESTION about one does, and that route belongs
    // to `askYourData`. The gate measures this rather than believing it.
    enforcedIn: "src/lib/files/limits.ts",
    enforcedSymbol: "maxFilesForPlan",
    cell: (p, locale) => countCell(maxFilesForPlan(p.slug), locale),
    unlimitedProof: {
      enforcedIn: "src/lib/files/limits.ts",
      // AN UNLIMITED COUNT INSIDE A FINITE SPACE. Ultimate and Enterprise
      // may create any number of files and still cannot exceed the
      // storage row, which is 50 GB for both — so the word is only
      // allowed here because `storage` is a row in the same table.
      alsoBoundedBy: ["storage"],
      // THE ROUTES DELEGATE. api/files/upload and api/files/register both
      // hand off to lib/files/ingest.ts, which is where the cap is read
      // and refused; naming the routes here made the gate report a
      // missing accessor that was one call away. Named at the place that
      // enforces, not at the place that is asked.
      routes: ["src/lib/files/ingest.ts"],
    },
  },
  {
    id: "storage",
    group: "see",
    minPlan: "free",
    charges: false,
    enforcedIn: "src/lib/files/limits.ts",
    enforcedSymbol: "maxStorageBytesForPlan",
    // NEVER "unlimited": storage is the one resource that bills every
    // month whether anybody reads it or not, and DEFAULT_STORAGE_LIMITS
    // says so in its own comment.
    cell: (p, locale) => ({ type: "value", text: formatStorage(maxStorageBytesForPlan(p.slug), locale) }),
  },

  // === ORGANISE ======================================================
  {
    id: "projects",
    group: "organise",
    minPlan: "free",
    sidebar: ["/dashboard/projects"],
    pages: ["projects", "projects/[id]"],
    routes: ["projects", "projects/[id]/members"],
    charges: false,
    enforcedIn: "src/app/api/projects/route.ts",
    enforcedSymbol: "export async function POST",
    cell: () => ({ type: "check" }),
  },
  {
    id: "missionControl",
    group: "organise",
    minPlan: "free",
    sidebar: ["/dashboard/mission", "/dashboard/reflection"],
    pages: ["mission", "reflection"],
    routes: [
      "mission/plan",
      "mission/review",
      "mission/schedule-step",
      "mission/[id]",
      "mission/[id]/steps",
      "mission/[id]/pdf",
      "reflection/generate",
      "weekly-digest",
    ],
    charges: true,
    enforcedIn: "src/app/api/mission/plan/route.ts",
    enforcedSymbol: "reserveCredits",
    cell: () => ({ type: "check" }),
  },
  {
    id: "teamCollaboration",
    group: "organise",
    minPlan: "professional",
    sidebar: ["/dashboard/team"],
    pages: ["team"],
    routes: ["team/invite", "team/remove"],
    charges: false,
    enforcedIn: "src/app/api/team/invite/route.ts",
    enforcedSymbol: "capabilities.teamCollaboration",
    cell: (p) => boolCell(p.capabilities.teamCollaboration),
  },
  {
    id: "teamSeatsAddOn",
    group: "organise",
    minPlan: "professional",
    charges: false,
    enforcedIn: "src/lib/billing/plans.ts",
    enforcedSymbol: "TEAM_SEAT_PRICE",
    cell: (p, _locale, words) => {
      if (!p.hasTeamSeats) return { type: "cross" };
      if (p.teamSeatsIncluded) return { type: "value", text: words.included };
      return { type: "value", text: words.perSeat };
    },
  },
  {
    id: "integrations",
    group: "organise",
    minPlan: "starter",
    sidebar: ["/dashboard/integrations"],
    pages: ["integrations"],
    routes: [
      "integrations/[provider]",
      "integrations/[provider]/connect",
      "integrations/[provider]/callback",
    ],
    charges: false,
    enforcedIn: "src/lib/integrations/limits.ts",
    enforcedSymbol: "maxIntegrationsForPlan",
    cell: (p, locale) => countCell(maxIntegrationsForPlan(p.slug), locale),
    unlimitedProof: {
      enforcedIn: "src/lib/integrations/limits.ts",
      // The per-hour READ ceiling is a separate resource and its own row.
      alsoBoundedBy: ["integrationReadsPerHour"],
      routes: ["src/app/api/integrations/[provider]/connect/route.ts"],
    },
  },
  {
    id: "notifications",
    group: "organise",
    minPlan: "free",
    charges: false,
    routes: ["notifications", "notifications/channels", "push/subscribe", "n/[id]"],
    enforcedIn: "src/app/api/notifications/route.ts",
    enforcedSymbol: "export",
    cell: () => ({ type: "check" }),
  },

  // === LIMITS ========================================================
  {
    id: "creditsPerMonth",
    group: "limits",
    minPlan: "free",
    charges: false,
    routes: [
      "credits/balance",
      "credits/transactions",
      "credits/checkout",
      "cron/monthly-credits",
      "cron/reset-credits",
      "billing/overage",
      "billing/addons",
      "billing/business-inputs",
      "billing/cancel",
      "billing/resume",
      "billing-portal",
      "checkout",
      "webhooks/stripe",
      "affiliate",
      "affiliate/connect",
      "cron/affiliate-payouts",
    ],
    pages: ["affiliate"],
    sidebar: ["/dashboard/affiliate"],
    enforcedIn: "src/lib/billing/credits.ts",
    enforcedSymbol: "grantCredits",
    cell: (p, locale, words) => ({
      type: "value",
      text: p.monthlyCredits === "custom" ? words.custom : formatCount(p.monthlyCredits, locale),
    }),
  },
  {
    id: "listRowsShown",
    group: "limits",
    minPlan: "free",
    charges: false,
    enforcedIn: "src/lib/record-cap.ts",
    enforcedSymbol: "RECORD_CAP",
    // THE SAME NUMBER ON EVERY PLAN, and a row rather than a footnote
    // because a list that stops at 500 is a thing a customer meets.
    cell: (_p, locale) => countCell(RECORD_CAP, locale),
  },
  {
    id: "agentRunsPerHour",
    group: "limits",
    minPlan: "starter",
    charges: false,
    enforcedIn: "src/lib/agents/agent-limits.ts",
    enforcedSymbol: "maxAgentRunsPerHour",
    cell: (p, locale, words) => {
      if (maxAgentsForPlan(p.slug) <= 0) return { type: "cross" };
      return unitCell(maxAgentRunsPerHour(), locale, words.perHour);
    },
  },
  {
    id: "fileUploadsPerHour",
    group: "limits",
    minPlan: "free",
    charges: false,
    enforcedIn: "src/lib/files/limits.ts",
    enforcedSymbol: "maxUploadsPerHour",
    cell: (_p, locale, words) => unitCell(maxUploadsPerHour(), locale, words.perHour),
  },
  {
    id: "fileQuestionsPerHour",
    group: "limits",
    minPlan: "free",
    charges: false,
    enforcedIn: "src/lib/files/limits.ts",
    enforcedSymbol: "maxFileQuestionsPerHour",
    cell: (_p, locale, words) => unitCell(maxFileQuestionsPerHour(), locale, words.perHour),
  },
  {
    id: "integrationReadsPerHour",
    group: "limits",
    minPlan: "starter",
    charges: false,
    enforcedIn: "src/lib/integrations/limits.ts",
    enforcedSymbol: "maxIntegrationReadsPerHour",
    cell: (p, locale, words) => {
      if (maxIntegrationsForPlan(p.slug) <= 0) return { type: "cross" };
      return unitCell(maxIntegrationReadsPerHour(), locale, words.perHour);
    },
  },
  {
    id: "siteEditsPerDay",
    group: "limits",
    minPlan: "starter",
    charges: false,
    enforcedIn: "src/lib/publishing/publish-limits.ts",
    enforcedSymbol: "MAX_LIVE_EDITS_PER_SITE_PER_DAY",
    cell: (p, locale, words) => {
      if (maxPublishedSitesForPlan(p.slug) <= 0) return { type: "cross" };
      return unitCell(MAX_LIVE_EDITS_PER_SITE_PER_DAY, locale, words.perDay);
    },
  },
  {
    id: "siteVersionsKept",
    group: "limits",
    minPlan: "starter",
    charges: false,
    enforcedIn: "src/lib/publishing/publish-limits.ts",
    enforcedSymbol: "MAX_SITE_VERSIONS",
    cell: (p, locale) => {
      if (maxPublishedSitesForPlan(p.slug) <= 0) return { type: "cross" };
      return countCell(MAX_SITE_VERSIONS, locale);
    },
  },
  {
    id: "websiteImageStorage",
    group: "limits",
    minPlan: "starter",
    charges: false,
    routes: ["websites/storage-usage", "cron/website-storage-cleanup"],
    enforcedIn: "src/lib/websites/storage-quota.ts",
    enforcedSymbol: "storageLimitBytes",
    // A SEPARATE ALLOWANCE FROM `storage` ABOVE, and the third per-plan
    // ceiling that had never appeared on the pricing page in any
    // language: 50 MB on Free up to 100 GB on Enterprise, for the
    // reference photographs a site is generated from.
    //
    // HOW STRONGLY IT IS ENFORCED, stated rather than implied, because
    // the honest answer is "weakly": the browser asks
    // /api/websites/storage-usage and refuses the batch before
    // uploading (website-builder-workspace.tsx, which calls it ADVISORY
    // in its own comment), storage RLS still lets a determined user
    // write into their own folder, and what bounds growth for real is
    // api/cron/website-storage-cleanup. Published as the capacity an
    // account is given, which is true, and not as a wall.
    cell: (p, locale) => {
      if (!p.capabilities.websiteBuilder) return { type: "cross" };
      return { type: "value", text: formatStorage(STORAGE_LIMIT_BYTES[p.slug] ?? 0, locale) };
    },
  },
  {
    id: "voiceClipLength",
    group: "limits",
    minPlan: "starter",
    charges: false,
    enforcedIn: "src/lib/voice/voice-pricing.ts",
    enforcedSymbol: "MAX_CLIP_SECONDS",
    // TWO MINUTES PER RECORDING, and it is here because it is the limit
    // a person meets first: the monthly minutes above say how much voice
    // a month holds, this says how long one press of the button may be.
    // DERIVED FROM THE CEILING, not typed as "2". MAX_CLIP_SECONDS is
    // 120 today; a row that says 2 and a recorder that stops at 90
    // seconds is the shape this whole file exists to make impossible.
    cell: (p, locale) => {
      if (voiceMinutesForPlan(p.slug) <= 0) return { type: "cross" };
      return countCell(Math.round(MAX_CLIP_SECONDS / 60), locale);
    },
  },

  // === SUPPORT =======================================================
  {
    id: "helpCentre",
    group: "support",
    minPlan: "free",
    sidebar: ["/help"],
    charges: false,
    enforcedIn: "src/app/help/page.tsx",
    enforcedSymbol: "export default",
    // EVERY PLAN, AND THAT IS THE WHOLE SUPPORT STORY. Four per-plan
    // support tiers were sold once with no support channel behind any of
    // them; pricing-truth.test.mjs keeps all four deleted. This row is
    // what the product actually has, on every plan, so the absence is
    // stated rather than left as a gap somebody fills with a promise.
    cell: () => ({ type: "check" }),
  },
  {
    id: "contactSupport",
    group: "support",
    minPlan: "free",
    charges: false,
    routes: ["contact", "client-error", "security-check-log", "pwa/telemetry"],
    enforcedIn: "src/app/api/contact/route.ts",
    enforcedSymbol: "export async function POST",
    cell: () => ({ type: "check" }),
  },
  {
    id: "accountAndPrivacy",
    group: "support",
    minPlan: "free",
    sidebar: ["/dashboard/settings"],
    pages: ["settings"],
    routes: [
      "account/export",
      "delete-account/request",
      "delete-account/confirm",
      "onboarding",
      "signup",
      "auth/login",
      "auth/device-check",
      "health",
    ],
    charges: false,
    enforcedIn: "src/app/api/account/export/route.ts",
    enforcedSymbol: "export",
    cell: () => ({ type: "check" }),
  },

  // === NOT SOLD ======================================================
  // Owner-only operational screens. They are in the catalog because the
  // gate requires every page under /dashboard to be accounted for, and
  // they are kept out of the table because a row a buyer cannot buy is
  // noise in a document whose whole job is "what do I get".
  {
    id: "ownerOperations",
    group: "support",
    minPlan: "free",
    notSold:
      "owner-only: isAdminEmail() refuses everybody else, so no plan can buy it",
    sidebar: [
      "/dashboard/business-health",
      "/dashboard/costs",
      "/dashboard/routing",
      "/dashboard/system-health",
    ],
    pages: ["business-health", "costs", "routing", "system-health"],
    routes: ["system-health/files", "system-health/resolve", "cron/cost-alerts"],
    charges: false,
    enforcedIn: "src/lib/auth/admin-emails.ts",
    enforcedSymbol: "isAdminEmail",
    cell: () => ({ type: "cross" }),
  },
];

// ---------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------

/** The entries the comparison table draws, in group order. */
export function soldFeatures(): FeatureEntry[] {
  const order = new Map(FEATURE_GROUPS.map((g, i) => [g, i]));
  return FEATURE_CATALOG.filter((f) => !f.notSold).sort(
    (a, b) => (order.get(a.group) ?? 0) - (order.get(b.group) ?? 0)
  );
}

/** The sold entries of one group, in declaration order within it. */
export function featuresInGroup(group: FeatureGroup): FeatureEntry[] {
  return FEATURE_CATALOG.filter((f) => f.group === group && !f.notSold);
}

export function getFeature(id: string): FeatureEntry | undefined {
  return FEATURE_CATALOG.find((f) => f.id === id);
}

/**
 * The plan a locked feature unlocks on, as the thing an upgrade wall
 * needs: the name to say, the price to say, and the slug to link to.
 *
 * WHY THIS IS DERIVED AND NOT PASSED IN. Four upgrade walls said
 * `planName="Starter"` as a literal — three of them hardcoded, one
 * looked up. A literal is a claim that can outlive the gate it
 * describes: moving AI Memory to Growth would have left three screens
 * telling people to buy Starter for it, and nothing in the build would
 * have noticed.
 */
export function unlockPlanFor(featureId: string): {
  slug: PlanSlug;
  name: string;
  priceEur: number | "custom";
} | null {
  const feature = getFeature(featureId);
  if (!feature) return null;
  const plan = PLANS.find((p) => p.slug === feature.minPlan);
  if (!plan) return null;
  return { slug: plan.slug, name: plan.name, priceEur: plan.price };
}

/**
 * The four props an upgrade wall needs, resolved from one feature id.
 *
 * `featureName` stays a caller's argument rather than another catalog
 * field: the screen already has the feature's name translated (it is in
 * its own page header), and a second copy here would be a second string
 * to keep in ten languages.
 */
export function upgradeWallProps(
  featureId: string,
  featureName: string
): { featureName: string; planName: string; planSlug: PlanSlug; priceEur: number | null } | null {
  const unlock = unlockPlanFor(featureId);
  if (!unlock) return null;
  return {
    featureName,
    planName: unlock.name,
    planSlug: unlock.slug,
    priceEur: typeof unlock.priceEur === "number" ? unlock.priceEur : null,
  };
}

export { TEAM_SEAT_PRICE };
