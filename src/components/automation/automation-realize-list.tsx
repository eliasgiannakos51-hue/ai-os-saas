"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { useCredits } from "@/components/credits/credits-context";
import { ClarificationQuestions } from "@/components/clarification/clarification-questions";
import { appendClarificationAnswers, alignSuggestions } from "@/lib/clarification-client";
import { fetchWithAuthRetry } from "@/lib/fetch-with-auth-retry";
import type { ModuleRecord } from "@/types/module-record";
import type { AutomationFrequency } from "@/lib/automation-schedule";

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

// "Make this real" — sits below the existing automations GenericList
// (idea-tracker records), one card per idea, each with its own inline
// form. Deliberately NOT added inside GenericList/GenericRecordRow (no
// per-record extra-action mechanism there, and touching those shared
// components risks the other 12 modules) — this is a fully separate
// section on the same page instead.
export function AutomationRealizeList({ records }: { records: ModuleRecord[] }) {
  const t = useTranslations("dashboard.automation");
  const router = useRouter();
  const { addToast } = useToast();
  const [openId, setOpenId] = useState<string | null>(null);

  if (records.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-border bg-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-orange-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">{t("realizeSectionTitle")}</p>
      </div>
      <ul className="space-y-2">
        {records.map((record) => {
          const taskName = typeof record.task_name === "string" ? record.task_name : "";
          const idea = typeof record.idea === "string" ? record.idea : "";
          const suggestedWorkflow = typeof record.suggested_workflow === "string" ? record.suggested_workflow : "";
          const prefill = [taskName, idea, suggestedWorkflow].filter(Boolean).join(" — ");
          const isOpen = openId === record.id;

          return (
            <li key={record.id} className="rounded-lg border border-border bg-input px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-sm text-foreground">{taskName || t("untitledIdea")}</p>
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : record.id)}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-orange-400 transition-colors duration-150 hover:border-orange-500 hover:bg-panel-hover"
                >
                  {isOpen ? t("cancel") : t("makeThisReal")}
                </button>
              </div>
              {isOpen && (
                <RealizeForm
                  initialDescription={prefill}
                  onDone={(succeeded, message) => {
                    setOpenId(null);
                    addToast(message, succeeded ? "success" : "error");
                    if (succeeded) router.refresh();
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RealizeForm({
  initialDescription,
  onDone,
}: {
  initialDescription: string;
  onDone: (succeeded: boolean, message: string) => void;
}) {
  const t = useTranslations("dashboard.automation");
  const [description, setDescription] = useState(initialDescription);
  // Starts unset (not pre-filled with "weekly") specifically so a user who
  // only types a description and hits submit — without ever opening this
  // dropdown — can't silently create an automation on a frequency they
  // never actually chose. Same reasoning extends dayOfWeek/dayOfMonth:
  // each only becomes relevant once its frequency is picked, so each
  // starts unset too, and the form is genuinely incomplete (not just
  // "defaulted") until the user explicitly picks every field it needs.
  const [frequency, setFrequency] = useState<AutomationFrequency | "">("");
  const [dayOfWeek, setDayOfWeek] = useState<number | "">("");
  const [dayOfMonth, setDayOfMonth] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingClarification, setPendingClarification] = useState<{
    questions: string[];
    /** Tappable answers, aligned by index with `questions`. */
    suggestions: string[][];
  } | null>(null);
  const { refresh: refreshCredits } = useCredits();

  const isComplete =
    description.trim().length > 0 &&
    frequency !== "" &&
    (frequency !== "weekly" || dayOfWeek !== "") &&
    (frequency !== "monthly" || dayOfMonth !== "");

  async function submitAutomation(finalDescription: string, skipClarification: boolean) {
    setSubmitting(true);
    try {
      // fetchWithAuthRetry (not plain fetch): skipClarification===true
      // means this is the resubmission after a clarifying-questions
      // pause, where a user's access token can realistically expire
      // while they compose real answers. See lib/fetch-with-auth-retry.ts.
      const res = await fetchWithAuthRetry("/api/automations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: finalDescription,
          frequency,
          dayOfWeek: frequency === "weekly" ? dayOfWeek : null,
          dayOfMonth: frequency === "monthly" ? dayOfMonth : null,
          skipClarification,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        onDone(false, data.error ?? t("realizeError"));
        return;
      }
      if (data.needsClarification) {
        setPendingClarification({
          questions: data.questions as string[],
          suggestions: alignSuggestions(data.questions as string[], data.questionSuggestions),
        });
        void refreshCredits();
        return;
      }
      setPendingClarification(null);
      onDone(true, t("realizeSuccess"));
    } catch {
      onDone(false, t("realizeError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (submitting || !isComplete) return;
    await submitAutomation(description.trim(), false);
  }

  function handleClarificationAnswer(answers: string[]) {
    if (!pendingClarification) return;
    const enriched = appendClarificationAnswers(description.trim(), pendingClarification.questions, answers);
    void submitAutomation(enriched, true);
  }

  function handleClarificationSkip() {
    void submitAutomation(description.trim(), true);
  }

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">{t("whatShouldHappen")}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={20000}
          rows={3}
          className="input resize-y text-sm"
          placeholder={t("whatShouldHappenPlaceholder")}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">{t("howOften")}</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as AutomationFrequency)}
            className="input text-sm"
          >
            <option value="" disabled>
              {t("selectFrequency")}
            </option>
            <option value="daily">{t("frequencyDaily")}</option>
            <option value="weekly">{t("frequencyWeekly")}</option>
            <option value="monthly">{t("frequencyMonthly")}</option>
          </select>
        </div>
        {frequency === "weekly" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">{t("whichDay")}</label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="input text-sm"
            >
              <option value="" disabled>
                {t("selectDay")}
              </option>
              {WEEKDAY_KEYS.map((key, index) => (
                <option key={key} value={index}>
                  {t(`weekday.${key}`)}
                </option>
              ))}
            </select>
          </div>
        )}
        {frequency === "monthly" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">{t("whichDayOfMonth")}</label>
            <select
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
              className="input text-sm"
            >
              <option value="" disabled>
                {t("selectDay")}
              </option>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {pendingClarification ? (
        <ClarificationQuestions
          questions={pendingClarification.questions}
          suggestions={pendingClarification.suggestions}
          onAnswer={handleClarificationAnswer}
          onSkip={handleClarificationSkip}
          submitting={submitting}
          title={t("clarificationTitle")}
          skipLabel={t("clarificationSkip")}
          continueLabel={t("clarificationContinue")}
          answerPlaceholder={t("clarificationAnswerPlaceholder")}
        />
      ) : (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !isComplete}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? t("realizing") : t("confirmMakeReal")}
        </button>
      )}
    </div>
  );
}
