/**
 * AN AUTOMATION IS A ROW OF BOXES (MASTER 16, package 30, behind the
 * switch "automations"; the plan is docs/automations-plan-2026-10-04.md).
 *
 * «όταν ανεβάζω αρχείο, κάνε σύνοψη και βάλ' τη στη Βιβλιοθήκη» is four:
 * start (a file is uploaded) → read (that file) → AI (summarise it) →
 * action (save to the Library). Every box is one thing a person can point
 * at and change with words; the run goes down the row and stops at the
 * first box that says stop.
 *
 * THE SIX KINDS, from MASTER 5.18: start, read data, AI step, condition
 * (whose other branch is "stop here"), approval, action. A call to another
 * tool and a call to a connection are reads and actions here — the
 * calendar is a read through the Calendar connection (package 31), a
 * Telegram message is an action through the person's own bot.
 *
 * Client-safe and pure: the screen draws from it, the routes validate
 * with it, the runner walks it. Held by scripts/tests/automations.test.mjs.
 */

export const MAX_BOXES = 8;
export const MAX_INSTRUCTION_CHARS = 600;

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const; // Monday = 1, as in ISO 8601

export type StartBox =
  | { id: string; kind: "start"; when: "time"; every: "day" | "weekdays" | "week" | "month"; at: string; weekday?: number; monthDay?: number }
  | { id: string; kind: "start"; when: "file_uploaded" };

export const READ_SOURCES = ["calendar_today", "calendar_tomorrow", "calendar_week", "finances_week", "finances_month", "uploaded_file"] as const;
export type ReadSource = (typeof READ_SOURCES)[number];
export type ReadBox = { id: string; kind: "read"; source: ReadSource };

export type AiBox = { id: string; kind: "ai"; instruction: string };

/** The one condition: what came before is not empty. Its other branch is "stop, quietly". */
export type ConditionBox = { id: string; kind: "condition"; test: "has_content" };

export type ApprovalBox = { id: string; kind: "approval" };

export const ACTIONS = ["send_telegram", "send_email", "notify", "save_to_library"] as const;
export type ActionKind = (typeof ACTIONS)[number];
export type ActionBox = { id: string; kind: "action"; do: ActionKind };

export type Box = StartBox | ReadBox | AiBox | ConditionBox | ApprovalBox | ActionBox;
export type BoxKind = Box["kind"];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const BOX_ID = /^[a-z0-9-]{1,24}$/;

function readStart(v: Record<string, unknown>, id: string): StartBox | null {
  if (v.when === "file_uploaded") return { id, kind: "start", when: "file_uploaded" };
  if (v.when !== "time") return null;
  const every = v.every;
  if (every !== "day" && every !== "weekdays" && every !== "week" && every !== "month") return null;
  const at = typeof v.at === "string" && HHMM.test(v.at) ? v.at : null;
  if (!at) return null;
  if (every === "week") {
    const weekday = Number(v.weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null;
    return { id, kind: "start", when: "time", every, at, weekday };
  }
  if (every === "month") {
    const monthDay = Number(v.monthDay);
    if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 28) return null;
    return { id, kind: "start", when: "time", every, at, monthDay };
  }
  return { id, kind: "start", when: "time", every, at };
}

/** One box, read defensively: anything not exactly a box is null. */
export function readBox(raw: unknown, fallbackId: string): Box | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const id = typeof v.id === "string" && BOX_ID.test(v.id) ? v.id : fallbackId;
  switch (v.kind) {
    case "start":
      return readStart(v, id);
    case "read":
      return (READ_SOURCES as readonly unknown[]).includes(v.source) ? { id, kind: "read", source: v.source as ReadSource } : null;
    case "ai": {
      const instruction = typeof v.instruction === "string" ? v.instruction.trim().slice(0, MAX_INSTRUCTION_CHARS) : "";
      return instruction.length >= 3 ? { id, kind: "ai", instruction } : null;
    }
    case "condition":
      return { id, kind: "condition", test: "has_content" };
    case "approval":
      return { id, kind: "approval" };
    case "action":
      return (ACTIONS as readonly unknown[]).includes(v.do) ? { id, kind: "action", do: v.do as ActionKind } : null;
    default:
      return null;
  }
}

export type FlowVerdict = { ok: true; boxes: Box[] } | { ok: false; reason: "empty" | "no_start" | "start_not_first" | "two_starts" | "no_action" | "too_many" | "bad_box" | "file_read_without_upload" | "duplicate_id" };

/**
 * A whole row, or the reason it is not one. The rules are the ones a run
 * depends on: it starts once, at the top; it does something at the end; a
 * file can only be read when a file is what started it.
 */
export function readFlow(raw: unknown): FlowVerdict {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, reason: "empty" };
  if (raw.length > MAX_BOXES) return { ok: false, reason: "too_many" };
  const boxes: Box[] = [];
  for (const [i, item] of raw.entries()) {
    const box = readBox(item, `b${i + 1}`);
    if (!box) return { ok: false, reason: "bad_box" };
    boxes.push(box);
  }
  if (new Set(boxes.map((b) => b.id)).size !== boxes.length) return { ok: false, reason: "duplicate_id" };
  const starts = boxes.filter((b) => b.kind === "start");
  if (starts.length === 0) return { ok: false, reason: "no_start" };
  if (starts.length > 1) return { ok: false, reason: "two_starts" };
  if (boxes[0].kind !== "start") return { ok: false, reason: "start_not_first" };
  if (!boxes.some((b) => b.kind === "action")) return { ok: false, reason: "no_action" };
  const start = boxes[0] as StartBox;
  if (start.when !== "file_uploaded" && boxes.some((b) => b.kind === "read" && b.source === "uploaded_file")) {
    return { ok: false, reason: "file_read_without_upload" };
  }
  return { ok: true, boxes };
}

/** The same schedule as a cron expression, for lib/agents/cron-expression.ts's nextRunAt. */
export function cronFor(start: StartBox): string | null {
  if (start.when !== "time") return null;
  const [hour, minute] = start.at.split(":").map(Number);
  switch (start.every) {
    case "day":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "week":
      return `${minute} ${hour} * * ${(start.weekday ?? 1) % 7}`;
    case "month":
      return `${minute} ${hour} ${start.monthDay ?? 1} * *`;
  }
}

/** What a box needs connected before the automation may be switched on. */
export function connectionsNeeded(boxes: Box[]): ("google_calendar" | "telegram")[] {
  const needs = new Set<"google_calendar" | "telegram">();
  for (const box of boxes) {
    if (box.kind === "read" && box.source.startsWith("calendar_")) needs.add("google_calendar");
    if (box.kind === "action" && box.do === "send_telegram") needs.add("telegram");
  }
  return [...needs];
}

/** How many boxes call a model: what a run is priced on. */
export function aiBoxCount(boxes: Box[]): number {
  return boxes.filter((b) => b.kind === "ai").length;
}

/** Replaces one box, keeping its place and its id. */
export function replaceBox(boxes: Box[], id: string, next: Box): Box[] {
  return boxes.map((b) => (b.id === id ? { ...next, id } : b));
}
