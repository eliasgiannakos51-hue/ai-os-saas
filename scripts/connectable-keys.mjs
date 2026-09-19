#!/usr/bin/env node
/*
 * EVERY EXTERNAL SERVICE THIS APP CAN BE CONNECTED TO.
 *
 * Asked for on 2026-09-19: the full list of keys that can be plugged in,
 * including the ones whose feature is not finished — what each turns on,
 * what goes SILENT without it, whether there is a free tier, and where
 * to get one.
 *
 * WHAT IS DERIVED AND WHAT IS TYPED, because they are different kinds of
 * fact and mixing them is how a table rots:
 *
 *   DERIVED from src/lib/env-check.ts — the variable name, whether the
 *   app treats it as required/recommended/optional, what it enables and
 *   what the fallback is. That file is the one the boot check and the
 *   System Health page already read, so a key added there appears here
 *   without anyone remembering to.
 *
 *   TYPED below — which PROVIDER a key belongs to, the category, the
 *   sign-up URL, and whether that provider has a free tier. None of
 *   those are in the codebase and none can be. They carry the date they
 *   were last checked.
 *
 * PRICES ARE NOT IN THIS FILE. A per-token or per-minute figure typed
 * here is out of date the week after it is typed, and this repository
 * has a rule about undated numbers that exists because of exactly that.
 * The URL is what answers "how much" and it answers it correctly
 * forever. What IS here is what the app itself charges, where the app
 * knows: `node scripts/tests/pricing-truth.test.mjs`.
 *
 * BOTH WAYS. Every provider key in env-check must appear in PROVIDERS
 * below, and every entry in PROVIDERS must still be a variable the app
 * reads. Either half failing is a red run, not a quiet gap.
 *
 * Run: node scripts/connectable-keys.mjs
 *      node scripts/connectable-keys.mjs --md     (markdown table)
 */
import { readFileSync } from "node:fs";

const CHECKED = "2026-09-19";

// Category: Models · Image/Video/Audio · Infrastructure · Data.
const PROVIDERS = {
  ANTHROPIC_API_KEY: {
    provider: "Anthropic",
    category: "Models",
    url: "https://console.anthropic.com/settings/keys",
    freeTier: "no — pay as you go, with a trial credit on a new account",
  },
  OPENAI_API_KEY: {
    provider: "OpenAI",
    category: "Image/Video/Audio",
    url: "https://platform.openai.com/api-keys",
    freeTier: "no — pay as you go",
  },
  GOOGLE_API_KEY: {
    provider: "Google AI Studio (Gemini)",
    category: "Models",
    url: "https://aistudio.google.com/apikey",
    freeTier: "yes — a free tier with rate limits",
  },
  GROQ_API_KEY: {
    provider: "Groq",
    category: "Models",
    url: "https://console.groq.com/keys",
    freeTier: "yes — a free tier with rate limits",
  },
  ELEVENLABS_API_KEY: {
    provider: "ElevenLabs",
    category: "Image/Video/Audio",
    url: "https://elevenlabs.io/app/settings/api-keys",
    freeTier: "yes — a monthly character allowance",
  },
  UNSPLASH_ACCESS_KEY: {
    provider: "Unsplash",
    category: "Image/Video/Audio",
    url: "https://unsplash.com/oauth/applications",
    freeTier: "yes — 50 requests/hour in demo, 5,000 once approved for production",
  },
  RESEND_API_KEY: {
    provider: "Resend",
    category: "Infrastructure",
    url: "https://resend.com/api-keys",
    freeTier: "yes — a monthly send allowance",
  },
  STRIPE_SECRET_KEY: {
    provider: "Stripe",
    category: "Infrastructure",
    url: "https://dashboard.stripe.com/apikeys",
    freeTier: "no key cost — Stripe charges per transaction",
  },
  STRIPE_WEBHOOK_SECRET: {
    provider: "Stripe",
    category: "Infrastructure",
    url: "https://dashboard.stripe.com/webhooks",
    freeTier: "n/a — issued with the webhook endpoint",
  },
  NEXT_PUBLIC_SUPABASE_URL: {
    provider: "Supabase",
    category: "Infrastructure",
    url: "https://supabase.com/dashboard/project/_/settings/api",
    freeTier: "yes — a free project tier",
  },
  NEXT_PUBLIC_SUPABASE_ANON_KEY: {
    provider: "Supabase",
    category: "Infrastructure",
    url: "https://supabase.com/dashboard/project/_/settings/api",
    freeTier: "yes — issued with the project",
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    provider: "Supabase",
    category: "Infrastructure",
    url: "https://supabase.com/dashboard/project/_/settings/api",
    freeTier: "yes — issued with the project",
  },
  TELEGRAM_BOT_TOKEN: {
    provider: "Telegram",
    category: "Infrastructure",
    url: "https://core.telegram.org/bots#botfather",
    freeTier: "yes — free",
  },
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: {
    provider: "Web Push (self-issued)",
    category: "Infrastructure",
    url: "https://www.npmjs.com/package/web-push#command-line",
    freeTier: "yes — generated locally, no account",
  },
  VAPID_PRIVATE_KEY: {
    provider: "Web Push (self-issued)",
    category: "Infrastructure",
    url: "https://www.npmjs.com/package/web-push#command-line",
    freeTier: "yes — generated locally, no account",
  },
  VAPID_SUBJECT: {
    provider: "Web Push (self-issued)",
    category: "Infrastructure",
    url: "https://datatracker.ietf.org/doc/html/rfc8292#section-2.1",
    freeTier: "n/a — a mailto: or https: URL you own",
  },
  GOOGLE_OAUTH_CLIENT_ID: {
    provider: "Google Cloud (Gmail/Calendar/Drive)",
    category: "Data",
    url: "https://console.cloud.google.com/apis/credentials",
    freeTier: "yes — OAuth credentials are free; API quotas apply",
  },
  GOOGLE_OAUTH_CLIENT_SECRET: {
    provider: "Google Cloud (Gmail/Calendar/Drive)",
    category: "Data",
    url: "https://console.cloud.google.com/apis/credentials",
    freeTier: "yes — issued with the client id",
  },
  SLACK_CLIENT_ID: {
    provider: "Slack",
    category: "Data",
    url: "https://api.slack.com/apps",
    freeTier: "yes — app credentials are free",
  },
  SLACK_CLIENT_SECRET: {
    provider: "Slack",
    category: "Data",
    url: "https://api.slack.com/apps",
    freeTier: "yes — issued with the client id",
  },
  INTEGRATION_ENCRYPTION_KEY: {
    provider: "self-issued",
    category: "Data",
    url: "openssl rand -base64 32",
    freeTier: "yes — generated locally, no account",
  },
  CRON_SECRET: {
    provider: "self-issued",
    category: "Infrastructure",
    url: "openssl rand -hex 32",
    freeTier: "yes — generated locally, no account",
  },
};

// --- what the app itself says, read out of env-check.ts ---------------
//
// PARSED, not imported: env-check.ts is `import "server-only"` and pulls
// in the logging stack, so a script cannot load it. The shape is a flat
// array of object literals, which is regular enough to read exactly —
// and the both-ways check below is what catches a parse that stops
// working, because an empty scrape would otherwise agree with every
// claim this file makes.
const src = readFileSync("src/lib/env-check.ts", "utf8");
const body = src.slice(src.indexOf("export const ENV_REQUIREMENTS"));
const entries = new Map();
for (const m of body.matchAll(/name:\s*"([A-Z][A-Z0-9_]*)"/g)) {
  const from = m.index;
  const next = body.indexOf('name: "', from + 8);
  const chunk = body.slice(from, next === -1 ? from + 900 : next);
  entries.set(m[1], {
    level: chunk.match(/level:\s*"(required|recommended|optional)"/)?.[1] ?? "?",
    what: chunk.match(/what:\s*\n?\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? "",
    fallback: chunk.match(/fallback:\s*\n?\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? "",
  });
}

let problems = 0;
if (entries.size < 40) {
  console.error(`the env-check scrape found only ${entries.size} entries — it has stopped parsing, and every row below would be missing`);
  process.exit(1);
}
for (const name of Object.keys(PROVIDERS)) {
  if (!entries.has(name)) {
    console.error(`STALE: ${name} is in this file's PROVIDERS table and no longer in src/lib/env-check.ts`);
    problems++;
  }
}
// A key-shaped variable the app reads and this file does not name. The
// test is the NAME, deliberately crude: a variable called *_API_KEY,
// *_SECRET, *_TOKEN or *_ACCESS_KEY is a credential for something
// outside this codebase, and one that is not in the table above is one
// nobody has written a sign-up URL for.
const KEYISH = /_API_KEY$|_SECRET$|_TOKEN$|_ACCESS_KEY$|_CLIENT_ID$|_PRIVATE_KEY$|_ANON_KEY$|_SERVICE_ROLE_KEY$/;
for (const [name] of entries) {
  if (KEYISH.test(name) && !PROVIDERS[name]) {
    console.error(`UNLISTED: ${name} is a credential env-check knows about and this file does not — add it with a provider and a URL`);
    problems++;
  }
}

const rows = Object.entries(PROVIDERS)
  .map(([name, p]) => ({ name, ...p, ...entries.get(name) }))
  .sort((a, b) => a.category.localeCompare(b.category) || a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));

const CATEGORIES = ["Models", "Image/Video/Audio", "Infrastructure", "Data"];
if (process.argv.includes("--md")) {
  console.log(`<!-- generated by scripts/connectable-keys.mjs — provider facts checked ${CHECKED} -->\n`);
  for (const cat of CATEGORIES) {
    console.log(`### ${cat}\n`);
    console.log("| Provider | env var | Turns on | Silent without it | Free tier | Where |");
    console.log("|---|---|---|---|---|---|");
    for (const r of rows.filter((x) => x.category === cat)) {
      console.log(`| ${r.provider} | \`${r.name}\` | ${r.what} | ${r.fallback || "—"} | ${r.freeTier} | ${r.url} |`);
    }
    console.log("");
  }
} else {
  for (const cat of CATEGORIES) {
    console.log(`\n== ${cat} ==`);
    for (const r of rows.filter((x) => x.category === cat)) {
      console.log(`\n  ${r.name}   [${r.level}]  ${r.provider}`);
      console.log(`      turns on : ${r.what}`);
      console.log(`      without  : ${r.fallback || "(env-check records no fallback)"}`);
      console.log(`      free tier: ${r.freeTier}`);
      console.log(`      where    : ${r.url}`);
    }
  }
  console.log(
    `\n  ${rows.length} connectable credentials across ${CATEGORIES.length} categories · ` +
      `names, levels and behaviour from src/lib/env-check.ts · provider facts checked ${CHECKED}`
  );
  console.log("  no prices here on purpose — see this file's header.");
}
process.exit(problems === 0 ? 0 : 1);
