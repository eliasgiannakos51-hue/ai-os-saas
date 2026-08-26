"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DownloadPdfButton } from "@/components/ui/download-pdf-button";
import { Bold, Italic, Heading1, Heading2, List, ChevronLeft, Check, Loader2 } from "lucide-react";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import type { UserDocument } from "@/types/document";

const AUTOSAVE_DEBOUNCE_MS = 2000;

type SaveState = "idle" | "saving" | "saved" | "error";

// Deliberately no editor dependency (Notion-lite, "keep it light" per the
// spec this was built from): a plain contentEditable region plus
// document.execCommand for the handful of formatting actions requested
// (bold/italic/headings/bullets). execCommand is deprecated but still
// universally supported for exactly this narrow use — the alternative is
// pulling in a whole rich-text framework for four buttons.
export function DocumentEditor({
  doc,
  initialFavorited = false,
}: {
  doc: Pick<UserDocument, "id" | "title" | "content" | "updated_at">;
  initialFavorited?: boolean;
}) {
  const t = useTranslations("dashboard.documents");
  const [title, setTitle] = useState(doc.title);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Debounced/unmount saves run inside setTimeout callbacks and effect
  // cleanups, both of which close over whatever `title` was at the time
  // they were CREATED — not the latest typed value. A ref stays current
  // across renders without re-creating those closures, so every save
  // reads the real latest title instead of a one-keystroke-behind (or, on
  // unmount, the original pre-edit) value.
  const titleRef = useRef(doc.title);
  // Guards against the save-on-unmount effect firing on first mount before
  // the user has touched anything.
  const dirty = useRef(false);

  // Set the editor's initial HTML exactly once, imperatively — a
  // contentEditable element must own its own DOM after that. Re-rendering
  // it from React state on every keystroke (the "controlled component"
  // pattern) would reset the cursor to the start of the content on every
  // render, making typing unusable.
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = doc.content?.html ?? "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(
    async (nextTitle: string, nextHtml: string) => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/documents/${doc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle, content: { html: nextHtml } }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setSaveState("error");
          return;
        }
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [doc.id]
  );

  function scheduleSave() {
    dirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      save(titleRef.current, editorRef.current?.innerHTML ?? "");
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Save immediately when leaving the page instead of waiting out the
  // debounce, so a quick edit-then-navigate never gets silently dropped.
  // The editor node itself never changes after mount (one unconditional
  // contentEditable div for the component's whole lifetime), so capturing
  // it here is equivalent to reading editorRef.current at cleanup time.
  useEffect(() => {
    const editorNode = editorRef.current;
    return () => {
      if (dirty.current && saveTimer.current) {
        clearTimeout(saveTimer.current);
        save(titleRef.current, editorNode?.innerHTML ?? "");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
    titleRef.current = e.target.value;
    scheduleSave();
  }

  function handleEditorInput() {
    scheduleSave();
  }

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    scheduleSave();
  }

  const toolbarButtons: { label: string; icon: typeof Bold; onClick: () => void }[] = [
    { label: t("bold"), icon: Bold, onClick: () => exec("bold") },
    { label: t("italic"), icon: Italic, onClick: () => exec("italic") },
    { label: t("heading1"), icon: Heading1, onClick: () => exec("formatBlock", "<h1>") },
    { label: t("heading2"), icon: Heading2, onClick: () => exec("formatBlock", "<h2>") },
    { label: t("bulletList"), icon: List, onClick: () => exec("insertUnorderedList") },
  ];

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href="/dashboard/documents"
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors duration-150 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t("backToDocuments")}
          </Link>

          <div className="flex items-center gap-3">
            {/* A document that only exists inside its own editor is not a
                document the user has. The PDF is rendered server-side from
                the same `content.html` this editor saves, so what downloads
                is what is stored — not what happens to be on screen. */}
            <DownloadPdfButton href={`/api/documents/${doc.id}/pdf`} fallbackName="document" />
            <span className="flex items-center gap-1.5 text-xs text-muted">
            {saveState === "saving" && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                {t("saving")}
              </>
            )}
            {saveState === "saved" && (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                {t("saved")}
              </>
            )}
            {saveState === "error" && <span className="text-red-400">{t("saveError")}</span>}
            </span>
          </div>
        </div>

        {/* The star pins to this block's top-right, next to the title, so
            the detail view puts the control where the card does. */}
        <div className="relative mb-4 pr-12">
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            placeholder={t("titlePlaceholder")}
            aria-label={t("titlePlaceholder")}
            className="w-full bg-transparent text-2xl font-bold text-foreground outline-none placeholder:text-muted/50"
          />
          <FavoriteButton
            table="user_documents"
            recordId={doc.id}
            headline={title || t("untitled")}
            initialFavorited={initialFavorited}
          />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-border bg-panel p-1.5">
          {toolbarButtons.map(({ label, icon: Icon, onClick }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClick}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </button>
          ))}
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleEditorInput}
          data-placeholder={t("contentPlaceholder")}
          className="document-editor-content min-h-[60vh] rounded-2xl border border-border bg-panel px-5 py-4 text-sm leading-relaxed text-foreground outline-none focus:border-orange-500/40"
        />
      </div>
    </main>
  );
}
