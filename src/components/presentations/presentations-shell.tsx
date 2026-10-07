"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Clock, FileDown, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { DownloadPdfButton, saveFileResponse } from "@/components/ui/download-pdf-button";
import { CostEstimateHint, useCostEstimate } from "@/components/credits/cost-estimate";
import { ToolShell, ChosenBox, OPTION, ACTION, workIsBeside, type ShellTurn } from "@/components/shell/tool-shell";
import { DeckSlides } from "@/components/presentations/deck-slides";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  ACCEPTED_ATTACHMENT_IMAGE_TYPES,
  CREATE_ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_IMAGE_BYTES,
  buildAttachmentImagePath,
} from "@/lib/create-attachment-image";
import {
  DEFAULT_SLIDES,
  IMAGE_SOURCES,
  MAX_DESCRIPTION_CHARS,
  MAX_INSTRUCTION_CHARS,
  MAX_OWN_IMAGES,
  MAX_SLIDES,
  MIN_INSTRUCTION_CHARS,
  MIN_SLIDES,
  deckEditEstimateInputChars,
  deckEstimateInputChars,
  type Deck,
  type ImageSource,
  type Slide,
} from "@/lib/presentations/deck";
import type { DeckRow, NoteRow } from "@/lib/presentations/rows";

type Open = { id: string | null; deck: Deck };

/**
 * SLIDES IN THE SHELL (MASTER 14.3, package 3), behind the switch
 * "tool-shell". The same routes as components/presentations/presentations-workspace.tsx,
 * which stays the page for everybody the switch is off for.
 *
 * The first thing said in the field writes the deck; while a saved deck is
 * open, what is said next CHANGES it (/api/presentations/[id]/edit), the
 * way a conversation works. The slides open beside the conversation, with
 * PowerPoint and PDF on top. Four options under the field: how many
 * slides, where the pictures come from, what was made before, and a new
 * deck.
 *
 * BOXES (package 4): a slide's number and title are pressed to choose it,
 * and the next change goes with its index — the route keeps every other
 * slide exactly as stored (lib/presentations/deck.ts, keepOnlySlide).
 */
export function PresentationsShell({
  initialDescription,
  decks,
  notes,
  ownImageUrls,
  unsplashConfigured,
}: {
  initialDescription?: string;
  decks: DeckRow[];
  notes: NoteRow[];
  ownImageUrls: Record<string, string>;
  unsplashConfigured: boolean;
}) {
  const t = useTranslations("presentations");
  const tShell = useTranslations("dashboard.toolShell");
  const tNames = useTranslations("dashboard.tools.names");
  const tSteps = useTranslations("aiSteps");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const composerRef = useRef<ChatComposerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [slideCount, setSlideCount] = useState<number>(DEFAULT_SLIDES);
  const [imageSource, setImageSource] = useState<ImageSource>(unsplashConfigured ? "unsplash" : "none");
  const [ownFiles, setOwnFiles] = useState<{ file: File; preview: string }[]>([]);
  const [localImageUrls, setLocalImageUrls] = useState<Record<string, string>>({});
  const [choosing, setChoosing] = useState<"count" | "images" | null>(null);
  const [length, setLength] = useState(initialDescription?.length ?? 0);
  const [running, setRunning] = useState(false);
  const [turns, setTurns] = useState<{ id: string; role: "user" | "tool"; text: string; deck?: Open }[]>([]);
  const [open, setOpenDeck] = useState<Open | null>(null);
  // The chosen slide of the open deck, or null for the whole deck. Any
  // other deck opening forgets it: an index means nothing in another deck.
  const [box, setBox] = useState<number | null>(null);
  const setOpen = (next: Open | null) => {
    setOpenDeck(next);
    setBox(null);
  };
  const [pane, setPane] = useState<"deck" | "recent" | null>(null);
  const [exporting, setExporting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // WHILE A SAVED DECK IS THE CURRENT ONE, THE FIELD CHANGES IT — also
  // with the work area closed, which on a phone is the only way to reach
  // the field at all. "New deck" is how to start another.
  const editing = Boolean(open?.id);
  const estimate = useCostEstimate("presentationGenerate", { inputChars: deckEstimateInputChars(length, slideCount) });
  const editEstimate = useCostEstimate("presentationEdit", {
    inputChars: open ? deckEditEstimateInputChars(open.deck, length) : 0,
  });

  function imageUrlFor(slide: Slide): string | null {
    if (!slide.image) return null;
    if (slide.image.kind === "unsplash") return slide.image.url;
    return ownImageUrls[slide.image.path] ?? localImageUrls[slide.image.path] ?? null;
  }

  function say(role: "user" | "tool", text: string, deck?: Open) {
    setTurns((prev) => [...prev, { id: `${role}${prev.length}`, role, text, deck }]);
  }

  function addOwnFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length === 0) return;
    setOwnFiles((prev) => {
      const room = MAX_OWN_IMAGES - prev.length;
      const accepted = picked
        .filter((f) => (ACCEPTED_ATTACHMENT_IMAGE_TYPES as readonly string[]).includes(f.type) && f.size <= MAX_ATTACHMENT_IMAGE_BYTES)
        .slice(0, Math.max(0, room));
      if (accepted.length < picked.length) addToast(t("errors.imageRejected", { max: MAX_OWN_IMAGES }), "error");
      return [...prev, ...accepted.map((file) => ({ file, preview: URL.createObjectURL(file) }))];
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
        const { error } = await supabase.storage.from(CREATE_ATTACHMENT_BUCKET).upload(path, file, { contentType: file.type });
        return { path, preview, error };
      })
    );
    const failures = results.filter((r) => r.error);
    if (failures.length > 0) addToast(getErrorMessage(failures[0].error, t("errors.uploadFailed")), "error");
    const ok = results.filter((r) => !r.error);
    setLocalImageUrls((prev) => ({ ...prev, ...Object.fromEntries(ok.map((r) => [r.path, r.preview])) }));
    return ok.map((r) => r.path);
  }

  function refusal(code: string, limit: number): string {
    return code === "too_long"
      ? t("errors.tooLong", { limit })
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
                : code === "not_included"
                  ? t("edit.notIncluded")
                  : code === "no_deck"
                    ? t("edit.noDeck")
                    : code === "bad_slide"
                      ? tShell("box.lost")
                    : code === "not_saved"
                      ? t("edit.notSaved")
                      : t("errors.failed");
  }

  async function write(description: string) {
    if (running) return;
    say("user", description);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    // THE PHOTOGRAPHS ARE UNDONE IF NO DECK COMES BACK TO HOLD THEM, as on
    // the page: every exit that is not a saved deck removes what was put
    // in create-attachments for it.
    let uploaded: string[] = [];
    const discardUploads = async () => {
      if (uploaded.length === 0) return;
      const paths = uploaded;
      uploaded = [];
      try {
        await supabase.storage.from(CREATE_ATTACHMENT_BUCKET).remove(paths);
      } catch {
        /* the run has already failed; a cleanup message would be noise */
      }
    };
    try {
      const ownImagePaths = imageSource === "own" ? await uploadOwnFiles() : [];
      uploaded = ownImagePaths;
      const response = await fetch("/api/presentations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ description: description.slice(0, MAX_DESCRIPTION_CHARS), slideCount, imageSource, ownImagePaths, locale }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        say("tool", refusal(String(body?.error ?? ""), MAX_DESCRIPTION_CHARS));
        await discardUploads();
        return;
      }
      uploaded = [];
      const made: Open = { id: (body?.id as string | null) ?? null, deck: body?.deck as Deck };
      say("tool", tShell("slides.done", { title: made.deck.title, count: made.deck.slides.length }), made);
      if (body?.images && body.images.wanted > 0 && body.images.found === 0 && imageSource !== "none") say("tool", t("result.noPhotoFound"));
      setOpen(made);
      setPane("deck");
      router.refresh();
    } catch {
      say("tool", controller.signal.aborted ? tSteps("stopped") : t("errors.failed"));
      await discardUploads();
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }

  async function change(instruction: string) {
    if (running || !open?.id) return;
    say("user", instruction);
    if (instruction.trim().length < MIN_INSTRUCTION_CHARS) {
      say("tool", t("errors.tooShort"));
      return;
    }
    setRunning(true);
    try {
      const response = await fetch(`/api/presentations/${open.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instruction.slice(0, MAX_INSTRUCTION_CHARS), ...(box === null ? {} : { slideIndex: box }) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        say("tool", refusal(String(body?.error ?? ""), MAX_INSTRUCTION_CHARS));
        return;
      }
      const changed: Open = { id: String(body.id), deck: body.deck as Deck };
      say("tool", box === null ? tShell("slides.changed") : tShell("box.slideChanged", { n: box + 1 }), changed);
      // The same slide stays chosen: the next words are usually about it.
      setOpenDeck(changed);
      setPane("deck");
      router.refresh();
    } catch {
      say("tool", t("errors.failed"));
    } finally {
      setRunning(false);
    }
  }

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
    if (open?.id === id) setOpen(null);
    router.refresh();
  }

  const shellTurns: ShellTurn[] = turns.map((turn) =>
    turn.deck
      ? {
          id: turn.id,
          role: turn.role,
          text: turn.text,
          card: {
            title: turn.deck.deck.title,
            open: pane === "deck" && open === turn.deck,
            onOpen: () => {
              setOpen(turn.deck!);
              setPane("deck");
            },
          },
        }
      : { id: turn.id, role: turn.role, text: turn.text }
  );

  const work =
    pane === "deck" && open
      ? {
          title: open.deck.title,
          actions: open.id ? (
            <>
              <button
                type="button"
                onClick={() => exportPptx(open.id as string)}
                disabled={exporting}
                aria-label={t("result.exportPptx")}
                title={t("result.exportPptx")}
                data-testid="slides-pptx"
                className={ACTION}
              >
                <FileDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <DownloadPdfButton href={`/api/presentations/${open.id}/pdf`} label={t("result.exportPdf")} fallbackName="presentation" className={OPTION} />
            </>
          ) : null,
          body: open.id ? (
            <>
              <p className="mb-3 text-xs text-muted">{tShell("box.hint")}</p>
              <DeckSlides
                deck={open.deck}
                imageUrlFor={imageUrlFor}
                selected={box}
                onSelect={(index) => {
                  setBox((v) => (v === index ? null : index));
                  // On a phone the work covers the field: back to it.
                  if (!workIsBeside()) setPane(null);
                  composerRef.current?.focus();
                }}
              />
            </>
          ) : (
            <DeckSlides deck={open.deck} imageUrlFor={imageUrlFor} />
          ),
        }
      : pane === "recent"
        ? {
            title: t("history.title"),
            body:
              decks.length === 0 && notes.length === 0 ? (
                <p className="text-xs text-muted">{t("history.empty")}</p>
              ) : (
                <ul className="row-list">
                  {decks.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                      <button
                        type="button"
                        disabled={!row.deck}
                        onClick={() => {
                          if (!row.deck) return;
                          setOpen({ id: row.id, deck: row.deck });
                          setPane("deck");
                        }}
                        className="min-w-0 flex-1 text-start disabled:cursor-default"
                      >
                        <p className="break-words text-sm text-foreground">{row.title}</p>
                        <p className="text-[11px] text-muted">
                          {row.deck ? t("result.slidesCount", { count: row.deck.slides.length }) : t("history.failed")}
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
                  {notes.map((note) => (
                    <li key={note.id} className="py-2">
                      <p className="break-words text-sm text-foreground">{note.title}</p>
                      <p className="text-[11px] text-muted">{new Date(note.createdAt).toLocaleDateString(locale)}</p>
                    </li>
                  ))}
                </ul>
              ),
          }
        : null;

  // Literal keys, for the same reason as in components/presentations/deck-slides.tsx.
  const sourceNames: Record<ImageSource, string> = {
    unsplash: t("form.sources.unsplash"),
    own: t("form.sources.own"),
    none: t("form.sources.none"),
  };
  const counts = Array.from({ length: MAX_SLIDES - MIN_SLIDES + 1 }, (_, i) => MIN_SLIDES + i);
  const sources = IMAGE_SOURCES.filter((s) => s !== "unsplash" || unsplashConfigured);

  return (
    <ToolShell
      ref={composerRef}
      name={tNames("slides")}
      turns={shellTurns}
      working={
        running ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <ThinkingIndicator size="sm" />
            {editing ? t("edit.applying") : t("form.generating")}
          </span>
        ) : null
      }
      placeholder={
        editing && box !== null
          ? tShell("box.placeholder", { name: tShell("box.slide", { n: box + 1 }) })
          : editing
            ? t("edit.placeholder")
            : t("form.descriptionPlaceholder")
      }
      sending={running}
      onSend={(text) => void (editing ? change(text) : write(text))}
      onStop={() => abortRef.current?.abort()}
      initialText={initialDescription}
      onLengthChange={setLength}
      options={[
        <span key="count" className="relative">
          <button type="button" onClick={() => setChoosing((v) => (v === "count" ? null : "count"))} aria-expanded={choosing === "count"} data-testid="slides-count" className={OPTION}>
            {t("form.slides", { count: slideCount })}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {choosing === "count" && (
            <div role="listbox" aria-label={t("form.slideCount")} className="surface absolute bottom-full start-0 z-10 mb-2 grid w-64 grid-cols-6 gap-1">
              {counts.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="option"
                  aria-selected={n === slideCount}
                  onClick={() => {
                    setSlideCount(n);
                    setChoosing(null);
                  }}
                  className={`min-h-[44px] rounded-item text-sm ${n === slideCount ? "bg-panel-hover text-foreground" : "text-muted hover:text-foreground"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </span>,
        <span key="images" className="relative">
          <button type="button" onClick={() => setChoosing((v) => (v === "images" ? null : "images"))} aria-expanded={choosing === "images"} data-testid="slides-images" className={OPTION}>
            <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {sourceNames[imageSource]}
          </button>
          {choosing === "images" && (
            <fieldset className="surface absolute bottom-full start-0 z-10 mb-2 w-72 space-y-1">
              <legend className="sr-only">{t("form.imageSource")}</legend>
              {sources.map((s) => (
                <label key={s} className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input type="radio" name="slides-image-source" checked={imageSource === s} onChange={() => setImageSource(s)} />
                  {sourceNames[s]}
                </label>
              ))}
              {imageSource === "own" && (
                <>
                  <input ref={fileInputRef} type="file" accept={ACCEPTED_ATTACHMENT_IMAGE_TYPES.join(",")} multiple hidden onChange={addOwnFiles} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className={OPTION}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("form.addPhotos")} ({t("form.photosSelected", { count: ownFiles.length, max: MAX_OWN_IMAGES })})
                  </button>
                </>
              )}
            </fieldset>
          )}
        </span>,
        <button key="recent" type="button" onClick={() => setPane((v) => (v === "recent" ? null : "recent"))} aria-pressed={pane === "recent"} data-testid="slides-recent" className={OPTION}>
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {t("history.title")}
        </button>,
        <button
          key="new"
          type="button"
          onClick={() => {
            setOpen(null);
            setPane(null);
            composerRef.current?.focus();
          }}
          disabled={!open}
          data-testid="slides-new"
          className={`${OPTION} disabled:opacity-40`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {tShell("slides.new")}
        </button>,
      ]}
      footer={
        <>
          {editing && box !== null && <ChosenBox label={tShell("box.slide", { n: box + 1 })} onClear={() => setBox(null)} />}
          {!running && length > 0 ? <CostEstimateHint credits={editing ? editEstimate.credits : estimate.credits} /> : null}
        </>
      }
      work={work}
      onCloseWork={() => setPane(null)}
    />
  );
}
