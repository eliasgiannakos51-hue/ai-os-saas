import type { Plan } from "@/lib/billing/plans";

/**
 * ADD-ONS, AND THE ONE PLACE ENTITLEMENT IS DECIDED.
 *
 * Four things a customer can buy on top of their plan. The dangerous part
 * is not the buying — it is that every cap check in the app currently
 * reads the PLAN. The moment an add-on can raise a cap, any check that
 * still reads the plan alone is a customer who paid for five more agents
 * and cannot create them, and it fails silently at the point of use.
 *
 * So `resolveEntitlements` is the only function that answers "how many
 * agents may this account have", and it takes the plan AND the add-ons.
 * A caller that has one and not the other cannot call it.
 *
 * Pure. lib/billing/addon-store.ts does the reading.
 */

export const ADDON_SLUGS = ["credits_1000", "agents_5", "storage_10gb", "priority"] as const;
export type AddonSlug = (typeof ADDON_SLUGS)[number];

export function isAddonSlug(value: unknown): value is AddonSlug {
  return typeof value === "string" && (ADDON_SLUGS as readonly string[]).includes(value);
}

export type AddonSpec = {
  slug: AddonSlug;
  priceEur: number;
  /** A one-off pack, or a monthly line on the subscription. The
   *  difference decides which Stripe mode the checkout runs in and
   *  whether "cancel" means anything. */
  billing: "one_off" | "monthly";
  /** The env var holding this add-on's Stripe price id. Absent from the
   *  environment means the add-on is not offered — cleanly, with the
   *  reason, rather than a checkout that 500s. */
  priceEnvVar: string;
  /** What it grants. Exactly one of these per add-on, so the entitlement
   *  resolver cannot be surprised by a field it does not read. */
  grants:
    | { kind: "credits"; amount: number }
    | { kind: "agents"; amount: number }
    | { kind: "storage_gb"; amount: number }
    | { kind: "priority" };
  /** May an account buy more than one? Five extra agents twice is ten;
   *  priority execution twice is priority execution. */
  stackable: boolean;
};

export const ADDONS: Record<AddonSlug, AddonSpec> = {
  credits_1000: {
    slug: "credits_1000",
    priceEur: 15,
    billing: "one_off",
    priceEnvVar: "STRIPE_PRICE_ADDON_CREDITS_1000",
    grants: { kind: "credits", amount: 1_000 },
    // Buying two packs is two thousand credits. The obvious case, and the
    // one that would be most annoying to get wrong.
    stackable: true,
  },
  agents_5: {
    slug: "agents_5",
    priceEur: 10,
    billing: "monthly",
    priceEnvVar: "STRIPE_PRICE_ADDON_AGENTS_5",
    grants: { kind: "agents", amount: 5 },
    stackable: true,
  },
  storage_10gb: {
    slug: "storage_10gb",
    priceEur: 5,
    billing: "monthly",
    priceEnvVar: "STRIPE_PRICE_ADDON_STORAGE_10GB",
    grants: { kind: "storage_gb", amount: 10 },
    stackable: true,
  },
  priority: {
    slug: "priority",
    priceEur: 20,
    billing: "monthly",
    priceEnvVar: "STRIPE_PRICE_ADDON_PRIORITY",
    grants: { kind: "priority" },
    // NOT STACKABLE. Two of these is twenty euros a month for nothing,
    // and a checkout that allows it is a refund request.
    stackable: false,
  },
};

/** An add-on the account holds, as the store returns it. */
export type HeldAddon = {
  slug: AddonSlug;
  quantity: number;
  status: "active" | "cancelled";
  /** A cancelled recurring add-on is paid up to here. */
  expiresAt: string | null;
};

/**
 * Is this add-on granting anything right now?
 *
 * CANCELLED IS NOT IMMEDIATELY GONE. Somebody who cancels on the 3rd has
 * paid to the end of the period, and taking the entitlement away on click
 * would be keeping their money and their agents. `expiresAt` is what
 * decides; a cancelled add-on with no expiry has already ended.
 */
export function addonIsActive(addon: HeldAddon, now: Date): boolean {
  if (addon.status === "active") return true;
  if (!addon.expiresAt) return false;
  const expires = new Date(addon.expiresAt);
  return Number.isFinite(expires.getTime()) && expires.getTime() > now.getTime();
}

export type Entitlements = {
  /** The plan's cap PLUS every active agents add-on. */
  maxAiAgents: number;
  storageGb: number;
  priority: boolean;
  /** What each add-on contributed, so the UI can show "10 (5 from your
   *  plan, 5 from an add-on)" rather than a number with no explanation. */
  fromAddons: { agents: number; storageGb: number; priority: boolean };
};

/** The plan's own storage, in GB. Not in PlanCapabilities today — the
 *  product has never had a storage cap to enforce — so it is stated here
 *  as the base an add-on adds to, in ONE place, rather than being
 *  invented separately by every caller that needs it. */
export const PLAN_STORAGE_GB: Record<string, number> = {
  free: 1,
  starter: 5,
  growth: 20,
  professional: 50,
  ultimate: 200,
  enterprise: 1_000,
};

/**
 * THE ONE ANSWER TO "WHAT MAY THIS ACCOUNT DO".
 *
 * Every cap check goes through here. A check that reads
 * `plan.capabilities.maxAiAgents` directly is a check that ignores an
 * add-on the customer paid for — see scripts/tests/revenue-engine.test.mjs,
 * which scans for exactly that.
 */
export function resolveEntitlements(params: {
  plan: Plan | null;
  addons: readonly HeldAddon[];
  now?: Date;
}): Entitlements {
  const now = params.now ?? new Date();
  const plan = params.plan;

  const active = params.addons.filter((addon) => addonIsActive(addon, now));

  let agents = 0;
  let storageGb = 0;
  let priority = false;

  for (const held of active) {
    const spec = ADDONS[held.slug];
    if (!spec) continue;
    // A NON-STACKABLE ADD-ON COUNTS ONCE whatever the quantity says. The
    // checkout refuses a second one, but a row can still arrive from a
    // Stripe retry or a hand-fixed subscription, and the entitlement is
    // where that has to stop meaning something.
    const quantity = spec.stackable ? Math.max(1, held.quantity) : 1;
    switch (spec.grants.kind) {
      case "agents":
        agents += spec.grants.amount * quantity;
        break;
      case "storage_gb":
        storageGb += spec.grants.amount * quantity;
        break;
      case "priority":
        priority = true;
        break;
      case "credits":
        // A one-off pack is granted at purchase and lives in the credit
        // balance. It is not a standing entitlement, so it contributes
        // nothing here — counting it would be granting it twice.
        break;
    }
  }

  // maxAiAgents is `number | "unlimited"` on Enterprise. An unlimited
  // plan plus an add-on is still unlimited, and `"unlimited" + 5` is the
  // string "unlimited5" — which every `<` comparison in the app would
  // then read as NaN and refuse. Resolved here, once, rather than at
  // every cap check.
  const planAgentsRaw = plan?.capabilities.maxAiAgents ?? 0;
  const planUnlimited = typeof planAgentsRaw !== "number";
  const planAgents = planUnlimited ? 0 : planAgentsRaw;
  const planStorage = plan ? PLAN_STORAGE_GB[plan.slug] ?? 1 : 1;

  return {
    maxAiAgents: planUnlimited ? Number.POSITIVE_INFINITY : planAgents + agents,
    storageGb: planStorage + storageGb,
    priority,
    fromAddons: { agents, storageGb, priority },
  };
}

export type AddonAvailability =
  | { available: true; priceId: string }
  | { available: false; reason: "not_configured"; envVar: string };

/**
 * Can this add-on be sold on this deployment?
 *
 * WITHOUT THE PRICE ID IT IS NOT OFFERED, cleanly. The alternative is a
 * buy button that reaches Stripe with an undefined price and returns a
 * 500 — the customer's read of which is that the product is broken, not
 * that it is unconfigured.
 */
export function addonAvailability(slug: AddonSlug, env: NodeJS.ProcessEnv = process.env): AddonAvailability {
  const spec = ADDONS[slug];
  const priceId = env[spec.priceEnvVar];
  if (!priceId || !priceId.trim()) return { available: false, reason: "not_configured", envVar: spec.priceEnvVar };
  return { available: true, priceId: priceId.trim() };
}

export type PurchaseVerdict = { ok: true } | { ok: false; reason: string };

/** Whether this account may buy one more of this add-on. */
export function checkPurchase(params: {
  slug: AddonSlug;
  held: readonly HeldAddon[];
  now?: Date;
}): PurchaseVerdict {
  const spec = ADDONS[params.slug];
  if (!spec) return { ok: false, reason: "unknown add-on" };
  if (spec.stackable) return { ok: true };
  const now = params.now ?? new Date();
  const alreadyHas = params.held.some((h) => h.slug === params.slug && addonIsActive(h, now));
  return alreadyHas ? { ok: false, reason: "already_active" } : { ok: true };
}
