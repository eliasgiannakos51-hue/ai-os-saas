/**
 * EVERY PROVIDER KEY THE OWNER HAS SET, WHAT IT IS FOR, WHETHER ANY CODE
 * READS IT, AND HOW TO TELL IF IT WORKS.
 *
 * The owner's question of 2026-10-03 (docs/v6-master.md, §1.0): nine keys
 * sit in Vercel — Anthropic, OpenAI, Groq, Deepgram, ElevenLabs, BFL/Flux,
 * Ideogram, Runway, VAPID — and four of them are read by nothing. A key
 * that is set and read by nothing looks exactly like a working feature
 * from the settings page, so this table says which is which, and
 * scripts/tests/key-inventory.test.mjs holds `readBy` to the code BOTH
 * ways: every file named must read one of the entry's variables, and an
 * entry that says no file reads it must be true of the whole of src/.
 *
 * NO VALUES. Nothing here reads process.env; checkKey() is handed the
 * value by the server route and returns a status. The key never leaves the
 * function that used it, and never reaches a log, a response or the
 * browser.
 *
 * THE CHECKS COST NOTHING. Each is a read of a list or an account — the
 * models a key can see, the projects it belongs to — never a generation.
 * Where a provider has no such call (Ideogram) the entry says so and the
 * status is "no-check", rather than spending money to find out.
 */

export type KeyId =
  | "anthropic"
  | "openai"
  | "groq"
  | "google"
  | "deepgram"
  | "elevenlabs"
  | "bfl"
  | "ideogram"
  | "runway"
  | "vapid";

export type KeyCheckSpec = {
  url: string;
  /** Headers carrying the key. A function so the key is never stored. */
  headers: (key: string) => Record<string, string>;
};

export type KeyEntry = {
  id: KeyId;
  label: string;
  /** Accepted variable names, canonical first. The first one set is used. */
  envVars: string[];
  /** The role the owner gave it (docs/v6-master.md, §1.0). */
  roles: string[];
  /** Repo paths whose code reads one of `envVars`. Empty = nothing reads it. */
  readBy: string[];
  /** What is missing before the role is real. Null when nothing is. */
  missing: string | null;
  /** The cheap validity call, or null when the provider offers none. */
  check: KeyCheckSpec | null;
};

export const KEY_INVENTORY: KeyEntry[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    envVars: ["ANTHROPIC_API_KEY"],
    roles: ["Opus: hard work, design, code, review, judge", "Sonnet: most work — chat, sites, documents", "Haiku: classification, summaries, titles"],
    readBy: ["src/lib/ai/providers/registry.ts"],
    missing: null,
    check: {
      url: "https://api.anthropic.com/v1/models?limit=1",
      headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
    },
  },
  {
    id: "openai",
    label: "OpenAI",
    envVars: ["OPENAI_API_KEY"],
    roles: ["second, blind judge", "failover for text", "Whisper: transcription fallback"],
    readBy: ["src/lib/ai/providers/registry.ts", "src/lib/voice/voice-providers.ts"],
    missing: "The blind-judge role does not exist yet (Evaluation Lab, V6.2).",
    check: { url: "https://api.openai.com/v1/models", headers: (key) => ({ authorization: `Bearer ${key}` }) },
  },
  {
    id: "groq",
    label: "Groq",
    envVars: ["GROQ_API_KEY"],
    roles: ["speed: routing, voice cards", "failover for text"],
    readBy: ["src/lib/ai/providers/registry.ts"],
    missing: "Only failover today; nothing routes to it for speed yet.",
    check: { url: "https://api.groq.com/openai/v1/models", headers: (key) => ({ authorization: `Bearer ${key}` }) },
  },
  {
    id: "google",
    label: "Google Gemini",
    envVars: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    roles: ["Nano Banana Pro: images", "Veo 3.1: video", "failover for text"],
    readBy: ["src/lib/ai/providers/registry.ts"],
    missing: "Not set in Vercel as of 2026-10-03. Images and video have no adapter in src/ yet.",
    check: {
      url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
      headers: (key) => ({ "x-goog-api-key": key }),
    },
  },
  {
    id: "deepgram",
    label: "Deepgram",
    envVars: ["DEEPGRAM_API_KEY"],
    roles: ["transcription (meetings)"],
    readBy: [],
    missing: "No adapter. Greek support is unverified — Deepgram's language list is blocked from the build environment, so it is tested with a real Greek recording before it replaces Whisper.",
    check: { url: "https://api.deepgram.com/v1/projects", headers: (key) => ({ authorization: `Token ${key}` }) },
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    envVars: ["ELEVENLABS_API_KEY"],
    roles: ["voice: reading aloud, voice-over"],
    readBy: ["src/lib/voice/voice-providers.ts"],
    missing: null,
    check: { url: "https://api.elevenlabs.io/v1/models", headers: (key) => ({ "xi-api-key": key }) },
  },
  {
    id: "bfl",
    label: "Black Forest Labs (Flux)",
    envVars: ["BFL_API_KEY"],
    roles: ["photorealistic images"],
    readBy: [],
    missing: "No adapter; the Images page has no generator. The owner's decision of 2026-10-03 routes images through Gemini first.",
    check: { url: "https://api.bfl.ai/v1/credits", headers: (key) => ({ "x-key": key }) },
  },
  {
    id: "ideogram",
    label: "Ideogram",
    envVars: ["IDEOGRAM_API_KEY"],
    roles: ["images with text: posters, posts, logos"],
    readBy: [],
    missing: "No adapter.",
    // Ideogram has no read-only call: every endpoint generates, and costs.
    check: null,
  },
  {
    id: "runway",
    label: "Runway",
    envVars: ["RUNWAYML_API_SECRET"],
    roles: ["— (owner, 2026-10-03: video through Gemini only)"],
    readBy: [],
    missing: "Not to be wired: the owner chose Gemini only for video.",
    check: {
      url: "https://api.dev.runwayml.com/v1/organization",
      headers: (key) => ({ authorization: `Bearer ${key}`, "x-runway-version": "2024-11-06" }),
    },
  },
  {
    id: "vapid",
    label: "Web Push (VAPID)",
    envVars: ["VAPID_PRIVATE_KEY"],
    roles: ["push notifications"],
    readBy: ["src/lib/push/web-push.ts"],
    missing: null,
    // Not an API key: a signing key. There is no provider to ask.
    check: null,
  },
];

export type KeyStatus =
  | "ok" // the provider accepted the key
  | "invalid" // 401: the provider does not know this key
  | "forbidden" // 403: the key is real but may not make this call
  | "rate-limited" // 429: accepted, but out of quota right now
  | "unknown-endpoint" // 404: the check URL is wrong, not the key
  | "unreachable" // network error, timeout or 5xx
  | "not-set"
  | "no-check";

export type KeyCheckResult = { id: KeyId; envVar: string | null; status: KeyStatus; httpStatus: number | null };

/** The first of the entry's variables that is set, by NAME only. */
export function keyVarFor(entry: KeyEntry, env: Record<string, string | undefined>): string | null {
  for (const name of entry.envVars) if ((env[name] ?? "").trim() !== "") return name;
  return null;
}

export function statusFromHttp(status: number): KeyStatus {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401) return "invalid";
  if (status === 403) return "forbidden";
  if (status === 404) return "unknown-endpoint";
  if (status === 429) return "rate-limited";
  return "unreachable";
}

/**
 * One cheap call. Returns a status and the HTTP code — never the key, never
 * the provider's response body (which can echo request headers back).
 */
export async function checkKey(
  entry: KeyEntry,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 8000
): Promise<KeyCheckResult> {
  const envVar = keyVarFor(entry, env);
  if (!envVar) return { id: entry.id, envVar: null, status: "not-set", httpStatus: null };
  if (!entry.check) return { id: entry.id, envVar, status: "no-check", httpStatus: null };
  const key = (env[envVar] ?? "").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(entry.check.url, { method: "GET", headers: entry.check.headers(key), signal: controller.signal, cache: "no-store" });
    return { id: entry.id, envVar, status: statusFromHttp(res.status), httpStatus: res.status };
  } catch {
    return { id: entry.id, envVar, status: "unreachable", httpStatus: null };
  } finally {
    clearTimeout(timer);
  }
}
