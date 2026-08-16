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
  Check,
} from "lucide-react";
import { EntityCard, CardGrid, type EntityCardStatus } from "@/components/ui/entity-card";
import { ListLayout } from "@/components/ui/list-layout";
import { EmptyState } from "@/components/empty-state";
import { stepLabelKey } from "@/lib/jobs/step-labels";
import { useToast } from "@/components/toast/toast-context";
import { formatDateTime } from "@/lib/format-number";
import { getErrorMessage } from "@/lib/get-error-message";
import { startAndWatchJob } from "@/lib/jobs/start-and-watch";
import { matchesSearch } from "@/lib/text/search-match";
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
  // Root translator: step-labels.ts returns FULL dotted keys (aiSteps.*).
  const tKey = useTranslations();
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
  // The worker's real step, so a long read is not a bare spinner.
  //
  // JOB_STEPS stores CODES ("reading", "answering", "checking"), not
  // sentences — a label written on the server is a label in one language,
  // and this one is shown to the user at the moment they are waiting.
  //
  // The code-to-key map used to be three lines RIGHT HERE, which is why
  // the other four job kinds went without one: a map inside a component is
  // not somewhere the next feature looks. It lives in
  // lib/jobs/step-labels.ts now, covering all five kinds, and this reads
  // from it like everything else does.
  const [askStep, setAskStep] = useState<string | null>(null);
  const askStepKey = stepLabelKey("file_ask", askStep);
  const askStepLabel = askStepKey ? tKey(askStepKey) : t("asking");

  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const storageUsed = useMemo(
    () => files.reduce((sum, f) => sum + f.size_bytes, 0),
    [files]
  );

  const rows = useMemo(() => {
    const q = query.trim();
    return files.filter((f) => matchesSearch(f.filename, q));
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
      // ASKING IS A BACKGROUND JOB NOW. The route used to send the whole
      // document set through one model call under a 60-second ceiling —
      // the request most likely to be killed, and a kill lost the answer
      // and kept the hold. The work now outlives this page; the progress
      // line below is the worker's real step, not a timer.
      const outcome = await startAndWatchJob(
        "/api/files/ask",
        { question: question.trim(), fileIds: selected, language: locale },
        { onProgress: (job) => setAskStep(job.stepLabel) }
      );
      if (!outcome.ok) {
        addToast(
          outcome.code === "still_running"
            ? t("askStillRunning")
            : outcome.code === "stalled"
              ? t("askStalled")
              : outcome.error || t("askError"),
          outcome.code === "still_running" ? "success" : "error"
        );
        return;
      }
      const data = outcome.result as Record<string, unknown>;
      if (!data.answered) {
        addToast(t("askError"), "error");
        return;
      }
      setAnswer({
        text: String(data.answer ?? ""),
        fromDocuments: Boolean(data.answeredFromDocuments),
        citations: (data.citations ?? []) as Citation[],
        removedCitations: Number(data.removedCitations ?? 0),
        skippedFiles: (data.skippedFiles ?? []) as string[],
        truncated: Boolean(data.truncated),
        credits: Number(outcome.creditsCharged ?? 0),
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

  // WHICH OF THE THREE STEPS THE USER IS ON, derived from the page's own
  // state rather than tracked separately — a wizard that can disagree with
  // the thing it describes is worse than no wizard.
  const currentStep = files.length === 0 ? 1 : selected.length === 0 ? 2 : 3;

  // The two reasons Ask can be unavailable, as text rather than as a grey
  // button. Both are things the user can fix in one action, so saying
  // which one applies is the whole difference between a dead end and an
  // instruction.
  const askDisabledReason =
    selected.length === 0
      ? t("askDisabledNoFiles")
      : !question.trim()
        ? t("askDisabledNoQuestion")
        : selected.length > MAX_FILES_PER_QUESTION
          ? t("tooManySelected", { max: MAX_FILES_PER_QUESTION })
          : null;

  const EXAMPLES = [t("example1"), t("example2"), t("example3")];

  return (
    <div className="space-y-5 pb-24">
      {/* THE THREE STEPS.

          The report was "I do not understand how it works and I cannot ask
          a question". Every piece was already on the page — upload, a card
          grid, a Collections box, an Ask panel — and nothing said they were
          a SEQUENCE. On a 900px screen with three files the Ask panel sat
          entirely below the fold, so the feature's whole purpose was
          off-screen behind two things that looked like the point.

          Stated once, at the top, with the current step marked. It is
          derived state, so it cannot drift from what the page is doing. */}
      <ol
        data-testid="files-steps"
        aria-label={t("stepsLabel")}
        className="grid gap-2 rounded-2xl border border-border bg-panel/60 p-3 sm:grid-cols-3"
      >
        {[
          { n: 1, title: t("step1Title"), hint: t("step1Hint") },
          { n: 2, title: t("step2Title"), hint: t("step2Hint") },
          { n: 3, title: t("step3Title"), hint: t("step3Hint") },
        ].map((step) => {
          const isCurrent = currentStep === step.n;
          const isDone = currentStep > step.n;
          return (
            <li
              key={step.n}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors duration-200 ${
                isCurrent
                  ? "border-orange-500/50 bg-orange-500/[0.07]"
                  : "border-transparent bg-transparent"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  isCurrent
                    ? "bg-orange-500 text-black"
                    : isDone
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-input text-muted"
                }`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : step.n}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-xs font-semibold ${isCurrent ? "text-foreground" : "text-muted"}`}
                >
                  {step.title}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted/80">{step.hint}</span>
              </span>
            </li>
          );
        })}
      </ol>

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
          data-testid="files-upload-button"
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
          files.length === 0 ? (
            /* THE EMPTY STATE THAT TEACHES.
               It used to read "No files yet. Upload one to start asking
               questions about it." — which reports a fact and leaves the
               reader to guess what the page is for. A first-time user needs
               to know what can be uploaded and what a question looks like,
               and the fastest way to convey the second is to show one. */
            <div
              data-testid="files-empty"
              className="rounded-2xl border border-border bg-panel/40 px-5 py-8 text-center"
            >
              <FileText className="mx-auto mb-3 h-7 w-7 text-orange-400/70" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">{t("emptyTitle")}</p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted">{t("emptyBody")}</p>
              <p className="mx-auto mt-2 max-w-md text-xs italic leading-relaxed text-muted/80">
                {t("emptyExample")}
              </p>
              <button
                type="button"
                data-testid="files-empty-upload"
                onClick={() => inputRef.current?.click()}
                className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                {t("choose")}
              </button>
            </div>
          ) : (
            <EmptyState icon={SearchX}>{tModule("noMatches", { query })}</EmptyState>
          )
        ) : (
          <CardGrid testId="files-list">
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
                  selected={isSelected}
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
                    {/* The tick was 14px with an 11px label, inside a card
                        with no highlight — there was no way to see, at a
                        glance, which files a question would use. Now a real
                        target, a real label, and the card itself lights up
                        (EntityCard's `selected`). */}
                    <label
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors duration-150 ${
                        file.processing_status !== "ready"
                          ? "cursor-not-allowed border-transparent text-muted/70"
                          : isSelected
                            ? "border-orange-500/50 bg-orange-500/10 text-orange-300"
                            : "border-border text-muted hover:border-orange-500/40 hover:text-foreground"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={file.processing_status !== "ready"}
                        onChange={() => toggle(file.id)}
                        className="h-[18px] w-[18px] rounded border-border accent-orange-500"
                      />
                      {file.processing_status === "ready" ? t("include") : t("cannotInclude")}
                    </label>
                    {/* PROCESSING AND FAILURE, in words.
                        A status chip reading "Processing" says nothing
                        about whether to wait ten seconds or give up, and a
                        chip reading "Unreadable" does not say the file has
                        to be replaced rather than re-selected. */}
                    {(file.processing_status === "pending" || file.processing_status === "processing") && (
                      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-400/90">
                        <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
                        {t("processingHint")}
                      </p>
                    )}
                    {file.processing_status === "failed" && (
                      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-400/90">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                        {file.error ?? t("failedHint")}
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
      <section
        id="files-ask"
        className="space-y-3 rounded-2xl border border-orange-500/30 bg-orange-500/[0.04] p-4"
      >
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

        <textarea
          data-testid="files-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("askPlaceholder")}
          rows={3}
          maxLength={2000}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />

        {/* EXAMPLE QUESTIONS, clickable.
            "What do these documents say about…?" as a placeholder tells
            somebody the shape of a question but not that this page answers
            specific ones. A question they can press is faster to understand
            than any amount of instruction, and it costs one click to try. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted">{t("examplesLabel")}</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              data-testid="files-example"
              onClick={() => setQuestion(example)}
              className="inline-flex min-h-[30px] items-center rounded-full border border-border px-3 py-1 text-[11px] text-muted transition-colors duration-150 hover:border-orange-500/50 hover:text-orange-300"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            data-testid="files-ask-button"
            onClick={() => void ask()}
            disabled={asking || Boolean(askDisabledReason)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {asking ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {asking ? askStepLabel : t("ask")}
          </button>
          {/* A grey button with no explanation is where this flow dead-ended.
              Which of the two prerequisites is missing decides what the user
              does next, so it is named. */}
          {askDisabledReason && !asking && (
            <p data-testid="files-ask-disabled-reason" className="text-xs text-amber-400/90">
              {askDisabledReason}
            </p>
          )}
        </div>

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

      {/* THE BAR THAT MAKES STEP 3 REACHABLE.

          The measurement behind this: with three files at 1280x900 the page
          is 1373px tall, so "Ask my documents" — the entire purpose of the
          feature — was below the fold, behind a card grid and a Collections
          box that both look like the point. That is the literal reading of
          "cannot ask a question": the control was there and off-screen.

          Reordering would only move the problem, since the files have to be
          tickable before there is anything to ask about. So the count and
          the way to step 3 follow the user down the page instead. It
          appears only once something is selected, which is also the moment
          the count becomes worth showing. */}
      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-orange-500/30 bg-panel/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2">
            <span
              data-testid="files-selected-count"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground"
            >
              <Check className="h-4 w-4 text-orange-400" aria-hidden="true" />
              {t("selectedCount", { count: selected.length })}
            </span>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-xs text-muted underline-offset-2 transition-colors duration-150 hover:text-foreground hover:underline"
            >
              {t("clearSelection")}
            </button>
            <span className="grow" />
            {selected.length > MAX_FILES_PER_QUESTION && (
              <span className="text-[11px] text-amber-400/90">
                {t("tooManySelected", { max: MAX_FILES_PER_QUESTION })}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                document.getElementById("files-ask")?.scrollIntoView({ behavior: "smooth", block: "center" });
                // Focus after the scroll starts: landing in the box is the
                // difference between arriving at step 3 and being shown it.
                setTimeout(
                  () => document.querySelector<HTMLTextAreaElement>('[data-testid="files-question"]')?.focus(),
                  350
                );
              }}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("goToAsk")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
