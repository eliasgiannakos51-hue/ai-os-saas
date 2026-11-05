/**
 * WEB PUSH: WHERE A NOTIFICATION MAY GO, HOW LONG ONE SEND MAY TAKE, AND
 * HOW A SWEEP REACHES MANY PEOPLE WITHOUT ANY OF THEM WAITING ON ANOTHER.
 *
 * Pure, with the sender passed in, so scripts/tests/push-delivery.test.mjs
 * can run it against a sender that never answers. src/lib/push/web-push.ts
 * hands it the real one; src/app/api/push/subscribe/route.ts checks the
 * same allow-list before a subscription is stored.
 *
 * WHAT WAS WRONG (2026-11-05):
 *   - a subscription was any `https://` URL, so the sender would make a
 *     signed request to whatever host was stored, from our servers;
 *   - nothing capped how many one account stored, or how often it asked;
 *   - one send had no time limit, and three crons awaited one person's
 *     sends before starting the next person's.
 */

/** The push services the browsers this product supports actually use:
 *  Chrome and the Chromium family (FCM), Firefox (Mozilla autopush),
 *  Safari (Apple). Matched exactly. */
export const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"] as const;

/** Windows Notification Service mints a per-region host under this
 *  suffix (`wns2-par02p.notify.windows.com`), so it is matched as a suffix,
 *  dot included — `evilnotify.windows.com` does not end with it. */
export const PUSH_SERVICE_HOST_SUFFIXES = [".notify.windows.com"] as const;

/** Longer than any endpoint a push service mints. */
export const MAX_PUSH_ENDPOINT_LENGTH = 2000;

/** Subscriptions kept per account; the oldest goes when an eleventh
 *  arrives. Ten browsers is more than one person uses. */
export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;

/** One send, start to finish. Passed to web-push as its socket timeout
 *  AND enforced here around the whole send, because a socket timeout is
 *  an IDLE timeout: a server that answers a byte at a time never trips it. */
export const PUSH_SEND_TIMEOUT_MS = 10_000;

/** How many people a sweep sends to at once. */
export const PUSH_BATCH_CONCURRENCY = 16;

/** Is `endpoint` a URL minted by one of the push services above? */
export function isAllowedPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > MAX_PUSH_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  // `https://fcm.googleapis.com@elsewhere/` is a URL whose HOST is
  // elsewhere; a credential part is never in a real endpoint.
  if (url.username !== "" || url.password !== "") return false;
  if (url.port !== "") return false;
  const host = url.hostname;
  if ((PUSH_SERVICE_HOSTS as readonly string[]).includes(host)) return true;
  return PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => host.length > suffix.length && host.endsWith(suffix));
}

/** The two keys a browser hands over, base64url. A P-256 public key is
 *  87 characters and an auth secret 22; anything far outside that, or
 *  outside the alphabet, is not a key. */
export function isPushKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 200 && /^[A-Za-z0-9_-]+=*$/.test(value);
}

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown; timedOut: boolean };

/** `work`, or a timeout after `ms`, whichever comes first. Never rejects;
 *  a rejection of `work` after the deadline is handled, not left to
 *  surface as an unhandled one. */
export function withDeadline<T>(work: PromiseLike<T>, ms: number): Promise<Settled<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: new Error(`timed out after ${ms} ms`), timedOut: true }), ms);
    Promise.resolve(work).then(
      (value) => {
        clearTimeout(timer);
        resolve({ ok: true, value });
      },
      (error) => {
        clearTimeout(timer);
        resolve({ ok: false, error, timedOut: false });
      }
    );
  });
}

export type PushRow = { id: string; endpoint: string; p256dh: string; auth: string };

export type DeliveryTally = {
  sent: number;
  failed: number;
  revoked: number;
  /** Rows whose endpoint is not a known push service: never sent to,
   *  marked revoked so they are not read again. */
  refused: number;
  /** Counted in `failed` as well. */
  timedOut: number;
};

/**
 * Sends to each of `rows` at once, each bounded by `timeoutMs`, at most
 * MAX_PUSH_SUBSCRIPTIONS_PER_USER of them. Never throws.
 */
export async function deliverToSubscriptions(
  rows: PushRow[],
  deps: {
    send: (row: PushRow) => PromiseLike<unknown>;
    revoke: (id: string) => PromiseLike<unknown>;
    onError?: (error: unknown, status: number | null) => void;
    timeoutMs?: number;
  }
): Promise<DeliveryTally> {
  const tally: DeliveryTally = { sent: 0, failed: 0, revoked: 0, refused: 0, timedOut: 0 };
  const timeoutMs = deps.timeoutMs ?? PUSH_SEND_TIMEOUT_MS;
  const revoke = async (id: string) => {
    try {
      await deps.revoke(id);
    } catch (err) {
      deps.onError?.(err, null);
    }
  };

  await Promise.all(
    rows.slice(0, MAX_PUSH_SUBSCRIPTIONS_PER_USER).map(async (row) => {
      if (!isAllowedPushEndpoint(row.endpoint)) {
        tally.refused += 1;
        await revoke(row.id);
        return;
      }
      // Through a then(), so a sender that throws synchronously is a
      // failed send rather than an exception out of this function.
      const outcome = await withDeadline(
        Promise.resolve().then(() => deps.send(row)),
        timeoutMs
      );
      if (outcome.ok) {
        tally.sent += 1;
        return;
      }
      if (outcome.timedOut) {
        tally.timedOut += 1;
        tally.failed += 1;
        deps.onError?.(outcome.error, null);
        return;
      }
      // 404/410 mean the browser threw the subscription away — the
      // endpoint is dead forever, so mark it revoked instead of retrying
      // it on every future send.
      const status = (outcome.error as { statusCode?: number } | null)?.statusCode ?? null;
      if (status === 404 || status === 410) {
        tally.revoked += 1;
        await revoke(row.id);
        return;
      }
      tally.failed += 1;
      deps.onError?.(outcome.error, status);
    })
  );
  return tally;
}

export type PushBatch = {
  /** Queues `task`; at most PUSH_BATCH_CONCURRENCY run at once. */
  add(task: () => PromiseLike<unknown>): void;
  /** Waits for every queued task, or `budgetMs`, whichever is first.
   *  Tasks not started by then are dropped. Never rejects. */
  settle(budgetMs?: number): Promise<{ finished: number; abandoned: number }>;
};

/**
 * Pushes queued during a sweep and sent alongside it, so one person's
 * slow push service is never the reason the next person waits — or the
 * reason the sweep runs out of time before it reaches them.
 */
export function createPushBatch(concurrency: number = PUSH_BATCH_CONCURRENCY): PushBatch {
  const limit = Math.max(1, Math.floor(concurrency));
  const waiting: (() => void)[] = [];
  const all: Promise<void>[] = [];
  let active = 0;
  let finished = 0;

  const pump = () => {
    while (active < limit && waiting.length > 0) waiting.shift()!();
  };

  return {
    add(task) {
      all.push(
        new Promise<void>((resolve) => {
          waiting.push(() => {
            active += 1;
            Promise.resolve()
              .then(task)
              .then(
                () => undefined,
                () => undefined
              )
              .then(() => {
                active -= 1;
                finished += 1;
                resolve();
                pump();
              });
          });
          pump();
        })
      );
    },
    async settle(budgetMs) {
      const everything = Promise.all(all).then(() => undefined);
      if (budgetMs === undefined) {
        await everything;
      } else {
        await withDeadline(everything, Math.max(0, budgetMs));
        waiting.length = 0;
      }
      return { finished, abandoned: all.length - finished };
    },
  };
}
