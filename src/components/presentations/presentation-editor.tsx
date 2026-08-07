"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  Printer,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { SlideView } from "@/components/presentations/slide-view";
import { readUsageReceipt } from "@/lib/billing/usage-receipt";
import { PRESENTATION_THEMES } from "@/lib/presentations/themes";
import {
  MAX_BULLETS_PER_SLIDE,
  MAX_BULLET_CHARS,
  MAX_EDIT_INSTRUCTION_CHARS,
  MAX_NOTES_CHARS,
  MAX_SLIDES,
  MAX_TITLE_CHARS,
  MIN_SLIDES,
  SLIDE_LAYOUTS,
  type Slide,
  type SlideLayout,
} from "@/lib/presentations/slides";

export type PresentationRecord = {
  id: string;
  title: string;
  brief: string;
  language: string;
  theme: string;
  slides: Slide[];
  sources: { title: string; url: string }[];
  share_slug: string | null;
  share_enabled: boolean | null;
};

export type VersionRecord = {
  version_number: number;
  change_summary: string;
  created_at: string;
};

// Paired with the 400/hour ceiling on PATCH in api/presentations/[id]:
// at this debounce a solid hour of typing cannot approach the limit,
// which is what keeps the limit from ever being felt by the person it is
// not aimed at.
const AUTOSAVE_DELAY_MS = 2500;

/**
 * The deck editor.
 *
 * Local state is the source of truth WHILE EDITING, and the server is
 * caught up by a debounced PATCH. Typing straight into the database is
 * either a request per keystroke or a laggy field; this is neither.
 *
 * The consequence to be careful about is that every server-side
 * operation (AI edit, rollback) returns the whole deck, and those
 * responses REPLACE local state rather than merging into it. Merging is
 * where an editor starts showing a slide that exists in neither version.
 */
export function PresentationEditor({
  presentation,
  versions: initialVersions,
}: {
  presentation: PresentationRecord;
  versions: VersionRecord[];
}) {
  const t = useTranslations("dashboard.presentations");
  const router = useRouter();
  const { addToast } = useToast();

  const [title, setTitle] = useState(presentation.title);
  const [slides, setSlides] = useState<Slide[]>(presentation.slides);
  const [themeId, setThemeId] = useState(presentation.theme);
  const [current, setCurrent] = useState(0);

  const [versions, setVersions] = useState<VersionRecord[]>(initialVersions);
  const [shareSlug, setShareSlug] = useState(presentation.share_slug);
  const [shareEnabled, setShareEnabled] = useState(Boolean(presentation.share_enabled));

  const [instruction, setInstruction] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const slide = slides[current];

  // ------------------------------------------------------------------
  // Autosave.
  // ------------------------------------------------------------------
  const dirty = useRef(false);
  const latest = useRef({ title, slides, themeId });
  latest.current = { title, slides, themeId };

  const save = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setSaving(true);
    try {
      const res = await fetch(`/api/presentations/${presentation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: latest.current.title,
          slides: latest.current.slides,
          theme: latest.current.themeId,
        }),
      });
      if (!res.ok) {
        // Marked dirty again so the next tick retries. A save that
        // failed silently is how an editor loses an afternoon.
        dirty.current = true;
        addToast(t("errors.saveFailed"), "error");
      }
    } catch {
      dirty.current = true;
    } finally {
      setSaving(false);
    }
  }, [presentation.id, addToast, t]);

  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [title, slides, themeId, save]);

  function mutate(next: { title?: string; slides?: Slide[]; themeId?: string }) {
    dirty.current = true;
    if (next.title !== undefined) setTitle(next.title);
    if (next.slides !== undefined) setSlides(next.slides);
    if (next.themeId !== undefined) setThemeId(next.themeId);
  }

  function updateSlide(index: number, patch: Partial<Slide>) {
    mutate({ slides: slides.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  }

  // ------------------------------------------------------------------
  // Structure.
  // ------------------------------------------------------------------
  function addSlide() {
    if (slides.length >= MAX_SLIDES) return;
    const used = new Set(slides.map((s) => s.id));
    let n = slides.length + 1;
    while (used.has(`s${n}`)) n++;
    const blank: Slide = {
      id: `s${n}`,
      title: t("newSlideTitle"),
      bullets: [],
      speakerNotes: "",
      layout: "bullets",
      imageSuggestion: null,
      imageUrl: null,
    };
    const next = [...slides.slice(0, current + 1), blank, ...slides.slice(current + 1)];
    mutate({ slides: next });
    setCurrent(current + 1);
  }

  function deleteSlide(index: number) {
    if (slides.length <= MIN_SLIDES) {
      addToast(t("errors.minSlides", { min: MIN_SLIDES }), "error");
      return;
    }
    const next = slides.filter((_, i) => i !== index);
    mutate({ slides: next });
    setCurrent(Math.min(index, next.length - 1));
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= slides.length || from === to) return;
    const next = [...slides];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    mutate({ slides: next });
    setCurrent(to);
  }

  // ------------------------------------------------------------------
  // Server operations.
  // ------------------------------------------------------------------
  async function runAiEdit() {
    if (!instruction.trim()) return;
    // Anything typed but not yet saved goes first, so the server edits
    // the deck the user is looking at rather than the one from up to
    // AUTOSAVE_DELAY_MS ago.
    await save();

    setAiBusy(true);
    try {
      const res = await fetch(`/api/presentations/${presentation.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const data = await res.json().catch(() => null);

      const receipt = readUsageReceipt(data);
      if (receipt && receipt.creditsCharged > 0) {
        addToast(t("charged", { credits: receipt.creditsCharged }), "success");
      }
      if (!res.ok || !data?.ok) {
        addToast(data?.error || t("errors.generic"), "error");
        return;
      }

      setTitle(data.presentation.title);
      setSlides(data.presentation.slides);
      setCurrent((c) => Math.min(c, data.presentation.slides.length - 1));
      setInstruction("");
      if (data.summary) addToast(data.summary, "success");
      router.refresh();
    } catch {
      addToast(t("errors.generic"), "error");
    } finally {
      setAiBusy(false);
    }
  }

  async function toggleShare(action: "enable" | "disable" | "rotate") {
    try {
      const res = await fetch(`/api/presentations/${presentation.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        addToast(data?.error || t("errors.generic"), "error");
        return;
      }
      setShareSlug(data.shareSlug);
      setShareEnabled(data.shareEnabled);
    } catch {
      addToast(t("errors.generic"), "error");
    }
  }

  async function restore(versionNumber: number) {
    try {
      const res = await fetch(`/api/presentations/${presentation.id}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionNumber }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        addToast(data?.error || t("errors.generic"), "error");
        return;
      }
      setTitle(data.presentation.title);
      setSlides(data.presentation.slides);
      setCurrent(0);
      setVersions((v) => [
        {
          version_number: (v[0]?.version_number ?? 0) + 1,
          change_summary: t("restoredSummary", { version: versionNumber }),
          created_at: new Date().toISOString(),
        },
        ...v,
      ]);
      addToast(t("restored", { version: versionNumber }), "success");
      router.refresh();
    } catch {
      addToast(t("errors.generic"), "error");
    }
  }

  const shareUrl = useMemo(
    () => (shareEnabled && shareSlug && typeof window !== "undefined" ? `${window.location.origin}/p/${shareSlug}` : ""),
    [shareEnabled, shareSlug]
  );

  if (!slide) {
    return <p className="text-sm text-muted">{t("errors.noSlides")}</p>;
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-sm flex-1"
          value={title}
          maxLength={MAX_TITLE_CHARS}
          onChange={(e) => mutate({ title: e.target.value })}
          aria-label={t("deckTitleLabel")}
        />

        <select
          className="input w-auto"
          value={themeId}
          onChange={(e) => mutate({ themeId: e.target.value })}
          aria-label={t("themeLabel")}
        >
          {PRESENTATION_THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {t(`themes.${theme.nameKey}`)}
            </option>
          ))}
        </select>

        <a className="btn-secondary" href={`/api/presentations/${presentation.id}/export`}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {t("exportPptx")}
        </a>

        <a
          className="btn-secondary"
          href={`/dashboard/presentations/${presentation.id}/print`}
          target="_blank"
          rel="noreferrer"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          {t("exportPdf")}
        </a>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => void toggleShare(shareEnabled ? "disable" : "enable")}
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {shareEnabled ? t("shareOff") : t("shareOn")}
        </button>

        <span className="ml-auto text-[11px] text-muted" aria-live="polite">
          {saving ? t("saving") : t("saved")}
        </span>
      </div>

      {shareEnabled && shareUrl ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-panel/60 p-3">
          <code className="flex-1 truncate text-[11px] text-muted">{shareUrl}</code>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(shareUrl);
              addToast(t("shareCopied"), "success");
            }}
          >
            {t("shareCopy")}
          </button>
          <button type="button" className="btn-secondary" onClick={() => void toggleShare("rotate")}>
            {t("shareRotate")}
          </button>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
        {/* Thumbnails */}
        <ol className="order-2 flex gap-2 overflow-x-auto lg:order-1 lg:max-h-[70vh] lg:flex-col lg:overflow-y-auto">
          {slides.map((s, i) => (
            <li
              key={s.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) move(dragIndex, i);
                setDragIndex(null);
              }}
              className="w-40 flex-none lg:w-full"
            >
              <button
                type="button"
                onClick={() => setCurrent(i)}
                aria-current={i === current}
                className={`w-full overflow-hidden rounded-lg border text-left transition ${
                  i === current ? "border-accent ring-1 ring-accent" : "border-border hover:border-accent/50"
                }`}
              >
                <SlideView slide={s} themeId={themeId} />
              </button>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
                <span>{i + 1}</span>
                {/* Drag-and-drop is not usable from a keyboard or a
                    screen reader, so reordering is also available as two
                    ordinary buttons. */}
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    aria-label={t("moveUp", { n: i + 1 })}
                    className="disabled:opacity-30"
                  >
                    <ChevronLeft className="h-3 w-3 rotate-90 lg:rotate-0" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    disabled={i === slides.length - 1}
                    aria-label={t("moveDown", { n: i + 1 })}
                    className="disabled:opacity-30"
                  >
                    <ChevronRight className="h-3 w-3 rotate-90 lg:rotate-0" aria-hidden="true" />
                  </button>
                </span>
              </div>
            </li>
          ))}
          <li className="w-40 flex-none lg:w-full">
            <button
              type="button"
              className="flex h-full min-h-[80px] w-full items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted hover:border-accent/50"
              onClick={addSlide}
              disabled={slides.length >= MAX_SLIDES}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("addSlide")}
            </button>
          </li>
        </ol>

        {/* Canvas + inspector */}
        <div className="order-1 space-y-4 lg:order-2">
          <SlideView slide={slide} themeId={themeId} className="rounded-xl border border-border" />

          <div className="space-y-3 rounded-2xl border border-border bg-panel/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{t("slideN", { n: current + 1 })}</h3>
              <div className="flex items-center gap-2">
                <select
                  className="input w-auto text-xs"
                  value={slide.layout}
                  onChange={(e) => updateSlide(current, { layout: e.target.value as SlideLayout })}
                  aria-label={t("layoutLabel")}
                >
                  {SLIDE_LAYOUTS.map((layout) => (
                    <option key={layout} value={layout}>
                      {t(`layouts.${layout}`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => deleteSlide(current)}
                  aria-label={t("deleteSlide")}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <input
              className="input"
              value={slide.title}
              maxLength={MAX_TITLE_CHARS}
              onChange={(e) => updateSlide(current, { title: e.target.value })}
              aria-label={t("slideTitleLabel")}
            />

            <div className="space-y-2">
              {slide.bullets.map((bullet, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="input"
                    value={bullet}
                    maxLength={MAX_BULLET_CHARS}
                    onChange={(e) => {
                      const next = [...slide.bullets];
                      next[i] = e.target.value;
                      updateSlide(current, { bullets: next });
                    }}
                    aria-label={t("bulletLabel", { n: i + 1 })}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      updateSlide(current, { bullets: slide.bullets.filter((_, j) => j !== i) })
                    }
                    aria-label={t("deleteBullet", { n: i + 1 })}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
              {slide.bullets.length < MAX_BULLETS_PER_SLIDE ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => updateSlide(current, { bullets: [...slide.bullets, ""] })}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("addBullet")}
                </button>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="speaker-notes"
                className="mb-1 block text-xs font-medium text-muted"
              >
                {t("speakerNotes")}
              </label>
              <textarea
                id="speaker-notes"
                className="input min-h-[80px]"
                value={slide.speakerNotes}
                maxLength={MAX_NOTES_CHARS}
                onChange={(e) => updateSlide(current, { speakerNotes: e.target.value })}
              />
            </div>
          </div>

          {/* AI edit */}
          <form
            className="flex flex-wrap gap-2 rounded-2xl border border-border bg-panel/60 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void runAiEdit();
            }}
          >
            <input
              className="input flex-1"
              value={instruction}
              maxLength={MAX_EDIT_INSTRUCTION_CHARS}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={t("aiEditPlaceholder")}
              aria-label={t("aiEditLabel")}
            />
            <button type="submit" className="btn-primary" disabled={aiBusy || !instruction.trim()}>
              {aiBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              {aiBusy ? t("applying") : t("apply")}
            </button>
          </form>

          {presentation.sources.length > 0 ? (
            <details className="rounded-2xl border border-border bg-panel/60 p-4">
              <summary className="cursor-pointer text-sm font-medium">{t("sources")}</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {presentation.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer nofollow"
                      className="text-accent hover:underline"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {versions.length > 0 ? (
            <details className="rounded-2xl border border-border bg-panel/60 p-4">
              <summary className="cursor-pointer text-sm font-medium">{t("history")}</summary>
              <ul className="mt-2 space-y-2 text-xs">
                {versions.map((version) => (
                  <li key={version.version_number} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted">
                      {t("versionN", { n: version.version_number })} — {version.change_summary}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void restore(version.version_number)}
                    >
                      {t("restore")}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
