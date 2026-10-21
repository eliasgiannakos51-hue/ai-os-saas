"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, PanelLeft, Pencil, Plus, Send, Square } from "lucide-react";
import { Earth } from "@/components/brand/earth";
import { Tooltip } from "@/components/ui/tooltip";
import { HelpTip } from "@/components/ui/help-tip";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { CodeBlock } from "@/components/coding/code-block";
import { CodingHistoryColumn, type CodeConversationRow } from "@/components/coding/coding-history-column";
import { useToast } from "@/components/toast/toast-context";
import { useLimitText } from "@/lib/errors/use-error-text";
import { createClient } from "@/lib/supabase/client";
import { MAX_INPUT_CHARS } from "@/lib/coding/operations";
import { languageFromPath } from "@/lib/coding/highlight";
import { reduceFiles, type ParsedFile } from "@/lib/coding/file-blocks";
import { diffHasChanges, diffLines, type DiffLine } from "@/lib/coding/diff";

export type CodeSession = {
  id: string;
  operation: string;
  title: string;
  input: string;
  language: string | null;
  targetLanguage: string | null;
  output: string | null;
  folder: string | null;
  status: string;
  source: string;
  createdAt: string;
};

type CodeMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  files: ParsedFile[] | null;
  status: "done" | "failed";
};

const COLUMN_KEY = "ionexa.codingConversationColumn";
const EXAMPLES = ["vat", "explain", "findBugs"] as const;

/**
 * CODING, AS A CONVERSATION (owner, 2026-10-18) — the same shell shape
 * as Ionexa Chat: a thread on the left, work on the right, the [◧]
 * history column over both. Replaces the five-button, one-shot form
 * (the "1 Describe, 2 Generate, 3 Review" steps, the permanent "what
 * this does NOT do" box, the operation picker, the character counter,
 * the "use your other modules" toggle, the history list at the foot of
 * the page) with one field and a model that decides on its own what is
 * being asked, the same way Chat already does.
 *
 * TABS, AS STACKED CARDS SELECTED BY A ROW OF NAMES, not a classic
 * single-pane tab strip with the others hidden in the DOM — the
 * difference the brief's word "tabs" does not distinguish and the
 * accessibility tree does not care about: one file is shown at a time,
 * selected by clicking its name, exactly what "tabs" means on screen.
 *
 * «ΠΑΤΑΩ ΕΝΑ ΚΟΥΤΙ» IS THE Pencil BUTTON ON A FILE'S OWN CARD, not a
 * click anywhere on the card's body — the body is highlighted code or a
 * diff, both text a person reads and selects, and a click-anywhere
 * handler on top of selectable text is a fight with the browser's own
 * selection gesture. A labelled button is also a target a screen reader
 * announces, which "click the box" is not.
 */
export function CodingWorkspace({
  conversations: initialConversations,
  legacySessions = [],
  initialTask,
}: {
  conversations: readonly CodeConversationRow[];
  /** code_sessions, read-only — see coding-history-column.tsx's own
   *  comment on the prop it forwards this to. */
  legacySessions?: readonly CodeSession[];
  /** The brief Home routed here, already in the box, never auto-run. */
  initialTask?: string;
}) {
  const t = useTranslations("coding");
  const tSteps = useTranslations("aiSteps");
  const { addToast } = useToast();
  // Which limit the route refused with, said with the true time it opens
  // again, in the reader's own language — not the route's English
  // `detail` (lib/errors/use-error-text.ts; limit-texts.test.mjs).
  const limitText = useLimitText();

  const [conversations, setConversations] = useState<CodeConversationRow[]>([...initialConversations]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CodeMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const [input, setInput] = useState(initialTask ?? "");
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // A COUNTER, NOT Date.now(). Two messages can leave in the same
  // millisecond on a fast machine, and a React key collision is a
  // dropped or duplicated row, not a cosmetic glitch.
  const messageSeqRef = useRef(0);
  function nextMessageId(): number {
    messageSeqRef.current += 1;
    return messageSeqRef.current;
  }

  // THE COLUMN, REMEMBERED PER DEVICE — same key shape and the same
  // "closed until the stored value resolves" default as Chat's own
  // (components/chat/chat-workspace.tsx), so the first paint never
  // shows a column that then vanishes for somebody who had closed it.
  const [columnOpen, setColumnOpen] = useState(false);
  useEffect(() => {
    try {
      setColumnOpen(window.localStorage.getItem(COLUMN_KEY) === "open");
    } catch {
      /* private window or storage off: closed, which is the default */
    }
  }, []);
  function toggleColumn() {
    setColumnOpen((open) => {
      const next = !open;
      try {
        window.localStorage.setItem(COLUMN_KEY, next ? "open" : "closed");
      } catch {
        /* nothing to persist to; the toggle still works for this visit */
      }
      return next;
    });
  }

  // THE CODE PANE, FULL-SCREEN ON A PHONE with a back button — the
  // owner's own words: «στο κινητό, ο κώδικας ανοίγει πλήρη οθόνη με
  // κουμπί πίσω». Below md it is either the thread or the code, never
  // both; at md and up both sit side by side and this flag does nothing.
  const [mobileCodeOpen, setMobileCodeOpen] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, sending]);

  async function loadMessages(conversationId: string) {
    setLoadingMessages(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("code_messages")
        .select("id, role, content, files, status")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (activeIdRef.current !== conversationId) return;
      setMessages(
        (data ?? []).map((row) => ({
          id: String(row.id),
          role: row.role === "assistant" ? "assistant" : "user",
          content: String(row.content ?? ""),
          files: (row.files as ParsedFile[] | null) ?? null,
          status: row.status === "failed" ? "failed" : "done",
        }))
      );
    } finally {
      if (activeIdRef.current === conversationId) setLoadingMessages(false);
    }
  }

  function openConversation(id: string) {
    if (id === activeId) return;
    setActiveId(id);
    setMessages([]);
    void loadMessages(id);
  }

  function startNew() {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setMobileCodeOpen(false);
  }

  function onConversationDeleted(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) startNew();
  }

  function stopSending() {
    abortRef.current?.abort();
  }

  async function send(text: string, editPath: string | null = null) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setInput("");
    const conversationId = activeId;
    const pendingId = `pending-${nextMessageId()}`;
    setMessages((prev) => [...prev, { id: pendingId, role: "user", content: trimmed, files: null, status: "done" }]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/coding/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ conversationId, text: trimmed, editPath }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        // THE SAVED ROW IS NOT UNDONE. A failure after the conversation
        // and the user's own turn were created (ai_unavailable, an
        // uncaught error) still leaves both in the database — reopening
        // this conversation from the column shows them again. Rolling
        // the bubble back here is only about THIS render, not a claim
        // that nothing was saved.
        setMessages((prev) => prev.filter((m) => m.id !== pendingId));
        addToast(
          limitText(body) ??
            (body?.code === "too_long"
              ? t("errors.tooLong", { limit: MAX_INPUT_CHARS })
              : body?.code === "too_short"
                ? t("errors.tooShort")
                : body?.code === "insufficient_credits"
                  ? t("errors.insufficientCredits")
                  : body?.code === "ai_unavailable"
                    ? t("errors.unavailable")
                    : t("errors.failed")),
          "error"
        );
        return;
      }
      if (!conversationId) {
        setActiveId(body.conversationId);
        setConversations((prev) => [{ id: body.conversationId, title: body.title }, ...prev]);
      }
      // THE USER BUBBLE ALREADY SHOWN IS LEFT AS IT IS — only the
      // assistant's reply is new. Reopening this conversation later
      // (loadMessages, straight from code_messages) replaces both with
      // their real rows; this is only about what the current render
      // shows before that happens.
      setMessages((prev) => [
        ...prev,
        {
          id: String(body.messageId ?? `assistant-${nextMessageId()}`),
          role: "assistant",
          content: String(body.prose ?? ""),
          files: Array.isArray(body.files) && body.files.length > 0 ? body.files : null,
          status: "done",
        },
      ]);
    } catch {
      if (controller.signal.aborted) {
        // THE ROW IS ALREADY SAVED — the route writes the user's turn
        // before it ever calls the model, so Stop only cancels the
        // reply, not the question. The bubble stays; only a reply never
        // arrives, same as the old route's own "nothing charged,
        // nothing recorded as failed" for the half that did not run.
        addToast(tSteps("stopped"));
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== pendingId));
        addToast(t("errors.failed"), "error");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
      setEditingPath(null);
      setEditText("");
    }
  }

  // ---- the files this conversation currently holds, and what the
  // latest turn touched (file-blocks.ts's reduceFiles is the one place
  // that folds patches into a snapshot; this uses the exact function
  // the route does, so the two can never compute a different answer) ----
  const assistantTurns = useMemo(() => messages.filter((m) => m.role === "assistant"), [messages]);
  const files = useMemo(() => reduceFiles(assistantTurns), [assistantTurns]);
  const { touchedPaths, filesBeforeLastTurn } = useMemo(() => {
    const last = assistantTurns[assistantTurns.length - 1];
    const before = reduceFiles(assistantTurns.slice(0, -1));
    return {
      touchedPaths: new Set((last?.files ?? []).map((f) => f.path)),
      filesBeforeLastTurn: new Map(before.map((f) => [f.path, f.content])),
    };
  }, [assistantTurns]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  // THE LATEST TURN'S OWN FILE WINS, BUT ONLY ONCE PER TURN. Without the
  // ref below, "jump to whatever touchedPaths names" would also fire
  // every time a person clicks a DIFFERENT, untouched tab by hand — the
  // click and this effect would fight, because touchedPaths itself does
  // not change just because the selection did. Comparing the latest
  // assistant message's own id is what tells a genuinely NEW reply
  // apart from a render the person's own click caused.
  const lastAssistantIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (files.length === 0) {
      setSelectedPath(null);
      lastAssistantIdRef.current = null;
      return;
    }
    const lastAssistant = assistantTurns[assistantTurns.length - 1];
    const isNewTurn = Boolean(lastAssistant) && lastAssistant.id !== lastAssistantIdRef.current;
    if (lastAssistant) lastAssistantIdRef.current = lastAssistant.id;
    if (isNewTurn) {
      const firstTouched = files.find((f) => touchedPaths.has(f.path));
      if (firstTouched) {
        setSelectedPath(firstTouched.path);
        return;
      }
    }
    if (selectedPath && files.some((f) => f.path === selectedPath)) return;
    setSelectedPath(files[0].path);
  }, [files, touchedPaths, assistantTurns, selectedPath]);

  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const selectedFile = files.find((f) => f.path === selectedPath) ?? null;
  const selectedDiff: DiffLine[] | null =
    selectedFile && touchedPaths.has(selectedFile.path)
      ? diffLines(filesBeforeLastTurn.get(selectedFile.path) ?? "", selectedFile.content)
      : null;
  const showDiff = Boolean(selectedDiff && diffHasChanges(selectedDiff));

  const isEmpty = !loadingMessages && messages.length === 0;
  const hasFiles = files.length > 0;

  function submitComposer() {
    void send(input);
  }

  function submitEdit() {
    if (editingPath) void send(editText, editingPath);
  }

  return (
    <div className="relative flex h-full overflow-hidden" data-testid="coding-shell">
      {/* [◧]'S OWN SLOT — same slide-over shape as Chat's column, the
          owner's exact words for why both products do it this way:
          «Στο Chat πατάω [◧] και ανοίγουν οι συνομιλίες μου στο πλάι.» */}
      <div
        data-testid="coding-column-slot"
        data-open={columnOpen}
        className={`absolute inset-y-0 start-0 z-30 w-[85%] max-w-[320px] border-e border-divider bg-background transition-[width,transform] duration-200 ease-out md:relative md:z-auto md:w-[280px] md:max-w-none ${
          columnOpen
            ? "translate-x-0 md:w-[280px]"
            : "-translate-x-full rtl:translate-x-full md:w-0 md:translate-x-0 md:overflow-hidden md:border-e-0"
        }`}
      >
        {columnOpen && (
          <CodingHistoryColumn
            conversations={conversations}
            activeId={activeId}
            onOpen={openConversation}
            onDeleted={onConversationDeleted}
            legacySessions={legacySessions}
            onNavigate={() => {
              if (typeof window !== "undefined" && window.innerWidth < 768) toggleColumn();
            }}
          />
        )}
      </div>
      {columnOpen && (
        <button
          type="button"
          aria-label={t("hideHistory")}
          data-testid="coding-column-scrim"
          onClick={toggleColumn}
          className="absolute inset-0 z-20 bg-background/50 md:hidden"
        />
      )}

      {/* ---- the conversation ---- */}
      <div className={`flex min-w-0 flex-1 flex-col ${mobileCodeOpen ? "hidden md:flex" : ""}`}>
        <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
          <Tooltip content={t(columnOpen ? "hideHistory" : "showHistory")} side="right">
            <button
              type="button"
              onClick={toggleColumn}
              aria-expanded={columnOpen}
              aria-label={t(columnOpen ? "hideHistory" : "showHistory")}
              data-testid="coding-column-toggle"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"
            >
              <PanelLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </Tooltip>
          <button
            type="button"
            onClick={startNew}
            aria-label={t("newConversation")}
            data-testid="coding-new-conversation"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-2 rounded-item px-2 text-sm text-muted hover:bg-panel-hover hover:text-foreground"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden whitespace-nowrap sm:inline">{t("newConversation")}</span>
          </button>
          {/* THE "?" FOR THE WHOLE PAGE — same reason Chat's own sits in
              this bar rather than on a PageHeader: this page renders no
              PageHeader at all (it is full viewport), and this row is
              the one place that is always on screen. */}
          <HelpTip helpKey="help.coding" scopeKey="coding.dataScope" />
          {hasFiles && (
            <button
              type="button"
              onClick={() => setMobileCodeOpen(true)}
              data-testid="coding-mobile-view-code"
              className="ms-auto flex min-h-[44px] items-center gap-1.5 rounded-item px-3 text-sm text-muted hover:bg-panel-hover hover:text-foreground md:hidden"
            >
              {t("mobile.viewCode")}
            </button>
          )}
        </div>

        <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" data-testid="coding-thread">
          {isEmpty ? (
            <div
              data-testid="coding-empty"
              className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-5 text-center"
            >
              <Earth variant="small" px={96} />
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("empty.heading")}</h1>
              <div className="w-full">
                <textarea
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitComposer();
                    }
                  }}
                  rows={3}
                  placeholder={t("empty.placeholder")}
                  aria-label={t("empty.placeholder")}
                  data-testid="coding-empty-input"
                  className="w-full resize-none rounded-field border border-border bg-panel px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted focus:border-foreground/60"
                />
                <button
                  type="button"
                  onClick={submitComposer}
                  disabled={!input.trim()}
                  data-testid="coding-empty-send"
                  className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-button px-5 text-sm font-semibold text-button-ink transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {t("empty.send")}
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {EXAMPLES.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void send(t(`empty.examples.${key}`))}
                    data-testid="coding-example"
                    className="min-h-[44px] rounded-full bg-panel px-4 text-xs text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
                  >
                    {t(`empty.examples.${key}`)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg) =>
                msg.role === "user" ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-card bg-panel px-4 py-2.5 text-sm text-foreground">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="flex items-start gap-2">
                    <Earth variant="small" px={20} still />
                    <div className="min-w-0 flex-1 text-sm text-foreground">
                      {msg.status === "failed" ? (
                        <p className="text-danger">{t("errors.failed")}</p>
                      ) : (
                        <>
                          {msg.content && <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>}
                          {msg.files && msg.files.length > 0 && (
                            <p className="mt-1 text-xs text-muted">{t("wroteFiles", { count: msg.files.length })}</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              )}
              {sending && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <ThinkingIndicator size="sm" />
                  {t("thinking")}
                </div>
              )}
            </div>
          )}
        </div>

        {!isEmpty && (
          <div className="flex items-end gap-2 border-t border-border px-3 py-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitComposer();
                }
              }}
              rows={1}
              placeholder={t("composerPlaceholder")}
              aria-label={t("composerPlaceholder")}
              data-testid="coding-composer"
              className="min-h-[44px] flex-1 resize-none rounded-field border border-border bg-panel px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted focus:border-foreground/60"
            />
            {sending ? (
              <button
                type="button"
                onClick={stopSending}
                data-testid="coding-stop"
                aria-label={tSteps("stop")}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-foreground/10 px-4 text-sm font-medium text-foreground transition-opacity duration-150 hover:opacity-90"
              >
                <Square className="h-3 w-3 fill-current" aria-hidden="true" />
                {tSteps("stop")}
              </button>
            ) : (
              <button
                type="button"
                onClick={submitComposer}
                disabled={!input.trim()}
                aria-label={t("empty.send")}
                data-testid="coding-send"
                // DEMOTED, NOT A SECOND FILLED CONTROL: the empty state's
                // own send button (coding-empty-send) is the one loud
                // control on this page, same reasoning one-primary-
                // action.test.mjs already applies to a list's "+ New"
                // next to a form's "Save" — mutually exclusive states of
                // the same flow, so the second stays quiet rather than
                // raising the page's baseline.
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-foreground/10 px-4 text-sm font-medium text-foreground transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---- the code ---- */}
      {hasFiles && (
        <div
          data-testid="coding-code-pane"
          className={`flex min-w-0 flex-col border-border bg-workspace md:static md:z-auto md:flex md:w-[55%] md:shrink-0 md:border-s ${
            mobileCodeOpen ? "fixed inset-0 z-40 flex" : "hidden md:flex"
          }`}
        >
          <button
            type="button"
            onClick={() => setMobileCodeOpen(false)}
            aria-label={t("mobile.back")}
            data-testid="coding-mobile-back"
            className="flex min-h-[44px] items-center gap-2 px-3 text-sm text-foreground md:hidden"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("mobile.back")}
          </button>

          {files.length > 1 && (
            <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1" data-testid="coding-file-tabs">
              {files.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => setSelectedPath(f.path)}
                  aria-current={f.path === selectedPath ? "true" : undefined}
                  data-testid="coding-file-tab"
                  className={`min-h-[44px] shrink-0 rounded-item px-3 text-xs ${
                    f.path === selectedPath
                      ? "bg-panel text-foreground"
                      : "text-muted hover:bg-panel-hover hover:text-foreground"
                  }`}
                >
                  {touchedPaths.has(f.path) && <span className="me-1 inline-block h-1.5 w-1.5 rounded-full bg-foreground/60" aria-hidden="true" />}
                  {f.path}
                </button>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {selectedFile && (
              <div className="space-y-2" data-testid="coding-file-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-foreground">{selectedFile.path}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPath((p) => (p === selectedFile.path ? null : selectedFile.path));
                      setEditText("");
                    }}
                    aria-label={t("editFile.open", { path: selectedFile.path })}
                    data-testid="coding-edit-file"
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item px-3 text-[11px] text-muted hover:bg-panel-hover hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                    {t("editFile.button")}
                  </button>
                </div>

                {editingPath === selectedFile.path && (
                  <div className="space-y-2 rounded-card bg-panel p-2" data-testid="coding-edit-file-form">
                    <textarea
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          submitEdit();
                        }
                      }}
                      rows={2}
                      placeholder={t("editFile.placeholder")}
                      aria-label={t("editFile.placeholder")}
                      data-testid="coding-edit-file-input"
                      className="w-full resize-none rounded-item border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-foreground/60"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingPath(null)}
                        className="min-h-[44px] rounded-item px-3 text-xs text-muted hover:text-foreground"
                      >
                        {t("editFile.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={submitEdit}
                        disabled={!editText.trim() || sending}
                        data-testid="coding-edit-file-submit"
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-button px-4 text-xs font-semibold text-button-ink disabled:opacity-40"
                      >
                        {sending ? <ThinkingIndicator size="sm" tone="inherit" /> : t("editFile.submit")}
                      </button>
                    </div>
                  </div>
                )}

                {showDiff && selectedDiff ? (
                  <div className="rounded-card border border-border bg-workspace" data-testid="coding-diff">
                    <pre className="overflow-x-auto px-3 py-3 text-xs leading-relaxed">
                      <code>
                        {selectedDiff.map((line, i) => (
                          <div
                            key={i}
                            className={
                              line.kind === "add"
                                ? "bg-success/10 text-success"
                                : line.kind === "remove"
                                  ? "bg-danger/10 text-danger"
                                  : "text-foreground"
                            }
                          >
                            <span aria-hidden="true" className="select-none pe-2 text-muted">
                              {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}
                            </span>
                            {line.text}
                          </div>
                        ))}
                      </code>
                    </pre>
                  </div>
                ) : (
                  <CodeBlock
                    code={selectedFile.content}
                    language={languageFromPath(selectedFile.path, selectedFile.content)}
                    fileName={selectedFile.path}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
