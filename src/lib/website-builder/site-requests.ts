import { fetchWithAuthRetry } from "@/lib/fetch-with-auth-retry";
import { ApiError } from "@/lib/errors/api-error";
import type { ApiErrorPayload } from "@/lib/errors/error-codes";
import type { UserWebsite } from "@/types/user-website";

/**
 * THE SITE'S REQUESTS, ONCE, FOR EVERY SCREEN THAT MAKES A SITE.
 *
 * The Site shell (components/website-builder/website-shell.tsx) and the
 * Site opened beside Chat (components/chat/site-pane.tsx, package 7) make a
 * site the same way: ask /api/websites/generate (which may answer with
 * questions first), hand the row to /api/websites/generate/process, and
 * watch /api/websites/status until it is done; a finished site is changed
 * through /api/websites/edit. Written once here, so the two cannot drift
 * into charging, asking or saving differently. Held by
 * scripts/tests/tool-shell.test.mjs and scripts/tests/chat-opens-tools.test.mjs.
 *
 * Client-safe. A network failure is THROWN (a TypeError from fetch), so
 * each screen says it in its own words; everything the server answered is
 * returned as a value.
 *
 * A REFUSAL IS AN ApiError (lib/errors/api-error.ts): its status, its code
 * and whether the credits came back, so a screen says it through
 * lib/errors/use-error-text.ts in the reader's language. The routes'
 * `error` and `message` are English sentences for logs and a curl; shown
 * as they were, a Greek screen read «Not enough credits (you have: 0,
 * need: 15)» and, when the provider was down, the provider's own JSON
 * (found 2026-10-08 by scripts/tests/site-pages-edges.prodtest.mjs and
 * scripts/tests/tool-shell-edges.prodtest.mjs). Beside it, the route's own
 * `code` and, out of credits, the two numbers it sends, which Chat's Site
 * pane says with the credits notice (components/chat/site-pane.tsx).
 */

export const SITE_POLL_INTERVAL_MS = 2500;

export const isSiteRunning = (w: UserWebsite | null | undefined): boolean =>
  Boolean(w && (w.status === "pending" || w.status === "processing"));

export type SiteStart =
  | { kind: "questions"; questions: string[] }
  | { kind: "started"; record: UserWebsite }
  /**
   * The server answered but made nothing: a brief that is not a website
   * (`offTopic`), with the classifier's sentence — which may be its
   * English default (lib/website-builder.ts, DEFAULT_OFF_TOPIC_MESSAGE).
   */
  | { kind: "notMade"; offTopic: boolean; message: string | null }
  /**
   * Refused: the plan, the credits, today's limit, the size, a failure.
   * `code` is the route's own ("not_included" when the plan has no Site,
   * "insufficientCredits" when the balance is short, with `available` and
   * `needed`).
   */
  | ({ kind: "refused"; error: ApiError } & RouteSaid);

/** What the route named, beside the ApiError: its own code and, out of credits, the two numbers. */
type RouteSaid = { code: string | null; available: number | null; needed: number | null };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
function routeSaid(data: Record<string, unknown> | null): RouteSaid {
  return { code: str(data?.code), available: num(data?.available), needed: num(data?.needed) };
}

/**
 * A refusal the routes answer with 200 and `rateLimited` — before any work,
 * so nothing was charged. Short credits are a 402 in lib/errors/error-codes.ts
 * terms (the route names them with `code: "insufficientCredits"`); a limit
 * is a 429.
 */
function refusedBeforeWork(data: { code?: unknown; message?: unknown } | null): ApiError {
  const short = data?.code === "insufficientCredits";
  return new ApiError(short ? 402 : 429, {
    error: typeof data?.message === "string" ? data.message : undefined,
    code: short ? "insufficientCredits" : "rateLimited",
  });
}

/**
 * Any other refusal, as an ApiError whose `message` is the route's own
 * sentence, or empty when it gave none — what `error` was before it became
 * an ApiError. Chat's Site pane (components/chat/site-pane.tsx) still says
 * a refusal through getErrorMessage, which shows a message and falls back
 * to its own translated sentence on an empty one; with ApiError's default
 * it read «Request failed with 200» for a change the safety review held
 * back (found 2026-10-09). The shell reads only the status, the code and
 * the credits (lib/errors/use-error-text.ts).
 */
function refusal(status: number, data: ApiErrorPayload | null, prose: unknown): ApiError {
  return new ApiError(status, { ...(data ?? {}), error: typeof prose === "string" ? prose : "" });
}

export async function startSiteGeneration(input: {
  name: string;
  description: string;
  skipClarification: boolean;
}): Promise<SiteStart> {
  const res = await fetchWithAuthRetry("/api/websites/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name, description: input.description, referenceImagePaths: [], skipClarification: input.skipClarification }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) return { kind: "refused", error: refusal(res.status, data, data?.error), ...routeSaid(data) };
  if (data.needsClarification) return { kind: "questions", questions: (data.questions as string[]) ?? [] };
  if (!data.generated) {
    if (data.rateLimited) return { kind: "refused", error: refusedBeforeWork(data), ...routeSaid(data) };
    return { kind: "notMade", offTopic: data.offTopic === true, message: typeof data.message === "string" ? data.message : null };
  }
  const record = data.record as UserWebsite;
  // THE WORKER, fired and not awaited: it runs for minutes, and the
  // status is watched below. keepalive so leaving the page does not
  // cancel the hand-over. A duplicate the server suppressed already has
  // its worker.
  if (!data.duplicateSuppressed) {
    void fetch("/api/websites/generate/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ websiteId: record.id, description: input.description, referenceImagePaths: [] }),
    });
  }
  return { kind: "started", record };
}

/**
 * Watch one site until it stops running. `onRecord` hears every state it
 * passes through, `onDone` the last one with the usage to report. A
 * failed read is retried on the next tick; `alive` stops the watch when
 * the screen that started it is gone.
 */
export function watchSite(
  id: string,
  handlers: { alive: () => boolean; onRecord: (record: UserWebsite) => void; onDone: (record: UserWebsite, usage: unknown) => void }
): void {
  async function tick() {
    if (!handlers.alive()) return;
    let record: UserWebsite;
    let usage: unknown = null;
    try {
      const res = await fetch(`/api/websites/status?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (handlers.alive()) setTimeout(tick, SITE_POLL_INTERVAL_MS);
        return;
      }
      record = data.record as UserWebsite;
      usage = data;
    } catch {
      if (handlers.alive()) setTimeout(tick, SITE_POLL_INTERVAL_MS);
      return;
    }
    if (!handlers.alive()) return;
    handlers.onRecord(record);
    if (isSiteRunning(record)) {
      setTimeout(tick, SITE_POLL_INTERVAL_MS);
      return;
    }
    handlers.onDone(record, usage);
  }
  void tick();
}

export type SiteChange =
  | { kind: "changed"; record: UserWebsite }
  /**
   * "pageGone": the page was renamed or removed; "boxLost": the chosen part
   * did not come back; "held": the safety review kept the change back;
   * "busy": another change to this site is still being made; "other":
   * everything else, said from `error`. `code` is "insufficientCredits",
   * with the two numbers, when the balance is short — for a screen to say
   * it in its own language rather than the route's English sentence.
   */
  | ({ kind: "refused"; reason: "pageGone" | "boxLost" | "held" | "busy" | "other"; error: ApiError } & RouteSaid);

/**
 * A change in words. `pageSlug` names the page it is about ("" or absent:
 * the home page); `section` the part of THAT page, by number.
 */
export async function requestSiteChange(input: { websiteId: string; changeRequest: string; section?: number | null; pageSlug?: string }): Promise<SiteChange> {
  const res = await fetchWithAuthRetry("/api/websites/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      websiteId: input.websiteId,
      changeRequest: input.changeRequest,
      referenceImagePaths: [],
      pageSlug: input.pageSlug ?? "",
      ...(input.section === null || input.section === undefined ? {} : { section: input.section }),
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok || !data.edited) {
    const reason =
      data?.reason === "unknown_page" || data?.reason === "invalid_page"
        ? "pageGone"
        : data?.reason === "box_lost" || data?.reason === "bad_section"
          ? "boxLost"
          : data?.flagged === true
            ? "held"
            : data?.busy === true
              ? "busy"
              : "other";
    const error = res.ok && data?.ok && data.rateLimited ? refusedBeforeWork(data) : refusal(res.status, data, data?.error ?? data?.message);
    return { kind: "refused", reason, error, ...routeSaid(data) };
  }
  return { kind: "changed", record: data.record as UserWebsite };
}

/** Ask the worker to stop a site that is being made. True when the server took the request. */
export async function requestSiteStop(websiteId: string): Promise<boolean> {
  const res = await fetch(`/api/websites/${encodeURIComponent(websiteId)}/cancel`, { method: "POST" });
  return res.ok;
}

export type SiteUndo =
  | { kind: "undone"; record: UserWebsite }
  /** "nothing": the site is as first made; "busy": it is being made or changed. */
  | { kind: "refused"; reason: "nothing" | "busy" | "other" };

/** Take back the last change (api/websites/[id]/undo, package 10). Free. */
export async function requestSiteUndo(websiteId: string): Promise<SiteUndo> {
  const res = await fetchWithAuthRetry(`/api/websites/${encodeURIComponent(websiteId)}/undo`, { method: "POST" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok || !data.record) {
    return { kind: "refused", reason: data?.code === "nothing_to_undo" ? "nothing" : data?.code === "busy" ? "busy" : "other" };
  }
  return { kind: "undone", record: data.record as UserWebsite };
}
