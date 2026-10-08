"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { LEAD_STAGES, isLeadStage, nextStage, type LeadStage } from "@/lib/sales/stages";

export type StagedLead = { id: string; lead_name: string; stage: string | null; remind_at: string | null };

const DAY_MS = 86_400_000;
/** The date input's own format, in the person's time zone. */
function dateInput(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * EVERY CONTACT WITH ITS STAGE, AND A REMINDER WHEN IT MOVES (MASTER 16,
 * package 18), behind the switch "finance-sales". Moving a contact sets
 * when to be reminded — three days on unless changed — and the reminder
 * arrives in the bell (api/cron/lead-reminders). Reminders that are due
 * are listed first.
 */
export function SalesStages({ leads }: { leads: StagedLead[] }) {
  const t = useTranslations("dashboard.sales");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, { stage: LeadStage; day: string }>>({});
  const now = Date.now();
  const stageOf = (lead: StagedLead): LeadStage => (isLeadStage(lead.stage) ? lead.stage : "new");
  // EVERY KEY WRITTEN OUT, so the catalogue this page needs can be seen
  // (scripts/tests/message-slices.test.mjs) — not `stages.${stage}`.
  const STAGE_LABEL: Record<LeadStage, string> = {
    new: t("stages.new"),
    contacted: t("stages.contacted"),
    meeting: t("stages.meeting"),
    proposal: t("stages.proposal"),
    won: t("stages.won"),
    lost: t("stages.lost"),
  };
  const due = leads.filter((l) => l.remind_at && new Date(l.remind_at).getTime() <= now);
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  function chosen(lead: StagedLead) {
    return choice[lead.id] ?? { stage: nextStage(stageOf(lead)) ?? stageOf(lead), day: dateInput(new Date(now + 3 * DAY_MS)) };
  }

  async function move(lead: StagedLead) {
    const c = chosen(lead);
    setBusy(lead.id);
    setProblem(null);
    try {
      // NINE IN THE MORNING of the chosen day, in the person's own time zone.
      const remindAt = c.day ? new Date(`${c.day}T09:00:00`).toISOString() : null;
      const res = await fetch(`/api/sales/${lead.id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: c.stage, remindAt }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setProblem(body?.code === "bad_reminder" ? t("badReminder") : t("failed"));
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-testid="sales-stages" className="mb-6 space-y-4">
      {due.length > 0 ? (
        <div data-testid="sales-due" className="surface">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Bell className="h-4 w-4 text-muted" aria-hidden="true" />
            {t("dueTitle")}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {due.map((l) => (
              <li key={l.id} className="text-foreground">
                {l.lead_name} <span className="text-muted">· {STAGE_LABEL[stageOf(l)]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="surface">
        <p className="text-sm font-semibold text-foreground">{t("title")}</p>
        {leads.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("empty")}</p>
        ) : (
          <ul className="row-list mt-2">
            {leads.map((lead) => {
              const c = chosen(lead);
              return (
                <li key={lead.id} data-testid="sales-lead" data-stage={stageOf(lead)} className="space-y-2 py-3">
                  <p className="text-sm text-foreground">
                    {lead.lead_name}
                    <span className="ms-2 text-xs text-muted">
                      {STAGE_LABEL[stageOf(lead)]}
                      {lead.remind_at ? ` · ${t("remindOn", { date: dateFormat.format(new Date(lead.remind_at)) })}` : ""}
                    </span>
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="block text-xs text-muted">
                      {t("moveTo")}
                      <select
                        data-testid="sales-stage"
                        value={c.stage}
                        onChange={(e) => setChoice((prev) => ({ ...prev, [lead.id]: { ...c, stage: e.target.value as LeadStage } }))}
                        className="input mt-1 w-full sm:w-44"
                      >
                        {LEAD_STAGES.map((s) => (
                          <option key={s} value={s}>
                            {STAGE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-muted">
                      {t("remind")}
                      <input
                        type="date"
                        data-testid="sales-remind"
                        value={c.day}
                        min={dateInput(new Date(now + DAY_MS))}
                        onChange={(e) => setChoice((prev) => ({ ...prev, [lead.id]: { ...c, day: e.target.value } }))}
                        className="input mt-1 w-full sm:w-44"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void move(lead)}
                      disabled={busy === lead.id}
                      data-testid="sales-move"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-card bg-panel-hover px-4 text-sm font-semibold text-foreground disabled:opacity-50"
                    >
                      {t("move")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {problem ? (
          <p role="status" className="mt-2 text-sm text-warning">
            {problem}
          </p>
        ) : null}
      </div>
    </div>
  );
}
