"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, PanelLeft } from "lucide-react";
import { Earth } from "@/components/brand/earth";
import { HelpTip } from "@/components/ui/help-tip";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useToast } from "@/components/toast/toast-context";
import { ChatComposer, type ChatComposerHandle } from "@/components/chat/chat-composer";
import { ShellHistoryColumn, type ShellHistoryRow } from "@/components/shell/shell-history-column";
import { CodeBlock } from "@/components/coding/code-block";
import { diffLines } from "@/lib/coding/diff";
import { guessLanguage } from "@/lib/coding/highlight";
import { MAX_INPUT_CHARS, OPERATION_SPECS, type CodeOperation } from "@/lib/coding/operations";

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
};

type Turn = { id: string; role: "user" | "tool"; text: string };
type Code = { content: string; language: string | null; isEdit: boolean; priorContent: string | null };

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
export function CodingWorkspace({ sessions, initialTask }: { sessions: CodeSession[]; initialTask?: string }) {
  const t = useTranslations("coding");
  const tSteps = useTranslations("aiSteps");
  const tShell = useTranslations("dashboard.toolShell");
  const { addToast } = useToast();
  const composerRef = useRef<ChatComposerHandle>(null);
  const abortRef = useRef<AbortController | null>(null);
  const turnCounter = useRef(0);

  const rows = sessions;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [code, setCode] = useState<Code | null>(null);
  const [sending, setSending] = useState(false);
  const [openedId, setOpenedId] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    try {
      setHistoryOpen(window.localStorage.getItem("ionexa.codingHistoryColumn") === "open");
    } catch {
      // private window or storage off: closed, which is the default
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
    try {
      const response = await fetch("/api/coding/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ text: trimmed, priorCode: code?.content ?? null, priorLanguage: code?.language ?? null }),
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
        setCode({ content: output, language, isEdit, priorContent: isEdit ? code?.content ?? null : null });
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
        ? { content: row.output, language: row.targetLanguage ?? row.language, isEdit: false, priorContent: null }
        : null
    );
    setOpenedId(id);
    if (typeof window !== "undefined" && window.innerWidth < 768) toggleHistory();
  }

  const historyRows: ShellHistoryRow[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status === "failed" ? t("history.failed") : t(`operations.${row.operation}.label`),
  }));

  const showEmpty = turns.length === 0 && !code;

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
        <button
          type="button"
          onClick={startNew}
          aria-label={t("new")}
          data-testid="coding-new"
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-2 rounded-item px-2 text-sm text-muted hover:bg-panel-hover hover:text-foreground"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="hidden whitespace-nowrap sm:inline">{t("new")}</span>
        </button>
        <h1 className="min-w-0 break-words text-sm font-semibold text-foreground">{t("title")}</h1>
        <HelpTip helpKey="help.coding" />
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {historyOpen && (
          <>
            <div
              data-testid="coding-history"
              className="absolute inset-y-0 start-0 z-30 w-[85%] max-w-[320px] border-e border-divider bg-background md:relative md:z-auto md:w-[280px]"
            >
              <ShellHistoryColumn rows={historyRows} activeId={openedId} onOpen={openFromHistory} onNavigate={toggleHistory} />
            </div>
            <button
              type="button"
              aria-label={tShell("hideHistory")}
              onClick={toggleHistory}
              className="absolute inset-0 z-20 bg-background/50 md:hidden"
            />
          </>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col lg:max-w-md lg:border-e lg:border-divider">
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
                        className="min-h-[44px] rounded-full bg-panel px-4 text-xs text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
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
                            ? "max-w-[85%] whitespace-pre-wrap break-words rounded-card bg-panel px-3 py-2 text-sm text-foreground"
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
              <div className="chat-measure">
                <ChatComposer ref={composerRef} sending={sending} onSend={send} onStop={() => abortRef.current?.abort()} initialText={initialTask} placeholder={t("placeholder")} />
              </div>
            </div>
          </div>

          {code && (
            <div className="flex min-h-0 flex-1 flex-col lg:w-[60%]" data-testid="coding-work">
              <div className="flex items-center gap-2 px-4 py-2 sm:px-6">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{code.language ?? t("code")}</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                {code.isEdit && code.priorContent ? (
                  <DiffView oldCode={code.priorContent} newCode={code.content} />
                ) : (
                  <CodeBlock code={code.content} language={code.language} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The change between two versions of the same code, as boxes: green for
 *  a line added, red (struck through) for a line removed, plain for a
 *  line neither — lib/coding/diff.ts does the comparing, this only
 *  draws it. */
function DiffView({ oldCode, newCode }: { oldCode: string; newCode: string }) {
  const lines = diffLines(oldCode, newCode);
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-workspace p-3 font-mono text-xs leading-relaxed">
      {lines.map((line, index) => (
        <div
          key={index}
          data-testid={line.kind === "added" ? "coding-diff-added" : line.kind === "removed" ? "coding-diff-removed" : "coding-diff-same"}
          className={
            line.kind === "added"
              ? "rounded-item bg-success/10 px-2 text-success"
              : line.kind === "removed"
                ? "rounded-item bg-danger/10 px-2 text-danger line-through"
                : "px-2 text-foreground"
          }
        >
          {line.text.length > 0 ? line.text : " "}
        </div>
      ))}
    </div>
  );
}
