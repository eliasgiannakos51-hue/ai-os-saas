"use client";

import { forwardRef, type ReactNode } from "react";
import { ArrowLeft, FileText, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ChatComposer, type ChatComposerHandle } from "@/components/chat/chat-composer";

/**
 * ONE SHELL FOR EVERY TOOL (docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN §5, «ΕΝΑ
 * ΚΕΛΥΦΟΣ ΓΙΑ ΟΛΑ»; docs/MASTER.md Μέρος 14.3 and package 3 of Μέρος 16),
 * behind the switch "tool-shell" (src/lib/flags/flags.ts).
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
};

export const ToolShell = forwardRef<ChatComposerHandle, Props>(function ToolShell(
  { name, help, turns, working, placeholder, sending, onSend, onStop, initialText, onLengthChange, options = [], footer, work, onCloseWork, attach, tray, holdSend },
  ref
) {
  const t = useTranslations("dashboard.toolShell");
  return (
    <div data-testid="tool-shell" className="relative flex h-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-4 py-2">
          <h1 className="min-w-0 break-words text-sm font-semibold text-foreground">{name}</h1>
          {help}
        </div>
        <div data-testid="tool-shell-thread" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
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
          game's versions and a Site's last section were under it,
          unreachable (measured 2026-10-08). The same room main keeps. */}
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
