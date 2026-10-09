"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FileText, Trash2, Upload } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { CopyButton } from "@/components/ui/copy-button";
import { useToast } from "@/components/toast/toast-context";
import { JobSeen } from "@/components/jobs/job-seen";
import { ToolShell, OPTION, type ShellTurn } from "@/components/shell/tool-shell";
import { stepLabelKey } from "@/lib/jobs/step-labels";
import { useHeldStepLabel } from "@/lib/jobs/use-ai-job";
import { startAndWatchJob, watchJob } from "@/lib/jobs/start-and-watch";
import { markJobConsumed } from "@/lib/jobs/consume";
import { useErrorText } from "@/lib/errors/use-error-text";
import { ApiError } from "@/lib/errors/api-error";
import type { ApiErrorPayload } from "@/lib/errors/error-codes";
import { isStoppedMessage } from "@/lib/stop-message";
import { ACCEPT_ATTRIBUTE, MAX_FILE_BYTES, MAX_FILES_PER_QUESTION, MAX_QUESTION_CHARS, formatBytes, kindFromExtension } from "@/lib/files/file-types";
import { answerForClipboard, answerFromResult, type Answer, type WorkspaceFile } from "@/lib/files/answer";
import { uploadFile } from "@/lib/files/upload-file";
import { CitedAnswerText, CitedPages, PageView } from "@/components/files/cited-answer";
import { pagesRead } from "@/lib/files/page-refs";
import type { Citation } from "@/lib/files/answer";

type Turn = { id: string; role: "user" | "tool"; text: string; answer?: Answer };

/**
 * FILES IN THE SHELL (MASTER 14.3, package 3), behind the switch
 * "tool-shell". The same routes and the same answer builder as
 * components/files/files-workspace.tsx, which stays the page for
 * everybody the switch is off for.
 *
 * SELECTION IS STILL THE SUBJECT: a question is asked of the files that
 * are ticked, and the conversation says which before it is asked. The
 * files and their ticks are the work beside the conversation; the field
 * asks; every answer carries the page it came from, or says it is not in
 * the documents. Two options: upload, and the files (with how many are
 * ticked). An answer that finished while the person was elsewhere is put
 * back, as on the page.
 */
export function FilesShell({
  initialFiles,
  initialOpenId = null,
  pages = false,
}: {
  initialFiles: WorkspaceFile[];
  /** A file to open on arrival — `?record=` from the Library: it is ticked, so the next question is asked of it. */
  initialOpenId?: string | null;
  /** The switch "file-pages" (package 12): an answer's pages are pressed to open them. */
  pages?: boolean;
}) {
  const t = useTranslations("dashboard.files");
  const tAsk = useTranslations("aiSteps.file_ask");
  const tNames = useTranslations("dashboard.tools.names");
  const tSteps = useTranslations("aiSteps");
  const describe = useErrorText();
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState(initialFiles);
  const asked = initialOpenId ? initialFiles.find((f) => f.id === initialOpenId) : undefined;
  const [selected, setSelected] = useState<string[]>(asked?.processing_status === "ready" ? [asked.id] : []);
  const [uploading, setUploading] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [askStep, setAskStep] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  // The page opened from an answer, with the turn it belongs to.
  const [openPage, setOpenPage] = useState<{ turnId: string; citation: Citation } | null>(null);
  const [pane, setPane] = useState<"files" | null>(asked ? "files" : null);
  const heldAskStep = useHeldStepLabel(askStep);
  // The worker's real step, through literal keys so the message slicer can
  // bound them (lib/i18n/message-slices.ts); the step codes are
  // lib/jobs/job-types.ts's, and stepLabelKey says which are declared.
  const askSteps: Record<string, string> = {
    reading: tAsk("reading"),
    answering: tAsk("answering"),
    combining: tAsk("combining"),
    checking: tAsk("checking"),
  };
  const askStepLabel = stepLabelKey("file_ask", heldAskStep) && heldAskStep ? askSteps[heldAskStep] : null;

  const say = (turn: Omit<Turn, "id">) => setTurns((prev) => [...prev, { ...turn, id: `${turn.role}${prev.length}` }]);
  const askable = useMemo(() => files.filter((f) => f.processing_status === "ready"), [files]);
  const selectedFiles = useMemo(() => files.filter((f) => selected.includes(f.id)), [files, selected]);

  // THE FILES ARE OPEN BESIDE THE CONVERSATION ON A COMPUTER; on a phone
  // they would cover the field, so there the option opens them.
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) setPane("files");
  }, []);

  // AN ANSWER THAT FINISHED ELSEWHERE IS PUT BACK, and one still running
  // is watched rather than asked again (the page's rule, /api/jobs).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/jobs?kind=file_ask");
        const data = await response.json();
        if (cancelled || !data.ok || !data.job) return;
        const job = data.job as { id: string; status: string; stepLabel: string | null; input: Record<string, unknown> | null; result: Record<string, unknown> | null; creditsCharged: number | null };
        const asked = typeof job.input?.question === "string" ? job.input.question : "";
        if (job.status === "done") {
          const result = (job.result ?? {}) as Record<string, unknown>;
          if (result.answered) {
            if (asked) say({ role: "user", text: asked });
            const answer = answerFromResult(result, Number(job.creditsCharged ?? 0), String(job.id));
            say({ role: "tool", text: answer.text, answer });
          } else void markJobConsumed(String(job.id));
          return;
        }
        if (asked) say({ role: "user", text: asked });
        setAsking(true);
        setAskStep(job.stepLabel);
        const outcome = await watchJob(String(job.id), (running) => {
          if (!cancelled) setAskStep(running.stepLabel);
        });
        if (cancelled) return;
        setAsking(false);
        if (outcome.ok && outcome.result.answered) {
          const answer = answerFromResult(outcome.result, Number(outcome.creditsCharged ?? 0), String(job.id));
          say({ role: "tool", text: answer.text, answer });
        } else if (!outcome.ok && outcome.code !== "still_running") {
          say({ role: "tool", text: outcome.code === "stalled" ? t("askStalled") : t("askError") });
        }
      } catch {
        /* nothing in flight is the common answer */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount only, as on the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  async function upload(list: FileList | null) {
    for (const file of Array.from(list ?? [])) {
      if (file.size > MAX_FILE_BYTES) {
        say({ role: "tool", text: t("tooLarge", { name: file.name, max: formatBytes(MAX_FILE_BYTES) }) });
        continue;
      }
      if (!kindFromExtension(file.name)) {
        say({ role: "tool", text: t("unsupportedType", { name: file.name }) });
        continue;
      }
      if (file.size === 0) {
        say({ role: "tool", text: t("emptyFile", { name: file.name }) });
        continue;
      }
      setUploading(file.name);
      try {
        const outcome = await uploadFile(file, {
          error: t("uploadError"),
          storageMissing: t("uploadStorageMissing"),
          storagePolicy: t("uploadStoragePolicy"),
          tooLargeForTransfer: t("tooLargeForTransfer"),
          offline: describe(new ApiError(0, null)).text,
        });
        if (!outcome.ok) {
          // The server's refusal, in the reader's language: a plan's file
          // or storage limit is the plan's limit (lib/files/ingest.ts,
          // `limitReached`); a body the host refused before the route ran
          // has no answer to read; with no status, the words passed in.
          say({
            role: "tool",
            text: !outcome.status
              ? outcome.error
              : outcome.status === 413 && !outcome.body
                ? t("tooLargeForTransfer")
                : describe(new ApiError(outcome.status, (outcome.body?.limitReached ? { ...outcome.body, code: "planLimit" } : outcome.body ?? null) as ApiErrorPayload | null)).text,
          });
          continue;
        }
        setFiles((current) => [outcome.file, ...current]);
        // A file that stored but could not be READ is not a success.
        if (outcome.file.processing_status === "failed") say({ role: "tool", text: outcome.file.error ?? t("uploadUnreadable", { name: file.name }) });
        else {
          say({ role: "tool", text: t("uploadSuccess", { name: outcome.file.filename }) });
          if (outcome.file.processing_status === "ready") setSelected((current) => (current.length < MAX_FILES_PER_QUESTION ? [...current, outcome.file.id] : current));
        }
      } catch (err) {
        // Thrown, not answered: the connection (lib/errors/use-error-text.ts).
        say({ role: "tool", text: describe(err).text });
      } finally {
        setUploading(null);
      }
    }
    router.refresh();
  }

  async function remove(file: WorkspaceFile) {
    if (!window.confirm(t("confirmDelete", { name: file.filename }))) return;
    try {
      const response = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        addToast(t("deleteError"), "error");
        return;
      }
      setFiles((current) => current.filter((f) => f.id !== file.id));
      setSelected((current) => current.filter((id) => id !== file.id));
      router.refresh();
    } catch (err) {
      addToast(describe(err).text, "error");
    }
  }

  async function ask(question: string) {
    const text = question.trim().slice(0, MAX_QUESTION_CHARS);
    if (!text || asking) return;
    say({ role: "user", text });
    if (selected.length === 0) {
      say({ role: "tool", text: t("selectFirst") });
      setPane("files");
      return;
    }
    if (selected.length > MAX_FILES_PER_QUESTION) {
      say({ role: "tool", text: t("tooManySelected", { max: MAX_FILES_PER_QUESTION }) });
      return;
    }
    setAsking(true);
    try {
      const outcome = await startAndWatchJob(
        "/api/files/ask",
        { question: text, fileIds: selected, language: locale },
        { onProgress: (job) => setAskStep(job.stepLabel) }
      );
      if (!outcome.ok) {
        // IN THE READER'S LANGUAGE (checked 2026-10-08 by
        // scripts/tests/tool-shell-edges.prodtest.mjs): a refusal is said
        // from the route's status (lib/errors/use-error-text.ts), and a job
        // that failed carries the worker's or the provider's own English,
        // which is for logs.
        say({
          role: "tool",
          text:
            outcome.code === "still_running"
              ? t("askStillRunning")
              : outcome.code === "stalled"
                ? t("askStalled")
                : outcome.status
                  ? describe(new ApiError(outcome.status, (outcome.body ?? null) as ApiErrorPayload | null)).text
                  : isStoppedMessage(outcome.error)
                    ? tSteps("stopped")
                    : t("askError"),
        });
        return;
      }
      const data = outcome.result as Record<string, unknown>;
      if (!data.answered) {
        say({ role: "tool", text: t("askError") });
        return;
      }
      const answer = answerFromResult(data, Number(outcome.creditsCharged ?? 0), outcome.jobId ?? null);
      say({ role: "tool", text: answer.text, answer });
      router.refresh();
    } catch {
      say({ role: "tool", text: t("askError") });
    } finally {
      setAsking(false);
    }
  }

  const shellTurns: ShellTurn[] = [
    ...(selectedFiles.length > 0
      ? [{ id: "subject", role: "tool" as const, text: t("askSelected", { count: selectedFiles.length, names: selectedFiles.map((f) => f.filename).join(", ") }) }]
      : []),
    ...turns.map((turn) => ({
      id: turn.id,
      role: turn.role,
      // With the switch, the answer is drawn below with its pages pressable.
      text: pages && turn.answer ? "" : turn.text,
      extra: turn.answer ? (
        <div data-testid="files-answer" className="mt-2 space-y-2">
          {!turn.answer.fromDocuments && <p className="text-xs text-warning">{t("notInDocuments")}</p>}
          {pages && <CitedAnswerText answer={turn.answer} onOpen={(citation) => setOpenPage({ turnId: turn.id, citation })} />}
          {pages && turn.answer.citations.length > 0 ? (
            <div>
              <p className="text-[11px] font-medium text-muted">{t("citations")}</p>
              <CitedPages answer={turn.answer} onOpen={(citation) => setOpenPage({ turnId: turn.id, citation })} />
            </div>
          ) : pages ? (
            turn.answer.fromDocuments && <p className="text-xs text-warning">{t("uncitedAnswer")}</p>
          ) : turn.answer.citations.length > 0 ? (
            <div>
              <p className="text-[11px] font-medium text-muted">{t("citations")}</p>
              <ul data-testid="files-citations" className="mt-1 space-y-0.5">
                {turn.answer.citations.map((c, i) => (
                  <li key={`${c.filename}-${c.label}-${i}`} className="text-xs text-foreground">
                    {c.filename} — {c.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            turn.answer.fromDocuments && <p className="text-xs text-warning">{t("uncitedAnswer")}</p>
          )}
          {pages && openPage?.turnId === turn.id && openPage.citation.fileId && (
            <PageView key={`${openPage.citation.fileId}-${openPage.citation.page}`} citation={openPage.citation} onClose={() => setOpenPage(null)} />
          )}
          {pages && turn.answer.citations.length === 0 && turn.answer.unreadPages.length > 0 && <CitedPages answer={{ ...turn.answer, citations: [] }} onOpen={() => {}} />}
          {turn.answer.removedCitations > 0 && <p className="text-[11px] text-muted">{t("removedCitations", { count: turn.answer.removedCitations })}</p>}
          {turn.answer.truncated && <p className="text-[11px] text-warning">{t("truncatedWarning")}</p>}
          {turn.answer.skippedFiles.length > 0 && <p className="text-[11px] text-muted">{t("skippedFiles", { names: turn.answer.skippedFiles.join(", ") })}</p>}
          {turn.answer.disclosure && <p className="text-[11px] text-muted">{turn.answer.disclosure}</p>}
          <CopyButton text={() => answerForClipboard(turn.answer!)} variant="icon" />
          {turn.answer.jobId && <JobSeen jobId={turn.answer.jobId} />}
        </div>
      ) : undefined,
    })),
  ];

  const work =
    pane === "files"
      ? {
          title: tNames("files"),
          body: (
            <div className="space-y-3">
              {/* The terms of handing a contract to an AI, said where it is
                  handed over: one line, not a box. */}
              <p className="text-[11px] leading-relaxed text-muted">{t("privacyNotice")}</p>
              {files.length === 0 ? (
              <p className="text-xs text-muted">{t("empty")}</p>
            ) : (
              <ul data-testid="files-shell-list" className="row-list">
                {files.map((file) => {
                  const ready = file.processing_status === "ready";
                  return (
                    <li key={file.id} className="flex items-center gap-3 py-2">
                      <label className="flex min-h-[44px] min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selected.includes(file.id)}
                          disabled={!ready}
                          onChange={() => toggle(file.id)}
                          aria-label={ready ? t("include") : t("cannotInclude")}
                        />
                        <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm text-foreground">{file.filename}</span>
                          <span className="block text-[11px] text-muted">
                            {ready
                              ? pages && pagesRead(file.file_type, file.page_count)
                                ? t("pagesPartRead", { read: pagesRead(file.file_type, file.page_count)!.read, total: pagesRead(file.file_type, file.page_count)!.total })
                                : file.page_count
                                  ? t("pages", { count: file.page_count })
                                  : t("statusReady")
                              : file.processing_status === "failed"
                                ? t("statusFailed")
                                : t("statusProcessing")}
                            {" · "}
                            {formatBytes(file.size_bytes)}
                          </span>
                        </span>
                      </label>
                      <button type="button" onClick={() => void remove(file)} aria-label={t("delete")} className="inline-flex h-11 w-11 items-center justify-center rounded-item text-muted hover:text-foreground">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            </div>
          ),
        }
      : null;

  return (
    <ToolShell
      name={tNames("files")}
      turns={shellTurns}
      working={
        uploading || asking ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <ThinkingIndicator size="sm" />
            {uploading ? t("uploading", { name: uploading }) : askStepLabel ?? t("asking")}
          </span>
        ) : null
      }
      placeholder={t("askPlaceholder")}
      sending={asking}
      onSend={(text) => void ask(text)}
      options={[
        <span key="upload">
          <input ref={inputRef} type="file" accept={ACCEPT_ATTRIBUTE} multiple className="sr-only" aria-label={t("choose")} data-testid="files-shell-input" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={Boolean(uploading)} data-testid="files-shell-upload" className={OPTION}>
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {t("choose")}
          </button>
        </span>,
        <button key="files" type="button" onClick={() => setPane((v) => (v === "files" ? null : "files"))} aria-pressed={pane === "files"} data-testid="files-shell-files" className={OPTION}>
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          {t("selectedOfTotal", { count: selected.length, total: askable.length })}
        </button>,
      ]}
      footer={<p className="mt-1.5 text-[11px] text-muted">{t("maxPerQuestion", { max: MAX_FILES_PER_QUESTION })}</p>}
      work={work}
      onCloseWork={() => setPane(null)}
    />
  );
}
