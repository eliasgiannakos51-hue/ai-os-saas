"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Copy, Play, Square, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { CostEstimateHint, useCostEstimate } from "@/components/credits/cost-estimate";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  MAX_DESCRIPTION_CHARS,
  PLATFORMS,
  POST_PLATFORMS,
  postClipboardText,
  postsEstimateInputChars,
  type Post,
  type PostPlatform,
  type PostSet,
} from "@/lib/posts/platforms";

export type PostRow = {
  id: string;
  description: string;
  platforms: PostPlatform[];
  /** Null for a run that failed — `error` says why. */
  set: PostSet | null;
  error: string | null;
  creditsCharged: number;
  createdAt: string;
};

/** The four things this page does not do, as identifiers the UI and the
 *  gate both read. The first is the one the name would otherwise promise. */
export const POST_LIMITS = ["no_publish", "no_scheduling", "no_images", "no_accounts"] as const;

type Selected = { id: string | null; set: PostSet; platforms: PostPlatform[]; creditsCharged: number };

/**
 * One copy button. Writes to the clipboard, says "Copied" for two
 * seconds, and says so when the browser refused — the text is still
 * selectable, so a refusal is a missing convenience, not a lost post.
 */
function CopyButton({ text, className }: { text: string; className?: string }) {
  // tCommon, not t: scripts/tests/i18n-coverage.test.mjs resolves a
  // translator by its NAME per file, and the workspace below names its
  // own `t` for the posts namespace.
  const tCommon = useTranslations("common");
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!text) {
      addToast(tCommon("copyNothing"), "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
      addToast(tCommon("copyFailed"), "error");
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={
        className ??
        "inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
      }
    >
      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      {copied ? tCommon("copied") : tCommon("copy")}
    </button>
  );
}

export function PostsWorkspace({
  history,
  initialDescription,
}: {
  history: PostRow[];
  /** The brief Home routed here, already in the box — see
   *  lib/create-studio/producer-routes.ts. Seeded, never auto-sent: the
   *  person still presses the button and still sees the estimate first. */
  initialDescription?: string;
}) {
  const t = useTranslations("posts");
  const tSteps = useTranslations("aiSteps");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [description, setDescription] = useState(initialDescription ?? "");
  const [platforms, setPlatforms] = useState<PostPlatform[]>([...POST_PLATFORMS]);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(() => {
    const first = history.find((r) => r.set);
    return first?.set ? { id: first.id, set: first.set, platforms: first.platforms, creditsCharged: first.creditsCharged } : null;
  });

  const estimate = useCostEstimate("postsGenerate", {
    inputChars: postsEstimateInputChars(description.length, platforms),
  });

  function togglePlatform(p: PostPlatform) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : POST_PLATFORMS.filter((x) => x === p || prev.includes(x))));
  }

  // THE STOP BUTTON. One controller per run; Stop aborts the fetch, the
  // route aborts the provider call and releases the hold, nothing is
  // charged and nothing is recorded as failed.
  const abortRef = useRef<AbortController | null>(null);
  function stopRun() {
    abortRef.current?.abort();
  }

  async function generate() {
    if (!description.trim() || platforms.length === 0 || running) return;
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ description, platforms, locale }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const code = String(body?.error ?? "");
        const message =
          code === "too_long"
            ? t("errors.tooLong", { limit: MAX_DESCRIPTION_CHARS })
            : code === "too_short"
              ? t("errors.tooShort")
              : code === "insufficient_credits" || code === "reserve_failed"
                ? t("errors.insufficient")
                : code === "rate_limited" || code === "bypass_ceiling"
                  ? t("errors.rateLimited")
                  : code === "ai_unavailable" || code === "not_configured"
                    ? t("errors.unavailable")
                    : code === "unusable"
                      ? t("errors.unusable")
                      : t("errors.failed");
        addToast(message, "error");
        return;
      }
      setSelected({
        id: (body?.id as string | null) ?? null,
        set: body.set as PostSet,
        platforms,
        creditsCharged: Number(body?.creditsCharged ?? 0),
      });
      router.refresh();
    } catch {
      if (!controller.signal.aborted) addToast(t("errors.failed"), "error");
      else addToast(tSteps("stopped"));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("history.deleteConfirm"))) return;
    const { error } = await supabase.from("generated_posts").delete().eq("id", id);
    if (error) {
      addToast(getErrorMessage(error, t("errors.failed")), "error");
      return;
    }
    if (selected?.id === id) setSelected(null);
    router.refresh();
  }

  const allText = selected
    ? selected.set.posts.map((p) => `${PLATFORMS[p.platform].label}\n${postClipboardText(p)}`).join("\n\n---\n\n")
    : "";
  const missing = selected ? selected.platforms.filter((p) => !selected.set.posts.some((post) => post.platform === p)) : [];

  return (
    <div className="space-y-6">
      {/* WHAT IT DOES NOT DO, ON THE SCREEN — first of all that it does
          not post anywhere. A page called Posts reads as a publisher to
          everybody who has not read the roadmap. */}
      <div className="rounded-2xl border border-border bg-panel p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("limits.title")}</h2>
        <ul className="mt-2 space-y-1">
          {POST_LIMITS.map((limit) => (
            <li key={limit} className="text-xs text-muted">
              {t(`limits.${limit}`)}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-border bg-panel p-5">
        <label htmlFor="post-description" className="text-sm font-semibold text-foreground">
          {t("form.description")}
        </label>
        <textarea
          id="post-description"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_CHARS))}
          placeholder={t("form.descriptionPlaceholder")}
          rows={4}
          className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-orange-500/40"
        />
        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-muted">{t("form.platforms")}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {POST_PLATFORMS.map((p) => {
              const spec = PLATFORMS[p];
              const on = platforms.includes(p);
              return (
                <label
                  key={p}
                  className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                    on ? "border-orange-500/60 text-foreground" : "border-border text-muted"
                  }`}
                >
                  <input type="checkbox" checked={on} onChange={() => togglePlatform(p)} />
                  <span>{spec.label}</span>
                  <span className="text-[11px] text-muted">{t("form.upTo", { max: spec.maxChars })}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Before the buttons in source order as well as on screen — the
              indicator sits on the panel, and globe-mark reads the surface
              from the lines above it. */}
          {running && (
            <span className="inline-flex items-center gap-2 text-xs text-muted" aria-live="polite">
              <ThinkingIndicator size="sm" />
              {t("form.generating")}
            </span>
          )}
          {running ? (
            <button
              type="button"
              onClick={stopRun}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground"
            >
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
              {tSteps("stop")}
            </button>
          ) : (
            <button
              type="button"
              onClick={generate}
              disabled={!description.trim() || platforms.length === 0}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              {t("form.generate")}
            </button>
          )}
        </div>
        {!running && description.trim() && platforms.length > 0 && <CostEstimateHint credits={estimate.credits} />}
      </div>

      {selected && (
        <section className="rounded-2xl border border-border bg-panel p-5" aria-label={t("result.title")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">{t("result.title")}</h2>
              {selected.creditsCharged > 0 && (
                <p className="text-xs text-muted">{t("result.charged", { credits: selected.creditsCharged })}</p>
              )}
            </div>
            <CopyButton text={allText} />
          </div>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {selected.set.posts.map((post: Post) => {
              const spec = PLATFORMS[post.platform];
              const clipboard = postClipboardText(post);
              return (
                <li key={post.platform} className="flex flex-col rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{spec.label}</h3>
                    <span className="text-[11px] text-muted">
                      {t("result.chars", { count: clipboard.length, max: spec.maxChars })}
                    </span>
                  </div>
                  <p className="mt-2 flex-1 whitespace-pre-wrap text-sm text-foreground">{post.text}</p>
                  {post.hashtags.length > 0 && <p className="mt-2 text-xs text-muted">{post.hashtags.join(" ")}</p>}
                  <div className="mt-3">
                    <CopyButton text={clipboard} />
                  </div>
                </li>
              );
            })}
            {missing.map((p) => (
              <li key={p} className="rounded-xl border border-dashed border-border p-4 text-xs text-muted">
                {t("result.missing", { platform: PLATFORMS[p].label })}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-panel p-5" aria-label={t("history.title")}>
        <h2 className="text-sm font-semibold text-foreground">{t("history.title")}</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-xs text-muted">{t("history.empty")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {history.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <button
                  type="button"
                  disabled={!row.set}
                  onClick={() =>
                    row.set && setSelected({ id: row.id, set: row.set, platforms: row.platforms, creditsCharged: row.creditsCharged })
                  }
                  className="min-w-0 flex-1 text-start disabled:cursor-default"
                >
                  <p className="line-clamp-1 text-sm text-foreground">{row.description}</p>
                  <p className="text-[11px] text-muted">
                    {row.set ? row.platforms.map((p) => PLATFORMS[p].label).join(" · ") : t("history.failed")}
                    {" · "}
                    {new Date(row.createdAt).toLocaleDateString(locale)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => remove(row.id)}
                  aria-label={t("history.delete")}
                  className="rounded-md p-2 text-muted hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
