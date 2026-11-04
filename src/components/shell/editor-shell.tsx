"use client";

import { forwardRef, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, History, PanelLeft, Plus, X, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ChatComposer, type ChatComposerHandle } from "@/components/chat/chat-composer";
import { Earth } from "@/components/brand/earth";
import { Tooltip } from "@/components/ui/tooltip";
import { useCredits } from "@/components/credits/credits-context";
import { formatNumber } from "@/lib/format-number";
import { FieldSlotsProvider, type FieldSelection } from "@/components/shell/editor-shell-context";
import { ACTION } from "@/components/shell/tool-shell-styles";
import type { ShellPrimary, ToolShellProps, ShellTurn } from "@/components/shell/tool-shell";

/**
 * THE EDITOR LAYOUT — the 26 screens the owner approved
 * (docs/design/approved/README.md, 2026-11-04), behind the switch
 * "editor-shell" (src/lib/flags/flags.ts). components/shell/tool-shell.tsx
 * hands every tool here when the switch is on for the reader, so the ~20
 * tools that draw `ToolShell` follow at once, and with it off not one of
 * them draws a pixel differently. Measurements are the mockup's own
 * sheet, docs/design/approved/src/common.css; the class each one comes
 * from is named where it is used.
 *
 * EDITOR-FIRST, NOT CONVERSATION-FIRST. The old shell put the
 * conversation on the left and the work in a 60% pane; here, once there
 * is work, the work IS the screen:
 *
 *   - a 56px bar (`.tbar`): history, «Tool / title», the tool's own
 *     controls and ONE status tag, a spacer, the tool's outlined
 *     buttons, and EXACTLY ONE white primary — drawn by this file, from
 *     `work.primary`, so no tool can draw a second one;
 *   - the work at full width on the work surface (`.stage`, `.canvas`),
 *     with 140px of room under it so the field never covers the end;
 *   - an optional 288px settings panel on the right (`.insp`), when the
 *     tool passes `work.panel` — its options live there during work;
 *   - the field floating bottom-centre, at most 680px (`.askwrap`,
 *     `.ask`), with the selected piece as a chip and the price before
 *     send, and above it ONE line: the last thing the tool said, and
 *     «Chat», which opens the whole conversation.
 *
 * With no work, the start screen (M00-Start.png): the globe, one heading,
 * up to three examples as full-width rows, and the field with the tool's
 * options inside its bottom row. With turns but no work it is Chat's
 * shape: the thread, and the field under it.
 *
 * On a phone (below 1024px) the open work is the whole screen above the
 * tab bar, as it was: back, the title, the credits; a «Chat | Result»
 * switch; the primary full-width above the field (M14-Image.png).
 *
 * Held by scripts/tests/tool-shell.test.mjs (section 11) and, in a real
 * browser at 1440×900 and 390×844, scripts/tests/editor-shell.prodtest.mjs.
 */
type Props = ToolShellProps & {
  /** The «Simple | Pro» switch, already drawn by tool-shell.tsx (one component, one place). */
  modeSwitch?: ReactNode;
};

/** The widest the floating field gets (`.ask`'s max-width). */
export const EDITOR_FIELD_MAX = 680;
/** The settings panel's width (`.insp`'s flex-basis). */
export const EDITOR_PANEL_WIDTH = 288;

export const EditorShell = forwardRef<ChatComposerHandle, Props>(function EditorShell(props, ref) {
  const { name, help, turns, working, placeholder, sending, onSend, onStop, initialText, onLengthChange, options = [], footer, work, onCloseWork, attach, tray, holdSend, empty, history, selection, cost, modeSwitch } = props;
  const t = useTranslations("dashboard.toolShell");
  const locale = useLocale();
  const { credits, isAdmin } = useCredits();

  // THE FIELD'S TWO SLOTS, filled by the components that already say them
  // under the field (ChosenBox, CostEstimateHint, FieldCost) — see
  // components/shell/editor-shell-context.tsx. A prop the tool passes wins.
  const [chosen, setChosen] = useState<FieldSelection | null>(null);
  const [registeredCost, setRegisteredCost] = useState<string | null>(null);
  const slots = useMemo(() => ({ setSelection: setChosen, setCost: setRegisteredCost }), []);
  const pick = selection ?? chosen;
  const price = cost ?? registeredCost;

  // «Chat | Result» on a phone; a new piece of work always opens on Result.
  const [phoneView, setPhoneView] = useState<"result" | "chat">("result");
  const workTitle = work?.title ?? null;
  useEffect(() => {
    if (workTitle !== null) setPhoneView("result");
  }, [workTitle]);

  // THE CONVERSATION, ONE PRESS AWAY on a computer: «Chat» on the line
  // above the field opens it over the work, Esc or ✕ closes it, and focus
  // goes back to the press that opened it.
  const [chatOpen, setChatOpen] = useState(false);
  const chatLink = useRef<HTMLButtonElement>(null);
  const chatClose = useRef<HTMLButtonElement>(null);
  const chatTitle = useId();
  useEffect(() => {
    if (!chatOpen) return;
    chatClose.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeChat();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatOpen]);
  function closeChat() {
    setChatOpen(false);
    requestAnimationFrame(() => chatLink.current?.focus());
  }
  useEffect(() => {
    if (!work) setChatOpen(false);
  }, [work]);

  const showEmpty = Boolean(empty) && turns.length === 0 && !work;
  const lastSaid = [...turns].reverse().find((turn) => turn.role === "tool" && turn.text)?.text ?? null;
  const panel = work?.panel ?? null;
  const primary = work?.primary ?? null;

  const thread = (
    <ol className="chat-measure space-y-4">
      {turns.map((turn) => (
        <ThreadTurn key={turn.id} turn={turn} openLabel={t("open")} isOpenLabel={t("editor.isOpen")} />
      ))}
      {working && <li aria-live="polite">{working}</li>}
    </ol>
  );

  const historyToggle = history ? (
    <Tooltip content={t(history.open ? "hideHistory" : "showHistory")} side="right">
      <button
        type="button"
        onClick={history.onToggle}
        aria-expanded={history.open}
        aria-label={t(history.open ? "hideHistory" : "showHistory")}
        data-testid="tool-shell-history-toggle"
        className={ACTION}
      >
        {work ? <History className="h-4 w-4" aria-hidden="true" /> : <PanelLeft className="h-4 w-4" aria-hidden="true" />}
      </button>
    </Tooltip>
  ) : null;

  // THE ONE FIELD, in the shape the moment asks for (components/chat/chat-composer.tsx):
  // one row over open work (08-Site.png, 14-Image.png), the stacked
  // start-screen shape otherwise (M00-Start.png). The options ride in the
  // stacked shape's bottom row; with work open they are the panel's when
  // there is one, and when there is none the field keeps its stacked
  // shape rather than squeezing the text between four chips — measured
  // 2026-11-04 on Site at 1440px, where one row left the text 190px and
  // pushed send onto a second line.
  const optionsInField = options.length > 0 && !(work && panel);
  const oneRow = Boolean(work) && !optionsInField;
  // THE SLOTS REACH THE FIELD ONLY: a price or a chosen box drawn inside
  // the WORK (Rebuild's and Games' per-button prices) stays where it is.
  const field = (
    <FieldSlotsProvider value={slots}>
    <ChatComposer
      ref={ref}
      shape={oneRow ? "inline" : "landing"}
      sending={sending}
      onSend={onSend}
      onStop={onStop}
      initialText={initialText}
      placeholder={placeholder}
      onLengthChange={onLengthChange}
      attach={attach}
      tray={tray}
      holdSend={holdSend}
      leading={pick ? <SelectionChip pick={pick} selectedLabel={t("editor.selected", { name: pick.label })} clearLabel={t("box.whole")} /> : null}
      beside={
        optionsInField ? (
          <div data-testid="tool-shell-options" className="flex min-w-0 flex-wrap items-center gap-1">
            {options}
          </div>
        ) : undefined
      }
      trailingBeside={price ? <FieldPrice text={price} /> : undefined}
    >
      {footer}
    </ChatComposer>
    </FieldSlotsProvider>
  );

  return (
      <div data-testid="tool-shell" data-shell="editor" className="relative flex h-full overflow-hidden">
        {/* THE [◧] SLOT — the same sliding column as the old shell and
            Chat's own (components/chat/conversation-column.tsx). */}
        {history && (
          <>
            <div
              data-testid="tool-shell-history"
              data-open={history.open}
              className={`absolute inset-y-0 start-0 z-30 w-[85%] max-w-[320px] border-e border-divider bg-background transition-[width,transform] duration-200 ease-out md:relative md:z-auto md:max-w-none ${
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

        {/* ONE TREE FOR BOTH MOMENTS. The field sits at the same place
            whether or not there is work, so React keeps the SAME
            ChatComposer when work opens: what is typed stays typed, focus
            stays put, and a quick job's `initialText` is not put back in
            the box after it was sent (it is the composer's initial state,
            and a remount would read it again). Only classes change.

            ON A PHONE THE WORK IS THE WHOLE SCREEN, ABOVE THE TAB BAR'S
            64px — the reasoning and the measurement are the old shell's
            (components/shell/tool-shell.tsx, "ON A PHONE THE WORK IS THE
            WHOLE SCREEN"): z-[60] inside the dashboard's z-10 layer, the
            tab bar (z-40, md:hidden) outside it and drawn over the last
            64px, so the work keeps that room below md and none above it. */}
        <section
          aria-label={work ? work.title : undefined}
          data-testid={work ? "tool-shell-work" : "editor-main"}
          data-view={work ? phoneView : undefined}
          className={
            work
              ? "fixed inset-0 z-[60] flex min-w-0 flex-col bg-background pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 lg:static lg:z-auto lg:flex-1"
              : "flex min-w-0 flex-1 flex-col"
          }
        >
          {/* THE BAR (`.tbar`: 56px, a divider under it). */}
          {work ? (
            <div data-testid="editor-bar" className="editor-bar">
              <button type="button" onClick={onCloseWork} aria-label={t("back")} data-testid="tool-shell-back" className={`${ACTION} lg:hidden`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="hidden lg:contents">{historyToggle}</span>
              {/* «Tool / title» (`.crumb`). The tool's name goes up a
                  level — out of this piece of work, to the tool's own
                  start — which is the old shell's ✕, kept without a
                  control the approved bar does not have. */}
              <div className="flex min-w-0 items-center gap-2 lg:me-1.5">
                <button
                  type="button"
                  onClick={onCloseWork}
                  data-testid="tool-shell-close"
                  aria-label={`${name} — ${t("close")}`}
                  className="hidden min-h-[44px] shrink-0 items-center rounded-item px-1 text-sm text-muted transition-colors duration-150 hover:text-foreground lg:inline-flex"
                >
                  {name}
                </button>
                <span aria-hidden="true" className="hidden text-sm text-muted lg:inline">
                  /
                </span>
                <h1 data-testid="editor-title" className="min-w-0 truncate text-[15px] font-semibold text-foreground">
                  {work.title}
                </h1>
              </div>
              <div className="hidden min-w-0 items-center gap-2 lg:flex">
                {modeSwitch}
                {work.controls}
                {work.status && (
                  <span data-testid="editor-status" className="editor-tag">
                    {work.status}
                  </span>
                )}
              </div>
              <div className="flex-1" />
              <div data-testid="editor-actions" className="hidden items-center gap-2 lg:flex">
                {work.actions}
                {primary && <PrimaryButton primary={primary} where="bar" />}
              </div>
              {/* The balance, ONLY where nothing else on the screen says
                  it: below md the tab bar's «You» carries it
                  (components/dashboard/mobile-tab-bar.tsx), from lg the
                  top bar does (components/dashboard/top-nav.tsx); between
                  the two this screen covers the top bar and there is no
                  tab bar. */}
              <Link
                href="/dashboard/settings#buy-credits"
                data-testid="editor-credits"
                className="chip-link hidden shrink-0 gap-1.5 tabular-nums text-foreground md:inline-flex lg:hidden"
              >
                <span className="sr-only">{t("editor.credits")}</span>
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                {isAdmin ? "∞" : credits === null ? "…" : formatNumber(credits, locale)}
              </Link>
            </div>
          ) : (
            <div data-testid="editor-bar" className="editor-bar">
              {historyToggle}
              {history && (
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
              )}
              <h1 className="min-w-0 break-words px-1 text-[15px] font-semibold text-foreground">{name}</h1>
              {help}
            </div>
          )}

          {/* «Chat | Result» (`.seg`), on a phone only. */}
          {work && (
            <div className="flex justify-center px-4 pt-3 lg:hidden">
              <div role="group" aria-label={t("editor.view")} data-testid="editor-switch" className="inline-flex rounded-card bg-panel p-1">
                {(
                  [
                    ["chat", t("editor.chat")],
                    ["result", t("editor.result")],
                  ] as const
                ).map(([view, label]) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setPhoneView(view)}
                    aria-pressed={phoneView === view}
                    data-testid={`editor-switch-${view}`}
                    className={`min-h-[44px] min-w-[7.5rem] rounded-item px-4 text-sm transition-colors duration-150 ${phoneView === view ? "bg-tag text-foreground" : "text-muted hover:text-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* A phone's bar has room for the title alone; what the tool
              says beside it on a computer is said here instead. */}
          {work && (work.mode || work.controls || work.status || work.actions) && phoneView === "result" && (
            <div className="flex flex-wrap items-center justify-center gap-2 px-4 pt-2 lg:hidden">
              {modeSwitch}
              {work.controls}
              {work.status && <span className="editor-tag">{work.status}</span>}
              {work.actions}
            </div>
          )}

          <div className="relative flex min-h-0 flex-1 flex-col">
            {work ? (
              <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden ${phoneView === "chat" ? "max-lg:hidden" : ""}`}>
                {/* THE STAGE (`.stage`, `.canvas`): the full width, on the
                    work surface, 140px of room under the work for the
                    field that floats over it. */}
                <div data-testid="editor-stage" className="min-w-0 flex-1 bg-workspace lg:overflow-y-auto">
                  <div className="mx-auto flex min-h-full w-full flex-col px-4 pb-6 pt-5 sm:px-8 lg:pb-[140px] lg:pt-7">{work.body}</div>
                </div>
                {/* THE PANEL (`.insp`, 288px): the tool's settings while it
                    works, the price box at its foot. On a phone, under the
                    work, in the same scroll. */}
                {panel && (
                  <aside data-testid="editor-panel" aria-label={t("editor.settings")} className="editor-panel">
                    {panel}
                  </aside>
                )}
              </div>
            ) : (
              <div data-testid="tool-shell-thread" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                {showEmpty ? (
                  // THE START SCREEN (M00-Start.png): the globe, one heading,
                  // the examples as full-width rows in one ~560px column.
                  <div data-testid="tool-shell-empty" className="mx-auto flex min-h-full w-full max-w-[560px] flex-col items-center justify-center gap-6 text-center">
                    <Earth variant="small" px={72} />
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">{empty!.heading}</h2>
                    {empty!.why && <p className="max-w-sm text-sm leading-relaxed text-muted">{empty!.why}</p>}
                    {empty!.examples && empty!.examples.length > 0 && (
                      <div className="flex w-full flex-col gap-2">
                        {empty!.examples.map((ex) => (
                          <button
                            key={ex.key}
                            type="button"
                            onClick={() => onSend(ex.label)}
                            data-testid="tool-shell-example"
                            className="min-h-[48px] w-full rounded-card bg-panel px-4 py-3 text-start text-sm text-body transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
                          >
                            {ex.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  thread
                )}
              </div>
            )}
            {work && phoneView === "chat" && (
              <div data-testid="tool-shell-thread" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:hidden">
                {thread}
              </div>
            )}

            {/* THE FIELD (`.askwrap`). Over work, on a computer, it FLOATS
                bottom-centre over the stage — never over the panel — at
                most 680px wide; on a phone, and with no work, it is the
                screen's last row, so it never covers anything. */}
            <div
              data-testid={work ? "editor-float" : "editor-dock"}
              className={
                work
                  ? `flex shrink-0 flex-col items-center gap-2 px-4 pb-3 pt-2 lg:pointer-events-none lg:absolute lg:inset-x-0 lg:bottom-0 lg:z-10 lg:px-6 lg:pb-[22px] lg:pt-0 ${panel ? "lg:end-72" : ""}`
                  : "flex shrink-0 flex-col items-center px-4 pb-4 sm:px-6 sm:pb-6"
              }
            >
              {work && primary && phoneView === "result" && (
                <div className="pointer-events-auto w-full max-w-[680px] lg:hidden">
                  <PrimaryButton primary={primary} where="phone" />
                </div>
              )}
              {work && lastSaid && (
                <div data-testid="editor-note" className="editor-note pointer-events-auto hidden lg:flex">
                  <Earth variant="small" px={18} />
                  <span data-testid="editor-note-text" className="min-w-0 flex-1 truncate">
                    {lastSaid}
                  </span>
                  <button
                    ref={chatLink}
                    type="button"
                    onClick={() => setChatOpen(true)}
                    aria-expanded={chatOpen}
                    aria-haspopup="dialog"
                    data-testid="editor-chat-open"
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-item px-2 text-muted transition-colors duration-150 hover:text-foreground"
                  >
                    <History className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("editor.chat")}
                  </button>
                </div>
              )}
              {/* With nothing said back yet, the conversation (what was
                  asked) is still one press away. */}
              {work && !lastSaid && turns.length > 0 && (
                <button
                  ref={chatLink}
                  type="button"
                  onClick={() => setChatOpen(true)}
                  aria-expanded={chatOpen}
                  aria-haspopup="dialog"
                  data-testid="editor-chat-open"
                  className="pointer-events-auto hidden min-h-[44px] items-center gap-1 rounded-item px-2 text-xs text-muted transition-colors duration-150 hover:text-foreground lg:inline-flex"
                >
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("editor.chat")}
                </button>
              )}
              <div data-testid="editor-field" className="pointer-events-auto w-full max-w-[680px]">
                {field}
              </div>
            </div>
          </div>
        </section>

        {/* THE WHOLE CONVERSATION, over the work (a computer only — a phone
            has «Chat» in its own switch). */}
        {work && chatOpen && (
          <>
            <button
              type="button"
              aria-label={t("editor.closeChat")}
              tabIndex={-1}
              onClick={closeChat}
              data-testid="editor-chat-scrim"
              className="absolute inset-0 z-[70] hidden bg-background/60 lg:block"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={chatTitle}
              data-testid="editor-chat"
              className="absolute inset-y-0 end-0 z-[71] hidden w-full max-w-[440px] flex-col border-s border-divider bg-background lg:flex"
            >
              <div className="editor-bar">
                <h2 id={chatTitle} className="min-w-0 flex-1 px-1 text-sm font-semibold text-foreground">
                  {t("editor.conversation")}
                </h2>
                <button ref={chatClose} type="button" onClick={closeChat} aria-label={t("editor.closeChat")} data-testid="editor-chat-close" className={ACTION}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div data-testid="editor-chat-thread" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {thread}
              </div>
            </div>
          </>
        )}
      </div>
  );
});

/** One turn of the conversation — the same shape as the old shell's. */
function ThreadTurn({ turn, openLabel, isOpenLabel }: { turn: ShellTurn; openLabel: string; isOpenLabel: string }) {
  return (
    <li data-role={turn.role} className={turn.role === "user" ? "flex justify-end" : ""}>
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
            <span className="block text-xs text-muted">{turn.card.open ? isOpenLabel : openLabel}</span>
          </span>
        </button>
      )}
    </li>
  );
}

/**
 * THE SCREEN'S ONE WHITE BUTTON (`.btn.pri`), written once and placed
 * twice by width: in the bar from 1024px, full-width above the field
 * below it. One tag in this file, so scripts/tests/one-primary-action.test.mjs
 * reads one control, which is what a person ever sees at one width.
 */
function PrimaryButton({ primary, where }: { primary: ShellPrimary; where: "bar" | "phone" }) {
  return (
    <button
      type="button"
      onClick={primary.onClick}
      disabled={primary.disabled}
      aria-busy={primary.busy || undefined}
      data-testid={where === "bar" ? "editor-primary" : "editor-primary-phone"}
      className={`inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-item bg-button px-4 text-sm font-semibold text-button-ink transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${where === "phone" ? "w-full" : ""}`}
    >
      {primary.icon}
      {primary.label}
    </button>
  );
}

/** The selected piece, inside the field (`.selc`): its name and ✕. */
function SelectionChip({ pick, selectedLabel, clearLabel }: { pick: FieldSelection; selectedLabel: string; clearLabel: string }) {
  return (
    <span data-testid="editor-selection" className="inline-flex min-w-0 items-center gap-1 rounded-item bg-tag ps-2.5 text-xs text-foreground">
      <span className="min-w-0 truncate lg:hidden">{selectedLabel}</span>
      <span className="hidden min-w-0 truncate lg:inline">{pick.label}</span>
      <button
        type="button"
        onClick={pick.onClear}
        aria-label={clearLabel}
        title={clearLabel}
        data-testid="editor-selection-clear"
        className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-item text-muted transition-colors duration-150 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

/** The price before sending, muted, before the send button (`.ask .cost`). */
function FieldPrice({ text }: { text: string }) {
  return (
    <span data-testid="editor-cost" className="whitespace-nowrap px-1 text-xs text-muted">
      {text}
    </span>
  );
}

/** One labelled group of a tool's settings in the panel (`.ig`, `.lbl`). */
export function PanelGroup({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2">
      <span id={id} className="text-xs font-medium text-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** The price box pinned at the foot of the panel (`.price`). */
export function PanelPrice({ rows, note }: { rows: { label: string; value: string }[]; note?: string }) {
  return (
    <div className="mt-auto flex flex-col gap-2">
      <dl data-testid="editor-price" className="editor-price">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">{row.label}</dt>
            <dd className="text-end text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
