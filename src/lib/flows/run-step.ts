import { startSiteGeneration, watchSite } from "@/lib/website-builder/site-requests";
import { POST_PLATFORMS, MAX_DESCRIPTION_CHARS as MAX_POSTS_CHARS } from "@/lib/posts/platforms";
import { DEFAULT_SLIDES, MAX_DECK_DESCRIPTION_CHARS as MAX_DECK_CHARS } from "@/lib/presentations/deck";
import { MAX_TOPIC_CHARS } from "@/lib/research/research-limits";
import { MAX_IMAGE_DESCRIPTION_CHARS } from "@/lib/images/image-studio";
import type { FlowKind } from "@/lib/flows/plan";

/**
 * EACH STEP OF A FLOW, THROUGH ITS TOOL'S OWN REQUESTS (package 36).
 *
 * Nothing here makes anything itself: the site is asked of
 * api/websites/generate exactly as the Site asks it (lib/website-builder/
 * site-requests.ts), the pictures of api/images/generate, the posts of
 * api/posts/generate, the research of api/research and its run, the deck
 * of api/presentations/generate — from the research, when there is one —
 * and the analysis of api/data-analysis. So each step is priced, refused,
 * charged and saved by the tool that makes it, the same as on its page.
 *
 * A step that makes something says WHICH row (`row`), and the flow route
 * puts that row in the project. A site and a research run for minutes on
 * the server after they start: their row is known at the start, so a flow
 * that is closed half-way can be followed again from the row.
 *
 * Client-safe. A refusal comes back as a CODE the screen says in words.
 */
export type StepOutcome = { ok: true; row: string } | { ok: false; error: string };

export type StepInput = {
  kind: FlowKind;
  brief: string;
  name: string;
  locale: string;
  /** The research this deck is made from, when the flow made one. */
  researchId?: string | null;
  /** The file an analysis reads. */
  file?: File | null;
  /** The row a step that started earlier made: followed, not started again. */
  startedRow?: string | null;
  /** Told the row as soon as it exists, before it is finished. */
  onStarted?: (row: string) => void;
  alive: () => boolean;
};

const POLL_MS = 3000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(url: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, data: (await response.json().catch(() => null)) as Record<string, unknown> | null };
}

/** The refusal a tool answered, as one code. */
function codeOf(status: number, data: Record<string, unknown> | null): string {
  if (status === 402 || data?.error === "insufficient_credits" || data?.code === "insufficient_credits") return "no_credits";
  if (status === 403 && (data?.code === "not_enabled" || data?.code === "not_included" || data?.error === "upgrade_required")) return "not_included";
  if (status === 503 && (data?.code === "not_configured" || data?.error === "not_configured")) return "not_configured";
  if (status === 429) return "rate_limited";
  return "failed";
}

function site(input: StepInput): Promise<StepOutcome> {
  return new Promise((resolve) => {
    const follow = (id: string) =>
      watchSite(id, {
        alive: input.alive,
        onRecord: () => undefined,
        onDone: (record) => resolve(record.status === "completed" ? { ok: true, row: record.id } : { ok: false, error: "failed" }),
      });
    if (input.startedRow) return follow(input.startedRow);
    startSiteGeneration({ name: input.name, description: input.brief, skipClarification: true })
      .then((start) => {
        if (start.kind !== "started") return resolve({ ok: false, error: start.kind === "refused" ? "refused" : "failed" });
        input.onStarted?.(start.record.id);
        follow(start.record.id);
      })
      .catch(() => resolve({ ok: false, error: "offline" }));
  });
}

async function research(input: StepInput): Promise<StepOutcome> {
  let id = input.startedRow ?? null;
  if (!id) {
    const made = await post("/api/research", { topic: input.brief.slice(0, MAX_TOPIC_CHARS), language: input.locale });
    const report = made.data?.report as { id?: string } | undefined;
    if (!made.data?.ok || !report?.id) return { ok: false, error: codeOf(made.status, made.data) };
    id = report.id;
    input.onStarted?.(id);
    // The run goes on on the server; its answer is only whether it started.
    const run = await post(`/api/research/${id}/run`, {});
    if (run.data && run.data.ok === false) return { ok: false, error: codeOf(run.status, run.data) };
  }
  while (input.alive()) {
    await sleep(POLL_MS);
    const response = await fetch(`/api/research/${id}`).catch(() => null);
    const data = response ? ((await response.json().catch(() => null)) as { ok?: boolean; report?: { status?: string } } | null) : null;
    const status = data?.report?.status;
    if (status === "ready") return { ok: true, row: id };
    if (status === "failed") return { ok: false, error: "failed" };
  }
  return { ok: false, error: "stopped" };
}

async function analysis(input: StepInput): Promise<StepOutcome> {
  let id = input.startedRow ?? null;
  if (!id) {
    if (!input.file) return { ok: false, error: "no_file" };
    const form = new FormData();
    form.append("file", input.file);
    const response = await fetch("/api/data-analysis/upload", { method: "POST", body: form });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || typeof data?.id !== "string") return { ok: false, error: codeOf(response.status, data) };
    id = data.id;
    input.onStarted?.(id);
  }
  const done = await post(`/api/data-analysis/${id}/analyse`, {});
  return done.status < 300 ? { ok: true, row: id } : { ok: false, error: codeOf(done.status, done.data) };
}

export async function runStep(input: StepInput): Promise<StepOutcome> {
  try {
    switch (input.kind) {
      case "site":
        return await site(input);
      case "research":
        return await research(input);
      case "analysis":
        return await analysis(input);
      case "images": {
        const r = await post("/api/images/generate", { description: input.brief.slice(0, MAX_IMAGE_DESCRIPTION_CHARS), aspect: "1:1" });
        const image = r.data?.image as { id?: string } | undefined;
        return r.data?.ok && image?.id ? { ok: true, row: image.id } : { ok: false, error: codeOf(r.status, r.data) };
      }
      case "posts": {
        const r = await post("/api/posts/generate", { description: input.brief.slice(0, MAX_POSTS_CHARS), platforms: [...POST_PLATFORMS], locale: input.locale });
        return r.data?.ok && typeof r.data.id === "string" ? { ok: true, row: r.data.id } : { ok: false, error: codeOf(r.status, r.data) };
      }
      case "slides": {
        const r = await post("/api/presentations/generate", {
          description: input.brief.slice(0, MAX_DECK_CHARS),
          slideCount: DEFAULT_SLIDES,
          imageSource: "none",
          locale: input.locale,
          ...(input.researchId ? { researchId: input.researchId } : {}),
        });
        return r.data?.ok && typeof r.data.id === "string" ? { ok: true, row: r.data.id } : { ok: false, error: codeOf(r.status, r.data) };
      }
    }
  } catch {
    return { ok: false, error: "offline" };
  }
}
