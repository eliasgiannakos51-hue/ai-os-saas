"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FileDown, Paperclip, Play, Square, Trash2, X } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { DownloadPdfButton, saveFileResponse } from "@/components/ui/download-pdf-button";
import { CostEstimateHint, useCostEstimate } from "@/components/credits/cost-estimate";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  ACCEPTED_ATTACHMENT_IMAGE_TYPES,
  CREATE_ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_IMAGE_BYTES,
  buildAttachmentImagePath,
} from "@/lib/create-attachment-image";
import { UNSPLASH_HOME_URL, withUnsplashUtm } from "@/lib/website-image-placeholders";
import {
  DEFAULT_SLIDES,
  IMAGE_SOURCES,
  MAX_DESCRIPTION_CHARS,
  MAX_OWN_IMAGES,
  MAX_SLIDES,
  MIN_SLIDES,
  deckEstimateInputChars,
  type Deck,
  type ImageSource,
  type Slide,
} from "@/lib/presentations/deck";

export type DeckRow = {
  id: string;
  title: string;
  /** Null for a run that failed — `error` says why. */
  deck: Deck | null;
  error: string | null;
  creditsCharged: number;
  createdAt: string;
};

export type NoteRow = {
  id: string;
  title: string;
  description: string | null;
  slideCount: number | null;
  createdAt: string;
};

/** The four things this page does not do, as identifiers the UI and the
 *  gate both read. A fifth one appearing here without a message key is a
 *  build failure, which is the point. */
export const DECK_LIMITS = ["no_charts", "no_themes", "no_editing", "no_generated_images"] as const;

type Selected = { id: string | null; deck: Deck; creditsCharged: number };

export function PresentationsWorkspace({
  decks,
  notes,
  ownImageUrls,
  unsplashConfigured,
  requestedRecord = null,
}: {
  decks: DeckRow[];
  notes: NoteRow[];
  ownImageUrls: Record<string, string>;
  unsplashConfigured: boolean;
  /** The `?record=` a starred row arrived with, or null. */
  requestedRecord?: string | null;
}) {
  const t = useTranslations("presentations");
  const tSteps = useTranslations("aiSteps");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [description, setDescription] = useState("");
  const [slideCount, setSlideCount] = useState<number>(DEFAULT_SLIDES);
  const [imageSource, setImageSource] = useState<ImageSource>(unsplashConfigured ? "unsplash" : "none");
  const [ownFiles, setOwnFiles] = useState<{ file: File; preview: string }[]>([]);
  const [running, setRunning] = useState(false);
  // THE STARRED ROW WINS, then the newest deck. A `?record=` that names a
  // hand-typed note (which has no slides to show) selects nothing and the
  // note is listed first in the history below instead.
  const [selected, setSelected] = useState<Selected | null>(() => {
    const requested = requestedRecord ? decks.find((d) => d.id === requestedRecord && d.deck) : null;
    const first = requested ?? decks.find((d) => d.deck);
    return first?.deck ? { id: first.id, deck: first.deck, creditsCharged: first.creditsCharged } : null;
  });
  const orderedNotes = useMemo(
    () => (requestedRecord ? [...notes].sort((a, b) => (a.id === requestedRecord ? -1 : b.id === requestedRecord ? 1 : 0)) : notes),
    [notes, requestedRecord]
  );
  // Object URLs for photos uploaded THIS session, so a freshly generated
  // deck shows them before the page has re-rendered with signed URLs.
  const [localImageUrls, setLocalImageUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const estimate = useCostEstimate("presentationGenerate", {
    inputChars: deckEstimateInputChars(description.length, slideCount),
  });

  function imageUrlFor(slide: Slide): string | null {
    if (!slide.image) return null;
    if (slide.image.kind === "unsplash") return slide.image.url;
    return ownImageUrls[slide.image.path] ?? localImageUrls[slide.image.path] ?? null;
  }

  function addOwnFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length === 0) return;
    setOwnFiles((prev) => {
      const room = MAX_OWN_IMAGES - prev.length;
      const accepted = picked
        .filter(
          (f) =>
            (ACCEPTED_ATTACHMENT_IMAGE_TYPES as readonly string[]).includes(f.type) &&
            f.size <= MAX_ATTACHMENT_IMAGE_BYTES
        )
        .slice(0, Math.max(0, room));
      if (accepted.length < picked.length) addToast(t("errors.imageRejected", { max: MAX_OWN_IMAGES }), "error");
      return [...prev, ...accepted.map((file) => ({ file, preview: URL.createObjectURL(file) }))];
    });
  }

  function removeOwnFile(index: number) {
    setOwnFiles((prev) => {
      const gone = prev[index];
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function uploadOwnFiles(): Promise<string[]> {
    if (ownFiles.length === 0) return [];
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const results = await Promise.all(
      ownFiles.map(async ({ file, preview }) => {
        const path = buildAttachmentImagePath(user.id, file.name);
        const { error } = await supabase.storage
          .from(CREATE_ATTACHMENT_BUCKET)
          .upload(path, file, { contentType: file.type });
        return { path, preview, error };
      })
    );
    const failures = results.filter((r) => r.error);
    if (failures.length > 0) addToast(getErrorMessage(failures[0].error, t("errors.uploadFailed")), "error");
    const ok = results.filter((r) => !r.error);
    setLocalImageUrls((prev) => ({ ...prev, ...Object.fromEntries(ok.map((r) => [r.path, r.preview])) }));
    return ok.map((r) => r.path);
  }

  // THE STOP BUTTON. One controller per run; Stop aborts the fetch, the
  // route aborts the provider call and releases the hold, nothing is
  // charged and nothing is recorded as failed.
  const abortRef = useRef<AbortController | null>(null);
  function stopRun() {
    abortRef.current?.abort();
  }

  async function generate() {
    if (!description.trim() || running) return;
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const ownImagePaths = imageSource === "own" ? await uploadOwnFiles() : [];
      const response = await fetch("/api/presentations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ description, slideCount, imageSource, ownImagePaths, locale }),
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
      const deck = body?.deck as Deck;
      setSelected({ id: (body?.id as string | null) ?? null, deck, creditsCharged: Number(body?.creditsCharged ?? 0) });
      if (body?.images && body.images.wanted > 0 && body.images.found === 0 && imageSource !== "none") {
        addToast(t("result.noPhotoFound"));
      }
      router.refresh();
    } catch {
      if (!controller.signal.aborted) addToast(t("errors.failed"), "error");
      else addToast(tSteps("stopped"));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }

  const [exporting, setExporting] = useState(false);
  async function exportPptx(id: string) {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/presentations/${id}/pptx`);
      if (!res.ok) {
        addToast(t("errors.exportFailed"), "error");
        return;
      }
      saveFileResponse(await res.blob(), res, "presentation.pptx");
    } catch {
      addToast(t("errors.exportFailed"), "error");
    } finally {
      setExporting(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("history.deleteConfirm"))) return;
    const { error } = await supabase.from("ai_presentations").delete().eq("id", id);
    if (error) {
      addToast(getErrorMessage(error, t("errors.failed")), "error");
      return;
    }
    if (selected?.id === id) setSelected(null);
    router.refresh();
  }

  const slideOptions = useMemo(
    () => Array.from({ length: MAX_SLIDES - MIN_SLIDES + 1 }, (_, i) => MIN_SLIDES + i),
    []
  );

  return (
    <div className="space-y-6">
      {/* WHAT IT DOES NOT DO, ON THE SCREEN. The previous version of this
          page was a notes form under a name that promised slides; the fix
          for the reverse mistake — a generator that reads as a designer —
          is the same: say the edges out loud where somebody about to rely
          on them reads them. */}
      <div className="rounded-2xl border border-border bg-panel p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("limits.title")}</h2>
        <ul className="mt-2 space-y-1">
          {DECK_LIMITS.map((limit) => (
            <li key={limit} className="text-xs text-muted">
              {t(`limits.${limit}`)}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-border bg-panel p-5">
        <label htmlFor="deck-description" className="text-sm font-semibold text-foreground">
          {t("form.description")}
        </label>
        <textarea
          id="deck-description"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_CHARS))}
          placeholder={t("form.descriptionPlaceholder")}
          rows={5}
          className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-orange-500/40"
        />
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="deck-slides" className="text-xs font-medium text-muted">
              {t("form.slideCount")}
            </label>
            <select
              id="deck-slides"
              value={slideCount}
              onChange={(e) => setSlideCount(Number(e.target.value))}
              className="mt-1 block min-h-[44px] rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            >
              {slideOptions.map((n) => (
                <option key={n} value={n}>
                  {t("form.slides", { count: n })}
                </option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend className="text-xs font-medium text-muted">{t("form.imageSource")}</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {IMAGE_SOURCES.map((source) => {
                const disabled = source === "unsplash" && !unsplashConfigured;
                return (
                  <label
                    key={source}
                    className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                      imageSource === source ? "border-orange-500/60 text-foreground" : "border-border text-muted"
                    } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <input
                      type="radio"
                      name="image-source"
                      value={source}
                      checked={imageSource === source}
                      disabled={disabled}
                      onChange={() => setImageSource(source)}
                    />
                    {source === "unsplash"
                      ? t("form.sources.unsplash")
                      : source === "own"
                        ? t("form.sources.own")
                        : t("form.sources.none")}
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {imageSource === "unsplash"
                ? t("form.sources.unsplashHint")
                : imageSource === "own"
                  ? t("form.sources.ownHint", { max: MAX_OWN_IMAGES })
                  : unsplashConfigured
                    ? t("form.sources.noneHint")
                    : t("form.sources.unsplashUnavailable")}
            </p>
          </fieldset>
        </div>

        {imageSource === "own" && (
          <div className="mt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_ATTACHMENT_IMAGE_TYPES.join(",")}
              multiple
              onChange={addOwnFiles}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={ownFiles.length >= MAX_OWN_IMAGES}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
            >
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
              {t("form.addPhotos")} ({t("form.photosSelected", { count: ownFiles.length, max: MAX_OWN_IMAGES })})
            </button>
            {ownFiles.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {ownFiles.map(({ file, preview }, i) => (
                  <li key={preview} className="relative">
                    <Image
                      src={preview}
                      alt={file.name}
                      width={96}
                      height={64}
                      unoptimized
                      className="h-16 w-24 rounded-md object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeOwnFile(i)}
                      aria-label={t("form.remove")}
                      className="absolute -end-1 -top-1 rounded-full bg-background p-0.5 text-muted shadow"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* BEFORE the buttons in source order as well as on screen: the
              indicator sits on the panel, not on the orange button beside
              it, and globe-mark reads the surface from the lines above. */}
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
              disabled={!description.trim()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              {t("form.generate")}
            </button>
          )}
        </div>
        {!running && description.trim() && <CostEstimateHint credits={estimate.credits} />}
      </div>

      {selected && (
        <section className="rounded-2xl border border-border bg-panel p-5" aria-label={t("result.title")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-foreground">{selected.deck.title}</h2>
              <p className="text-xs text-muted">
                {t("result.slidesCount", { count: selected.deck.slides.length })}
                {selected.creditsCharged > 0 ? ` · ${t("result.charged", { credits: selected.creditsCharged })}` : ""}
              </p>
            </div>
            {selected.id && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => exportPptx(selected.id as string)}
                  disabled={exporting}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground disabled:opacity-60"
                >
                  <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                  {exporting ? t("result.preparing") : t("result.exportPptx")}
                </button>
                <DownloadPdfButton
                  href={`/api/presentations/${selected.id}/pdf`}
                  label={t("result.exportPdf")}
                  fallbackName="presentation"
                />
              </div>
            )}
          </div>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {selected.deck.slides.map((slide, index) => {
              const url = imageUrlFor(slide);
              return (
                <li key={index} className="rounded-xl border border-border bg-background p-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted">
                    {index + 1} · {t(`result.layout.${slide.layout}`)}
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-foreground">{slide.title}</h3>
                  {url && (
                    <figure className="mt-2">
                      <Image
                        src={url}
                        alt={slide.imageQuery ?? slide.title}
                        width={640}
                        height={360}
                        unoptimized
                        className="h-36 w-full rounded-md object-cover"
                      />
                      {slide.image?.kind === "unsplash" && (
                        <figcaption className="mt-1 text-[10px] text-muted">
                          {t.rich("result.photoBy", {
                            name: slide.image.photographerName,
                            author: (chunks) => (
                              <a href={withUnsplashUtm((slide.image as { photographerUrl: string }).photographerUrl)} target="_blank" rel="noreferrer" className="underline">
                                {chunks}
                              </a>
                            ),
                            unsplash: (chunks) => (
                              <a href={UNSPLASH_HOME_URL} target="_blank" rel="noreferrer" className="underline">
                                {chunks}
                              </a>
                            ),
                          })}
                        </figcaption>
                      )}
                    </figure>
                  )}
                  {slide.bullets.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 ps-4 text-xs text-foreground">
                      {slide.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  )}
                  {slide.notes && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] font-medium text-muted">{t("result.notes")}</summary>
                      <p className="mt-1 text-xs text-muted">{slide.notes}</p>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-panel p-5" aria-label={t("history.title")}>
        <h2 className="text-sm font-semibold text-foreground">{t("history.title")}</h2>
        {decks.length === 0 && notes.length === 0 ? (
          <p className="mt-2 text-xs text-muted">{t("history.empty")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {decks.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <button
                  type="button"
                  disabled={!row.deck}
                  onClick={() => row.deck && setSelected({ id: row.id, deck: row.deck, creditsCharged: row.creditsCharged })}
                  className="min-w-0 flex-1 text-start disabled:cursor-default"
                >
                  <p className="truncate text-sm text-foreground">{row.title}</p>
                  <p className="text-[11px] text-muted">
                    {row.deck
                      ? t("history.slides", { count: row.deck.slides.length })
                      : t("history.failed")}
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
            {orderedNotes.map((row) => (
              <li
                key={row.id}
                className={`flex items-center justify-between gap-3 py-2 ${row.id === requestedRecord ? "rounded-lg bg-orange-500/10 px-2" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{row.title}</p>
                  <p className="text-[11px] text-muted">
                    {t("history.noteFromBefore")}
                    {row.slideCount ? ` · ${t("history.slides", { count: row.slideCount })}` : ""}
                    {" · "}
                    {new Date(row.createdAt).toLocaleDateString(locale)}
                  </p>
                  {row.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{row.description}</p>}
                </div>
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
