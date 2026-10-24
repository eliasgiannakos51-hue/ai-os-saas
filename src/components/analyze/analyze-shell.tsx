"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Download, FileText, FolderPlus, Sparkles, Trash2, Upload } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { CopyButton } from "@/components/ui/copy-button";
import { useToast } from "@/components/toast/toast-context";
import { JobSeen } from "@/components/jobs/job-seen";
import { AnalysisChart } from "@/components/data-analysis/analysis-chart";
import { FactText, useExplainFact } from "@/components/data-analysis/fact-text";
import { formatFact } from "@/lib/data-analysis/facts";
import { ToolShell, OPTION, type ShellTurn } from "@/components/shell/tool-shell";
import { ShellHistoryColumn, type ShellHistoryRow } from "@/components/shell/shell-history-column";
import { MAX_UPLOAD_BYTES } from "@/lib/data-analysis/limits";
import { useErrorText } from "@/lib/errors/use-error-text";
import { ApiError } from "@/lib/errors/api-error";
import type { ApiErrorPayload } from "@/lib/errors/error-codes";
import { describeColumn, type AnalysisSummary, type AnalysisView } from "@/lib/data-analysis/view";
import { stepLabelKey } from "@/lib/jobs/step-labels";
import { useHeldStepLabel } from "@/lib/jobs/use-ai-job";
import { startAndWatchJob, watchJob } from "@/lib/jobs/start-and-watch";
import { markJobConsumed } from "@/lib/jobs/consume";
import { isStoppedMessage } from "@/lib/stop-message";
import { askFailure } from "@/lib/files/ask-failure";
import { uploadRefusal } from "@/lib/files/refusal-words";
import { ACCEPT_ATTRIBUTE, MAX_FILE_BYTES, MAX_FILES_PER_QUESTION, MAX_QUESTION_CHARS, extensionOf, formatBytes, kindFromExtension } from "@/lib/files/file-types";
import { answerForClipboard, answerFromResult, type Answer, type WorkspaceCollection, type WorkspaceFile } from "@/lib/files/answer";
import { uploadFile } from "@/lib/files/upload-file";
import { CitedAnswerText, CitedPages, PageView, usePageLabel } from "@/components/files/cited-answer";
import { pagesRead, relabelAnswer } from "@/lib/files/page-refs";
import { useFilesFailureWords } from "@/components/files/failure-words";
import type { Citation } from "@/lib/files/answer";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import { HelpTip } from "@/components/ui/help-tip";

/** The longest name /api/files/collections keeps (its MAX_NAME). */
const MAX_COLLECTION_NAME = 80;

/** Extensions the spreadsheet reader takes — exactly what the legacy
 *  Analyze accepted (.csv/.tsv/.xlsx/.txt), unioned at the picker with
 *  everything the document reader takes. A file outside this list goes
 *  to Files' reader instead — see the PR body for the one case that
 *  overlaps (.txt: kept here, the spreadsheet's original behaviour). */
const SHEET_EXTENSIONS = new Set(["csv", "tsv", "xlsx", "txt"]);

type FileTurn = { id: string; role: "user" | "tool"; text: string; answer?: Answer; naming?: boolean };

/**
 * ANALYZE AND FILES, MERGED INTO ONE TOOL (owner's message of 2026-10-22,
 * the second critical round, item 4): "Analyze και Files γίνονται ένα, με
 * όνομα «Analyze»." Same shell shape as Coding — earth, one field, up to
 * three examples, conversation left, result right.
 *
 * NEITHER OLD ENGINE WAS REWRITTEN. This component is the two old shells
 * (analysis-shell.tsx and files-shell.tsx, both deleted in this same
 * change) spliced at the top level: one upload
 * button dispatches by extension to whichever of the two upload routes
 * already existed, one `mode` ("analysis" | "files" | null) decides which
 * half's turns and work pane are drawn, and the ONE field's `onSend`
 * routes to whichever half's `ask()` already existed. Every route, every
 * table, every credit/plan check from both tools is untouched — see the
 * PR body for the full capability-by-capability map.
 *
 * ACCEPTS, per the owner's four bullets: a file (union of what both old
 * tools accepted below); text typed or pasted with nothing open, which
 * asks the obvious "upload something first" exactly as the old Analyze
 * already did when asked with no file; and pasted text through the
 * "Επικόλληση κειμένου" option, wrapped as a .txt and read through Files'
 * own engine — reusing it rather than a third answering path. A web link
 * and a video link are NOT built here: the owner asked, for video, to be
 * told first what a YouTube link costs and whether it works at all
 * before anything is built (answered separately, not yet a decided
 * "build it"), and a web link raises the identical unresolved question
 * (fetch reliability, no existing reader in this codebase to carry over)
 * — both stay genuinely absent rather than shown and broken, the same
 * rule Coding's GitHub buttons follow.
 */
export function AnalyzeShell({
  analyses,
  current,
  initialFiles,
  initialCollections = [],
  initialOpenId = null,
  pages = false,
}: {
  analyses: AnalysisSummary[];
  current: AnalysisView | null;
  initialFiles: WorkspaceFile[];
  initialCollections?: WorkspaceCollection[];
  initialOpenId?: string | null;
  pages?: boolean;
}) {
  const t = useTranslations("dataAnalysis");
  const tFiles = useTranslations("dashboard.files");
  const tAsk = useTranslations("aiSteps.file_ask");
  const locale = useLocale();
  const explain = useExplainFact();
  const tShell = useTranslations("dashboard.toolShell");
  const tNames = useTranslations("dashboard.tools.names");
  const tSteps = useTranslations("aiSteps");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { addToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const composerRef = useRef<ChatComposerHandle>(null);
  const describe = useErrorText();
  const show = usePageLabel();
  const failures = useFilesFailureWords();

  const refusal = (status: number, code: unknown, fallback: string) =>
    status === 402 ? describe(new ApiError(402, null)).text : code === "ai_unavailable" ? t("analyse.unavailable") : fallback;

  // WHICH HALF IS ACTIVE. null while nothing has been opened or uploaded
  // yet — the empty landing shows then, same ToolShell rule as Coding.
  const [mode, setMode] = useState<"analysis" | "files" | null>(current ? "analysis" : initialOpenId ? "files" : null);
  const [pane, setPane] = useState<"work" | null>(null);

  // -- the spreadsheet half (the old analysis-shell.tsx, now deleted) --
  const [analysisUploading, setAnalysisUploading] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [analysisAsking, setAnalysisAsking] = useState(false);
  const [notes, setNotes] = useState<{ id: string; role: "user" | "tool"; text: string }[]>([]);
  const note = (role: "user" | "tool", text: string) => setNotes((prev) => [...prev, { id: `n${role}${prev.length}`, role, text }]);

  // -- the document half (the old files-shell.tsx, now deleted) --
  const [files, setFiles] = useState(initialFiles);
  const [collections, setCollections] = useState(initialCollections);
  const [naming, setNaming] = useState(false);
  // THE SAME TRICK AS `naming` (below), for pasted text (new in this
  // merge, no analogue in either old tool): while true, the next thing
  // sent is wrapped as a .txt and read through Files' own engine.
  const [pastingText, setPastingText] = useState(false);
  const [savingCollection, setSavingCollection] = useState(false);
  const requestedFile = initialOpenId ? initialFiles.find((f) => f.id === initialOpenId) : undefined;
  const [selected, setSelected] = useState<string[]>(requestedFile?.processing_status === "ready" ? [requestedFile.id] : []);
  const [filesUploading, setFilesUploading] = useState<string | null>(null);
  const [filesAsking, setFilesAsking] = useState(false);
  const [askStep, setAskStep] = useState<string | null>(null);
  const [fileTurns, setFileTurns] = useState<FileTurn[]>([]);
  const [openPage, setOpenPage] = useState<{ turnId: string; citation: Citation } | null>(null);
  const heldAskStep = useHeldStepLabel(askStep);
  const askSteps: Record<string, string> = {
    reading: tAsk("reading"),
    answering: tAsk("answering"),
    combining: tAsk("combining"),
    checking: tAsk("checking"),
  };
  const askStepLabel = stepLabelKey("file_ask", heldAskStep) && heldAskStep ? askSteps[heldAskStep] : null;
  const say = (turn: Omit<FileTurn, "id">) => setFileTurns((prev) => [...prev, { ...turn, id: `${turn.role}${prev.length}` }]);
  const askable = useMemo(() => files.filter((f) => f.processing_status === "ready"), [files]);
  const selectedFiles = useMemo(() => files.filter((f) => selected.includes(f.id)), [files, selected]);

  // ONE RESULT OPEN AT A TIME, on a computer where there is room: whichever
  // half has something to show when this mounts or `current` changes
  // under the person (a fresh `?id=` from the history column, a new
  // upload's router.push). On a phone the work would cover the field, so
  // there it waits for the person to open it.
  useEffect(() => {
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    if (current) {
      setMode("analysis");
      setPane("work");
    } else if (requestedFile) {
      setMode("files");
      setPane("work");
    } else if (!mode) {
      // Files always opened its manager on a computer with nothing
      // specific requested; that default survives the merge.
      setMode("files");
      setPane("work");
    }
    // Mount + WHICH analysis is open only, as the two old effects were. It was
    // `[current]`, the object, and every server refresh (a finished answer's
    // "seen" mark, a saved question) hands down a new object for the same
    // analysis: on a computer that put a person who had just chosen a document
    // back on the analysis, and their document answer disappeared from the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // WHAT THE PHONE'S SHARE SHEET DID (src/app/share/route.ts): it ends at
  // /dashboard/files with `?shared=N` and the counts of what failed, or
  // `?share_error=rate_limit`; /dashboard/files forwards them here and this
  // says them, once, as the old Files page did (its switch-off screen no
  // longer exists, so without this the words would be lost).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("shared") && !params.has("share_error")) return;
    const stored = Number(params.get("shared") ?? 0);
    const failed = Number(params.get("share_failed") ?? 0);
    const dropped = Number(params.get("share_dropped") ?? 0);
    const reason = params.get("share_reason");
    if (params.get("share_error") === "rate_limit") {
      addToast(tFiles("sharedRateLimit"), "error");
    } else {
      if (stored > 0) addToast(tFiles("sharedStored", { count: stored }), "success");
      if (failed > 0) {
        addToast(
          reason ? `${tFiles("sharedFailed", { count: failed })} ${tFiles("sharedReason", { reason })}` : tFiles("sharedFailed", { count: failed }),
          "error"
        );
      }
      if (dropped > 0) addToast(tFiles("sharedDropped", { max: 5 }), "error");
    }
    // So a reload does not announce a share that already happened.
    window.history.replaceState(null, "", window.location.pathname);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    try {
      setHistoryOpen(window.localStorage.getItem("ionexa.analyzeHistoryColumn") === "open");
    } catch {
      /* private window or storage off: closed, which is the default */
    }
  }, []);
  function toggleHistory() {
    setHistoryOpen((isOpen) => {
      const next = !isOpen;
      try {
        window.localStorage.setItem("ionexa.analyzeHistoryColumn", next ? "open" : "closed");
      } catch {
        /* nothing to persist to; the toggle still works for this visit */
      }
      return next;
    });
  }

  // AN ANSWER THAT FINISHED ELSEWHERE IS PUT BACK, exactly as Files did.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/jobs?kind=file_ask");
        const data = await response.json();
        if (cancelled || !data.ok || !data.job) return;
        const job = data.job as { id: string; status: string; stepLabel: string | null; input: Record<string, unknown> | null; result: Record<string, unknown> | null; creditsCharged: number | null };
        const asked = typeof job.input?.question === "string" ? job.input.question : "";
        setMode("files");
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
        setFilesAsking(true);
        setAskStep(job.stepLabel);
        const outcome = await watchJob(String(job.id), (running) => {
          if (!cancelled) setAskStep(running.stepLabel);
        });
        if (cancelled) return;
        setFilesAsking(false);
        if (outcome.ok && outcome.result.answered) {
          const answer = answerFromResult(outcome.result, Number(outcome.creditsCharged ?? 0), String(job.id));
          say({ role: "tool", text: answer.text, answer });
        } else if (!outcome.ok && outcome.code !== "still_running") {
          say({ role: "tool", text: failures.ask({ code: outcome.code, jobId: String(job.id) }) });
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

  function toggleSelected(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  // -- uploads: one dispatcher, two unchanged destinations --
  async function uploadSheet(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      note("tool", t("upload.tooLarge"));
      return;
    }
    setAnalysisUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/data-analysis/upload", { method: "POST", body: form });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.id) {
        note("tool", t("upload.failed"));
        return;
      }
      addToast(t("upload.done", { rows: body.rowCount }));
      router.push(`/dashboard/data-analysis?id=${body.id}`);
      router.refresh();
    } finally {
      setAnalysisUploading(false);
    }
  }

  async function uploadDoc(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      addToast(tFiles("tooLarge", { name: file.name, max: formatBytes(MAX_FILE_BYTES) }), "error");
      return;
    }
    if (!kindFromExtension(file.name)) {
      addToast(tFiles("unsupportedType", { name: file.name }), "error");
      return;
    }
    if (file.size === 0) {
      addToast(tFiles("emptyFile", { name: file.name }), "error");
      return;
    }
    setFilesUploading(file.name);
    try {
      const outcome = await uploadFile(file, {
        error: tFiles("uploadError"),
        storageMissing: tFiles("uploadStorageMissing"),
        storagePolicy: tFiles("uploadStoragePolicy"),
        tooLargeForTransfer: tFiles("tooLargeForTransfer"),
        offline: describe(new ApiError(0, null)).text,
        refused: (refusal) => failures.refused(refusal, file.name),
      });
      if (!outcome.ok) {
        addToast(
          !outcome.status || uploadRefusal(outcome.body ?? null, outcome.status) !== "uploadError"
            ? outcome.error
            : describe(new ApiError(outcome.status, (outcome.body?.limitReached ? { ...outcome.body, code: "planLimit" } : outcome.body ?? null) as ApiErrorPayload | null)).text,
          "error"
        );
        return;
      }
      setFiles((current) => [outcome.file, ...current]);
      setMode("files");
      setPane("work");
      if (outcome.file.processing_status === "failed") addToast(failures.unreadable(outcome.file.error, tFiles("uploadUnreadable", { name: file.name })), "error");
      else {
        addToast(tFiles("uploadSuccess", { name: outcome.file.filename }));
        if (outcome.file.processing_status === "ready") setSelected((current) => (current.length < MAX_FILES_PER_QUESTION ? [...current, outcome.file.id] : current));
      }
    } catch (err) {
      addToast(describe(err).text, "error");
    } finally {
      setFilesUploading(null);
      router.refresh();
    }
  }

  async function handleUpload(list: FileList | null) {
    for (const file of Array.from(list ?? [])) {
      const ext = extensionOf(file.name).replace(/^\./, "").toLowerCase();
      if (SHEET_EXTENSIONS.has(ext)) await uploadSheet(file);
      else await uploadDoc(file);
    }
  }

  // PASTED TEXT, read through Files' own engine (new in this merge): the
  // text becomes a .txt the same upload path above already handles, then
  // a fixed, translated question asks for exactly what the owner asked
  // for — summary, key points, numbers.
  async function analyzePastedText(text: string) {
    setPastingText(false);
    const trimmed = text.trim();
    if (!trimmed) return;
    const blob = new Blob([trimmed], { type: "text/plain" });
    const name = `${t("pastedText.filename")}.txt`;
    await uploadDoc(new File([blob], name, { type: "text/plain" }));
    // uploadDoc already selected the new file and opened the files pane;
    // ask it the summary question Files already knows how to answer.
    await askFiles(t("pastedText.autoQuestion"));
  }

  // FIND PATTERNS is an option, not the screen's action: the field is.
  async function findPatterns() {
    if (!current) return;
    setAnalysing(true);
    try {
      const response = await fetch(`/api/data-analysis/${current.id}/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        note("tool", refusal(response.status, body?.error, t("analyse.failed")));
        return;
      }
      note("tool", t("analyse.done"));
      if (Number(body?.dropped) > 0) note("tool", t("how.dropped", { count: Number(body.dropped) }));
      setPane("work");
      router.refresh();
    } finally {
      setAnalysing(false);
    }
  }

  async function askAnalysis(question: string) {
    if (!current) {
      note("user", question);
      note("tool", tShell("analyze.needFile"));
      return;
    }
    setAnalysisAsking(true);
    try {
      const response = await fetch(`/api/data-analysis/${current.id}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        note("user", question);
        note("tool", refusal(response.status, body?.error, t("ask.failed")));
        return;
      }
      if (body?.cannotAnswer) {
        note("user", question);
        note("tool", String(body.cannotAnswer));
      }
      router.refresh();
    } finally {
      setAnalysisAsking(false);
    }
  }

  async function removeFile(file: WorkspaceFile) {
    if (!window.confirm(tFiles("confirmDelete", { name: file.filename }))) return;
    try {
      const response = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        addToast(tFiles("deleteError"), "error");
        return;
      }
      setFiles((current) => current.filter((f) => f.id !== file.id));
      setSelected((current) => current.filter((id) => id !== file.id));
      router.refresh();
    } catch (err) {
      addToast(describe(err).text, "error");
    }
  }

  const readyIds = (collection: WorkspaceCollection) => collection.fileIds.filter((id) => askable.some((f) => f.id === id));
  const isChosen = (collection: WorkspaceCollection) => {
    const ids = readyIds(collection);
    return ids.length > 0 && ids.length === selected.length && ids.every((id) => selected.includes(id));
  };

  function startNaming() {
    if (selected.length === 0 || naming) return;
    setNaming(true);
    say({ role: "tool", text: tFiles("collectionName", { count: selected.length }), naming: true });
    if (!window.matchMedia("(min-width: 1024px)").matches) setPane(null);
    composerRef.current?.focus();
  }

  async function saveCollection(text: string) {
    const name = text.trim().slice(0, MAX_COLLECTION_NAME);
    if (!name || savingCollection) return;
    say({ role: "user", text: name });
    if (selected.length < 1) {
      say({ role: "tool", text: tFiles("selectFirst") });
      setPane("work");
      return;
    }
    setSavingCollection(true);
    try {
      const response = await fetch("/api/files/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, fileIds: selected }),
      });
      const data = await response.json().catch(() => null);
      if (!data?.ok || !data.collection) {
        say({ role: "tool", text: tFiles("collectionError") });
        return;
      }
      const made = data.collection as WorkspaceCollection;
      setCollections((current) => [made, ...current]);
      setNaming(false);
      say({ role: "tool", text: tFiles("collectionCreated", { name: made.name }) });
    } catch (err) {
      say({ role: "tool", text: describe(err).text });
    } finally {
      setSavingCollection(false);
    }
  }

  async function askFiles(question: string) {
    const text = question.trim().slice(0, MAX_QUESTION_CHARS);
    if (!text || filesAsking) return;
    say({ role: "user", text });
    if (selected.length === 0) {
      say({ role: "tool", text: tFiles("selectFirst") });
      setPane("work");
      return;
    }
    if (selected.length > MAX_FILES_PER_QUESTION) {
      say({ role: "tool", text: tFiles("tooManySelected", { max: MAX_FILES_PER_QUESTION }) });
      return;
    }
    setFilesAsking(true);
    try {
      const outcome = await startAndWatchJob(
        "/api/files/ask",
        { question: text, fileIds: selected, language: locale },
        { onProgress: (job) => setAskStep(job.stepLabel) }
      );
      if (!outcome.ok) {
        say({
          role: "tool",
          text: isStoppedMessage(outcome.error)
            ? tSteps("stopped")
            : askFailure(outcome) === "askError" && outcome.status
              ? describe(new ApiError(outcome.status, (outcome.body ?? null) as ApiErrorPayload | null)).text
              : failures.ask(outcome),
        });
        return;
      }
      const data = outcome.result as Record<string, unknown>;
      if (!data.answered) {
        say({ role: "tool", text: tFiles("askError") });
        return;
      }
      const answer = answerFromResult(data, Number(outcome.creditsCharged ?? 0), outcome.jobId ?? null);
      say({ role: "tool", text: answer.text, answer });
      router.refresh();
    } catch {
      say({ role: "tool", text: tFiles("askError") });
    } finally {
      setFilesAsking(false);
    }
  }

  function onSend(text: string) {
    if (naming) return void saveCollection(text);
    if (pastingText) return void analyzePastedText(text);
    if (mode === "files") return void askFiles(text);
    if (mode === "analysis") return void askAnalysis(text);
    // Nothing open yet: exactly the old Analyze's own answer to being
    // asked with no file.
    note("user", text);
    note("tool", tShell("analyze.needFile"));
  }

  // -- turns, by mode --
  const analysisAsked: ShellTurn[] = current
    ? [...current.questions].reverse().flatMap((record) => [
        { id: `${record.id}-q`, role: "user" as const, text: record.question },
        {
          id: `${record.id}-a`,
          role: "tool" as const,
          text: record.answer ?? "",
          extra: record.evidence ? (
            <div data-testid="analysis-evidence" className="mt-2">
              <p className="text-[11px] text-muted">{t("ask.matched", { matched: record.evidence.matchedRows, total: record.evidence.totalRows })}</p>
              <table className="mt-1 w-full text-start text-xs">
                <tbody>
                  {record.evidence.rows.map((row) => (
                    <tr key={row.group}>
                      <td className="py-1 text-muted">{row.group}</td>
                      <td className="py-1 text-end text-foreground">{Math.round(row.value * 100) / 100}</td>
                      <td className="py-1 ps-3 text-end text-[11px] text-muted">{t("ask.rowCount", { count: row.rows })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : undefined,
        },
      ])
    : [];

  const lastNamingId = [...fileTurns].reverse().find((turn) => turn.naming)?.id ?? null;
  const filesShellTurns: ShellTurn[] = [
    ...(selectedFiles.length > 0
      ? [{ id: "subject", role: "tool" as const, text: tFiles("askSelected", { count: selectedFiles.length, names: selectedFiles.map((f) => f.filename).join(", ") }) }]
      : []),
    ...fileTurns.map((turn) => ({
      id: turn.id,
      role: turn.role,
      text: pages && turn.answer ? "" : turn.answer ? relabelAnswer(turn.text, turn.answer.citations, show) : turn.text,
      extra: turn.naming ? (
        naming && turn.id === lastNamingId ? (
          <button type="button" onClick={() => setNaming(false)} data-testid="files-collection-cancel" className={`${OPTION} mt-2`}>
            {tCommon("cancel")}
          </button>
        ) : undefined
      ) : turn.answer ? (
        <div data-testid="files-answer" className="mt-2 space-y-2">
          {!turn.answer.fromDocuments && <p className="text-xs text-warning">{tFiles("notInDocuments")}</p>}
          {pages && <CitedAnswerText answer={turn.answer} onOpen={(citation) => setOpenPage({ turnId: turn.id, citation })} />}
          {pages && turn.answer.citations.length > 0 ? (
            <div>
              <p className="text-[11px] font-medium text-muted">{tFiles("citations")}</p>
              <CitedPages answer={turn.answer} onOpen={(citation) => setOpenPage({ turnId: turn.id, citation })} />
            </div>
          ) : pages ? (
            turn.answer.fromDocuments && <p className="text-xs text-warning">{tFiles("uncitedAnswer")}</p>
          ) : turn.answer.citations.length > 0 ? (
            <div>
              <p className="text-[11px] font-medium text-muted">{tFiles("citations")}</p>
              <ul data-testid="files-citations" className="mt-1 space-y-0.5">
                {turn.answer.citations.map((c, i) => (
                  <li key={`${c.filename}-${c.label}-${i}`} className="text-xs text-foreground">
                    {c.filename} — {show(c.label)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            turn.answer.fromDocuments && <p className="text-xs text-warning">{tFiles("uncitedAnswer")}</p>
          )}
          {pages && openPage?.turnId === turn.id && openPage.citation.fileId && (
            <PageView key={`${openPage.citation.fileId}-${openPage.citation.page}`} citation={openPage.citation} onClose={() => setOpenPage(null)} />
          )}
          {pages && turn.answer.citations.length === 0 && turn.answer.unreadPages.length > 0 && <CitedPages answer={{ ...turn.answer, citations: [] }} onOpen={() => {}} />}
          {turn.answer.removedCitations > 0 && <p className="text-[11px] text-muted">{tFiles("removedCitations", { count: turn.answer.removedCitations })}</p>}
          {turn.answer.truncated && <p className="text-[11px] text-warning">{tFiles("truncatedWarning")}</p>}
          {turn.answer.skippedFiles.length > 0 && <p className="text-[11px] text-muted">{tFiles("skippedFiles", { names: turn.answer.skippedFiles.join(", ") })}</p>}
          {turn.answer.disclosure && <p className="text-[11px] text-muted">{turn.answer.disclosure}</p>}
          <CopyButton text={() => answerForClipboard(turn.answer!, show)} variant="icon" />
          {turn.answer.jobId && <JobSeen jobId={turn.answer.jobId} />}
        </div>
      ) : undefined,
    })),
  ];

  const turns: ShellTurn[] =
    mode === "analysis"
      ? [
          ...(current
            ? [
                {
                  id: "file",
                  role: "tool" as const,
                  text: t("summary.counts", { rows: current.rowCount, columns: current.profile.columns.length }),
                  card: { title: current.title, open: pane === "work", onOpen: () => setPane("work") },
                },
              ]
            : []),
          ...analysisAsked,
          ...notes,
        ]
      : mode === "files"
        ? filesShellTurns
        : [...notes]; // only an unanswerable "needFile" exchange reaches here

  const facts = current?.findings?.facts ?? [];

  const analysisWork =
    mode === "analysis" && pane === "work" && current
      ? {
          title: current.title,
          actions: (
            <>
              <a href={`/api/data-analysis/${current.id}/export?format=csv`} className={OPTION}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                CSV
              </a>
              <a href={`/api/data-analysis/${current.id}/export?format=json`} className={OPTION}>
                JSON
              </a>
            </>
          ),
          body: (
            <div data-testid="analysis-file" className="space-y-5">
              <div>
                <p className="text-xs text-muted">
                  {t("summary.counts", { rows: current.rowCount, columns: current.profile.columns.length })}
                  {current.profile.duplicateRows > 0 ? ` · ${t("summary.duplicates", { count: current.profile.duplicateRows })}` : ""}
                </p>
                {current.truncated ? <p className="mt-1 text-xs text-warning">{t("summary.truncated")}</p> : null}
                {current.raggedRows > 0 ? <p className="mt-1 text-xs text-warning">{t("summary.ragged", { count: current.raggedRows })}</p> : null}
              </div>
              {current.findings ? (
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{t("findings.title")}</h3>
                  {facts.length > 0 ? <p className="mt-1 text-[11px] text-muted">{t("how.press")}</p> : null}
                  {current.findings.summary ? (
                    <p className="mt-1 text-sm text-body">
                      {current.findings.summaryParts ? <FactText parts={current.findings.summaryParts} facts={facts} /> : current.findings.summary}
                    </p>
                  ) : null}
                  <ul className="mt-2 space-y-2">
                    {current.findings.findings.map((finding) => (
                      <li key={finding.headline} data-testid="analysis-finding">
                        <p className="text-sm text-foreground">
                          {finding.headlineParts ? <FactText parts={finding.headlineParts} facts={facts} /> : finding.headline}
                        </p>
                        <p className="text-xs text-muted">
                          {finding.detailParts ? <FactText parts={finding.detailParts} facts={facts} /> : finding.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {facts.length > 0 ? (
                    <details data-testid="analysis-how" className="mt-3 text-xs">
                      <summary className="flex min-h-[44px] cursor-pointer items-center text-foreground">{t("how.title")}</summary>
                      <ul className="space-y-1">
                        {facts.map((fact) => (
                          <li key={fact.id} data-testid="analysis-how-fact">
                            <span className="font-medium text-foreground">{formatFact(fact, locale)}</span>
                            <span className="text-muted"> — {explain(fact)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted">{t("findings.none")}</p>
              )}
              {current.charts.length > 0 && (
                <div className="grid gap-4 xl:grid-cols-2">
                  {current.charts.map((chart, index) => (
                    <AnalysisChart key={`${chart.spec.title}-${index}`} chart={chart} />
                  ))}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-start text-xs">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-1 font-normal">{t("columns.name")}</th>
                      <th className="py-1 font-normal">{t("columns.filled")}</th>
                      <th className="py-1 font-normal">{t("columns.distinct")}</th>
                      <th className="py-1 font-normal">{t("columns.stats")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.profile.columns.map((column) => (
                      <tr key={column.name}>
                        <td className="py-2 text-foreground">{column.name}</td>
                        <td className="py-2 text-muted">
                          {column.filled}
                          {column.missing > 0 ? ` (${column.missing} ${t("columns.missing")})` : ""}
                        </td>
                        <td className="py-2 text-muted">{column.unique}</td>
                        <td className="py-2 text-muted">{describeColumn(column)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {current.legacyNotes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{t("legacy.title")}</h3>
                  <p className="text-xs text-muted">{t("legacy.description")}</p>
                  <ul className="mt-2 space-y-2">
                    {current.legacyNotes.map((n) => (
                      <li key={n.id} className="text-xs">
                        <p className="text-foreground">{n.title}</p>
                        {n.description ? <p className="text-muted">{n.description}</p> : null}
                        {n.findings ? <p className="text-muted">{n.findings}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ),
        }
      : null;

  const filesWork =
    mode === "files" && pane === "work"
      ? {
          title: tNames("files"),
          body: (
            <div className="space-y-3">
              <p className="text-[11px] leading-relaxed text-muted">{tFiles("privacyNotice")}</p>
              <section aria-label={tFiles("collections")} data-testid="files-collections">
                <p className="text-xs font-medium text-muted">{tFiles("collections")}</p>
                {collections.length === 0 && <p className="mt-0.5 text-[11px] text-muted">{tFiles("collectionsHint")}</p>}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {collections.map((collection) => (
                    <button
                      key={collection.id}
                      type="button"
                      onClick={() => setSelected(readyIds(collection))}
                      aria-pressed={isChosen(collection)}
                      data-testid="files-collection"
                      className={`${OPTION} ${isChosen(collection) ? "border-foreground text-foreground" : ""}`}
                    >
                      <span className="break-words">{collection.name}</span> · {collection.fileIds.length}
                    </button>
                  ))}
                  <button type="button" onClick={startNaming} disabled={selected.length === 0 || naming} data-testid="files-collection-save" className={`${OPTION} disabled:opacity-40`}>
                    <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    {tFiles("saveSelection", { count: selected.length })}
                  </button>
                </div>
              </section>
              {files.length === 0 ? (
                <p className="text-xs text-muted">{tFiles("empty")}</p>
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
                            onChange={() => toggleSelected(file.id)}
                            aria-label={ready ? tFiles("include") : tFiles("cannotInclude")}
                          />
                          <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-sm text-foreground">{file.filename}</span>
                            <span className="block text-[11px] text-muted">
                              {ready
                                ? pages && pagesRead(file.file_type, file.page_count)
                                  ? tFiles("pagesPartRead", { read: pagesRead(file.file_type, file.page_count)!.read, total: pagesRead(file.file_type, file.page_count)!.total })
                                  : file.page_count
                                    ? tFiles("pages", { count: file.page_count })
                                    : tFiles("statusReady")
                                : file.processing_status === "failed"
                                  ? tFiles("statusFailed")
                                  : tFiles("statusProcessing")}
                              {" · "}
                              {formatBytes(file.size_bytes)}
                            </span>
                          </span>
                        </label>
                        <button type="button" onClick={() => void removeFile(file)} aria-label={tFiles("delete")} className="inline-flex h-11 w-11 items-center justify-center rounded-item text-muted hover:text-foreground">
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

  const work = analysisWork ?? filesWork;

  // THE [◧] COLUMN: both tables' rows, newest first within each, the
  // spreadsheet's own analyses ahead of the plain document list — the
  // order Analyze's own history already had, documents added after it.
  // data_analyses has no delete route (Analyze never had one), so those
  // rows mark `deletable: false` rather than offering a trash button that
  // would fail.
  const historyRows: (ShellHistoryRow & { deletable?: boolean })[] = [
    ...analyses.map((item) => ({ id: `a:${item.id}`, title: item.title, status: t("upload.done", { rows: item.rowCount }), deletable: false })),
    ...files.map((file) => ({
      id: `f:${file.id}`,
      title: file.filename,
      status:
        file.processing_status === "ready"
          ? `${formatBytes(file.size_bytes)}${file.page_count ? ` · ${tFiles("pages", { count: file.page_count })}` : ""}`
          : file.processing_status === "failed"
            ? tFiles("statusFailed")
            : tFiles("statusProcessing"),
    })),
  ];
  const activeHistoryId = mode === "analysis" && current ? `a:${current.id}` : mode === "files" && selectedFiles.length === 1 ? `f:${selectedFiles[0].id}` : null;

  return (
    <ToolShell
      name={tNames("analyze")}
      help={<HelpTip helpKey="help.dataAnalysis" />}
      ref={composerRef}
      turns={turns}
      working={
        analysisUploading || analysing || analysisAsking ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <ThinkingIndicator size="sm" />
            {analysisUploading ? t("upload.working") : analysing ? t("analyse.working") : t("ask.working")}
          </span>
        ) : filesUploading || filesAsking ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <ThinkingIndicator size="sm" />
            {filesUploading ? tFiles("uploading", { name: filesUploading }) : askStepLabel ?? tFiles("asking")}
          </span>
        ) : null
      }
      placeholder={naming ? tFiles("collectionPlaceholder") : pastingText ? t("pastedText.placeholder") : mode === "files" ? tFiles("askPlaceholder") : mode === "analysis" && current ? t("ask.placeholder") : t("upload.description")}
      sending={analysisAsking || filesAsking || savingCollection}
      onSend={onSend}
      options={[
        <span key="upload">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={`${ACCEPT_ATTRIBUTE},.csv,.tsv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`}
            className="sr-only"
            aria-label={t("upload.title")}
            data-testid="analyze-upload-input"
            onChange={(e) => {
              void handleUpload(e.target.files);
              e.target.value = "";
            }}
          />
          <button type="button" onClick={() => fileInput.current?.click()} disabled={analysisUploading || Boolean(filesUploading)} data-testid="analyze-upload" className={OPTION}>
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {t("upload.title")}
          </button>
        </span>,
        <button
          key="paste"
          type="button"
          onClick={() => {
            setPastingText(true);
            note("tool", t("pastedText.prompt"));
          }}
          disabled={pastingText}
          data-testid="analyze-paste-text"
          className={`${OPTION} disabled:opacity-40`}
        >
          {t("pastedText.button")}
        </button>,
        ...(mode === "analysis" && current
          ? [
              <button key="analyse" type="button" onClick={() => void findPatterns()} disabled={analysing} data-testid="analysis-analyse" className={`${OPTION} disabled:opacity-40`}>
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {t("analyse.button")}
              </button>,
            ]
          : []),
        ...(mode === "files"
          ? [
              <button key="files" type="button" onClick={() => setPane((v) => (v === "work" ? null : "work"))} aria-pressed={pane === "work"} data-testid="files-shell-files" className={OPTION}>
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                {tFiles("selectedOfTotal", { count: selected.length, total: askable.length })}
              </button>,
            ]
          : []),
      ]}
      empty={{
        heading: t("empty.heading"),
        examples: [
          { key: "trend", label: t("empty.examples.trend") },
          { key: "outliers", label: t("empty.examples.outliers") },
          { key: "compare", label: t("empty.examples.compare") },
        ],
      }}
      history={{
        open: historyOpen,
        onToggle: toggleHistory,
        onNew: () => {
          setMode(null);
          setPane(null);
          setNotes([]);
          router.push("/dashboard/data-analysis");
        },
        newLabel: t("new"),
        column: (
          <ShellHistoryColumn
            rows={historyRows}
            activeId={activeHistoryId}
            onOpen={(id) => {
              if (id.startsWith("a:")) {
                router.push(`/dashboard/data-analysis?id=${id.slice(2)}`);
                setMode("analysis");
                setPane("work");
              } else {
                const fileId = id.slice(2);
                const file = files.find((f) => f.id === fileId);
                setMode("files");
                setPane("work");
                if (file?.processing_status === "ready") setSelected([fileId]);
              }
            }}
            onDelete={async (id) => {
              if (id.startsWith("f:")) {
                const file = files.find((f) => f.id === id.slice(2));
                if (file) await removeFile(file);
              }
            }}
            onNavigate={() => {
              if (typeof window !== "undefined" && window.innerWidth < 768) toggleHistory();
            }}
          />
        ),
      }}
      work={work}
      onCloseWork={() => setPane(null)}
    />
  );
}
