"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import {
  Telescope,
  Loader2,
  Play,
  Trash2,
  FileText,
  ExternalLink,
  AlertTriangle,
  ListChecks,
} from "lucide-react";
import { EntityCard, CardGrid, type EntityCardStatus } from "@/components/ui/entity-card";
import { EmptyState } from "@/components/empty-state";
import { AiGeneratedNotice } from "@/components/ai/ai-generated-notice";
import { useToast } from "@/components/toast/toast-context";
import { formatDateTime } from "@/lib/format-number";
import { getErrorMessage } from "@/lib/get-error-message";
import { MAX_TOPIC_CHARS } from "@/lib/research/research-limits";

type Question = { question: string; why: string };
type Source = { title: string; url: string };
type Section = { heading: string; body: string };

export type ResearchReport = {
  id: string;
  topic: string;
  status: "pending" | "planning" | "researching" | "synthesising" | "ready" | "failed";
  questions: Question[];
  sections?: Section[];
  sources?: Source[];
  document_id: string | null;
  credits_charged: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  // Written by the worker after each question. Optional because a
  // database that has not had the progress migration applied simply does
  // not return them — see api/research/[id], which selects `*`.
  questions_done?: number | null;
  questions_total?: number | null;
  current_question?: string | null;
};

/** Poll interval while a report runs. A report takes minutes, so a
 *  one-second poll would be 300 pointless requests; five seconds is
 *  responsive enough that the status never feels stuck. */
const POLL_MS = 5000;

/** The statuses that mean a worker is (or should be) running. Derived
 *  from the row, never from client state — see the polling effect. */
const RUNNING_STATUSES = new Set(["planning", "researching", "synthesising"]);

function isRunning(report: ResearchReport): boolean {
  return RUNNING_STATUSES.has(report.status);
}

/**
 * Deep Research.
 *
 * The flow has a deliberate stop in the middle: topic → PLAN → (the user
 * looks at the questions and the price) → Run → report.
 *
 * That stop is the whole ethical content of this screen. This is the most
 * expensive action in the product, and the only honest moment to show
 * someone the bill is before it is incurred, with the actual plan in
 * front of them. Everything else here is in service of that: the
 * questions are shown in full, the estimate is shown next to them, and
 * nothing is charged for the expensive half until Run is pressed.
 */
export function ResearchWorkspace({
  initialReports,
  monthlyCap,
  usedThisMonth,
}: {
  initialReports: ResearchReport[];
  monthlyCap: number | null;
  usedThisMonth: number;
}) {
  const t = useTranslations("dashboard.deepResearch");
  const tModule = useTranslations("module");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();

  const [reports, setReports] = useState(initialReports);
  const [topic, setTopic] = useState("");
  const [planning, setPlanning] = useState(false);
  const [draft, setDraft] = useState<{ report: ResearchReport; credits: number } | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<ResearchReport | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/research/${id}`);
      const data = await response.json();
      if (!data.ok) return null;
      const report = data.report as ResearchReport;
      setReports((current) => current.map((r) => (r.id === report.id ? { ...r, ...report } : r)));
      setOpen((current) => (current && current.id === report.id ? { ...current, ...report } : current));
      return report;
    } catch {
      return null;
    }
  }, []);

  // WHAT IS RUNNING COMES FROM THE ROWS, NOT FROM THIS COMPONENT.
  //
  // This used to poll only `running` — a piece of state set by pressing
  // Start. So a user who started a report and then navigated anywhere, or
  // reloaded, came back to a card frozen on "researching" with nothing
  // polling it: the work was still happening on the server, but this
  // screen had no idea and would never find out. The user's account of
  // "I changed something on the page and the research stopped" is that
  // exact thing seen from outside — the research did not stop, the only
  // thing watching it did.
  //
  // Deriving the set from the reports themselves makes the page pick any
  // in-flight report back up on mount, which is what makes closing the tab
  // safe. `running` is kept purely for the per-card spinner on the report
  // the user just started, before the first poll has returned.
  const activeIds = reports.filter(isRunning).map((r) => r.id);
  const activeKey = activeIds.join(",");

  useEffect(() => {
    const ids = activeKey ? activeKey.split(",") : [];
    if (ids.length === 0) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(() => {
      for (const id of ids) {
        void refresh(id).then((report) => {
          if (!report) return;
          if (report.status === "ready" || report.status === "failed") {
            setRunning((current) => (current === id ? null : current));
            if (report.status === "ready") addToast(t("finished"));
            else addToast(report.error ?? t("runError"), "error");
            router.refresh();
          }
        });
      }
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [activeKey, refresh, addToast, t, router]);

  // One immediate read on mount for anything already in flight, so a user
  // returning to the page does not stare at a stale status for a whole
  // poll interval before it corrects itself.
  useEffect(() => {
    for (const report of initialReports) {
      if (isRunning(report)) void refresh(report.id);
    }
    // Deliberately mount-only: later refreshes are the interval's job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function plan() {
    const value = topic.trim();
    if (!value) return;
    setPlanning(true);
    setDraft(null);
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: value, language: locale }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("planError"), "error");
        return;
      }
      const report = data.report as ResearchReport;
      setDraft({ report, credits: Number(data.estimate?.credits ?? 0) });
      setReports((current) => [{ ...report, sections: [], sources: [] }, ...current]);
      setTopic("");
    } catch (err) {
      addToast(getErrorMessage(err, t("planError")), "error");
    } finally {
      setPlanning(false);
    }
  }

  async function run(id: string) {
    setRunning(id);
    setDraft(null);
    setReports((current) => current.map((r) => (r.id === id ? { ...r, status: "researching" } : r)));

    // Deliberately NOT awaited for its result: the run takes minutes, and
    // a client that waits will hit its own fetch timeout and report a
    // failure for work that is still running. The status comes from
    // polling, which is the only thing that can survive a closed tab.
    fetch(`/api/research/${id}/run`, { method: "POST", keepalive: true })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (data && !data.ok) {
          addToast(data.error ?? t("runError"), "error");
          setRunning(null);
          void refresh(id);
        }
      })
      .catch(() => {
        // The request may simply have outlived the page. Polling is the
        // source of truth, so a network error here is not an outcome.
      });
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(t("confirmDelete", { name }))) return;
    setBusy(id);
    try {
      const response = await fetch(`/api/research/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("deleteError"), "error");
        return;
      }
      setReports((current) => current.filter((r) => r.id !== id));
      setOpen((current) => (current?.id === id ? null : current));
      addToast(t("deleteSuccess"));
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("deleteError")), "error");
    } finally {
      setBusy(null);
    }
  }

  function statusFor(report: ResearchReport): EntityCardStatus {
    if (report.status === "ready") return { label: t("statusReady"), tone: "success" };
    if (report.status === "failed") return { label: t("statusFailed"), tone: "danger" };
    if (report.status === "pending") return { label: t("statusPending"), tone: "neutral" };
    return { label: t(`status${report.status === "synthesising" ? "Synthesising" : "Researching"}`), tone: "warning" };
  }

  const capReached = monthlyCap !== null && usedThisMonth >= monthlyCap;

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl border border-border bg-panel/60 p-4">
        <label htmlFor="research-topic" className="text-sm font-semibold text-foreground">
          {t("topicLabel")}
        </label>
        <textarea
          id="research-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={t("topicPlaceholder")}
          rows={3}
          maxLength={MAX_TOPIC_CHARS}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void plan()}
            disabled={planning || !topic.trim() || capReached}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-60"
          >
            {planning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                {t("planning")}
              </>
            ) : (
              <>
                <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                {t("planIt")}
              </>
            )}
          </button>
          <span className="text-[11px] text-muted">
            {monthlyCap === null
              ? t("usedUnlimited", { used: usedThisMonth })
              : t("usedThisMonth", { used: usedThisMonth, cap: monthlyCap })}
          </span>
        </div>
        {capReached && <p className="text-[11px] text-amber-400/90">{t("capReached")}</p>}
      </section>

      {/* The stop. The questions and the price, together, before anything
          expensive happens. */}
      {draft && (
        <section className="space-y-3 rounded-2xl border border-orange-500/30 bg-orange-500/[0.04] p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Telescope className="h-4 w-4 text-orange-400" aria-hidden="true" />
            {t("planTitle")}
          </h2>
          <p className="text-[11px] leading-relaxed text-muted">{t("planIntro")}</p>

          <ol className="space-y-2">
            {draft.report.questions.map((q, i) => (
              <li key={`${q.question}-${i}`} className="rounded-lg border border-border bg-panel/60 p-2.5">
                <p className="text-xs font-medium text-foreground">
                  {i + 1}. {q.question}
                </p>
                {q.why && <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{q.why}</p>}
              </li>
            ))}
          </ol>

          <p className="text-xs font-medium text-foreground">
            {t("estimate", { credits: draft.credits })}
          </p>
          <p className="text-[11px] leading-relaxed text-muted">{t("estimateNote")}</p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void run(draft.report.id)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              {t("start")}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="inline-flex min-h-[36px] items-center rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
            >
              {t("notNow")}
            </button>
          </div>
        </section>
      )}

      {reports.length === 0 ? (
        <EmptyState icon={Telescope}>{t("empty")}</EmptyState>
      ) : (
        <CardGrid>
          {reports.map((report, index) => (
            <EntityCard
              key={report.id}
              index={index}
              icon={Telescope}
              accentSlug="research"
              title={report.topic}
              description={t("createdAt", { when: formatDateTime(report.created_at, locale) })}
              status={statusFor(report)}
              tags={[
                { key: "questions", label: t("questionCount", { count: report.questions?.length ?? 0 }), tone: "accent" },
                ...(report.credits_charged > 0
                  ? [{ key: "credits", label: t("creditsCharged", { credits: report.credits_charged }) }]
                  : []),
              ]}
              menuLabel={tModule("actionsFor", { name: report.topic })}
              menu={[
                ...(report.status === "pending"
                  ? [
                      {
                        key: "run",
                        label: t("start"),
                        icon: Play,
                        disabled: running === report.id,
                        onSelect: () => void run(report.id),
                      },
                    ]
                  : []),
                ...(report.status === "ready"
                  ? [
                      {
                        key: "open",
                        label: t("openReport"),
                        icon: FileText,
                        onSelect: () => void refresh(report.id).then((full) => setOpen(full ?? report)),
                      },
                    ]
                  : []),
                {
                  key: "delete",
                  label: t("delete"),
                  icon: Trash2,
                  destructive: true,
                  disabled: busy === report.id,
                  onSelect: () => void remove(report.id, report.topic),
                },
              ]}
            >
              {report.error && (
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-400/90">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  {report.error}
                </p>
              )}
              {/* Real progress, not a spinner.
                  A report runs for minutes; "in progress" for six minutes
                  is indistinguishable from "stuck", which is why the user
                  read a slow run as a broken one. The worker writes
                  questions_done after each question, so this can say which
                  question it is on and what it is looking up. Falls back
                  to the plain spinner when the row has no progress columns
                  yet (migration not applied) rather than showing nothing. */}
              {(isRunning(report) || running === report.id) && (
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-[11px] text-muted">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    {typeof report.questions_total === "number" && report.questions_total > 0
                      ? t("progressStep", {
                          done: Math.min((report.questions_done ?? 0) + 1, report.questions_total),
                          total: report.questions_total,
                        })
                      : report.status === "synthesising"
                        ? t("statusSynthesising")
                        : t("inProgress")}
                  </p>
                  {report.current_question && report.status === "researching" && (
                    <p className="line-clamp-2 pl-[18px] text-[11px] leading-relaxed text-muted/80">
                      {report.current_question}
                    </p>
                  )}
                  {typeof report.questions_total === "number" && report.questions_total > 0 && (
                    <div
                      className="ml-[18px] h-1 overflow-hidden rounded-full bg-border"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={report.questions_total}
                      aria-valuenow={report.questions_done ?? 0}
                    >
                      <div
                        className="h-full rounded-full bg-orange-500 transition-all duration-500"
                        style={{
                          width: `${Math.round(((report.questions_done ?? 0) / report.questions_total) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                  <p className="pl-[18px] text-[11px] text-muted/70">{t("keepsRunning")}</p>
                </div>
              )}
            </EntityCard>
          ))}
        </CardGrid>
      )}

      {open?.status === "ready" && (
        <section className="space-y-4 rounded-2xl border border-border bg-panel/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">{open.topic}</h2>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="text-[11px] font-medium text-muted transition-colors duration-150 hover:text-foreground"
            >
              {t("close")}
            </button>
          </div>

          {/* EU AI Act art. 50. The report reads like a researched
              document — sourced, structured, confident — which is exactly
              why it needs the notice on screen and not only in the
              Document copy's markdown. */}
          <AiGeneratedNotice variant="block" />

          {(open.sections ?? []).map((section, i) => (
            <div key={`${section.heading}-${i}`} className="space-y-1">
              {section.heading && (
                <h3 className="text-xs font-semibold text-foreground">{section.heading}</h3>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{section.body}</p>
            </div>
          ))}

          {(open.sources ?? []).length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold text-foreground">{t("sources")}</h3>
              <ol className="space-y-0.5">
                {(open.sources ?? []).map((source, i) => (
                  <li key={source.url} className="text-[11px] text-muted">
                    [{i + 1}]{" "}
                    <a
                      href={source.url}
                      target="_blank"
                      // noreferrer as well as noopener: the sources are
                      // arbitrary third-party pages, and they do not need
                      // to know which of our screens sent the visit.
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline decoration-dotted hover:text-foreground"
                    >
                      {source.title}
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {open.document_id && (
            <Link
              href={`/dashboard/documents/${open.document_id}`}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {t("openDocument")}
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
