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
  /** Never print the value, whatever the complaint says. A malformed
   *  secret is still a secret: the reason is the useful half, and echoing
   *  a key into a log to explain that it is the wrong LENGTH would put it
   *  somewhere it was never meant to be. */
  secret?: boolean;
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
  {
    // Enterprise is the one plan with no price in code, which used to mean
    // its combined ceiling could not be checked at all — it inherited
    // Ultimate's free-chat allowance against a price nothing knew. This is
    // the contractual floor the gate measures it against; signing a deal
    // below it is what would break the guarantee, not setting this wrong.
    name: "ENTERPRISE_MIN_PRICE_EUR",
    level: "optional",
    what: "Floor price of an Enterprise contract — what its 25% ceiling is measured against",
    fallback: "400",
    suspicious: numberIn(200, 1_000_000),
  },
  { name: "STRIPE_SECRET_KEY", level: "recommended", what: "Checkout and subscriptions" },
  { name: "STRIPE_WEBHOOK_SECRET", level: "recommended", what: "Verifying Stripe webhooks. Without it, grants never land" },

  // --- degrade gracefully, but a user notices ------------------------
  {
    // The one variable whose absence does not degrade but ACTIVELY breaks
    // on smaller plans: the app assumes it may run 800s per invocation, so
    // on a platform that kills at 60–300s a website generation dies mid-
    // work with no catch block — surfacing later as "stale job force-
    // failed" and "interrupted before it finished", which look like model
    // failures and are not. Must equal the platform's REAL function
    // ceiling in seconds (Vercel Hobby/Fluid: 300, Pro/Fluid: 800).
    name: "MAX_FUNCTION_DURATION",
    level: "recommended",
    what: "The platform's real function timeout in seconds — chunking and stale-job detection are calibrated to it",
    fallback: "800 (a Pro/Fluid figure — on a smaller plan, long generations are killed mid-work and force-failed as stale)",
    suspicious: numberIn(10, 3600),
  },
  { name: "CRON_SECRET", level: "recommended", what: "Authenticates scheduled runs. Without it cron endpoints return 503" },
  { name: "RESEND_API_KEY", level: "recommended", what: "All outbound email, including margin and error alerts" },
  {
    // Upgraded from "optional" after production logged 20 refused emails:
    // Resend's shared onboarding@resend.dev sender is TESTING mode, which
    // delivers only to the Resend account owner's own address. Every
    // welcome, new-device and digest email to a real user is refused with
    // "You can only send testing emails to your own address".
    name: "RESEND_FROM_EMAIL",
    level: "recommended",
    what: "Sender address, on a domain verified in Resend — unverified senders deliver only to the account owner",
    fallback: "Ionexa AI <onboarding@resend.dev> (testing mode: real users receive nothing)",
    suspicious: (value) =>
      /@resend\.dev>?\s*$/i.test(value)
        ? "resend.dev is Resend's testing sender — emails to anyone but the account owner are refused"
        : null,
  },
  {
    // A VAPID pair is what makes push possible AT ALL, and its absence is
    // completely silent by design: lib/push/web-push.ts logs once and every
    // send becomes a no-op. That is right for a deployment that does not
    // want push, and indistinguishable from a broken one for a deployment
    // that does — which is exactly what an env check is for.
    name: "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    level: "recommended",
    what: "Web Push. The BROWSER needs this one to create a subscription at all",
    fallback: "the settings panel says 'not configured' and no notification is ever sent",
    suspicious: (value) =>
      // An uncompressed P-256 point is 65 bytes, which is 87 base64url
      // characters. A pasted private key or a truncated copy is the
      // failure this catches, and it fails at subscribe() time in the
      // browser with an opaque InvalidCharacterError.
      value.trim().length !== 87
        ? `expected 87 base64url characters (a 65-byte P-256 public key), got ${value.trim().length}`
        : null,
  },
  {
    name: "VAPID_PRIVATE_KEY",
    level: "recommended",
    what: "Web Push, server side. Signs the JWT every push service demands",
    fallback: "sends are skipped as 'unconfigured' — agent results and reminders never reach a phone",
    secret: true,
  },
  {
    name: "VAPID_SUBJECT",
    level: "optional",
    what: "The mailto: or https: URL identifying the sender in push JWTs",
    fallback: "mailto: built from RESEND_FROM_EMAIL, or support@ionexa.ai",
  },
  {
    // Set automatically by Vercel for Next.js projects; listed so the
    // fallback is documented rather than discovered.
    name: "NEXT_PUBLIC_BUILD_ID",
    level: "optional",
    what: "Stamps the service-worker registration URL so a deploy reaches the worker",
    fallback: "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA, then \"dev\" — on a host that sets neither, the offline page cache is not purged on deploy",
  },
  {
    // V4 #18. OPTIONAL and cleanly absent: without it telegramConfigured()
    // is false, the Settings panel says so instead of offering a field
    // that cannot work, loadNotifyContext never marks Telegram available,
    // and resolveChannels drops it however the user's preference reads.
    // Nothing half-works — the failure mode this avoids is a user who
    // connects a chat id, sees "connected", and never receives anything.
    //
    // Discord needs NO server-side key at all: the credential is the
    // webhook URL, which each user supplies and which is stored encrypted
    // per user.
    name: "TELEGRAM_BOT_TOKEN",
    level: "optional",
    what: "Sends notifications to Telegram. Without it the Telegram channel is disabled and says so",
    fallback: "Telegram is offered nowhere in Settings; every other channel is unaffected",
  },
  // Annual billing. OPTIONAL, and the fallback is the whole design: with
  // any of the four missing, annualBillingAvailable() is false, /pricing
  // renders no Monthly/Annual toggle, ?billing=annual does nothing, and
  // the product sells exactly as it did before annual existed. Nothing
  // breaks and nothing half-works — the failure mode of a partially
  // configured toggle would be a buy button that 500s on a price id
  // that does not exist.
  { name: "STRIPE_PRICE_STARTER_ANNUAL", level: "optional", what: "Starter billed yearly (€200 — ten months)", fallback: "annual billing is not offered at all" },
  { name: "STRIPE_PRICE_GROWTH_ANNUAL", level: "optional", what: "Growth billed yearly (€500 — ten months)", fallback: "annual billing is not offered at all" },
  { name: "STRIPE_PRICE_PROFESSIONAL_ANNUAL", level: "optional", what: "Professional billed yearly (€1,000 — ten months)", fallback: "annual billing is not offered at all" },
  { name: "STRIPE_PRICE_ULTIMATE_ANNUAL", level: "optional", what: "Ultimate billed yearly (€2,000 — ten months)", fallback: "annual billing is not offered at all" },
  {
    // V4 #2 (voice). OPTIONAL and cleanly absent: transcribeAvailable() is
    // false, the microphone button renders nothing at all rather than a
    // control that fails on press, and /api/voice/transcribe answers with
    // "OPENAI_API_KEY is not set on this deployment". Listed here because
    // the ABSENCE is otherwise invisible to the owner: a deployment with
    // no key looks identical to one where the feature was never built.
    name: "OPENAI_API_KEY",
    level: "optional",
    what: "Speech-to-text (Whisper). Voice INPUT everywhere: chat, module forms, the agent builder",
    fallback: "the microphone button is not rendered; every text path is unaffected",
    secret: true,
  },
  {
    name: "ELEVENLABS_API_KEY",
    level: "optional",
    what: "Text-to-speech. Voice OUTPUT: reading an agent run or a chat reply aloud, and the hands-free loop",
    fallback: "the speaker button is not rendered, and the hands-free conversation cannot be started",
    secret: true,
  },
  { name: "ADMIN_EMAILS", level: "optional", what: "Extra admin accounts, comma-separated", fallback: "the hardcoded owner address" },
  {
    name: "UNSPLASH_ACCESS_KEY",
    level: "optional",
    what: "Real photos in generated websites",
    fallback: "photo placeholders are REMOVED — a site with fewer, relevant images rather than random ones",
  },
  {
    // Raising this on the free Demo tier does not buy more photos: it
    // spends the hour's 50 requests on one generation and 403s the next
    // three.
    name: "UNSPLASH_REQUESTS_PER_GENERATION",
    level: "optional",
    what: "Unsplash searches one website generation may spend — raise only with a production Unsplash app (5000/hour)",
    fallback: "12 (sized for the free Demo tier's 50/hour)",
    suspicious: numberIn(1, 500),
  },
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
  // Integrations (V3 Task 3). All "optional": the feature is off unless
  // they are set, and a deployment that never wanted Gmail/Slack must not
  // be told it is misconfigured. INTEGRATION_ENCRYPTION_KEY is listed
  // first because without it the connect route refuses to run at all —
  // which is the correct behaviour, and worth being able to SEE on the
  // system-health page rather than discovering from a 503.
  {
    name: "INTEGRATION_ENCRYPTION_KEY",
    level: "optional",
    what:
      "Encrypts stored third-party OAuth tokens and Telegram/Discord delivery credentials. " +
      "Without it, integrations and those two channels refuse to connect",
    fallback: "integrations and Telegram/Discord delivery disabled",
    secret: true,
    // A key of the wrong LENGTH is rejected at every save with "secure
    // storage is not configured on the server" — which reads as "not set"
    // and sends whoever set it looking in the wrong place. The same
    // parser lib/integrations/crypto.ts uses, restated as a shape check
    // so the health page can say "set, but wrong" instead of nothing.
    suspicious: (value) => {
      const hex = /^[0-9a-fA-F]{64}$/.test(value);
      const b64 = /^[A-Za-z0-9+/]{43}=$/.test(value);
      const b64url = /^[A-Za-z0-9_-]{43}$/.test(value);
      return hex || b64 || b64url
        ? null
        : "not a 32-byte key — must be 64 hex characters or 32 bytes of base64 (openssl rand -hex 32). Integrations and Telegram/Discord delivery will refuse to connect";
    },
  },
  {
    name: "GOOGLE_OAUTH_CLIENT_ID",
    level: "optional",
    what: "Gmail and Google Drive integrations",
    fallback: "those providers are hidden",
  },
  {
    name: "GOOGLE_OAUTH_CLIENT_SECRET",
    level: "optional",
    what: "Gmail and Google Drive token exchange",
    fallback: "those providers are hidden",
  },
  {
    name: "SLACK_CLIENT_ID",
    level: "optional",
    what: "Slack integration and Slack agent delivery",
    fallback: "Slack is hidden",
  },
  {
    name: "SLACK_CLIENT_SECRET",
    level: "optional",
    what: "Slack token exchange",
    fallback: "Slack is hidden",
  },
  {
    name: "INTEGRATION_MAX_READS_PER_HOUR",
    level: "optional",
    what: "Reads of connected accounts one user can cause per hour",
    fallback: "60",
    suspicious: numberIn(1, 1000),
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
    // whole point of the warning. `secret: true` requirements carry an
    // empty value here, so a caller that renders the report without
    // consulting formatEnvReport still cannot leak one.
    if (reason) report.suspicious.push({ name: req.name, value: req.secret ? "" : raw.trim(), reason });
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
    const req = ENV_REQUIREMENTS.find((r) => r.name === s.name);
    // The value is printed only for the numeric knobs, where the value IS
    // the warning ("0.80 is below the floor"). Anything marked secret
    // reports the complaint alone.
    lines.push(
      req?.secret
        ? `[env] SUSPICIOUS ${s.name} — ${s.reason}`
        : `[env] SUSPICIOUS ${s.name}="${s.value}" — ${s.reason}`
    );
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
