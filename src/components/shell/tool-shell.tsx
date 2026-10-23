"use client";

import { forwardRef, type ReactNode } from "react";
import { ArrowLeft, FileText, PanelLeft, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ChatComposer, type ChatComposerHandle } from "@/components/chat/chat-composer";
import { Earth } from "@/components/brand/earth";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * ONE SHELL FOR EVERY TOOL (docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN §5, «ΕΝΑ
 * ΚΕΛΥΦΟΣ ΓΙΑ ΟΛΑ»; docs/MASTER.md Μέρος 14.3 and package 3 of Μέρος 16),
 * for everybody — the switch "tool-shell" was removed 2026-10-23.
 *
 * The conversation on the left, the work on the right; one field, the
 * same as Chat's (components/chat/chat-composer.tsx), with the tool's own
 * placeholder; at most four options under it, as labels; one button,
 * which is the field's send. No steps on top, no boxes of warnings, no
 * tabs that are not needed. On a phone the work is the whole screen, with
 * a button back to the conversation.
 *
 * Each tool keeps its own routes and its own state and hands this its
 * turns, its options and its work. scripts/tests/tool-shell.test.mjs holds
 * every tool that uses it to four options and one field.
 *
 * THE EMPTY LANDING AND THE [◧] HISTORY COLUMN (MASTER Μέρος 20 Δ,
 * 2026-10-21): the same shapes Chat already has
 * (components/chat/chat-workspace.tsx, components/chat/conversation-column.tsx),
 * inside this shell rather than copied with a textarea of its own — the
 * "Coding, as a conversation" redesign (Βήμα 3) draws the same two
 * shapes too, but in its own bespoke component, outside `ToolShell`,
 * since Coding never used this shell to begin with. With no turns yet
 * and no work open, `empty` draws the small globe, one heading and up to
 * three examples that send at once — still through the one field, the
 * `ChatComposer` above stays the only place a key is typed. `history`
 * draws the same sliding [◧] slot, over the whole shell, that Chat's own
 * column sits in; the column itself is each tool's content. Both are
 * opt-in, so a tool that has not moved to them yet keeps its blank
 * thread and its own "Recent" option exactly as before.
 */
export type ShellTurn = {
  id: string;
  role: "user" | "tool";
  text: string;
  /** A small card under a tool turn that opens the work again. */
  card?: { title: string; open: boolean; onOpen: () => void };
  /** What a tool turn shows under its words: a plan to approve, with its
   *  price and the press that starts it (Research). */
  extra?: ReactNode;
};

export const MAX_SHELL_OPTIONS = 4;
export const MAX_SHELL_EXAMPLES = 3;

/** One example on the empty landing: the text it sends, at once, on a press. */
export type ShellExample = { key: string; label: string };

type Props = {
  /** The tool's one-word name (MASTER 14.1), on top of the conversation. */
  name: string;
  /** The "?" for this tool, beside its name. */
  help?: ReactNode;
  turns: ShellTurn[];
  /** A turn being worked on: shown under the last one while it runs. */
  working?: ReactNode;
  placeholder: string;
  sending: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
  initialText?: string;
  onLengthChange?: (length: number) => void;
  /** The tool's options, drawn under the field. At most four. */
  options?: ReactNode[];
  /** Lines under the field: the price before sending, one plain limit. */
  footer?: ReactNode;
  /** What the tool made, beside the conversation. */
  work?: { title: string; actions?: ReactNode; body: ReactNode } | null;
  onCloseWork?: () => void;
  /** Files given to the field — the «+», a paste, a drop — and what they
   *  are, drawn above the text; the same as Chat's (package 9). Slides
   *  passes them for a spreadsheet to chart (package 13). */
  attach?: { accept: string; label: string; onFiles: (files: File[]) => void };
  tray?: ReactNode;
  /** Send waits while a file is still being read. */
  holdSend?: boolean;
  /** The empty landing: one question and up to three examples, drawn with
   *  the small globe while there are no turns and no work open. Omit for
   *  a blank thread (the old behaviour). */
  empty?: { heading: string; examples?: ShellExample[] };
  /** The [◧] history column: its open state, what toggles and opens it,
   *  and its own content (a `ShellHistoryColumn`, typically). Omit to
   *  keep the tool's own history UI (an option under the field). */
  history?: { open: boolean; onToggle: () => void; onNew: () => void; newLabel: string; column: ReactNode };
};

export const ToolShell = forwardRef<ChatComposerHandle, Props>(function ToolShell(
  { name, help, turns, working, placeholder, sending, onSend, onStop, initialText, onLengthChange, options = [], footer, work, onCloseWork, attach, tray, holdSend, empty, history },
  ref
) {
  const t = useTranslations("dashboard.toolShell");
  const showEmpty = Boolean(empty) && turns.length === 0 && !work;
  return (
    <div data-testid="tool-shell" className="relative flex h-full overflow-hidden">
      {/* THE [◧] SLOT, the same sliding shape as Chat's own
          (components/chat/chat-workspace.tsx, components/chat/conversation-column.tsx):
          over the whole shell, so it covers the work area too. */}
      {history && (
        <>
          <div
            data-testid="tool-shell-history"
            data-open={history.open}
            className={`absolute inset-y-0 start-0 z-30 w-[85%] max-w-[320px] border-e border-divider bg-background transition-[width,transform] duration-200 ease-out md:relative md:z-auto md:w-[280px] md:max-w-none ${
              history.open
                ? "translate-x-0 md:w-[280px]"
                : "-translate-x-full rtl:translate-x-full md:w-0 md:translate-x-0 md:overflow-hidden md:border-e-0"
            }`}
          >
            {history.open && history.column}
          </div>
          {history.open && (
            <button
              type="button"
              aria-label={t("hideHistory")}
              data-testid="tool-shell-history-scrim"
              onClick={history.onToggle}
              className="absolute inset-0 z-20 bg-background/50 md:hidden"
            />
          )}
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-4 py-2">
          {history && (
            <>
              <Tooltip content={t(history.open ? "hideHistory" : "showHistory")} side="right">
                <button
                  type="button"
                  onClick={history.onToggle}
                  aria-expanded={history.open}
                  aria-label={t(history.open ? "hideHistory" : "showHistory")}
                  data-testid="tool-shell-history-toggle"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"
                >
                  <PanelLeft className="h-4 w-4" aria-hidden="true" />
                </button>
              </Tooltip>
              <button
                type="button"
                onClick={history.onNew}
                aria-label={history.newLabel}
                data-testid="tool-shell-new"
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-2 rounded-item px-2 text-sm text-muted hover:bg-panel-hover hover:text-foreground"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="hidden whitespace-nowrap sm:inline">{history.newLabel}</span>
              </button>
            </>
          )}
          <h1 className="min-w-0 break-words text-sm font-semibold text-foreground">{name}</h1>
          {help}
        </div>
        <div data-testid="tool-shell-thread" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {showEmpty ? (
            <div data-testid="tool-shell-empty" className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-5 text-center">
              <Earth variant="small" px={96} />
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">{empty!.heading}</h2>
              {empty!.examples && empty!.examples.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {empty!.examples.map((ex) => (
                    <button
                      key={ex.key}
                      type="button"
                      onClick={() => onSend(ex.label)}
                      data-testid="tool-shell-example"
                      className="min-h-[44px] rounded-full bg-panel px-4 text-xs text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <ol className="chat-measure space-y-4">
            {turns.map((turn) => (
              <li key={turn.id} data-role={turn.role} className={turn.role === "user" ? "flex justify-end" : ""}>
                {turn.text && (
                  <p
                    className={
                      turn.role === "user"
                        ? "max-w-[85%] whitespace-pre-wrap break-words rounded-card bg-panel px-3 py-2 text-sm text-foreground"
                        : "whitespace-pre-wrap break-words text-sm leading-relaxed text-body"
                    }
                  >
                    {turn.text}
                  </p>
                )}
                {turn.extra}
                {turn.card && (
                  <button
                    type="button"
                    onClick={turn.card.onOpen}
                    aria-pressed={turn.card.open}
                    data-testid="tool-shell-card"
                    className={`btn-outline mt-2 w-full max-w-sm gap-3 px-3 py-2 text-start ${turn.card.open ? "bg-panel-hover" : ""}`}
                  >
                    <FileText className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm text-foreground">{turn.card.title}</span>
                      <span className="block text-xs text-muted">{t(turn.card.open ? "isOpen" : "open")}</span>
                    </span>
                  </button>
                )}
              </li>
            ))}
            {working && <li aria-live="polite">{working}</li>}
          </ol>
          )}
        </div>
        <div className="p-4 sm:p-6">
          <div className="chat-measure">
            <ChatComposer
              ref={ref}
              sending={sending}
              onSend={onSend}
              onStop={onStop}
              initialText={initialText}
              placeholder={placeholder}
              onLengthChange={onLengthChange}
              attach={attach}
              tray={tray}
              holdSend={holdSend}
            >
              {options.length > 0 && (
                <div data-testid="tool-shell-options" className="mt-2 flex flex-wrap gap-2">
                  {options}
                </div>
              )}
              {footer}
            </ChatComposer>
          </div>
        </div>
      </div>

      {/* ON A PHONE THE WORK IS THE WHOLE SCREEN, ABOVE THE TAB BAR'S 64px.
          Its z-[60] is counted inside the dashboard's z-10 layer
          (app/dashboard/layout.tsx), and the tab bar
          (components/dashboard/mobile-tab-bar.tsx, z-40, md:hidden) sits
          outside it, so the bar is drawn over the work's last 64px: a
          game's versions, a Site's last section and an automation's
          history were under it, unreachable (measured 2026-10-08, the last
          by scripts/tests/connections-automations-edges.prodtest.mjs). The
          same room main keeps, and the scrolling area ends above the bar. */}
      {work && (
        <section
          aria-label={work.title}
          data-testid="tool-shell-work"
          className="fixed inset-0 z-[60] flex flex-col bg-workspace pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 lg:static lg:z-auto lg:w-[60%] lg:shrink-0"
        >
          <div className="flex items-center gap-1 px-2 py-1.5">
            <button type="button" onClick={onCloseWork} aria-label={t("back")} data-testid="tool-shell-back" className={`${ACTION} lg:hidden`}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <p className="min-w-0 flex-1 break-words px-1 text-sm font-medium text-foreground">{work.title}</p>
            {work.actions}
            <button type="button" onClick={onCloseWork} aria-label={t("close")} data-testid="tool-shell-close" className={`${ACTION} hidden lg:inline-flex`}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">{work.body}</div>
        </section>
      )}
    </div>
  );
});

/** A 44px icon action in the work area's top row. */
export const ACTION =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground";

/** One option under the field: a label that is pressed, or that opens a choice. */
export const OPTION = "chip-link gap-1.5";

/**
 * ONE BOX CHOSEN (package 4): under the field, what the next change will
 * touch, and the press that goes back to the whole thing. Slides and Site
 * draw it while a slide or a part of the page is chosen.
 */
export function ChosenBox({ label, onClear }: { label: string; onClear: () => void }) {
  const t = useTranslations("dashboard.toolShell");
  return (
    <p data-testid="box-chosen" className="mt-1 flex items-center gap-1 text-xs text-foreground">
      <span className="min-w-0 break-words">{t("box.only", { name: label })}</span>
      <button type="button" onClick={onClear} aria-label={t("box.whole")} title={t("box.whole")} data-testid="box-clear" className={ACTION}>
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </p>
  );
}

/** Whether the work sits beside the conversation (a computer) or covers it (a phone). */
export function workIsBeside(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
}
