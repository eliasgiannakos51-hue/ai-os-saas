"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  FileText,
  Upload,
  Trash2,
  Download,
  Sparkles,
  SearchX,
  FolderPlus,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { EntityCard, CardGrid, type EntityCardStatus } from "@/components/ui/entity-card";
import { ListLayout } from "@/components/ui/list-layout";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast/toast-context";
import { formatDateTime } from "@/lib/format-number";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILE_BYTES,
  MAX_FILES_PER_QUESTION,
  formatBytes,
} from "@/lib/files/file-types";

export type WorkspaceFile = {
  id: string;
  filename: string;
  file_type: string;
  size_bytes: number;
  page_count: number | null;
  char_count: number;
  processing_status: "pending" | "processing" | "ready" | "failed";
  error: string | null;
  uploaded_at: string;
};

export type WorkspaceCollection = {
  id: string;
  name: string;
  description: string | null;
  fileIds: string[];
};

type Citation = { filename: string; label: string };

type Answer = {
  text: string;
  fromDocuments: boolean;
  citations: Citation[];
  removedCitations: number;
  skippedFiles: string[];
  truncated: boolean;
  credits: number;
  disclosure: string;
};

/**
 * The File Workspace.
 *
 * The design decision that shapes everything else: SELECTION IS THE
 * SUBJECT. A question is asked about the files that are ticked, and the
 * ask panel names them — because "the AI answered from my documents" is
 * only reassuring if you can see which ones. A picker hidden behind a
 * modal would let somebody ask about the wrong contract and never know.
 */
export function FilesWorkspace({
  initialFiles,
  initialCollections,
  usage,
}: {
  initialFiles: WorkspaceFile[];
  initialCollections: WorkspaceCollection[];
  usage: { fileCap: number | null; storageBytes: number; storageCap: number | null };
}) {
  const t = useTranslations("dashboard.files");
  const tModule = useTranslations("module");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();

  const [files, setFiles] = useState(initialFiles);
  const [collections, setCollections] = useState(initialCollections);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);

  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const storageUsed = useMemo(
    () => files.reduce((sum, f) => sum + f.size_bytes, 0),
    [files]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => !q || f.filename.toLowerCase().includes(q));
  }, [files, query]);

  const selectedFiles = useMemo(
    () => files.filter((f) => selected.includes(f.id)),
    [files, selected]
  );

  const toggle = useCallback((id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }, []);

  async function uploadOne(file: File) {
    // Refused here as well as on the server, so a 19MB upload does not
    // have to travel before being told no.
    if (file.size > MAX_FILE_BYTES) {
      addToast(t("tooLarge", { name: file.name, max: formatBytes(MAX_FILE_BYTES) }), "error");
      return;
    }
    setUploading(file.name);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/files/upload", { method: "POST", body });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("uploadError"), "error");
        return;
      }
      setFiles((current) => [data.file as WorkspaceFile, ...current]);
      // A file that stored but could not be READ is not a success, and
      // saying "uploaded" over it is how somebody comes to believe the AI
      // can see a scan that it cannot.
      if (data.file.processing_status === "failed") {
        addToast(data.file.error ?? t("uploadUnreadable", { name: file.name }), "error");
      } else {
        addToast(t("uploadSuccess", { name: data.file.filename }));
      }
    } catch (err) {
      addToast(getErrorMessage(err, t("uploadError")), "error");
    } finally {
      setUploading(null);
    }
  }

  async function uploadMany(list: FileList | null) {
    if (!list) return;
    // Sequentially: each upload runs a CPU-bound extraction, and firing
    // ten at once is how a browser drop of a folder becomes a timeout.
    for (const file of Array.from(list)) {
      await uploadOne(file);
    }
    router.refresh();
  }

  async function download(id: string, filename: string) {
    setBusy(id);
    try {
      const response = await fetch(`/api/files/${id}/download`);
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("downloadError"), "error");
        return;
      }
      // A plain navigation, not a fetch: the signed URL is a download,
      // and it expires in a minute.
      const link = document.createElement("a");
      link.href = data.url;
      link.download = filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      addToast(getErrorMessage(err, t("downloadError")), "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string, filename: string) {
    if (!window.confirm(t("confirmDelete", { name: filename }))) return;
    setBusy(id);
    try {
      const response = await fetch(`/api/files/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("deleteError"), "error");
        return;
      }
      setFiles((current) => current.filter((f) => f.id !== id));
      setSelected((current) => current.filter((x) => x !== id));
      addToast(t("deleteSuccess"));
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("deleteError")), "error");
    } finally {
      setBusy(null);
    }
  }

  async function ask() {
    if (selected.length === 0) {
      addToast(t("selectFirst"), "error");
      return;
    }
    if (!question.trim()) return;

    setAsking(true);
    setAnswer(null);
    try {
      const response = await fetch("/api/files/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), fileIds: selected, language: locale }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("askError"), "error");
        return;
      }
      setAnswer({
        text: data.answer,
        fromDocuments: data.answeredFromDocuments,
        citations: data.citations ?? [],
        removedCitations: data.removedCitations ?? 0,
        skippedFiles: data.skippedFiles ?? [],
        truncated: Boolean(data.truncated),
        credits: Number(data.creditsCharged ?? 0),
        disclosure: String(data.disclosure ?? ""),
      });
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("askError")), "error");
    } finally {
      setAsking(false);
    }
  }

  async function createCollection() {
    const name = newCollectionName.trim();
    if (!name) return;
    setCreatingCollection(true);
    try {
      const response = await fetch("/api/files/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, fileIds: selected }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("collectionError"), "error");
        return;
      }
      setCollections((current) => [data.collection as WorkspaceCollection, ...current]);
      setNewCollectionName("");
      addToast(t("collectionCreated", { name }));
    } catch (err) {
      addToast(getErrorMessage(err, t("collectionError")), "error");
    } finally {
      setCreatingCollection(false);
    }
  }

  function statusFor(file: WorkspaceFile): EntityCardStatus {
    if (file.processing_status === "ready") return { label: t("statusReady"), tone: "success" };
    if (file.processing_status === "failed") return { label: t("statusFailed"), tone: "danger" };
    return { label: t("statusProcessing"), tone: "warning" };
  }

  return (
    <div className="space-y-5">
      {/* Upload. A drop zone AND a button: dragging is faster for people
          who know it exists, and invisible to everyone else. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void uploadMany(e.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors duration-150 ${
          dragging ? "border-orange-500 bg-orange-500/[0.06]" : "border-border bg-panel/40"
        }`}
      >
        <Upload className="mx-auto mb-2 h-5 w-5 text-muted" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">{t("dropHere")}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          {t("uploadHint", { max: formatBytes(MAX_FILE_BYTES) })}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          onChange={(e) => {
            void uploadMany(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={Boolean(uploading)}
          className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {t("uploading", { name: uploading })}
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              {t("choose")}
            </>
          )}
        </button>
      </div>

      <ListLayout
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder={tModule("searchPlaceholder")}
        meta={
          <span className="text-xs text-muted">
            {usage.fileCap === null
              ? t("usedUnlimited", { used: files.length })
              : t("used", { used: files.length, cap: usage.fileCap })}
            {" · "}
            {usage.storageCap === null
              ? formatBytes(storageUsed)
              : t("storage", {
                  used: formatBytes(storageUsed),
                  cap: formatBytes(usage.storageCap),
                })}
          </span>
        }
      >
        {rows.length === 0 ? (
          <EmptyState icon={files.length === 0 ? FileText : SearchX}>
            {files.length === 0 ? t("empty") : tModule("noMatches", { query })}
          </EmptyState>
        ) : (
          <CardGrid>
            {rows.map((file, index) => {
              const isSelected = selected.includes(file.id);
              return (
                <EntityCard
                  key={file.id}
                  index={index}
                  icon={FileText}
                  accentSlug="documents"
                  title={file.filename}
                  description={t("uploadedAt", { when: formatDateTime(file.uploaded_at, locale) })}
                  status={statusFor(file)}
                  tags={[
                    { key: "type", label: file.file_type.toUpperCase(), tone: "accent" },
                    { key: "size", label: formatBytes(file.size_bytes) },
                    ...(file.page_count
                      ? [{ key: "pages", label: t("pages", { count: file.page_count }) }]
                      : []),
                  ]}
                  menuLabel={tModule("actionsFor", { name: file.filename })}
                  menu={[
                    {
                      key: "download",
                      label: t("download"),
                      icon: Download,
                      disabled: busy === file.id,
                      onSelect: () => void download(file.id, file.filename),
                    },
                    {
                      key: "delete",
                      label: t("delete"),
                      icon: Trash2,
                      destructive: true,
                      disabled: busy === file.id,
                      onSelect: () => void remove(file.id, file.filename),
                    },
                  ]}
                >
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium text-muted">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={file.processing_status !== "ready"}
                        onChange={() => toggle(file.id)}
                        className="h-3.5 w-3.5 rounded border-border accent-orange-500"
                      />
                      {file.processing_status === "ready" ? t("include") : t("cannotInclude")}
                    </label>
                    {file.error && (
                      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-400/90">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                        {file.error}
                      </p>
                    )}
                  </div>
                </EntityCard>
              );
            })}
          </CardGrid>
        )}
      </ListLayout>

      {/* Collections. Deliberately small: a collection is a shortcut for
          "these files again", not a filing system. */}
      <section className="space-y-2 rounded-2xl border border-border bg-panel/60 p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("collections")}</h2>
        {collections.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {collections.map((collection) => (
              <button
                key={collection.id}
                type="button"
                onClick={() => setSelected(collection.fileIds)}
                className="inline-flex min-h-[32px] items-center rounded-lg border border-border px-3 py-1 text-[11px] font-medium text-muted transition-colors duration-150 hover:text-foreground"
              >
                {collection.name} · {collection.fileIds.length}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder={t("collectionPlaceholder")}
            maxLength={80}
            className="min-h-[36px] flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted"
          />
          <button
            type="button"
            onClick={() => void createCollection()}
            disabled={creatingCollection || !newCollectionName.trim()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground disabled:opacity-50"
          >
            <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
            {t("saveSelection", { count: selected.length })}
          </button>
        </div>
      </section>

      {/* Ask. Naming the selected files here rather than only ticking them
          above is the point: the answer is only as trustworthy as the
          reader's certainty about what it was drawn from. */}
      <section className="space-y-3 rounded-2xl border border-orange-500/30 bg-orange-500/[0.04] p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-orange-400" aria-hidden="true" />
          {t("askTitle")}
        </h2>

        <p className="text-[11px] leading-relaxed text-muted">
          {selected.length === 0
            ? t("askNothingSelected")
            : t("askSelected", {
                count: selected.length,
                names: selectedFiles.map((f) => f.filename).join(", "),
              })}
        </p>
        {selected.length > MAX_FILES_PER_QUESTION && (
          <p className="text-[11px] text-amber-400/90">{t("tooManySelected", { max: MAX_FILES_PER_QUESTION })}</p>
        )}

        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("askPlaceholder")}
          rows={3}
          maxLength={2000}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />

        <button
          type="button"
          onClick={() => void ask()}
          disabled={asking || !question.trim() || selected.length === 0}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-60"
        >
          {asking ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {t("asking")}
            </>
          ) : (
            t("ask")
          )}
        </button>

        {answer && (
          <div className="space-y-2 rounded-xl border border-border bg-panel/60 p-3">
            {/* Said FIRST, not in a footnote: whether the answer came out
                of the documents at all is the most important thing about
                it. */}
            {!answer.fromDocuments && (
              <p className="flex items-start gap-1.5 text-[11px] font-medium leading-relaxed text-amber-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                {t("notInDocuments")}
              </p>
            )}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{answer.text}</p>

            {answer.citations.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted">{t("citations")}</p>
                <ul className="space-y-0.5">
                  {answer.citations.map((citation, i) => (
                    <li key={`${citation.filename}-${citation.label}-${i}`} className="text-[11px] text-muted">
                      {citation.filename} — {citation.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reported rather than swallowed: if the model invented
                references, the reader is entitled to know the answer was
                less grounded than it looked. */}
            {answer.removedCitations > 0 && (
              <p className="text-[11px] text-amber-400/90">
                {t("removedCitations", { count: answer.removedCitations })}
              </p>
            )}
            {answer.truncated && <p className="text-[11px] text-amber-400/90">{t("truncatedWarning")}</p>}
            {answer.skippedFiles.length > 0 && (
              <p className="text-[11px] text-amber-400/90">
                {t("skippedFiles", { names: answer.skippedFiles.join(", ") })}
              </p>
            )}

            <p className="text-[11px] text-muted">
              {answer.disclosure} · {t("creditsCharged", { credits: answer.credits })}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
