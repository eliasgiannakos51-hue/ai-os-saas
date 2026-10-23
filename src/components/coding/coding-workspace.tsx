"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Download, Plus, PanelLeft, Upload, FolderTree, GitPullRequest, Undo2, Loader2, CheckCircle, XCircle, GitMerge, AlertTriangle } from "lucide-react";
import { Earth } from "@/components/brand/earth";
import { HelpTip } from "@/components/ui/help-tip";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useToast } from "@/components/toast/toast-context";
import { useCredits } from "@/components/credits/credits-context";
import { ChatComposer, type ChatComposerHandle } from "@/components/chat/chat-composer";
import { ShellHistoryColumn, type ShellHistoryRow } from "@/components/shell/shell-history-column";
import { CodeBlock } from "@/components/coding/code-block";
import { estimateForAction } from "@/lib/billing/estimate";
import { DEFAULTS } from "@/lib/billing/pricing-config";
import { diffLines, replaceLine } from "@/lib/coding/diff";
import { downloadTextFile, downloadZip, suggestedFileName } from "@/lib/coding/download";
import { guessLanguage, languageFromPath } from "@/lib/coding/highlight";
import { MAX_INPUT_CHARS, OPERATION_SPECS, type CodeOperation } from "@/lib/coding/operations";
import { FOLDER_UPLOAD_MAX_FILES, readUploadedFolder } from "@/lib/coding/folder-upload";
import { POWER_LEVELS, modelForPower, type PowerLevel } from "@/lib/coding/power";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { GitHubConnect, type GitHubSelection } from "@/components/coding/github-connect";

export type CodeSession = {
  id: string;
  operation: string;
  title: string;
  input: string;
  language: string | null;
  targetLanguage: string | null;
  output: string | null;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

type Turn = { id: string; role: "user" | "tool"; text: string };

/** One tab in the code panel — `path` is null for anything that is not
 *  from a folder upload (a generated answer, a paste), which draws no
 *  tab row at all when it is the only file. */
type CodeFile = { path: string | null; content: string; language: string | null };
type Code = { files: CodeFile[]; activeIndex: number; isEdit: boolean; priorContent: string | null };

/** «Διαγραφή με Αναίρεση» (the owner's critical message, 2026-10-22),
 *  the same window chat's own sidebar already uses
 *  (lib/chat/delete-later.ts) — kept as its own constant here rather
 *  than imported, since that module's URL builder is chat-specific and
 *  Coding's own ShellHistoryColumn usage needs only the duration. */
const DELETE_UNDO_WINDOW_MS = 6000;

/**
 * CODING, AS A CONVERSATION (the owner's critical message, 2026-10-22).
 *
 * Bespoke, not `ToolShell` — Coding never used that shell to begin with
 * (components/shell/tool-shell.tsx explains why in its own header) — but
 * drawing the same two shapes it standardised: the empty landing (small
 * globe, one heading, up to three examples that send at once) and the
 * [◧] history column (components/shell/shell-history-column.tsx, shared
 * with every tool that has moved onto it).
 *
 * One field. What operation runs — generate, explain, find bugs,
 * convert, write tests — is read off what was typed by `planTurn`
 * (lib/coding/operations.ts), not chosen from a row of buttons; a plain
 * remark while code is already on screen is a change to make to it, and
 * the result is diffed against what was there, green added and red
 * removed (lib/coding/diff.ts).
 *
 * ONE ROW PER TURN IN code_sessions, same as it always was — there is no
 * migration here. The conversation itself (several turns chained
 * together with the code they produced) lives in this component's own
 * state for the length of the visit; [◧] still opens any one past turn
 * from history, the same single exchange the old page could.
 */
export function CodingWorkspace({ sessions, initialTask, isAdmin = false, githubConfigured = false }: { sessions: CodeSession[]; initialTask?: string; isAdmin?: boolean; githubConfigured?: boolean }) {
  const t = useTranslations("coding");
  const tSteps = useTranslations("aiSteps");
  const tShell = useTranslations("dashboard.toolShell");
  const { addToast } = useToast();
  const { accountCreditPriceEur, planSlug } = useCredits();
  const composerRef = useRef<ChatComposerHandle>(null);
  const abortRef = useRef<AbortController | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const turnCounter = useRef(0);
  const formatRelative = useFormatRelativeTime();

  const [rows, setRows] = useState<CodeSession[]>(sessions);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [code, setCode] = useState<Code | null>(null);
  const [sending, setSending] = useState(false);
  const [uploadingFolder, setUploadingFolder] = useState(false);
  const [openedId, setOpenedId] = useState<string | null>(null);
  // «ΙΣΧΥΣ» (the owner's message, 2026-10-23) — the field's own choice,
  // "normal" being the one model every turn ran on before this control
  // existed (lib/coding/power.ts), so a person who never touches it sees
  // no change. `inputLength` only feeds the credit estimate beside each
  // option; the text itself still lives inside ChatComposer.
  const [power, setPower] = useState<PowerLevel>("normal");
  const [inputLength, setInputLength] = useState(0);
  const [github, setGitHub] = useState<GitHubSelection>({ repo: null, branch: null });

  // GITHUB FILE TREE + COMMIT/PR FLOW (Part Γ + Δ).
  const [fileTree, setFileTree] = useState<Array<{ path: string; type: string }>>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [newBranchForCommit, setNewBranchForCommit] = useState("");
  const [committing, setCommitting] = useState(false);
  const [prResult, setPrResult] = useState<{ number: number; url: string } | null>(null);
  const [ciStatus, setCiStatus] = useState<{ state: string; checks: Array<{ name: string; status: string; conclusion: string | null }> } | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<Code[]>([]);

  const tGh = useTranslations("coding.github");

  useEffect(() => {
    if (!github.repo || !github.branch) {
      setFileTree([]);
      return;
    }
    setLoadingTree(true);
    fetch("/api/github/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: github.repo, branch: github.branch, mode: "tree" }),
    })
      .then((r) => r.json())
      .then((body: { ok?: boolean; tree?: Array<{ path: string; type: string }> }) => {
        if (body.ok && body.tree) setFileTree(body.tree);
      })
      .catch(() => {})
      .finally(() => setLoadingTree(false));
  }, [github.repo, github.branch]);

  useEffect(() => {
    if (!prResult || !github.repo) return;
    let active = true;
    const poll = () => {
      fetch(`/api/github/pr-status?repo=${encodeURIComponent(github.repo!)}&pr=${prResult.number}`)
        .then((r) => r.json())
        .then((body: { ok?: boolean; state?: string; merged?: boolean; checks?: Array<{ name: string; status: string; conclusion: string | null }> }) => {
          if (!active) return;
          if (body.ok) {
            setCiStatus({ state: body.state ?? "open", checks: body.checks ?? [] });
          }
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 15_000);
    return () => { active = false; clearInterval(interval); };
  }, [prResult, github.repo]);

  function pushUndo() {
    if (code) setUndoStack((prev) => [...prev.slice(-9), code]);
  }

  function popUndo() {
    setUndoStack((prev) => {
      const next = [...prev];
      const last = next.pop();
      if (last) setCode(last);
      return next;
    });
  }

  async function openGitHubFile(path: string) {
    if (!github.repo || !github.branch) return;
    const res = await fetch("/api/github/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: github.repo, branch: github.branch, path, mode: "read" }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; content?: string; encoding?: string } | null;
    if (body?.ok && typeof body.content === "string") {
      pushUndo();
      const language = languageFromPath(path, body.content);
      setCode({ files: [{ path, content: body.content, language }], activeIndex: 0, isEdit: false, priorContent: null });
    }
  }

  async function doCommitAndPr() {
    if (!github.repo || !code || committing) return;
    setCommitting(true);
    try {
      const files = code.files.filter((f) => f.path).map((f) => ({ path: f.path!, content: f.content }));
      if (files.length === 0) return;
      const baseBranch = github.branch ?? "main";
      const branchName = newBranchForCommit.trim() || `ionexa-${Date.now()}`;
      const res = await fetch("/api/github/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: github.repo,
          baseBranch,
          newBranch: branchName,
          files,
          commitMessage: commitMsg || "Update via Ionexa Coding",
          prTitle: prTitle || commitMsg || "Update via Ionexa Coding",
          prBody: prBody || "",
        }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; pr?: { number: number; html_url: string } } | null;
      if (body?.ok && body.pr) {
        setPrResult({ number: body.pr.number, url: body.pr.html_url });
        setCommitOpen(false);
        say("tool", `${tGh("prCreated")} #${body.pr.number}`);
      }
    } finally {
      setCommitting(false);
    }
  }

  async function doMerge() {
    if (!github.repo || !prResult || merging) return;
    setMerging(true);
    try {
      const res = await fetch("/api/github/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: github.repo, pr: prResult.number }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (body?.ok) {
        say("tool", tGh("merged"));
        setCiStatus((prev) => prev ? { ...prev, state: "closed" } : prev);
      }
    } finally {
      setMerging(false);
      setMergeConfirmOpen(false);
    }
  }

  // OPEN BY DEFAULT, UNCONDITIONALLY (the owner's critical message,
  // 2026-10-22: "the sessions list, open on the left, like Claude Code,
  // from the start" — repeated, this time with no viewport exception).
  // A first visit this session cannot measure (no stored preference)
  // starts open on every screen; [◧] closes it, and the choice sticks
  // through localStorage. A phone still draws it as a full-screen
  // overlay rather than a side panel (below), so "open from the start"
  // and "opens above the page" are the same thing there, not a
  // contradiction.
  const [historyOpen, setHistoryOpen] = useState(true);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("ionexa.codingHistoryColumn");
      if (stored === "open" || stored === "closed") setHistoryOpen(stored === "open");
    } catch {
      // private window or storage off: the open-by-default start stands
    }
  }, []);
  function toggleHistory() {
    setHistoryOpen((open) => {
      const next = !open;
      try {
        window.localStorage.setItem("ionexa.codingHistoryColumn", next ? "open" : "closed");
      } catch {
        // nothing to persist to; the toggle still works for this visit
      }
      return next;
    });
  }

  function say(role: Turn["role"], text: string) {
    turnCounter.current += 1;
    setTurns((prev) => [...prev, { id: `${role}-${turnCounter.current}`, role, text }]);
  }

  function startNew() {
    setTurns([]);
    setCode(null);
    setOpenedId(null);
  }

  async function send(text: string) {
    if (sending) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setOpenedId(null);
    say("user", trimmed);
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    // THE ACTIVE TAB ONLY — a remark edits whichever file is open, the
    // same "one file, not a project" rule MAX_INPUT_CHARS already
    // enforces server-side; the other tabs from a folder upload sit
    // untouched until their own tab is active and asked about.
    const activeFile = code ? code.files[code.activeIndex] : undefined;
    pushUndo();
    try {
      const response = await fetch("/api/coding/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ text: trimmed, priorCode: activeFile?.content ?? null, priorLanguage: activeFile?.language ?? null, power }),
      });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok || !body?.ok) {
        say(
          "tool",
          body?.error === "too_long"
            ? t("errors.tooLong", { limit: MAX_INPUT_CHARS })
            : body?.error === "ai_unavailable"
              ? t("errors.unavailable")
              : t("errors.failed")
        );
        return;
      }
      const output = String(body.output ?? "");
      if (body.outputKind === "code") {
        const isEdit = body.isEdit === true;
        const language = typeof body.resultLanguage === "string" ? body.resultLanguage : guessLanguage(output);
        const newFile: CodeFile = { path: activeFile?.path ?? null, content: output, language };
        setCode((prev) =>
          prev
            ? { ...prev, files: prev.files.map((f, i) => (i === prev.activeIndex ? newFile : f)), isEdit, priorContent: isEdit ? activeFile?.content ?? null : null }
            : { files: [newFile], activeIndex: 0, isEdit, priorContent: null }
        );
        say("tool", isEdit ? t("changed") : t("made"));
      } else {
        say("tool", output);
      }
    } catch {
      say("tool", controller.signal.aborted ? tSteps("stopped") : t("errors.failed"));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
  }

  // BARE DELETE AND RENAME, no confirm of their own — ShellHistoryColumn's
  // own "⋯" menu confirms delete before calling this, the same single-
  // confirm rule every other tool's history list follows.
  async function deleteSession(id: string) {
    const response = await fetch(`/api/coding/sessions/${id}`, { method: "DELETE" });
    if (!response.ok) {
      addToast(t("errors.failed"), "error");
      return;
    }
    setRows((prev) => prev.filter((row) => row.id !== id));
    if (openedId === id) startNew();
  }

  async function renameSession(id: string, title: string) {
    const response = await fetch(`/api/coding/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      addToast(t("errors.failed"), "error");
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, title } : row)));
  }

  // "ΑΝΕΒΑΣΜΑ ΦΑΚΕΛΟΥ" — local files only, no GitHub App needed (lib/
  // coding/folder-upload.ts has the budget and the binary-skip rules).
  // EACH FILE KEEPS ITS OWN TAB (the owner's critical message,
  // 2026-10-22: "καρτέλες αρχείων") rather than being folded into one
  // blob — `readUploadedFolder` already returns them separately; only
  // the ACTIVE tab is ever sent to the AI (`send`, above), the same
  // "one file, not a project" rule as a paste or a generated answer.
  async function handleFolderUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploadingFolder(true);
    try {
      const files = await readUploadedFolder(fileList);
      if (files.length === 0) {
        addToast(t("errors.folderEmpty"), "error");
        return;
      }
      const truncated = files.length > FOLDER_UPLOAD_MAX_FILES;
      const included = files.slice(0, FOLDER_UPLOAD_MAX_FILES);
      setCode({
        files: included.map((f) => ({ path: f.path, content: f.text, language: languageFromPath(f.path, f.text) })),
        activeIndex: 0,
        isEdit: false,
        priorContent: null,
      });
      setOpenedId(null);
      say(
        "tool",
        truncated
          ? t("history.folderUploadedTruncated", { count: included.length })
          : t("history.folderUploaded", { count: included.length })
      );
    } finally {
      setUploadingFolder(false);
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  }

  function selectFile(index: number) {
    setCode((prev) => (prev ? { ...prev, activeIndex: index, isEdit: false, priorContent: null } : prev));
  }

  /** CLICK A BOX, TYPE A CHANGE, ONLY THAT CHANGES (the owner's critical
   *  message, 2026-10-22) — a local, deterministic line replacement in
   *  the active file, not another AI call: the diff already shows which
   *  line changed, so the person is editing THAT text directly, and
   *  every other line in the file is untouched because nothing else is
   *  ever written. */
  function editDiffLine(lineIndex: number, newText: string) {
    setCode((prev) => {
      if (!prev) return prev;
      const active = prev.files[prev.activeIndex];
      const nextFile = { ...active, content: replaceLine(active.content, lineIndex, newText) };
      return { ...prev, files: prev.files.map((f, i) => (i === prev.activeIndex ? nextFile : f)) };
    });
  }

  function openFromHistory(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const spec = OPERATION_SPECS[row.operation as CodeOperation] ?? OPERATION_SPECS.generate;
    const toolText = row.status === "failed" ? t("errors.failed") : spec.outputKind === "prose" ? row.output ?? "" : t("made");
    setTurns([
      { id: `${id}-u`, role: "user", text: row.input },
      { id: `${id}-t`, role: "tool", text: toolText },
    ]);
    setCode(
      spec.outputKind === "code" && row.output
        ? { files: [{ path: null, content: row.output, language: row.targetLanguage ?? row.language }], activeIndex: 0, isEdit: false, priorContent: null }
        : null
    );
    setOpenedId(id);
    if (typeof window !== "undefined" && window.innerWidth < 768) toggleHistory();
  }

  // NAME, REPOSITORY, WHEN IT LAST CHANGED (the owner's message right
  // after #332). There is no repository yet — NEEDS 11's GitHub App
  // does not exist in this environment, so every row says "—" rather
  // than inventing one; the day a session is actually tied to a repo,
  // this line reads it instead.
  const historyRows: ShellHistoryRow[] = rows.map((row) => {
    const when = row.updatedAt ? formatRelative(row.updatedAt) : null;
    return {
      id: row.id,
      title: row.title,
      status: row.status === "failed" ? t("history.failed") : [t("history.noRepository"), when].filter(Boolean).join(" · "),
    };
  });

  const showEmpty = turns.length === 0 && !code;

  // ONE ESTIMATE PER CHOICE, same primitive the server reserves against
  // (lib/billing/estimate.ts) so the number beside "Μέγιστη" and the
  // credits it actually holds can never disagree. Recomputed on every
  // keystroke like the Website Builder's and the social posts' own live
  // estimates (website-shell.tsx, posts-shell.tsx) — three pure, local
  // calls, nothing worth a second component for.
  const powerCredits: Record<PowerLevel, number> = Object.fromEntries(
    POWER_LEVELS.map((level) => [
      level,
      Math.round(
        estimateForAction(
          "codeAssist",
          { model: modelForPower(level), inputChars: inputLength, planSlug },
          DEFAULTS,
          accountCreditPriceEur ?? undefined
        ).estimatedCredits
      ),
    ])
  ) as Record<PowerLevel, number>;

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="coding-workspace">
      <div className="flex items-center gap-2 px-4 py-2">
        <button
          type="button"
          onClick={toggleHistory}
          aria-expanded={historyOpen}
          aria-label={tShell(historyOpen ? "hideHistory" : "showHistory")}
          data-testid="coding-history-toggle"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <h1 className="min-w-0 break-words text-sm font-semibold text-foreground">{t("title")}</h1>
        <HelpTip helpKey="help.coding" />
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {historyOpen && (
          <>
            {/* THE SESSIONS COLUMN IS ITS OWN LITTLE SIDEBAR (the owner's
                follow-up message, 2026-10-23, "like the second picture"):
                «+ Νέο session» is the first, full-width thing in it — not a
                small icon-button sharing a row with the page title and
                [◧] above. The layout moved; nothing it could do before
                is gone, "New" still calls the same startNew(). */}
            <div
              data-testid="coding-history"
              className="absolute inset-y-0 start-0 z-30 flex w-[85%] max-w-[320px] flex-col bg-background md:relative md:z-auto md:w-[280px]"
            >
              <div className="shrink-0 p-2">
                <button
                  type="button"
                  onClick={startNew}
                  data-testid="coding-new"
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-item border border-border px-3 text-sm text-foreground hover:bg-panel-hover"
                >
                  <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t("new")}
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <ShellHistoryColumn
                  rows={historyRows}
                  activeId={openedId}
                  onOpen={openFromHistory}
                  onDelete={deleteSession}
                  onRename={renameSession}
                  onNavigate={toggleHistory}
                  linkTable="code_sessions"
                  deleteUndoWindowMs={DELETE_UNDO_WINDOW_MS}
                />
              </div>
            </div>
            <button
              type="button"
              aria-label={tShell("hideHistory")}
              onClick={toggleHistory}
              className="absolute inset-0 z-20 bg-background/50 md:hidden"
            />
          </>
        )}

        {/* THE UNIFIED AREA — ΔΥΟ ΠΕΡΙΟΧΕΣ, ΟΧΙ ΤΡΕΙΣ (the owner's
            follow-up message, 2026-10-23: "όπως η δεύτερη εικόνα"). Right
            of the sessions column is now one background (`bg-panel`, one
            step lighter than the sessions column's own `bg-background` —
            the two tell apart by shade, no line drawn between them) and
            one flex container, not a conversation pane with its own
            border next to a code pane with its own. It only splits into
            two SIDES once there is code to show one in; until then the
            conversation column is not capped at `lg:max-w-md` at all —
            that cap, applied unconditionally before, is what left a
            wide empty gap to its right whenever there was nothing to put
            there (the owner's literal complaint, "η δεξιά πλευρά άδεια"),
            including the plain back-and-forth turns that never produce
            code (explain, find bugs with nothing shown back). */}
        <div
          data-testid="coding-main"
          className={code ? "flex min-h-0 flex-1 flex-col overflow-y-auto bg-panel lg:flex-row lg:overflow-hidden" : "flex min-h-0 flex-1 flex-col overflow-hidden bg-panel"}
        >
          <div className={code ? "flex min-h-0 flex-1 flex-col lg:max-w-md" : "mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col"}>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              {showEmpty ? (
                <div data-testid="coding-empty" className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-5 text-center">
                  <Earth variant="small" px={96} />
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t("empty.heading")}</h2>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {(["function", "explain", "tests"] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => void send(t(`example.${key}`))}
                        data-testid="coding-example"
                        className="min-h-[44px] rounded-full bg-panel-hover px-4 text-xs text-muted transition-colors duration-150 hover:bg-panel hover:text-foreground"
                      >
                        {t(`example.${key}`)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <ol className="chat-measure space-y-4">
                  {turns.map((turn) => (
                    <li key={turn.id} data-role={turn.role} className={turn.role === "user" ? "flex justify-end" : ""}>
                      <p
                        className={
                          turn.role === "user"
                            ? "max-w-[85%] whitespace-pre-wrap break-words rounded-card bg-panel-hover px-3 py-2 text-sm text-foreground"
                            : "whitespace-pre-wrap break-words text-sm leading-relaxed text-body"
                        }
                      >
                        {turn.text}
                      </p>
                    </li>
                  ))}
                  {sending && (
                    <li aria-live="polite" className="inline-flex items-center gap-2 text-xs text-muted">
                      <ThinkingIndicator size="sm" />
                      {tSteps("working")}
                    </li>
                  )}
                </ol>
              )}
            </div>
            <div className="p-4 sm:p-6">
              {/* ΠΑΝΩ ΑΠΟ ΤΟ ΠΕΔΙΟ (the owner's follow-up message,
                  2026-10-23). "Σύνδεση GitHub" is gated on the four
                  env vars only (githubAppConfigured(), lib/github/auth.ts)
                  — no feature flag (the owner's "χωρίς διακόπτες",
                  2026-10-23). Admin sees setup message; users see nothing
                  until the keys are in Vercel (MASTER 20 Γ). */}
              <div data-testid="coding-project-row" className="mb-2 flex flex-wrap items-center gap-2">
                <GitHubConnect selection={github} onSelectionChange={setGitHub} isAdmin={isAdmin} githubConfigured={githubConfigured} />
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  hidden
                  // webkitdirectory: non-standard, no React/DOM type, but
                  // honoured by every browser this product supports; its
                  // only effect missing is the picker defaulting to a
                  // multi-file choice instead of a folder one.
                  {...{ webkitdirectory: "" }}
                  onChange={(e) => void handleFolderUpload(e.target.files)}
                  data-testid="coding-folder-input"
                />
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={uploadingFolder}
                  title={tGh("fromComputer")}
                  data-testid="coding-upload-folder"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border px-3 text-xs text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground disabled:opacity-40"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("uploadFolder")}
                </button>
              </div>
              <ChatComposer
                ref={composerRef}
                sending={sending}
                onSend={send}
                onStop={() => abortRef.current?.abort()}
                initialText={initialTask}
                placeholder={t("placeholder")}
                onLengthChange={setInputLength}
                trailingBeside={
                  // ΚΑΤΩ ΔΕΞΙΑ ΜΕΣΑ ΣΤΟ ΠΕΔΙΟ: ΙΣΧΥΣ (the owner's
                  // follow-up message, 2026-10-23) — three choices, a
                  // credit estimate beside each (powerCredits, above),
                  // never a model's name: lib/coding/power.ts is the only
                  // place "Κανονική" becomes a model id, and it does that
                  // on the server, not here.
                  <select
                    value={power}
                    onChange={(e) => setPower(e.target.value as PowerLevel)}
                    disabled={sending}
                    aria-label={t("power.label")}
                    data-testid="coding-power"
                    className="h-9 max-w-[6.5rem] rounded-item bg-transparent text-[11px] text-muted outline-none hover:text-foreground disabled:opacity-40 sm:max-w-[11rem] sm:text-xs"
                  >
                    {POWER_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {t("power.estimate", { level: t(`power.${level}`), count: powerCredits[level] })}
                      </option>
                    ))}
                  </select>
                }
              />
            </div>
          </div>

          {code && (
            <div className="flex min-h-0 flex-1 flex-col lg:w-[60%]" data-testid="coding-work">
              {/* ACTION BAR: undo, commit/PR, CI, merge */}
              {github.repo && github.branch && (
                <div className="flex flex-wrap items-center gap-2 border-b border-divider px-4 py-2 sm:px-6" data-testid="coding-actions">
                  {undoStack.length > 0 && (
                    <button
                      type="button"
                      onClick={popUndo}
                      data-testid="coding-undo"
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-item border border-border px-2.5 text-xs text-muted hover:bg-panel-hover hover:text-foreground"
                    >
                      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {tGh("undo")}
                    </button>
                  )}
                  {!prResult && code.files.some((f) => f.path) && (
                    <button
                      type="button"
                      onClick={() => setCommitOpen(true)}
                      data-testid="coding-commit-open"
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-item bg-foreground px-2.5 text-xs text-background hover:opacity-80"
                    >
                      <GitPullRequest className="h-3.5 w-3.5" aria-hidden="true" />
                      {tGh("commitChanges")}
                    </button>
                  )}
                  {prResult && (
                    <>
                      <a
                        href={prResult.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="coding-view-pr"
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-item border border-border px-2.5 text-xs text-foreground hover:bg-panel-hover"
                      >
                        <GitPullRequest className="h-3.5 w-3.5" aria-hidden="true" />
                        {tGh("viewPr")} #{prResult.number}
                      </a>
                      {ciStatus && (
                        <span className="inline-flex items-center gap-1 text-xs">
                          {ciStatus.checks.every((c) => c.conclusion === "success") ? (
                            <><CheckCircle className="h-3.5 w-3.5 text-success" aria-hidden="true" /><span className="text-success">{tGh("ciPassed")}</span></>
                          ) : ciStatus.checks.some((c) => c.conclusion === "failure") ? (
                            <><XCircle className="h-3.5 w-3.5 text-danger" aria-hidden="true" /><span className="text-danger">{tGh("ciFailed")}</span></>
                          ) : (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin text-muted" aria-hidden="true" /><span className="text-muted">{tGh("ciPending")}</span></>
                          )}
                        </span>
                      )}
                      {ciStatus?.state === "open" && !mergeConfirmOpen && (
                        <button
                          type="button"
                          onClick={() => setMergeConfirmOpen(true)}
                          disabled={merging}
                          data-testid="coding-merge"
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-item border border-success/40 bg-success/5 px-2.5 text-xs text-success hover:bg-success/10 disabled:opacity-40"
                        >
                          <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
                          {tGh("merge")}
                        </button>
                      )}
                      {mergeConfirmOpen && (
                        <div className="flex items-center gap-2" data-testid="coding-merge-confirm">
                          <span className="flex items-center gap-1 text-xs text-warning">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            {tGh("mergeConfirm")}
                          </span>
                          <button
                            type="button"
                            onClick={() => void doMerge()}
                            disabled={merging}
                            data-testid="coding-merge-yes"
                            className="min-h-[36px] rounded-item bg-success px-3 text-xs text-background hover:opacity-80 disabled:opacity-40"
                          >
                            {merging ? tGh("merging") : tGh("merge")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setMergeConfirmOpen(false)}
                            className="min-h-[36px] rounded-item border border-border px-3 text-xs text-muted hover:bg-panel-hover"
                          >
                            {tGh("cancel")}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  <span className="text-[10px] text-muted">{tGh("neverMain")}</span>
                </div>
              )}

              {code.files.length > 1 && (
                <div
                  aria-label={t("files")}
                  data-testid="coding-file-tabs"
                  className="flex items-center gap-1 border-b border-divider px-4 py-1.5 sm:px-6"
                >
                  <div role="tablist" className="flex flex-1 gap-1 overflow-x-auto">
                    {code.files.map((f, i) => (
                      <button
                        key={f.path ?? i}
                        type="button"
                        role="tab"
                        aria-selected={i === code.activeIndex}
                        onClick={() => selectFile(i)}
                        data-testid="coding-file-tab"
                        className={`min-h-[44px] shrink-0 rounded-item px-2.5 text-xs ${
                          i === code.activeIndex ? "bg-panel-hover text-foreground" : "text-muted hover:bg-panel-hover hover:text-foreground"
                        }`}
                      >
                        {f.path ?? t("code")}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadZip(
                      code.files.filter((f): f is CodeFile & { path: string } => f.path !== null).map((f) => ({ path: f.path, content: f.content })),
                      "code.zip",
                    )}
                    aria-label={tGh("downloadZip")}
                    data-testid="coding-download-zip"
                    className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-item px-2 text-xs text-muted hover:bg-panel-hover hover:text-foreground"
                  >
                    <Download className="h-3 w-3" aria-hidden="true" />
                    {tGh("downloadZip")}
                  </button>
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                {code.isEdit && code.priorContent ? (
                  <DiffView
                    oldCode={code.priorContent}
                    newCode={code.files[code.activeIndex].content}
                    onEditLine={editDiffLine}
                    fileName={code.files[code.activeIndex].path}
                    language={code.files[code.activeIndex].language}
                  />
                ) : (
                  <CodeBlock
                    code={code.files[code.activeIndex].content}
                    language={code.files[code.activeIndex].language}
                    fileName={code.files[code.activeIndex].path}
                  />
                )}
              </div>
            </div>
          )}

          {/* GITHUB FILE TREE — shown on the far right when a repo+branch
              is selected and there is no code open yet, or alongside the
              code panel on large screens. */}
          {github.repo && github.branch && !code && (
            <div className="flex min-h-0 flex-1 flex-col border-s border-divider" data-testid="coding-file-tree">
              <div className="flex items-center gap-2 border-b border-divider px-4 py-2">
                <FolderTree className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                <span className="text-xs font-medium text-foreground">{tGh("fileTree")}</span>
              </div>
              {loadingTree ? (
                <div className="flex items-center gap-2 px-4 py-6 text-xs text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  {tGh("loadingTree")}
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto py-1">
                  {fileTree.filter((f) => f.type === "blob").map((f) => (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => void openGitHubFile(f.path)}
                      data-testid="coding-tree-file"
                      className="flex w-full min-h-[36px] items-center px-4 text-start text-xs text-body hover:bg-panel-hover"
                    >
                      <span className="truncate">{f.path}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* COMMIT / PR DIALOG */}
      {commitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60" data-testid="coding-commit-dialog">
          <div className="w-full max-w-md rounded-card border border-border bg-background p-6 shadow-lg">
            <h3 className="mb-4 text-sm font-semibold text-foreground">{tGh("commitChanges")}</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted">{tGh("commitMessage")}</label>
                <input
                  type="text"
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  placeholder="Update code via Ionexa Coding"
                  data-testid="coding-commit-msg"
                  className="h-9 w-full rounded-item border border-border bg-transparent px-2 text-xs text-foreground outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">{tGh("branchNameLabel")}</label>
                <input
                  type="text"
                  value={newBranchForCommit}
                  onChange={(e) => setNewBranchForCommit(e.target.value)}
                  placeholder={`ionexa-${Date.now()}`}
                  data-testid="coding-commit-branch"
                  className="h-9 w-full rounded-item border border-border bg-transparent px-2 text-xs text-foreground outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">{tGh("prTitle")}</label>
                <input
                  type="text"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  data-testid="coding-pr-title"
                  className="h-9 w-full rounded-item border border-border bg-transparent px-2 text-xs text-foreground outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">{tGh("prBody")}</label>
                <textarea
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                  rows={3}
                  data-testid="coding-pr-body"
                  className="w-full rounded-item border border-border bg-transparent px-2 py-1.5 text-xs text-foreground outline-none"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCommitOpen(false)}
                className="min-h-[36px] rounded-item border border-border px-3 text-xs text-muted hover:bg-panel-hover"
              >
                {tGh("cancel")}
              </button>
              <button
                type="button"
                onClick={() => void doCommitAndPr()}
                disabled={committing}
                data-testid="coding-commit-submit"
                className="min-h-[36px] rounded-item bg-foreground px-3 text-xs text-background hover:opacity-80 disabled:opacity-40"
              >
                {committing ? tGh("creating") : tGh("createPr")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The change between two versions of the same code, as boxes: green for
 *  a line added, red (struck through) for a line removed, plain for a
 *  line neither — lib/coding/diff.ts does the comparing, this only
 *  draws it.
 *
 *  CLICK A BOX, TYPE A CHANGE, ONLY THAT CHANGES (the owner's critical
 *  message, 2026-10-22): a box that exists in the NEW code — "added" or
 *  "same", never "removed", which has nothing left to retype — opens an
 *  inline field on click; `onEditLine` splices just that one line, by
 *  its position in the new file, so every other line is untouched. */
function DiffView({
  oldCode,
  newCode,
  onEditLine,
  fileName,
  language,
}: {
  oldCode: string;
  newCode: string;
  onEditLine: (lineIndex: number, newText: string) => void;
  fileName: string | null;
  language: string | null;
}) {
  const t = useTranslations("coding");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const lines = diffLines(oldCode, newCode);
  // Each "added"/"same" line's own position in newCode — the index
  // `onEditLine` splices at. "removed" lines carry no such position.
  let newIndex = 0;
  const withPositions = lines.map((line) => {
    if (line.kind === "removed") return { line, atIndex: null as number | null };
    const atIndex = newIndex;
    newIndex += 1;
    return { line, atIndex };
  });

  function startEdit(atIndex: number, text: string) {
    setEditing(atIndex);
    setDraft(text);
  }
  function commitEdit(atIndex: number) {
    onEditLine(atIndex, draft);
    setEditing(null);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(newCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="code-panel">
      <div className="code-panel-header">
        <span className="break-words text-[11px] uppercase tracking-wider text-muted">{fileName ?? language ?? t("code")}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => downloadTextFile(newCode, suggestedFileName(fileName, language))}
            aria-label={t("download")}
            data-testid="coding-download"
            className="code-action-button"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            {t("download")}
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={t("copy")}
            data-testid="coding-copy"
            className="code-action-button"
          >
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            {copied ? t("copied") : t("copy")}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
        {withPositions.map(({ line, atIndex }, index) =>
          editing === atIndex ? (
            <input
              key={index}
              type="text"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitEdit(atIndex as number)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit(atIndex as number);
                else if (e.key === "Escape") setEditing(null);
              }}
              data-testid="coding-diff-edit-input"
              className="block w-full rounded-item border border-foreground/40 bg-panel px-2 py-0.5 text-foreground outline-none"
            />
          ) : (
            <button
              key={index}
              type="button"
              disabled={atIndex === null}
              onClick={() => atIndex !== null && startEdit(atIndex, line.text)}
              data-testid={line.kind === "added" ? "coding-diff-added" : line.kind === "removed" ? "coding-diff-removed" : "coding-diff-same"}
              className={`block w-full rounded-item px-2 text-start ${
                line.kind === "added"
                  ? "bg-success/10 text-success hover:bg-success/20"
                  : line.kind === "removed"
                    ? "bg-danger/10 text-danger line-through"
                    : "text-foreground hover:bg-panel-hover"
              }`}
            >
              {line.text.length > 0 ? line.text : " "}
            </button>
          )
        )}
      </div>
    </div>
  );
}
