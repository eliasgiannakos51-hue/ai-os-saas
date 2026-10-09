import { fetchWithAuthRetry } from "@/lib/fetch-with-auth-retry";
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
 * returned as a value — with its status and its body, because the
 * routes' `error` and `message` are English prose for logs, and a screen
 * says a refusal in its reader's language from the status and the code
 * (lib/errors/use-error-text.ts; held 2026-10-08 by
 * scripts/tests/tool-shell-edges.prodtest.mjs).
 */

export const SITE_POLL_INTERVAL_MS = 2500;

export const isSiteRunning = (w: UserWebsite | null | undefined): boolean =>
  Boolean(w && (w.status === "pending" || w.status === "processing"));

export type SiteStart =
  | { kind: "questions"; questions: string[] }
  | { kind: "started"; record: UserWebsite }
  /**
   * The server answered but made nothing (an off-topic brief, a duplicate
   * refused, no credits) — with its sentence, which is English. `code`
   * "insufficientCredits" and `rateLimited` say why when it was the balance
   * or the limits; out of credits, `available` and `needed` carry the two
   * numbers, for a screen to say it in its own language.
   */
  | { kind: "notMade"; message: string | null; code: string | null; rateLimited: boolean; available: number | null; needed: number | null }
  /** Refused: the plan, the credits, the size — `error` is the server's own; `code` is "not_included" when the plan has no Site. */
  | { kind: "refused"; error: unknown; status: number; body: ApiErrorPayload | null; code: string | null };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

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
  if (!res.ok || !data?.ok) return { kind: "refused", error: data?.error ?? null, status: res.status, body: data, code: str(data?.code) };
  if (data.needsClarification) return { kind: "questions", questions: (data.questions as string[]) ?? [] };
  if (!data.generated) {
    return { kind: "notMade", message: str(data.message), rateLimited: data.rateLimited === true, code: str(data.code), available: num(data.available), needed: num(data.needed) };
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
   * did not come back. `status` and `body` are the route's answer: 200 with
   * `edited: false` is a refusal said in the body (`code`, `rateLimited`,
   * `flagged`), anything else is said by the status. `code` is
   * "insufficientCredits", with the two numbers, when the balance is short —
   * for a screen to say it in its own language rather than the route's
   * English sentence.
   */
  | {
      kind: "refused";
      reason: "pageGone" | "boxLost" | "other";
      error: unknown;
      status: number;
      body: (ApiErrorPayload & Record<string, unknown>) | null;
      code: string | null;
      available: number | null;
      needed: number | null;
    };

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
          : "other";
    return { kind: "refused", reason, status: res.status, body: data, error: data?.error ?? data?.message ?? null, code: str(data?.code), available: num(data?.available), needed: num(data?.needed) };
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
