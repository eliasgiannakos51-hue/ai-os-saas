"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Clock, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { CopyButton } from "@/components/ui/copy-button";
import { CostEstimateHint, useCostEstimate } from "@/components/credits/cost-estimate";
import { ToolShell, OPTION, type ShellTurn } from "@/components/shell/tool-shell";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_DESCRIPTION_CHARS,
  PLATFORMS,
  POST_PLATFORMS,
  postClipboardText,
  postsEstimateInputChars,
  type PostPlatform,
  type PostRow,
  type PostSet,
} from "@/lib/posts/platforms";

type Shown = { id: string | null; set: PostSet; platforms: PostPlatform[] };

/**
 * POSTS IN THE SHELL (MASTER 14.3, package 3), behind the switch
 * "tool-shell". The same routes as components/posts/posts-workspace.tsx,
 * which stays the page for everybody the switch is off for:
 * /api/posts/generate writes, generated_posts keeps the history.
 *
 * What is said in the field is the brief; the posts open on the right, one
 * per platform, each with its copy button. Two options under the field:
 * the platforms, and what was written before. What it does NOT do is one
 * line under the field, not a box.
 */
export function PostsShell({
  history,
  initialDescription,
  initialOpenId = null,
}: {
  history: PostRow[];
  initialDescription?: string;
  /** Posts to open on arrival — `?record=` from the Library. */
  initialOpenId?: string | null;
}) {
  const t = useTranslations("posts");
  const tShell = useTranslations("dashboard.toolShell");
  const tNames = useTranslations("dashboard.tools.names");
  const tSteps = useTranslations("aiSteps");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const composerRef = useRef<ChatComposerHandle>(null);

  const [platforms, setPlatforms] = useState<PostPlatform[]>([...POST_PLATFORMS]);
  const [choosing, setChoosing] = useState(false);
  const [length, setLength] = useState(initialDescription?.length ?? 0);
  const [running, setRunning] = useState(false);
  const [turns, setTurns] = useState<{ id: string; role: "user" | "tool"; text: string; shown?: Shown }[]>([]);
  const asked = initialOpenId ? history.find((row) => row.id === initialOpenId && row.set) : undefined;
  const [open, setOpen] = useState<"posts" | "recent" | null>(asked ? "posts" : null);
  const [shown, setShown] = useState<Shown | null>(asked?.set ? { id: asked.id, set: asked.set, platforms: asked.platforms } : null);

  const estimate = useCostEstimate("postsGenerate", { inputChars: postsEstimateInputChars(length, platforms) });

  const abortRef = useRef<AbortController | null>(null);

  function togglePlatform(p: PostPlatform) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : POST_PLATFORMS.filter((x) => x === p || prev.includes(x))));
  }

  async function write(description: string) {
    // Every platform when none is chosen, as on the old page.
    const chosen = platforms.length > 0 ? platforms : [...POST_PLATFORMS];
    if (running) return;
    const text = description.slice(0, MAX_DESCRIPTION_CHARS);
    setTurns((prev) => [...prev, { id: `u${prev.length}`, role: "user", text }]);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ description: text, platforms: chosen, locale }),
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
        setTurns((prev) => [...prev, { id: `t${prev.length}`, role: "tool", text: message }]);
        return;
      }
      const made: Shown = { id: (body?.id as string | null) ?? null, set: body.set as PostSet, platforms: chosen };
      setTurns((prev) => [
        ...prev,
        { id: `t${prev.length}`, role: "tool", text: tShell("posts.done", { count: made.set.posts.length }), shown: made },
      ]);
      setShown(made);
      setOpen("posts");
      router.refresh();
    } catch {
      setTurns((prev) => [
        ...prev,
        { id: `t${prev.length}`, role: "tool", text: controller.signal.aborted ? tSteps("stopped") : t("errors.failed") },
      ]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("history.deleteConfirm"))) return;
    const { error } = await supabase.from("generated_posts").delete().eq("id", id);
    if (error) {
      // The database's own message is English; the reader gets the screen's words.
      addToast(t("errors.failed"), "error");
      return;
    }
    if (shown?.id === id) setShown(null);
    router.refresh();
  }

  const shellTurns: ShellTurn[] = turns.map((turn) =>
    turn.shown
      ? {
          id: turn.id,
          role: turn.role,
          text: turn.text,
          card: {
            title: t("result.title"),
            open: open === "posts" && shown === turn.shown,
            onOpen: () => {
              setShown(turn.shown!);
              setOpen("posts");
            },
          },
        }
      : { id: turn.id, role: turn.role, text: turn.text }
  );

  const allText = shown
    ? shown.set.posts.map((p) => `${PLATFORMS[p.platform].label}\n${postClipboardText(p)}`).join("\n\n---\n\n")
    : "";
  const missing = shown ? shown.platforms.filter((p) => !shown.set.posts.some((post) => post.platform === p)) : [];

  const work =
    open === "posts" && shown
      ? {
          title: t("result.title"),
          actions: <CopyButton text={allText} label={tShell("posts.copyAll")} variant="icon" />,
          body: (
            <ol data-testid="posts-result" className="space-y-6">
              {shown.set.posts.map((post) => {
                const spec = PLATFORMS[post.platform];
                const clipboard = postClipboardText(post);
                return (
                  <li key={post.platform}>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{spec.label}</h3>
                      <span className="text-[11px] text-muted">{t("result.chars", { count: clipboard.length, max: spec.maxChars })}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-body">{post.text}</p>
                    {post.hashtags.length > 0 && <p className="mt-2 text-xs text-muted">{post.hashtags.join(" ")}</p>}
                    <CopyButton text={clipboard} label={tShell("posts.copyOne", { platform: spec.label })} variant="icon" />
                  </li>
                );
              })}
              {missing.map((p) => (
                <li key={p} className="text-xs text-muted">
                  {t("result.missing", { platform: PLATFORMS[p].label })}
                </li>
              ))}
            </ol>
          ),
        }
      : open === "recent"
        ? {
            title: t("history.title"),
            body:
              history.length === 0 ? (
                <p className="text-xs text-muted">{t("history.empty")}</p>
              ) : (
                <ul className="row-list">
                  {history.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                      <button
                        type="button"
                        disabled={!row.set}
                        onClick={() => {
                          if (!row.set) return;
                          setShown({ id: row.id, set: row.set, platforms: row.platforms });
                          setOpen("posts");
                        }}
                        className="min-w-0 flex-1 text-start disabled:cursor-default"
                      >
                        <p className="break-words text-sm text-foreground">{row.description}</p>
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
                        className="inline-flex h-11 w-11 items-center justify-center rounded-item text-muted hover:text-foreground"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ),
          }
        : null;

  return (
    <ToolShell
      ref={composerRef}
      name={tNames("posts")}
      turns={shellTurns}
      working={
        running ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <ThinkingIndicator size="sm" />
            {t("form.generating")}
          </span>
        ) : null
      }
      placeholder={t("form.descriptionPlaceholder")}
      sending={running}
      onSend={(text) => void write(text)}
      onStop={() => abortRef.current?.abort()}
      initialText={initialDescription}
      onLengthChange={setLength}
      options={[
        <span key="platforms" className="relative">
          <button
            type="button"
            onClick={() => setChoosing((v) => !v)}
            aria-expanded={choosing}
            data-testid="posts-platforms"
            className={OPTION}
          >
            {tShell("posts.platforms", { count: platforms.length > 0 ? platforms.length : POST_PLATFORMS.length })}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {choosing && (
            <fieldset className="surface absolute bottom-full start-0 z-10 mb-2 w-64 space-y-1">
              <legend className="sr-only">{t("form.platforms")}</legend>
              {POST_PLATFORMS.map((p) => (
                <label key={p} className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={platforms.includes(p)} onChange={() => togglePlatform(p)} />
                  <span className="flex-1">{PLATFORMS[p].label}</span>
                  <span className="text-[11px] text-muted">{t("form.upTo", { max: PLATFORMS[p].maxChars })}</span>
                </label>
              ))}
            </fieldset>
          )}
        </span>,
        <button
          key="recent"
          type="button"
          onClick={() => setOpen((v) => (v === "recent" ? null : "recent"))}
          aria-pressed={open === "recent"}
          data-testid="posts-recent"
          className={OPTION}
        >
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {t("history.title")}
        </button>,
      ]}
      footer={
        <>
          {!running && length > 0 && <CostEstimateHint credits={estimate.credits} />}
          <p className="mt-1.5 text-[11px] text-muted">{t("limits.no_publish")}</p>
        </>
      }
      work={work}
      onCloseWork={() => setOpen(null)}
    />
  );
}
