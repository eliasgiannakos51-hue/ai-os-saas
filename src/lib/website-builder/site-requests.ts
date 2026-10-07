import { fetchWithAuthRetry } from "@/lib/fetch-with-auth-retry";
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
 */

export const SITE_POLL_INTERVAL_MS = 2500;

export const isSiteRunning = (w: UserWebsite | null | undefined): boolean =>
  Boolean(w && (w.status === "pending" || w.status === "processing"));

export type SiteStart =
  | { kind: "questions"; questions: string[] }
  | { kind: "started"; record: UserWebsite }
  /** The server answered but made nothing (an off-topic brief, a duplicate refused) — with its sentence. */
  | { kind: "notMade"; message: string | null }
  /** Refused: the plan, the credits, the size — `error` is the server's own. */
  | { kind: "refused"; error: unknown };

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
  if (!res.ok || !data?.ok) return { kind: "refused", error: data?.error ?? null };
  if (data.needsClarification) return { kind: "questions", questions: (data.questions as string[]) ?? [] };
  if (!data.generated) return { kind: "notMade", message: typeof data.message === "string" ? data.message : null };
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
  /** "pageGone": the page was renamed or removed; "boxLost": the chosen part did not come back. */
  | { kind: "refused"; reason: "pageGone" | "boxLost" | "other"; error: unknown };

export async function requestSiteChange(input: { websiteId: string; changeRequest: string; section?: number | null }): Promise<SiteChange> {
  const res = await fetchWithAuthRetry("/api/websites/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      websiteId: input.websiteId,
      changeRequest: input.changeRequest,
      referenceImagePaths: [],
      pageSlug: "",
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
    return { kind: "refused", reason, error: data?.error ?? data?.message ?? null };
  }
  return { kind: "changed", record: data.record as UserWebsite };
}

/** Ask the worker to stop a site that is being made. True when the server took the request. */
export async function requestSiteStop(websiteId: string): Promise<boolean> {
  const res = await fetch(`/api/websites/${encodeURIComponent(websiteId)}/cancel`, { method: "POST" });
  return res.ok;
}
