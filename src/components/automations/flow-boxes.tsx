"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bell, BookOpen, Check, Clock, FileUp, Filter, Mail, PauseCircle, Send, Sparkles, Table2, CalendarDays, Timer } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import {
  ACTIONS,
  MAX_INSTRUCTION_CHARS,
  READ_SOURCES,
  connectionsNeeded,
  partOf,
  type ActionKind,
  type Box,
  type ReadSource,
  type SentencePart,
  type StartBox,
} from "@/lib/automations/boxes";
import type { LineState, RunProgress } from "@/lib/automations/run-progress";
import { MAX_MINUTES, MIN_MINUTES, timeSaved } from "@/lib/automations/time-saved";
import type { ShownRun } from "@/lib/automations/flow-view";
import { errorCode } from "@/lib/automations/flow-view";
import type { RunStep } from "@/lib/automations/run-steps";
import { getProvider } from "@/lib/integrations/providers";

/**
 * THE BOXES OF ONE AUTOMATION, AND WHAT EACH RUN DID WITH THEM (MASTER 16,
 * package 30). Drawn by components/automations/automation-shell.tsx in
 * the work area.
 *
 * Top to bottom, joined by a line: each box is one press, which CHOOSES
 * it — the field then changes that box alone, and the hand editor opens
 * under the row. A condition draws its other branch beside it («αλλιώς:
 * σταματά»). A box that needs something not connected says so, with the
 * press that leads to the connection.
 *
 * Every word is a literal key here (dashboard.automations.*), so the
 * message slicer sees them all.
 */
export type Connected = { google_calendar: boolean; telegram: boolean };

/** The names of what an automation connects to: brand names, the same in every language. */
export const CONNECTION_NAME: Record<keyof Connected, string> = {
  google_calendar: String(getProvider("google_calendar")?.name),
  telegram: "Telegram",
};

/** Where each connection is made. */
export const CONNECT_AT: Record<keyof Connected, string> = {
  google_calendar: "/dashboard/integrations",
  telegram: "/dashboard/agents",
};

const ROW = "flex w-full items-start gap-3 rounded-item bg-panel px-3 py-2.5 text-start hover:bg-panel-hover";

function useWords() {
  const t = useTranslations("dashboard.automations");
  const kind: Record<Box["kind"], string> = {
    start: t("kinds.start"),
    read: t("kinds.read"),
    ai: t("kinds.ai"),
    condition: t("kinds.condition"),
    approval: t("kinds.approval"),
    action: t("kinds.action"),
  };
  const source: Record<ReadSource, string> = {
    calendar_today: t("sources.calendar_today"),
    calendar_tomorrow: t("sources.calendar_tomorrow"),
    calendar_week: t("sources.calendar_week"),
    finances_week: t("sources.finances_week"),
    finances_month: t("sources.finances_month"),
    uploaded_file: t("sources.uploaded_file"),
  };
  const action: Record<ActionKind, string> = {
    send_telegram: t("actions.send_telegram"),
    send_email: t("actions.send_email"),
    notify: t("actions.notify"),
    save_to_library: t("actions.save_to_library"),
  };
  const weekday = [t("weekdays.d1"), t("weekdays.d2"), t("weekdays.d3"), t("weekdays.d4"), t("weekdays.d5"), t("weekdays.d6"), t("weekdays.d7")];
  // «Όταν → Αν → Κάνε»: the part of the sentence each box is (lib/automations/boxes.ts SENTENCE_PART).
  const part: Record<SentencePart, string> = { when: t("parts.when"), if: t("parts.if"), do: t("parts.do") };
  const needs = CONNECTION_NAME;
  function start(box: StartBox): string {
    if (box.when === "file_uploaded") return t("start.file");
    if (box.every === "day") return t("start.day", { at: box.at });
    if (box.every === "weekdays") return t("start.weekdays", { at: box.at });
    if (box.every === "week") return t("start.week", { day: weekday[(box.weekday ?? 1) - 1], at: box.at });
    return t("start.month", { day: box.monthDay ?? 1, at: box.at });
  }
  function describe(box: Box): string {
    switch (box.kind) {
      case "start":
        return start(box);
      case "read":
        return source[box.source];
      case "ai":
        return box.instruction;
      case "condition":
        return t("condition");
      case "approval":
        return t("approval");
      case "action":
        return action[box.do];
    }
  }
  return { t, kind, source, action, weekday, part, needs, describe };
}

/** What one step of a run did, in the reader's words: the history's lines and the canvas's failure mark say it the same way. */
function useNoteWords(): (step: RunStep) => string {
  const t = useTranslations("dashboard.automations");
  return (step) => {
    const note: Record<RunStep["note"], string> = {
      started: t("notes.started"),
      read_items: t("notes.read_items", { count: step.count ?? 0 }),
      read_nothing: t("notes.read_nothing"),
      ai_done: t("notes.ai_done"),
      condition_empty: t("notes.condition_empty"),
      condition_met: t("notes.condition_met"),
      approval_waiting: t("notes.approval_waiting"),
      approval_given: t("notes.approval_given"),
      would_wait: t("notes.would_wait"),
      sent: t("notes.sent"),
      would_send: t("notes.would_send"),
      saved: t("notes.saved"),
      would_save: t("notes.would_save"),
      not_connected: t("notes.not_connected"),
      no_file: t("notes.no_file"),
      over_limit: t("notes.over_limit"),
      no_credits: t("notes.no_credits"),
      rate_limited: t("notes.rate_limited"),
      provider: t("notes.provider"),
      unsafe: t("notes.unsafe"),
      delivery: t("notes.delivery"),
      failed: t("notes.failed"),
    };
    return note[step.note];
  };
}

/**
 * ONE LINE BETWEEN TWO BOXES OF THE PRO CANVAS, in the state the run puts
 * it in (lib/automations/run-progress.ts): idle is the border colour and
 * still; `done` is lit; `active` is lit with two dots travelling down it
 * into the box the run is in. The look is globals.css's `.flow-line`,
 * which also takes the dots away, and keeps the line bright, for anybody
 * who asked for less motion.
 */
function FlowLine({ state }: { state: LineState }) {
  return (
    <span aria-hidden="true" data-testid="flow-line" data-state={state} className="flow-line">
      {state === "active" && (
        <>
          <span className="flow-dot" />
          <span className="flow-dot" />
        </>
      )}
    </span>
  );
}

/** One box, as a short line: what the field says it will change. */
export function useBoxLabel(): (box: Box) => string {
  const { kind } = useWords();
  return (box) => kind[box.kind];
}

function BoxIcon({ box }: { box: Box }) {
  const cls = "mt-0.5 h-4 w-4 shrink-0 text-muted";
  if (box.kind === "start") return box.when === "file_uploaded" ? <FileUp className={cls} aria-hidden="true" /> : <Clock className={cls} aria-hidden="true" />;
  if (box.kind === "read") return box.source.startsWith("calendar_") ? <CalendarDays className={cls} aria-hidden="true" /> : box.source === "uploaded_file" ? <FileUp className={cls} aria-hidden="true" /> : <Table2 className={cls} aria-hidden="true" />;
  if (box.kind === "ai") return <Sparkles className={cls} aria-hidden="true" />;
  if (box.kind === "condition") return <Filter className={cls} aria-hidden="true" />;
  if (box.kind === "approval") return <PauseCircle className={cls} aria-hidden="true" />;
  if (box.do === "send_telegram") return <Send className={cls} aria-hidden="true" />;
  if (box.do === "send_email") return <Mail className={cls} aria-hidden="true" />;
  if (box.do === "notify") return <Bell className={cls} aria-hidden="true" />;
  return <BookOpen className={cls} aria-hidden="true" />;
}

export function BoxRow({
  boxes,
  chosen,
  onChoose,
  connected,
  progress,
}: {
  boxes: Box[];
  chosen: string | null;
  onChoose: (id: string) => void;
  connected: Connected;
  /** Where the followed run is (lib/automations/run-progress.ts), for
   *  the readers "agents-automations-pro" is open to. Omitted, the row is
   *  drawn exactly as it was before: a short still line, nothing marked. */
  progress?: RunProgress | null;
}) {
  const { t, kind, needs, describe } = useWords();
  const noteWords = useNoteWords();
  return (
    <ol data-testid="flow-boxes" data-live={progress ? progress.live : undefined} aria-busy={progress?.live || undefined} className="space-y-0">
      {boxes.map((box, i) => {
        const missing = connectionsNeeded([box]).filter((need) => !connected[need]);
        const state = progress?.boxes[box.id] ?? "idle";
        const failed = progress?.failed?.box === box.id ? progress.failed : null;
        const mark = chosen === box.id ? "ring-2 ring-foreground" : state === "failed" ? "ring-1 ring-danger" : state === "active" ? "ring-1 ring-foreground/50" : "";
        return (
          <li key={box.id} className="relative">
            {i > 0 && (progress ? <FlowLine state={progress.lines[i - 1] ?? "idle"} /> : <span aria-hidden="true" className="ms-5 block h-3 w-px bg-border" />)}
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => onChoose(box.id)}
                aria-pressed={chosen === box.id}
                data-testid="flow-box"
                data-kind={box.kind}
                data-state={progress ? state : undefined}
                className={`${ROW} ${mark}`}
              >
                <BoxIcon box={box} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] uppercase tracking-wide text-muted">{kind[box.kind]}</span>
                  <span className="block break-words text-sm text-foreground">{describe(box)}</span>
                </span>
                {state === "active" && (
                  <span className="mt-0.5 shrink-0">
                    <ThinkingIndicator size="sm" />
                    <span className="sr-only">{t("runStatus.running")}</span>
                  </span>
                )}
                {state === "done" && <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />}
              </button>
              {box.kind === "condition" && (
                <span data-testid="flow-branch" className="mt-2.5 shrink-0 text-[11px] text-muted">
                  {t("conditionElse")}
                </span>
              )}
            </div>
            {failed && (
              <p data-testid="flow-failed" className="mt-1 ps-3 text-xs text-danger">
                {t("failedHere", { reason: noteWords({ box: failed.box, status: "failed", note: failed.note }) })}
              </p>
            )}
            {missing.map((need) => (
              <p key={need} data-testid="flow-needs" className="mt-1 flex flex-wrap items-center gap-2 ps-3 text-xs text-warning">
                {t("needsConnection", { name: needs[need] })}
                <Link href={CONNECT_AT[need]} className="inline-flex min-h-[44px] items-center text-foreground underline underline-offset-2">
                  {t("connect")}
                </Link>
              </p>
            ))}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * THE SAME AUTOMATION, IN PLAIN WORDS: Simple's half of the «Simple | Pro»
 * switch (the owner's «55. AGENTS ΚΑΙ AUTOMATIONS: SIMPLE ΚΑΙ PRO»,
 * 2026-11-04, Κομμάτι 1) — «βλέπεις τα βήματα σε λίστα, με απλά λόγια».
 *
 * THE SAME `boxes` ARRAY `BoxRow` ABOVE DRAWS, read through the same
 * `useWords().describe`. That is the whole point of the switch: «ό,τι
 * φτιάχνεις στο Simple ανοίγει και στο Pro, και αντίστροφα», so there is
 * no second shape to keep in step and no second place a step could go
 * missing. Pressing Pro draws the identical row of boxes it always did.
 *
 * WHAT SIMPLE LEAVES OUT IS THE MECHANISM, NOT THE AUTOMATION: no kind
 * labels (ΕΝΑΡΞΗ/ΑΝΑΓΝΩΣΗ/ΣΥΝΘΗΚΗ are the words Pro teaches), no branch
 * drawn beside a condition — the condition says both halves in one
 * sentence instead — and nothing to press, because configuring a step is
 * what Pro is for. Every step is still shown: a reader of Simple who
 * counts the lines gets the same number Pro draws boxes.
 *
 * A BOX THAT NEEDS A CONNECTION STILL SAYS SO. It is not mechanism, it is
 * the reason the automation cannot be switched on, and hiding it in
 * Simple would leave a person with a dead «Ενεργοποίηση» and no sentence
 * anywhere saying why (the `flow-needs` line `BoxRow` draws, same text,
 * same press to the connection).
 */
export function FlowSteps({ boxes, connected, preview = false }: { boxes: Box[]; connected: Connected; /** A template's card (components/automations/template-gallery.tsx): the same steps, without the line that says Pro is where to change them. */ preview?: boolean }) {
  const { t, part, needs, describe } = useWords();
  function sentence(box: Box): string {
    switch (box.kind) {
      case "read":
        return t("simple.reads", { what: describe(box) });
      case "ai":
        return t("simple.does", { what: describe(box) });
      case "condition":
        return t("simple.onlyIf");
      default:
        // start, approval and action already read as whole sentences in
        // every locale («Κάθε μέρα στις 09:00», «Περιμένει να το
        // εγκρίνεις», «Το στέλνει στο Telegram σου») — wrapping those in
        // a lead-in would say the same thing twice.
        return describe(box);
    }
  }
  return (
    <div className="space-y-2">
      <ol data-testid="flow-steps" className="space-y-2">
        {boxes.map((box, i) => {
          const missing = connectionsNeeded([box]).filter((need) => !connected[need]);
          return (
            <li key={box.id} data-testid="flow-step" data-kind={box.kind} data-part={partOf(box)} className="flex items-start gap-3">
              {/* «ΌΤΑΝ → ΑΝ → ΚΆΝΕ» (the owner, 2026-11-05): each step says
                  which part of the sentence it is, so the list reads top to
                  bottom as one — «Όταν κάθε μέρα στις 08:30 / Κάνε: διαβάζει…
                  / Αν βρέθηκε κάτι / Κάνε: το στέλνει». A word, not the
                  number it replaced: the order is the list's own, and the
                  number said nothing a person could act on. Read aloud
                  before the sentence, so a screen reader hears it too. */}
              <span data-testid="flow-step-part" data-index={i} className="mt-px inline-flex min-h-[1.5rem] min-w-[3.5rem] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-tag px-2 text-[11px] font-medium text-foreground">
                {part[partOf(box)]}
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                {/* ON A TEMPLATE'S CARD an AI step's words are the whole
                    instruction the model gets, and four lines of it drown
                    the shape of the automation the card is showing: two
                    lines there, the rest one hover away and the whole of
                    it in the automation once made. */}
                <span title={preview ? sentence(box) : undefined} className={`${preview && box.kind === "ai" ? "line-clamp-2" : "block"} break-words text-sm leading-relaxed text-body`}>
                  {sentence(box)}
                </span>
                {missing.map((need) => (
                  <span key={need} data-testid="flow-needs" className="flex flex-wrap items-center gap-2 text-xs text-warning">
                    {t("needsConnection", { name: needs[need] })}
                    <Link href={CONNECT_AT[need]} className="inline-flex min-h-[44px] items-center text-foreground underline underline-offset-2">
                      {t("connect")}
                    </Link>
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
      {!preview && <p className="text-xs text-muted">{t("simple.hint")}</p>}
    </div>
  );
}

/**
 * THE SAME BOX, CHANGED BY HAND: the choices a box has, as lists. Saved
 * through PATCH /api/automations/flows/[id] as a new version — free, and
 * taken back by «Αναίρεση» like a change with words.
 */
export function BoxEditor({ box, saving, onSave }: { box: Box; saving: boolean; onSave: (next: Box) => void }) {
  const { t, source, action, weekday } = useWords();
  const [draft, setDraft] = useState<Box>(box);
  const field = "mt-1 block min-h-[44px] w-full rounded-item bg-panel px-3 text-sm text-foreground";
  const label = "block text-xs text-muted";

  let body: React.ReactNode = null;
  if (draft.kind === "start") {
    const timed = draft.when === "time" ? draft : null;
    body = (
      <>
        <label className={label}>
          {t("edit.when")}
          <select
            className={field}
            value={timed ? timed.every : "file"}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(
                v === "file"
                  ? { id: draft.id, kind: "start", when: "file_uploaded" }
                  : { id: draft.id, kind: "start", when: "time", every: v as "day", at: timed?.at ?? "09:00", ...(v === "week" ? { weekday: timed?.weekday ?? 1 } : {}), ...(v === "month" ? { monthDay: timed?.monthDay ?? 1 } : {}) }
              );
            }}
          >
            <option value="day">{t("edit.everyDay")}</option>
            <option value="weekdays">{t("edit.everyWeekdays")}</option>
            <option value="week">{t("edit.everyWeek")}</option>
            <option value="month">{t("edit.everyMonth")}</option>
            <option value="file">{t("start.file")}</option>
          </select>
        </label>
        {timed && (
          <label className={label}>
            {t("edit.at")}
            <input type="time" className={field} value={timed.at} onChange={(e) => setDraft({ ...timed, at: e.target.value })} />
          </label>
        )}
        {timed?.every === "week" && (
          <label className={label}>
            {t("edit.weekday")}
            <select className={field} value={timed.weekday ?? 1} onChange={(e) => setDraft({ ...timed, weekday: Number(e.target.value) })}>
              {weekday.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        {timed?.every === "month" && (
          <label className={label}>
            {t("edit.monthDay")}
            <input type="number" min={1} max={28} className={field} value={timed.monthDay ?? 1} onChange={(e) => setDraft({ ...timed, monthDay: Number(e.target.value) })} />
          </label>
        )}
      </>
    );
  } else if (draft.kind === "read") {
    const read = draft;
    body = (
      <label className={label}>
        {t("edit.source")}
        <select className={field} value={read.source} onChange={(e) => setDraft({ ...read, source: e.target.value as ReadSource })}>
          {READ_SOURCES.map((s) => (
            <option key={s} value={s}>
              {source[s]}
            </option>
          ))}
        </select>
      </label>
    );
  } else if (draft.kind === "ai") {
    const ai = draft;
    body = (
      <label className={label}>
        {t("edit.instruction")}
        <textarea
          className={`${field} min-h-[88px] py-2`}
          maxLength={MAX_INSTRUCTION_CHARS}
          value={ai.instruction}
          onChange={(e) => setDraft({ ...ai, instruction: e.target.value })}
        />
      </label>
    );
  } else if (draft.kind === "action") {
    const act = draft;
    body = (
      <label className={label}>
        {t("edit.do")}
        <select className={field} value={act.do} onChange={(e) => setDraft({ ...act, do: e.target.value as ActionKind })}>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {action[a]}
            </option>
          ))}
        </select>
      </label>
    );
  } else {
    body = <p className="text-xs text-muted">{t("edit.nothing")}</p>;
  }

  const editable = draft.kind !== "condition" && draft.kind !== "approval";
  return (
    <div data-testid="flow-box-editor" className="space-y-3 rounded-item bg-panel/60 p-3">
      <p className="text-xs font-medium text-foreground">{t("edit.title")}</p>
      {body}
      {editable && (
        <button
          type="button"
          disabled={saving || JSON.stringify(draft) === JSON.stringify(box)}
          onClick={() => onSave(draft)}
          data-testid="flow-box-save"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-3 text-xs text-foreground hover:bg-panel-hover disabled:opacity-60"
        >
          {saving ? <ThinkingIndicator size="sm" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          {t("edit.save")}
        </button>
      )}
    </div>
  );
}

function StepLine({ step, boxes }: { step: RunStep; boxes: Box[] }) {
  const { t, kind } = useWords();
  const noteWords = useNoteWords();
  const box = boxes.find((b) => b.id === step.box);
  const tone = step.status === "failed" ? "text-danger" : step.status === "stopped" || step.status === "waiting" ? "text-warning" : "text-body";
  return (
    <li data-testid="flow-step" data-status={step.status} className={`flex items-baseline gap-2 text-xs ${tone}`}>
      <span className="w-24 shrink-0 text-muted">{box ? kind[box.kind] : step.box}</span>
      <span className="min-w-0 flex-1 break-words">{noteWords(step)}</span>
      {typeof step.credits === "number" && step.credits > 0 && <span className="shrink-0 text-muted">{t("credits", { count: step.credits })}</span>}
    </li>
  );
}

export function RunHistory({
  runs,
  boxes,
  locale,
  timeZone,
  busy,
  onApprove,
  onCancel,
  openId,
}: {
  runs: ShownRun[];
  boxes: Box[];
  locale: string;
  timeZone: string;
  busy: string | null;
  onApprove: (run: ShownRun) => void;
  onCancel: (run: ShownRun) => void;
  /** A run to open on arrival: the one a notification pointed at. */
  openId?: string | null;
}) {
  const { t } = useWords();
  const [open, setOpen] = useState<string | null>(openId ?? runs.find((r) => r.status === "waiting_approval")?.id ?? null);
  const when = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    } catch {
      return iso.slice(0, 16).replace("T", " ");
    }
  };
  const by: Record<ShownRun["startedBy"], string> = { time: t("by.time"), event: t("by.event"), manual: t("by.manual"), dry: t("by.dry") };
  const status: Record<ShownRun["status"], string> = {
    queued: t("runStatus.queued"),
    running: t("runStatus.running"),
    waiting_approval: t("runStatus.waiting_approval"),
    done: t("runStatus.done"),
    stopped: t("runStatus.stopped"),
    failed: t("runStatus.failed"),
    cancelled: t("runStatus.cancelled"),
  };
  const reason: Record<string, string> = {
    approval_expired: t("runErrors.approval_expired"),
    interrupted: t("runErrors.interrupted"),
    switched_off: t("runErrors.off"),
    flow_off: t("runErrors.off"),
  };

  if (runs.length === 0) return <p className="text-xs text-muted">{t("historyEmpty")}</p>;
  return (
    <ul data-testid="flow-history" className="space-y-2">
      {runs.map((run) => {
        const expanded = open === run.id;
        const code = errorCode(run.error);
        return (
          <li key={run.id} data-testid="flow-run" data-status={run.status} className="rounded-item bg-panel/60">
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : run.id)}
              aria-expanded={expanded}
              className="flex min-h-[44px] w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-start text-xs"
            >
              <span className="text-foreground">{when(run.startedAt)}</span>
              <span className="text-muted">{by[run.startedBy]}</span>
              <span className={run.status === "failed" ? "text-danger" : run.status === "waiting_approval" ? "text-warning" : "text-body"}>{status[run.status]}</span>
              <span className="ms-auto text-muted">{t("credits", { count: run.credits })}</span>
            </button>
            {expanded && (
              <div className="space-y-2 px-3 pb-3">
                {code && reason[code] && <p className="text-xs text-muted">{reason[code]}</p>}
                {run.steps.length > 0 && (
                  <ol className="space-y-1">
                    {run.steps.map((step, i) => (
                      <StepLine key={`${step.box}-${i}`} step={step} boxes={boxes} />
                    ))}
                  </ol>
                )}
                {run.output && (
                  <div>
                    <p className="text-[11px] text-muted">{run.startedBy === "dry" ? t("wouldSend") : run.status === "waiting_approval" ? t("toApprove") : t("result")}</p>
                    <p data-testid="flow-output" className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-item bg-panel px-3 py-2 text-xs text-foreground">
                      {run.output}
                    </p>
                  </div>
                )}
                {run.status === "waiting_approval" && (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => onApprove(run)}
                        data-testid="flow-approve"
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-3 text-xs font-medium text-foreground hover:bg-panel-hover disabled:opacity-60"
                      >
                        {busy === run.id ? <ThinkingIndicator size="sm" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                        {t("approve")}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => onCancel(run)}
                        data-testid="flow-cancel"
                        className="inline-flex min-h-[44px] items-center rounded-item px-3 text-xs text-muted hover:bg-panel-hover hover:text-foreground disabled:opacity-60"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                    {run.approvalExpiresAt && <p className="text-[11px] text-muted">{t("approveHint", { when: when(run.approvalExpiresAt) })}</p>}
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * THE MOST ONE RUN MAY COST (automation_flows.cost_limit), set by hand.
 * The runner stops a run before the AI box that would pass it
 * (lib/automations/runner.ts); the route holds it to the column's bounds.
 */
export function CostLimitForm({ limit, saving, onSave }: { limit: number; saving: boolean; onSave: (limit: number) => void }) {
  const { t } = useWords();
  const [draft, setDraft] = useState(String(limit));
  return (
    <form
      className="space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(Number(draft));
      }}
    >
      <label htmlFor="flow-limit" className="block text-xs text-muted">
        {t("limit")}
      </label>
      <div className="flex items-center gap-2">
        <input
          id="flow-limit"
          type="number"
          min={1}
          max={5000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          data-testid="flow-limit"
          className="min-h-[44px] w-28 rounded-item bg-panel px-3 text-sm text-foreground"
        />
        <span className="text-xs text-muted">{t("limitUnit")}</span>
        <button
          type="submit"
          disabled={saving || draft === String(limit)}
          data-testid="flow-limit-save"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-3 text-xs text-foreground hover:bg-panel-hover disabled:opacity-60"
        >
          {t("limitSave")}
        </button>
      </div>
      <p className="text-[11px] text-muted">{t("limitHelp")}</p>
    </form>
  );
}

/**
 * «ΣΟΥ ΓΛΊΤΩΣΕ ~X ΏΡΕΣ» (the owner, 2026-11-05; the switch
 * "automation-time-saved"): how many minutes the job used to take, typed
 * by the person, and what that comes to — finished runs × those minutes
 * (lib/automations/time-saved.ts), with both factors printed under the
 * figure so it can be checked by eye. With no minutes it shows the field
 * and nothing else: not a zero, not a guess.
 *
 * Drawn only when the page could read the column at all
 * (lib/automations/page-data.ts loadMinutesSaved), so a database the
 * migration has not reached yet never offers a field that cannot save.
 */
export function TimeSavedForm({ minutes, doneRuns, saving, onSave }: { minutes: number | null; doneRuns: number; saving: boolean; onSave: (minutes: number | null) => void }) {
  const { t } = useWords();
  const [draft, setDraft] = useState(minutes === null ? "" : String(minutes));
  const saved = timeSaved(doneRuns, minutes);
  return (
    <form
      className="space-y-1"
      data-testid="flow-time-saved"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft.trim() === "" ? null : Number(draft));
      }}
    >
      {saved.kind !== "none" && (
        <div data-testid="flow-time-saved-result" data-kind={saved.kind} className="mb-2 space-y-0.5">
          <p className="flex items-center gap-1.5 text-sm text-foreground">
            <Timer className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            {saved.kind === "hours" ? t("timeSaved.hours", { hours: saved.hours }) : saved.kind === "minutes" ? t("timeSaved.minutes", { minutes: saved.total }) : t("timeSaved.notYet")}
          </p>
          {saved.kind !== "not_yet" && <p data-testid="flow-time-saved-how" className="text-[11px] text-muted">{t("timeSaved.how", { runs: saved.runs, minutes: saved.minutesPerRun })}</p>}
        </div>
      )}
      <label htmlFor="flow-minutes" className="block text-xs text-muted">
        {t("timeSaved.label")}
      </label>
      <div className="flex items-center gap-2">
        <input
          id="flow-minutes"
          type="number"
          inputMode="numeric"
          min={MIN_MINUTES}
          max={MAX_MINUTES}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          data-testid="flow-minutes"
          className="min-h-[44px] w-28 rounded-item bg-panel px-3 text-sm text-foreground"
        />
        <span className="text-xs text-muted">{t("timeSaved.unit")}</span>
        <button
          type="submit"
          disabled={saving || draft.trim() === (minutes === null ? "" : String(minutes))}
          data-testid="flow-minutes-save"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-3 text-xs text-foreground hover:bg-panel-hover disabled:opacity-60"
        >
          {t("limitSave")}
        </button>
      </div>
      <p className="text-[11px] text-muted">{t("timeSaved.help")}</p>
    </form>
  );
}
