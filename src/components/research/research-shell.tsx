"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Clock, ExternalLink, FileText, Play, Square, Trash2 } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { DownloadPdfButton } from "@/components/ui/download-pdf-button";
import { AiGeneratedNotice } from "@/components/ai/ai-generated-notice";
import { VoicePlayer } from "@/components/voice/voice-player";
import { useToast } from "@/components/toast/toast-context";
import { ToolShell, OPTION, type ShellTurn } from "@/components/shell/tool-shell";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import { formatDateTime } from "@/lib/format-number";
import { getErrorMessage } from "@/lib/get-error-message";
import { isStoppedMessage } from "@/lib/stop-message";
import { MAX_TOPIC_CHARS } from "@/lib/research/research-limits";
import type { ResearchReport } from "@/lib/research/report";
import { CitedBody } from "@/components/research/cited-body";
import { SendToSlides } from "@/components/research/send-to-slides";

/** A report takes minutes; five seconds is responsive enough (as on the page). */
const POLL_MS = 5000;
const RUNNING_STATUSES = new Set(["planning", "researching", "synthesising"]);
const isRunning = (report: ResearchReport) => RUNNING_STATUSES.has(report.status);

type Turn = { id: string; role: "user" | "tool"; text: string; plan?: { report: ResearchReport; credits: number }; reportId?: string };

/**
 * RESEARCH IN THE SHELL (MASTER 14.3, package 3), behind the switch
 * "tool-shell". The same routes as components/research/research-workspace.tsx,
 * which stays the page for everybody the switch is off for.
 *
 * The deliberate stop stays: a subject said in the field is PLANNED
 * (/api/research), and the plan comes back into the conversation with
 * its questions and its price, before anything expensive happens. Only
 * the press under it runs it. While it runs, the conversation says which
 * question it is on and offers Stop; when it is ready the report opens
 * beside the conversation with its numbered sources, the PDF and the
 * document. What is running comes from the rows, so a closed tab loses
 * nothing: the poll picks it back up.
 */
export function ResearchShell({
  initialTopic,
  initialReports,
  initialOpenId = null,
  monthlyCap,
  usedThisMonth,
  slides = false,
}: {
  initialTopic?: string;
  initialReports: ResearchReport[];
  /** A report to open on arrival — `?record=` from the Library. */
  initialOpenId?: string | null;
  monthlyCap: number | null;
  usedThisMonth: number;
  /** The switch "research-slides" (package 11): the numbers open their
   *  sources, and the report goes to Slides with one press. */
  slides?: boolean;
}) {
  const t = useTranslations("dashboard.deepResearch");
  const tNames = useTranslations("dashboard.tools.names");
  const tShell = useTranslations("dashboard.toolShell");
  const tSteps = useTranslations("aiSteps");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const composerRef = useRef<ChatComposerHandle>(null);

  const [reports, setReports] = useState(initialReports);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [planning, setPlanning] = useState(false);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const asked = initialOpenId ? initialReports.find((r) => r.id === initialOpenId) ?? null : null;
  const [open, setOpen] = useState<ResearchReport | null>(asked);
  const [pane, setPane] = useState<"report" | "recent" | null>(asked ? "report" : null);
  const lastProgressRef = useRef<Map<string, string>>(new Map());

  const say = (turn: Omit<Turn, "id">) => setTurns((prev) => [...prev, { ...turn, id: `${turn.role}${prev.length}` }]);

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

  // The list rows carry no sections: a report opened from a link is read
  // whole once, the way pressing it under "made before" does.
  const askedId = asked?.id ?? null;
  useEffect(() => {
    if (askedId) void refresh(askedId);
  }, [askedId, refresh]);

  // WHAT IS RUNNING COMES FROM THE ROWS, and a run that has not moved since
  // the last tick is nudged (/continue), exactly as on the page.
  const activeKey = reports.filter(isRunning).map((r) => r.id).join(",");
  useEffect(() => {
    const ids = activeKey ? activeKey.split(",") : [];
    if (ids.length === 0) return;
    const timer = setInterval(() => {
      for (const id of ids) {
        void refresh(id).then((report) => {
          if (!report) return;
          if (isRunning(report)) {
            const previous = lastProgressRef.current.get(report.id);
            const current = `${report.status}:${report.questions_done ?? 0}`;
            if (previous === current) void fetch(`/api/research/${report.id}/continue`, { method: "POST", keepalive: true }).catch(() => undefined);
            lastProgressRef.current.set(report.id, current);
          } else {
            lastProgressRef.current.delete(report.id);
          }
          if (report.status === "ready") {
            say({ role: "tool", text: t("finished"), reportId: report.id });
            setOpen(report);
            setPane("report");
            router.refresh();
          } else if (report.status === "failed") {
            say({ role: "tool", text: isStoppedMessage(report.error) ? tSteps("stopped") : report.error ?? t("runError") });
            router.refresh();
          }
        });
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [activeKey, refresh, t, tSteps, router]);

  // One immediate read on mount for anything already in flight.
  useEffect(() => {
    for (const report of initialReports) if (isRunning(report)) void refresh(report.id);
    // Deliberately mount-only: later refreshes are the interval's job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function plan(topic: string) {
    const value = topic.trim().slice(0, MAX_TOPIC_CHARS);
    if (!value || planning) return;
    say({ role: "user", text: value });
    setPlanning(true);
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: value, language: locale }),
      });
      const data = await response.json();
      if (!data.ok) {
        say({ role: "tool", text: data.error ?? t("planError") });
        return;
      }
      const report = data.report as ResearchReport;
      setReports((current) => [{ ...report, sections: [], sources: [] }, ...current]);
      say({ role: "tool", text: t("planIntro"), plan: { report, credits: Number(data.estimate?.credits ?? 0) } });
    } catch (err) {
      say({ role: "tool", text: getErrorMessage(err, t("planError")) });
    } finally {
      setPlanning(false);
    }
  }

  function run(id: string) {
    setApproved((prev) => new Set(prev).add(id));
    setReports((current) => current.map((r) => (r.id === id ? { ...r, status: "researching" } : r)));
    // Not awaited for its result: the run takes minutes and the poll is
    // the only thing that survives a closed tab.
    fetch(`/api/research/${id}/run`, { method: "POST", keepalive: true })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (data && !data.ok) {
          say({ role: "tool", text: data.error ?? t("runError") });
          void refresh(id);
        }
      })
      .catch(() => undefined);
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(t("confirmDelete", { name }))) return;
    try {
      const response = await fetch(`/api/research/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("deleteError"), "error");
        return;
      }
      setReports((current) => current.filter((r) => r.id !== id));
      setOpen((current) => (current?.id === id ? null : current));
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("deleteError")), "error");
    }
  }

  const running = reports.filter(isRunning);
  const capReached = monthlyCap !== null && usedThisMonth >= monthlyCap;

  const shellTurns: ShellTurn[] = turns.map((turn) => {
    if (turn.plan) {
      const { report, credits } = turn.plan;
      const started = approved.has(report.id);
      return {
        id: turn.id,
        role: turn.role,
        text: turn.text,
        extra: (
          <div data-testid="research-plan" className="mt-2 space-y-2">
            <ol className="space-y-1.5">
              {report.questions.map((q, i) => (
                <li key={`${q.question}-${i}`} className="text-sm text-foreground">
                  {i + 1}. {q.question}
                  {q.why && <span className="block text-[11px] text-muted">{q.why}</span>}
                </li>
              ))}
            </ol>
            <p className="text-xs font-medium text-foreground">{t("estimate", { credits })}</p>
            <p className="text-[11px] text-muted">{t("estimateNote")}</p>
            {!started && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => run(report.id)} data-testid="research-start" className={OPTION}>
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("start")}
                </button>
              </div>
            )}
          </div>
        ),
      };
    }
    if (turn.reportId) {
      const report = reports.find((r) => r.id === turn.reportId);
      return {
        id: turn.id,
        role: turn.role,
        text: turn.text,
        card: report
          ? {
              title: report.topic,
              open: pane === "report" && open?.id === report.id,
              onOpen: () => {
                void refresh(report.id).then((full) => setOpen(full ?? report));
                setPane("report");
              },
            }
          : undefined,
      };
    }
    return { id: turn.id, role: turn.role, text: turn.text };
  });

  const work =
    pane === "report" && open?.status === "ready"
      ? {
          title: open.topic,
          actions: (
            <>
              {slides && <SendToSlides report={open} className={OPTION} />}
              <DownloadPdfButton href={`/api/research/${open.id}/pdf`} fallbackName="research-report" className={OPTION} />
              {open.document_id && (
                <Link href={`/dashboard/documents/${open.document_id}`} className={OPTION}>
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("openDocument")}
                </Link>
              )}
            </>
          ),
          body: (
            <div data-testid="research-report" className="space-y-4">
              <AiGeneratedNotice variant="block" />
              <VoicePlayer
                text={[open.topic, ...(open.sections ?? []).map((s) => [s.heading, s.body].filter(Boolean).join(". "))].filter(Boolean).join("\n\n")}
              />
              {(open.sections ?? []).map((section, i) => (
                <div key={`${section.heading}-${i}`} className="space-y-1">
                  {section.heading && <h3 className="text-sm font-semibold text-foreground">{section.heading}</h3>}
                  {slides ? (
                    <CitedBody body={section.body} sources={open.sources ?? []} className="text-sm leading-relaxed text-body" />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">{section.body}</p>
                  )}
                </div>
              ))}
              {(open.sources ?? []).length > 0 && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-foreground">{t("sources")}</h3>
                  <ol data-testid="research-sources" className="space-y-1">
                    {(open.sources ?? []).map((source, i) => (
                      <li key={source.url} className="text-xs text-muted">
                        [{i + 1}]{" "}
                        <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline decoration-dotted hover:text-foreground">
                          {source.title}
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ),
        }
      : pane === "recent"
        ? {
            title: tNames("research"),
            body:
              reports.length === 0 ? (
                <p className="text-xs text-muted">{t("empty.title")}</p>
              ) : (
                <ul className="row-list">
                  {reports.map((report) => (
                    <li key={report.id} className="flex items-center justify-between gap-3 py-2">
                      <button
                        type="button"
                        disabled={report.status !== "ready"}
                        onClick={() => {
                          void refresh(report.id).then((full) => setOpen(full ?? report));
                          setPane("report");
                        }}
                        className="min-w-0 flex-1 text-start disabled:cursor-default"
                      >
                        <p className="break-words text-sm text-foreground">{report.topic}</p>
                        <p className="text-[11px] text-muted">
                          {report.status === "ready" ? t("statusReady") : report.status === "failed" ? t("statusFailed") : isRunning(report) ? t("inProgress") : t("statusPending")}
                          {" · "}
                          {formatDateTime(report.created_at, locale)}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(report.id, report.topic)}
                        aria-label={t("delete")}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-item text-muted hover:text-foreground"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ),
          }
        : null;

  return (
    <ToolShell
      ref={composerRef}
      name={tNames("research")}
      turns={shellTurns}
      working={
        planning ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <ThinkingIndicator size="sm" />
            {t("planning")}
          </span>
        ) : running.length > 0 ? (
          <div className="space-y-1">
            {running.map((report) => (
              <div key={report.id} className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <ThinkingIndicator size="sm" />
                <span className="min-w-0 flex-1 break-words">
                  {typeof report.questions_total === "number" && report.questions_total > 0
                    ? t("progressStep", { done: Math.min((report.questions_done ?? 0) + 1, report.questions_total), total: report.questions_total })
                    : report.status === "synthesising"
                      ? t("statusSynthesising")
                      : t("inProgress")}
                  {report.current_question && report.status === "researching" ? ` · ${report.current_question}` : ""}
                </span>
                <button
                  type="button"
                  data-testid="research-stop"
                  onClick={() => {
                    void fetch(`/api/research/${report.id}/cancel`, { method: "POST" }).then(
                      (res) => addToast(res.ok ? tSteps("stopping") : t("runError"), res.ok ? undefined : "error"),
                      () => addToast(t("runError"), "error")
                    );
                  }}
                  className={OPTION}
                >
                  <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                  {tSteps("stop")}
                </button>
              </div>
            ))}
            <p className="text-[11px] text-muted">{t("keepsRunning")}</p>
          </div>
        ) : null
      }
      placeholder={t("topicPlaceholder")}
      sending={planning}
      onSend={(text) => void plan(text)}
      initialText={initialTopic}
      options={[
        <button key="recent" type="button" onClick={() => setPane((v) => (v === "recent" ? null : "recent"))} aria-pressed={pane === "recent"} data-testid="research-recent" className={OPTION}>
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {tShell("recent")}
        </button>,
      ]}
      footer={
        <p className="mt-1.5 text-[11px] text-muted">
          {capReached ? t("capReached") : monthlyCap === null ? t("usedUnlimited", { used: usedThisMonth }) : t("usedThisMonth", { used: usedThisMonth, cap: monthlyCap })}
        </p>
      }
      work={work}
      onCloseWork={() => setPane(null)}
    />
  );
}
