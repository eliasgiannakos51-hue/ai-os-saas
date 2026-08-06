import "server-only";

// What this app needs from the environment, in one place.
//
// The reason it exists: a missing variable does not announce itself. The
// app boots, pages render, and the feature that needed it fails quietly
// per-request — or worse, succeeds with a wrong value. USD_TO_EUR_RATE
// set to 0.80 charged 45 credits where 52 was correct, and every settled
// row still reported a healthy margin, because the margin was measured
// against the same understated euros.
//
// So this reports, once, at startup: what is missing, and what is set to
// something suspicious. It NEVER throws and never fails a build — env
// validation that can break a deploy is worse than the problem it
// solves, and this deliberately runs at runtime only (see instrumentation.ts).

export type EnvRequirement = {
  name: string;
  /** required: the app is meaningfully broken without it. */
  level: "required" | "recommended" | "optional";
  what: string;
  /** What the code falls back to when unset. */
  fallback?: string;
  /** Returns a complaint string when the VALUE looks wrong. */
  suspicious?: (value: string) => string | null;
};

function numberIn(min: number, max: number) {
  return (value: string): string | null => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "not a number";
    if (n < min || n > max) return `outside the sane range ${min}–${max} — the default will be used instead`;
    return null;
  };
}

export const ENV_REQUIREMENTS: EnvRequirement[] = [
  // --- the app does not work at all without these -------------------
  { name: "NEXT_PUBLIC_SUPABASE_URL", level: "required", what: "Supabase project URL (auth + database)" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", level: "required", what: "Supabase anon key, used by the browser and middleware" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", level: "required", what: "Service-role key for credits, settlement and admin reads" },
  { name: "ANTHROPIC_API_KEY", level: "required", what: "Every AI feature. Without it they fail per-request, not at boot" },
  { name: "NEXT_PUBLIC_SITE_URL", level: "required", what: "Absolute URLs in emails, OAuth redirects and generated websites" },

  // --- money. Wrong values here lose money silently ------------------
  {
    name: "USD_TO_EUR_RATE",
    level: "recommended",
    what: "USD→EUR for pricing Anthropic's dollar costs in euros",
    fallback: "0.92",
    // Below the floor understates cost and eats margin invisibly.
    suspicious: numberIn(0.85, 1.5),
  },
  {
    name: "CREDIT_MARGIN_MULTIPLIER",
    level: "recommended",
    what: "Target margin on every AI action",
    fallback: "4",
    suspicious: numberIn(4, 10),
  },
  {
    name: "CREDIT_PRICE_EUR",
    level: "recommended",
    what: "List price of one credit",
    fallback: "0.02",
    suspicious: numberIn(0.001, 10),
  },
  { name: "STRIPE_SECRET_KEY", level: "recommended", what: "Checkout and subscriptions" },
  { name: "STRIPE_WEBHOOK_SECRET", level: "recommended", what: "Verifying Stripe webhooks. Without it, grants never land" },

  // --- degrade gracefully, but a user notices ------------------------
  { name: "CRON_SECRET", level: "recommended", what: "Authenticates scheduled runs. Without it cron endpoints return 503" },
  { name: "RESEND_API_KEY", level: "recommended", what: "All outbound email, including margin and error alerts" },
  { name: "RESEND_FROM_EMAIL", level: "optional", what: "Sender address", fallback: "Ionexa AI <onboarding@resend.dev>" },
  { name: "ADMIN_EMAILS", level: "optional", what: "Extra admin accounts, comma-separated", fallback: "the hardcoded owner address" },
  { name: "UNSPLASH_ACCESS_KEY", level: "optional", what: "Real photos in generated websites", fallback: "placeholder images" },
  { name: "LARGE_ACTION_CONFIRM_THRESHOLD", level: "optional", what: "Credits above which an action asks for confirmation", fallback: "50" },
  { name: "RESERVE_BUFFER_PERCENT", level: "optional", what: "Headroom added to a reservation", fallback: "10" },
  // Autonomous Agents fair use. Optional, because every one of them has a
  // real default from plans.ts — but listed so the owner can SEE, on the
  // system-health page, which of them are being overridden. A limit that
  // silently differs from the pricing page is the kind of thing nobody
  // finds until a customer asks why they cannot add an agent.
  {
    name: "AGENT_LIMIT_STARTER",
    level: "optional",
    what: "Agents a Starter account may own",
    fallback: "2",
    suspicious: numberIn(0, 1000),
  },
  {
    name: "AGENT_LIMIT_GROWTH",
    level: "optional",
    what: "Agents a Growth account may own",
    fallback: "5",
    suspicious: numberIn(0, 1000),
  },
  {
    name: "AGENT_LIMIT_PROFESSIONAL",
    level: "optional",
    what: "Agents a Professional account may own",
    fallback: "15",
    suspicious: numberIn(0, 1000),
  },
  {
    name: "AGENT_LIMIT_ULTIMATE",
    level: "optional",
    what: "Agents an Ultimate account may own",
    fallback: "50",
    suspicious: numberIn(0, 1000),
  },
  {
    name: "AGENT_MAX_RUNS_PER_HOUR",
    level: "optional",
    what: "Agent executions one account can cause per hour",
    fallback: "20",
    suspicious: numberIn(1, 500),
  },
];

export type EnvReport = {
  missingRequired: string[];
  missingRecommended: string[];
  suspicious: { name: string; value: string; reason: string }[];
};

/** Pure, so it can be tested against hand-written environments. */
export function checkEnv(env: Record<string, string | undefined>): EnvReport {
  const report: EnvReport = { missingRequired: [], missingRecommended: [], suspicious: [] };
  for (const req of ENV_REQUIREMENTS) {
    const raw = env[req.name];
    if (raw === undefined || raw.trim() === "") {
      if (req.level === "required") report.missingRequired.push(req.name);
      else if (req.level === "recommended") report.missingRecommended.push(req.name);
      continue;
    }
    const reason = req.suspicious?.(raw.trim());
    // The VALUE is never echoed for anything that could be a secret —
    // only for the small set of numeric knobs, where the value is the
    // whole point of the warning.
    if (reason) report.suspicious.push({ name: req.name, value: raw.trim(), reason });
  }
  return report;
}

export function formatEnvReport(report: EnvReport): string[] {
  const lines: string[] = [];
  for (const name of report.missingRequired) {
    const req = ENV_REQUIREMENTS.find((r) => r.name === name)!;
    lines.push(`[env] MISSING REQUIRED ${name} — ${req.what}`);
  }
  for (const name of report.missingRecommended) {
    const req = ENV_REQUIREMENTS.find((r) => r.name === name)!;
    lines.push(
      `[env] missing ${name} — ${req.what}${req.fallback ? ` (falling back to ${req.fallback})` : ""}`
    );
  }
  for (const s of report.suspicious) {
    lines.push(`[env] SUSPICIOUS ${s.name}="${s.value}" — ${s.reason}`);
  }
  return lines;
}

let reported = false;

/**
 * Logs the report once per process. Safe to call from anywhere; does
 * nothing after the first call.
 */
export function reportEnvOnce(env: Record<string, string | undefined> = process.env): EnvReport {
  const report = checkEnv(env);
  if (reported) return report;
  reported = true;
  const lines = formatEnvReport(report);
  if (lines.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[env] all required and recommended variables are set");
    return report;
  }
  for (const line of lines) {
    // eslint-disable-next-line no-console
    if (line.includes("MISSING REQUIRED") || line.includes("SUSPICIOUS")) console.error(line);
    // eslint-disable-next-line no-console
    else console.warn(line);
  }
  return report;
}
