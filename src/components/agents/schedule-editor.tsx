"use client";

import { useTranslations } from "next-intl";
import { parseCronExpression } from "@/lib/agents/cron-expression";

// A cron expression, edited by people who have never heard of cron.
//
// The AI builder writes the expression; this only ever has to EDIT one,
// which is a much smaller problem — the four shapes below cover every
// schedule the builder is instructed to produce, and anything outside them
// is shown read-only rather than silently rewritten into something the
// user did not ask for. That last part matters: an editor that "helpfully"
// normalises an expression it does not understand would change when an
// agent spends money.

export type ScheduleFrequency = "hourly" | "daily" | "weekly" | "monthly";

export type ScheduleParts = {
  frequency: ScheduleFrequency;
  /** 0-23, ignored for hourly. */
  hour: number;
  /** 0-6, Sunday-first. Only for weekly. */
  weekday: number;
  /** 1-28. Only for monthly — capped at 28 so a schedule can never skip
   *  February. */
  dayOfMonth: number;
  minute: number;
};

export const DEFAULT_SCHEDULE_PARTS: ScheduleParts = {
  frequency: "daily",
  hour: 8,
  weekday: 1,
  dayOfMonth: 1,
  minute: 0,
};

export function partsToCron(parts: ScheduleParts): string {
  const m = Math.min(59, Math.max(0, Math.round(parts.minute)));
  const h = Math.min(23, Math.max(0, Math.round(parts.hour)));
  switch (parts.frequency) {
    case "hourly":
      return `${m} * * * *`;
    case "weekly":
      return `${m} ${h} * * ${Math.min(6, Math.max(0, Math.round(parts.weekday)))}`;
    case "monthly":
      return `${m} ${h} ${Math.min(28, Math.max(1, Math.round(parts.dayOfMonth)))} * *`;
    case "daily":
    default:
      return `${m} ${h} * * *`;
  }
}

/**
 * The inverse — null when the expression is not one of the four shapes
 * this editor can represent, so the caller can fall back to showing it
 * read-only instead of misrepresenting it.
 */
export function cronToParts(expression: string): ScheduleParts | null {
  const parsed = parseCronExpression(expression);
  if (!parsed.ok) return null;
  const f = parsed.fields;
  if (f.minute.length !== 1) return null;
  if (f.month.length !== 12) return null;
  const minute = f.minute[0];

  if (f.hour.length === 24 && !f.dayOfMonthRestricted && !f.dayOfWeekRestricted) {
    return { ...DEFAULT_SCHEDULE_PARTS, frequency: "hourly", minute };
  }
  if (f.hour.length !== 1) return null;
  const hour = f.hour[0];

  if (!f.dayOfMonthRestricted && !f.dayOfWeekRestricted) {
    return { ...DEFAULT_SCHEDULE_PARTS, frequency: "daily", hour, minute };
  }
  if (f.dayOfWeekRestricted && !f.dayOfMonthRestricted && f.dayOfWeek.length === 1) {
    return { ...DEFAULT_SCHEDULE_PARTS, frequency: "weekly", hour, minute, weekday: f.dayOfWeek[0] };
  }
  if (f.dayOfMonthRestricted && !f.dayOfWeekRestricted && f.dayOfMonth.length === 1 && f.dayOfMonth[0] <= 28) {
    return {
      ...DEFAULT_SCHEDULE_PARTS,
      frequency: "monthly",
      hour,
      minute,
      dayOfMonth: f.dayOfMonth[0],
    };
  }
  return null;
}

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function ScheduleEditor({
  parts,
  onChange,
  disabled = false,
}: {
  parts: ScheduleParts;
  onChange: (parts: ScheduleParts) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("dashboard.agents");
  const tWeekday = useTranslations("dashboard.automation.weekday");

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="agent-frequency" className="mb-1 block text-xs font-medium text-muted">
          {t("scheduleFrequencyLabel")}
        </label>
        <select
          id="agent-frequency"
          className="input"
          value={parts.frequency}
          disabled={disabled}
          onChange={(e) => onChange({ ...parts, frequency: e.target.value as ScheduleFrequency })}
        >
          <option value="hourly">{t("frequencyHourly")}</option>
          <option value="daily">{t("frequencyDaily")}</option>
          <option value="weekly">{t("frequencyWeekly")}</option>
          <option value="monthly">{t("frequencyMonthly")}</option>
        </select>
      </div>

      {parts.frequency !== "hourly" && (
        <div>
          <label htmlFor="agent-hour" className="mb-1 block text-xs font-medium text-muted">
            {t("scheduleTimeLabel")}
          </label>
          <select
            id="agent-hour"
            className="input"
            value={parts.hour}
            disabled={disabled}
            onChange={(e) => onChange({ ...parts, hour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              // A 24-hour label, not a localised time: this is a picker of
              // clock positions rather than a formatted instant, and a
              // locale-formatted "8:00 AM" here would be the one string on
              // the page whose rendering depends on the runtime.
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>
      )}

      {parts.frequency === "weekly" && (
        <div>
          <label htmlFor="agent-weekday" className="mb-1 block text-xs font-medium text-muted">
            {t("scheduleWeekdayLabel")}
          </label>
          <select
            id="agent-weekday"
            className="input"
            value={parts.weekday}
            disabled={disabled}
            onChange={(e) => onChange({ ...parts, weekday: Number(e.target.value) })}
          >
            {WEEKDAY_KEYS.map((key, index) => (
              <option key={key} value={index}>
                {tWeekday(key)}
              </option>
            ))}
          </select>
        </div>
      )}

      {parts.frequency === "monthly" && (
        <div>
          <label htmlFor="agent-dom" className="mb-1 block text-xs font-medium text-muted">
            {t("scheduleDayOfMonthLabel")}
          </label>
          <select
            id="agent-dom"
            className="input"
            value={parts.dayOfMonth}
            disabled={disabled}
            onChange={(e) => onChange({ ...parts, dayOfMonth: Number(e.target.value) })}
          >
            {Array.from({ length: 28 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

/** Shared renderer for "every day at 08:00" / "every Monday at 09:00". */
export function useScheduleLabel(): (expression: string) => string {
  // Deliberately NOT named `t`: this file already has a `t` bound to
  // "dashboard.agents", and two different namespaces behind the same
  // identifier in one file is how a key silently resolves against the
  // wrong namespace — scripts/tests/i18n-coverage.test.mjs resolves
  // ident -> namespace per file and cannot tell them apart either.
  const tSchedule = useTranslations("dashboard.agents.schedule");
  const tWeekday = useTranslations("dashboard.automation.weekday");

  return (expression: string) => {
    const parts = cronToParts(expression);
    if (!parts) return tSchedule("custom", { expression });
    const time = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
    switch (parts.frequency) {
      case "hourly":
        return tSchedule("hourly");
      case "weekly":
        return tSchedule("weekly", { day: tWeekday(WEEKDAY_KEYS[parts.weekday]), time });
      case "monthly":
        return tSchedule("monthly", { day: parts.dayOfMonth, time });
      case "daily":
      default:
        return tSchedule("daily", { time });
    }
  };
}
