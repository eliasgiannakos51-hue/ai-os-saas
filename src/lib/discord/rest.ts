/**
 * DISCORD'S REST API, WITH ITS RATE LIMITS RESPECTED (the owner's Discord
 * directive, 2026-11-05).
 *
 * One client for every call this product makes to
 * https://discord.com/api/v10 with the bot token: the apply, the undo,
 * the connect's check, the slash command's answer, an automation's
 * message. Nothing else in the tree builds a Discord API URL.
 *
 * RATE LIMITS, THE WAY DISCORD DOCUMENTS THEM
 * (https://discord.com/developers/docs/topics/rate-limits):
 *   - every response may carry X-RateLimit-Bucket, -Remaining and
 *     -Reset-After; when a bucket says 0 remaining, the next request on
 *     that route waits until it resets, instead of being sent to fail;
 *   - a 429 carries `retry_after` (seconds) in its body and Retry-After in
 *     its headers, and `global: true` when the whole bot must wait; the
 *     request is retried after that, at most MAX_RETRIES times;
 *   - a wait longer than maxWaitMs is NOT slept through: the call fails
 *     as `rate_limited`, so an apply stops and says what it made rather
 *     than outliving its function.
 *
 * `fetchImpl`, `sleep` and `now` are injectable so
 * scripts/tests/discord-bot.test.mjs can run this against a stand-in
 * Discord that answers 429s, with no clock and no network.
 */

export const DISCORD_API = "https://discord.com/api/v10";
const MAX_RETRIES = 3;
const DEFAULT_MAX_WAIT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 15_000;

export type DiscordOk<T> = { ok: true; status: number; body: T };
export type DiscordFail = {
  ok: false;
  status: number;
  /** Discord's own JSON error code (10003 Unknown Channel, 50013 Missing Permissions…), when it sent one. */
  code: number | null;
  reason: "rate_limited" | "not_found" | "forbidden" | "refused" | "unavailable" | "network";
};
export type DiscordResult<T> = DiscordOk<T> | DiscordFail;

type Bucket = { remaining: number; resetAt: number };

export type DiscordRestOptions = {
  /** "Bot <token>", or "Bearer …" — the whole Authorization header value. Omit for the interaction webhooks, which take none. */
  authorization?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  maxWaitMs?: number;
};

/** The route a bucket belongs to: method, and the path with every id but the major one (guild, channel, webhook) generalised. */
export function routeKey(method: string, path: string): string {
  const parts = path.split("/");
  const out = parts.map((seg, i) => (/^\d{15,22}$/.test(seg) && !["guilds", "channels", "webhooks"].includes(parts[i - 1] ?? "") ? ":id" : seg));
  return `${method.toUpperCase()} ${out.join("/")}`;
}

export class DiscordRest {
  private readonly buckets = new Map<string, Bucket>();
  private readonly bucketOfRoute = new Map<string, string>();
  private globalUntil = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxWaitMs: number;

  constructor(private readonly options: DiscordRestOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => Date.now());
    this.maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  }

  /** How long the next request on this route must wait, in ms (0 = go). */
  private waitFor(route: string): number {
    const now = this.now();
    let wait = Math.max(0, this.globalUntil - now);
    const id = this.bucketOfRoute.get(route);
    const bucket = id ? this.buckets.get(id) : undefined;
    if (bucket && bucket.remaining <= 0 && bucket.resetAt > now) wait = Math.max(wait, bucket.resetAt - now);
    return wait;
  }

  private remember(route: string, headers: Headers): void {
    const id = headers.get("x-ratelimit-bucket");
    const remaining = Number(headers.get("x-ratelimit-remaining"));
    const resetAfter = Number(headers.get("x-ratelimit-reset-after"));
    if (!id || !Number.isFinite(remaining) || !Number.isFinite(resetAfter)) return;
    this.bucketOfRoute.set(route, id);
    this.buckets.set(id, { remaining, resetAt: this.now() + Math.ceil(resetAfter * 1000) });
  }

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<DiscordResult<T>> {
    const route = routeKey(method, path);
    for (let attempt = 0; ; attempt++) {
      const wait = this.waitFor(route);
      if (wait > this.maxWaitMs) return { ok: false, status: 429, code: null, reason: "rate_limited" };
      if (wait > 0) await this.sleep(wait);

      let res: Response;
      try {
        const headers: Record<string, string> = { "User-Agent": "DiscordBot (https://ionexa.ai, 1)" };
        if (this.options.authorization) headers.Authorization = this.options.authorization;
        if (body !== undefined) headers["Content-Type"] = "application/json";
        res = await this.fetchImpl(`${DISCORD_API}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        if (attempt < MAX_RETRIES) {
          await this.sleep(1000);
          continue;
        }
        return { ok: false, status: 0, code: null, reason: "network" };
      }
      this.remember(route, res.headers);

      if (res.status === 429) {
        const payload = (await res.json().catch(() => null)) as { retry_after?: number; global?: boolean } | null;
        const seconds = Number(payload?.retry_after ?? res.headers.get("retry-after") ?? 1);
        const ms = Math.ceil((Number.isFinite(seconds) && seconds > 0 ? seconds : 1) * 1000);
        if (payload?.global || res.headers.get("x-ratelimit-global")) this.globalUntil = this.now() + ms;
        else {
          const id = this.bucketOfRoute.get(route);
          if (id) this.buckets.set(id, { remaining: 0, resetAt: this.now() + ms });
          else this.globalUntil = Math.max(this.globalUntil, this.now() + ms);
        }
        if (attempt >= MAX_RETRIES || ms > this.maxWaitMs) return { ok: false, status: 429, code: null, reason: "rate_limited" };
        continue;
      }
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        await this.sleep(1000 * (attempt + 1));
        continue;
      }
      if (res.ok) {
        const parsed = res.status === 204 ? null : await res.json().catch(() => null);
        return { ok: true, status: res.status, body: parsed as T };
      }
      const err = (await res.json().catch(() => null)) as { code?: number } | null;
      const code = typeof err?.code === "number" ? err.code : null;
      return {
        ok: false,
        status: res.status,
        code,
        reason: res.status === 404 ? "not_found" : res.status === 403 || res.status === 401 ? "forbidden" : res.status >= 500 ? "unavailable" : "refused",
      };
    }
  }
}
