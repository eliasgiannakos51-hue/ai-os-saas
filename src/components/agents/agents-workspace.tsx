"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Bot, Plus, Play, Pause, Pencil, Trash2, SearchX, History } from "lucide-react";
import { EntityCard, CardGrid, type EntityCardStatus } from "@/components/ui/entity-card";
import { ListLayout } from "@/components/ui/list-layout";
import { EmptyState } from "@/components/empty-state";
import { SortToggle } from "@/components/sort-toggle";
import { PaginationControls } from "@/components/pagination-controls";
import { ClarificationQuestions } from "@/components/clarification/clarification-questions";
import { useToast } from "@/components/toast/toast-context";
import { useSortAndPaginate } from "@/lib/use-sort-and-paginate";
import { formatDateTimeInZone, formatNumber } from "@/lib/format-number";
import { appendClarificationAnswers } from "@/lib/clarification-client";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAiJob } from "@/lib/jobs/use-ai-job";
import { AiJobProgress } from "@/components/ui/ai-job-progress";
import { resolveBrowserTimeZone, nextRuns } from "@/lib/agents/cron-expression";
import type { AgentDraft, AgentRun, UserAgent } from "@/lib/agents/agent-config";
import { matchesSearch } from "@/lib/text/search-match";
import {
  ScheduleEditor,
  cronToParts,
  partsToCron,
  useScheduleLabel,
  DEFAULT_SCHEDULE_PARTS,
  type ScheduleParts,
} from "@/components/agents/schedule-editor";

// The whole Autonomous Agents surface: the list, the one-sentence create
// flow, and the per-agent detail with its run history.
//
// One client component rather than five, because every one of those parts
// mutates the same list and has to reflect the result immediately —
// splitting them would mean either lifting all of this state up anyway or
// passing six callbacks down. The pieces that are genuinely reusable (the
// card, the list chrome, the clarification prompt, the schedule editor)
// are separate components and shared with the rest of the app.

type BuildResponse = {
  ok: boolean;
  built?: boolean;
  needsClarification?: boolean;
  questions?: string[];
  draft?: AgentDraft;
  understood?: string;
  unsupported?: string;
  upcomingRuns?: string[];
  estimatedCreditsPerRun?: number;
  error?: string;
  upgradeRequired?: boolean;
  limitReached?: boolean;
};

export function AgentsWorkspace({
  agents,
  runs,
  agentCap,
  accountEmail,
}: {
  agents: UserAgent[];
  runs: AgentRun[];
  agentCap: number;
  accountEmail: string;
}) {
  const t = useTranslations("dashboard.agents");
  const tModule = useTranslations("module");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const scheduleLabel = useScheduleLabel();

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [requestText, setRequestText] = useState("");
  const requestRef = useRef<HTMLTextAreaElement | null>(null);
  // The id, not a boolean. "Am I building" is answered by the job row, so
  // it survives a reload — a `building` flag set by pressing a button is
  // exactly what made Deep Research look like it had stopped when the user
  // changed pages.
  const [jobId, setJobId] = useState<string | null>(null);
  const { job, isRunning: building } = useAiJob(jobId);
  const [runJobId, setRunJobId] = useState<string | null>(null);
  const { job: runJob, isRunning: runningNow } = useAiJob(runJobId);
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [preview, setPreview] = useState<BuildResponse | null>(null);
  const [savingAgent, setSavingAgent] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    description: string;
    prompt: string;
    parts: ScheduleParts;
    needsWebSearch: boolean;
  } | null>(null);
  const [lastRunOutput, setLastRunOutput] = useState<string | null>(null);

  const atCapacity = agents.length >= agentCap;

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return agents;
    return agents.filter((a) =>
      matchesSearch(`${a.name} ${a.description ?? ""} ${a.prompt}`, q)
    );
  }, [agents, query]);

  const { sortOrder, setSortOrder, page, setPage, totalPages, paginated, alphabetical } =
    useSortAndPaginate(filtered, query, (a) => a.name);

  const selected = useMemo(
    () => agents.find((a) => a.id === selectedId) ?? null,
    [agents, selectedId]
  );
  const selectedRuns = useMemo(
    () => (selected ? runs.filter((r) => r.agent_id === selected.id) : []),
    [runs, selected]
  );

  // ---- create flow ---------------------------------------------------

  // BUILDING IS A BACKGROUND JOB NOW.
  //
  // This used to await the whole design — two sequential model calls — on
  // one fetch, so closing the tab aborted it and a platform kill left the
  // credit hold stranded with nothing written anywhere. The route returns
  // a job id immediately; the row is the record; this only watches it.
  async function build(text: string, skipClarification: boolean) {
    try {
      const response = await fetch("/api/agents/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // keepalive so navigating away in the second between the press and
        // the 202 cannot lose the request that creates the job.
        keepalive: true,
        body: JSON.stringify({
          request: text,
          skipClarification,
          timezone: resolveBrowserTimeZone(),
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("buildError"), "error");
        return;
      }
      setQuestions(null);
      setPreview(null);
      setJobId(String(data.jobId));
    } catch (err) {
      addToast(getErrorMessage(err, t("buildError")), "error");
    }
  }

  // THE RESULT ARRIVES FROM THE ROW, not from the fetch that started it.
  useEffect(() => {
    if (!job || job.status === "queued" || job.status === "running") return;
    if (job.status === "failed") {
      // Never the raw server string: it is English, and this is precisely
      // the moment a user in another language should not be handed one.
      // "stalled" is the reaper's code for a worker that died — the credits
      // are already back, and saying so is the difference between a scare
      // and an inconvenience.
      addToast(job.error === "stalled" ? t("buildStalled") : t("buildError"), "error");
      setJobId(null);
      return;
    }
    const result = (job.result ?? {}) as BuildResponse;
    if (result.needsClarification && result.questions?.length) {
      setQuestions(result.questions);
      setPreview(null);
    } else if (result.built) {
      setQuestions(null);
      setPreview({ ...result, ok: true });
    } else {
      // The builder ran and could not design it. Real tokens were spent,
      // so this is a completed job carrying a refusal — not an error to
      // retry for free.
      addToast(result.error ?? t("buildError"), "error");
    }
    setJobId(null);
  }, [job, addToast, t]);

  // WHAT MAKES CLOSING THE PAGE SAFE. On mount, ask the server whether
  // this account already has a build running. Nothing is remembered in the
  // browser, so it works in a second tab, in a different browser, and
  // after a cleared cache — all three of which a localStorage id gets
  // wrong by telling the user nothing is running while a worker spends
  // their credits.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/jobs?kind=agent_build");
        const data = await response.json();
        if (!cancelled && data.ok && data.job) {
          setCreating(true);
          setJobId(String(data.job.id));
        }
      } catch {
        // No running job is the common answer and a failed check is not
        // evidence of one. The page works either way.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The run's outcome arrives from its row, exactly like the build's.
  useEffect(() => {
    if (!runJob || runJob.status === "queued" || runJob.status === "running") return;
    if (runJob.status === "failed") {
      addToast(runJob.error === "stalled" ? t("buildStalled") : t("runFailed"), "error");
      setRunJobId(null);
      router.refresh();
      return;
    }
    const result = (runJob.result ?? {}) as {
      ran?: boolean;
      output?: string;
      creditsCharged?: number;
      error?: string;
    };
    if (!result.ran) {
      addToast(result.error ?? t("runFailed"), "error");
    } else if (result.output) {
      setLastRunOutput(result.output);
      addToast(t("runSuccess", { credits: formatNumber(result.creditsCharged ?? 0, locale) }));
    } else {
      addToast(t("runNothingToReport"));
    }
    setRunJobId(null);
    router.refresh();
  }, [runJob, addToast, t, locale, router]);

  // A run started before a reload is picked back up the same way a build is.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/jobs?kind=agent_run");
        const data = await response.json();
        if (!cancelled && data.ok && data.job) setRunJobId(String(data.job.id));
      } catch {
        /* no running job is the common answer */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createAgent() {
    if (!preview?.draft) return;
    setSavingAgent(true);
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: preview.draft }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("createError"), "error");
        return;
      }
      addToast(t("createSuccess"));
      resetCreate();
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("createError")), "error");
    } finally {
      setSavingAgent(false);
    }
  }

  function resetCreate() {
    setCreating(false);
    setRequestText("");
    setQuestions(null);
    setPreview(null);
  }

  // ---- per-agent actions ---------------------------------------------

  async function patchAgent(agent: UserAgent, body: Record<string, unknown>, successMessage: string) {
    setBusyId(agent.id);
    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("saveError"), "error");
        return false;
      }
      addToast(successMessage);
      router.refresh();
      return true;
    } catch (err) {
      addToast(getErrorMessage(err, t("saveError")), "error");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAgent(agent: UserAgent) {
    if (!window.confirm(t("confirmDelete", { name: agent.name }))) return;
    setBusyId(agent.id);
    try {
      const response = await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("saveError"), "error");
        return;
      }
      addToast(t("deleteSuccess"));
      if (selectedId === agent.id) setSelectedId(null);
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("saveError")), "error");
    } finally {
      setBusyId(null);
    }
  }

  // RUNNING IS A BACKGROUND JOB NOW, for the same reason building is: a
  // search-enabled run plus a retry plus an email is the slowest thing
  // this feature does, and awaiting it meant closing the tab aborted the
  // fetch while the run itself carried on unseen.
  async function runNow(agent: UserAgent) {
    setLastRunOutput(null);
    setSelectedId(agent.id);
    try {
      const response = await fetch(`/api/agents/${agent.id}/run`, { method: "POST", keepalive: true });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("runFailed"), "error");
        return;
      }
      setRunJobId(String(data.jobId));
    } catch (err) {
      addToast(getErrorMessage(err, t("runFailed")), "error");
    }
  }

  function startEditing(agent: UserAgent) {
    setSelectedId(agent.id);
    setEditing(true);
    setEditDraft({
      name: agent.name,
      description: agent.description ?? "",
      prompt: agent.prompt,
      parts: cronToParts(agent.schedule_cron) ?? DEFAULT_SCHEDULE_PARTS,
      needsWebSearch: agent.config?.needsWebSearch === true,
    });
  }

  async function saveEdit(agent: UserAgent) {
    if (!editDraft) return;
    const saved = await patchAgent(
      agent,
      {
        name: editDraft.name,
        description: editDraft.description,
        prompt: editDraft.prompt,
        scheduleCron: partsToCron(editDraft.parts),
        needsWebSearch: editDraft.needsWebSearch,
      },
      t("updateSuccess")
    );
    if (saved) {
      setEditing(false);
      setEditDraft(null);
    }
  }

  // ---- rendering -----------------------------------------------------

  function statusFor(agent: UserAgent): EntityCardStatus {
    if (agent.status === "active")
      return { label: t("statusActive"), tone: "success", pulse: busyId === agent.id || runningNow };
    if (agent.status === "paused") return { label: t("statusPaused"), tone: "neutral" };
    return { label: t("statusDisabled"), tone: "danger" };
  }

  const previewRuns = preview?.upcomingRuns ?? [];

  return (
    <div className="space-y-5">
      <ListLayout
        newAction={
          <button
            type="button"
            onClick={() => (creating ? resetCreate() : setCreating(true))}
            disabled={atCapacity && !creating}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {creating ? t("cancel") : t("newAgent")}
          </button>
        }
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder={tModule("searchPlaceholder")}
        filters={<SortToggle sortOrder={sortOrder} onChange={setSortOrder} alphabetical={alphabetical} />}
        meta={
          <span className="text-xs text-muted">
            {t("agentsUsed", { used: agents.length, cap: agentCap })}
          </span>
        }
      >
        {creating && (
          <div className="mb-5 space-y-4 rounded-2xl border border-border bg-panel p-4">
            <div>
              <label htmlFor="agent-request" className="mb-1 block text-xs font-medium text-muted">
                {t("requestLabel")}
              </label>
              <textarea
                id="agent-request"
                ref={requestRef}
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
                placeholder={t("requestPlaceholder")}
                rows={3}
                className="input"
                disabled={building || savingAgent}
              />
              <p className="mt-1.5 text-[11px] text-muted">{t("deliveryNote", { email: accountEmail })}</p>
            </div>

            {questions && (
              <ClarificationQuestions
                questions={questions}
                submitting={building}
                title={t("clarificationTitle")}
                skipLabel={t("clarificationSkip")}
                continueLabel={t("clarificationContinue")}
                answerPlaceholder={t("clarificationAnswerPlaceholder")}
                onAnswer={(answers) =>
                  build(appendClarificationAnswers(requestText, questions, answers), true)
                }
                onSkip={() => build(requestText, true)}
              />
            )}

            {preview?.draft && (
              <div className="space-y-3 rounded-xl border border-orange-500/30 bg-orange-500/[0.04] p-4">
                <p className="text-sm font-semibold text-foreground">{t("previewTitle")}</p>
                {preview.understood && (
                  <p className="text-sm leading-relaxed text-foreground">{preview.understood}</p>
                )}
                {preview.unsupported && (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs leading-relaxed text-amber-300">
                    {preview.unsupported}
                  </p>
                )}
                <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">{t("previewName")}</dt>
                    <dd className="text-foreground">{preview.draft.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t("previewSchedule")}</dt>
                    <dd className="text-foreground">
                      {scheduleLabel(preview.draft.scheduleCron)} · {preview.draft.timezone}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t("previewDelivery")}</dt>
                    <dd className="break-all text-foreground">{preview.draft.deliveryTarget}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t("previewCostPerRun")}</dt>
                    <dd className="text-foreground">
                      {t("creditsPerRun", {
                        credits: formatNumber(preview.estimatedCreditsPerRun ?? 0, locale),
                      })}
                    </dd>
                  </div>
                </dl>
                {previewRuns.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs text-muted">{t("previewNextRuns")}</p>
                    <ul className="space-y-0.5 text-xs text-foreground">
                      {previewRuns.map((iso) => (
                        <li key={iso}>
                          {formatDateTimeInZone(iso, locale, preview.draft?.timezone)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted">{t("previewTask")}</summary>
                  <p className="mt-2 whitespace-pre-wrap leading-relaxed text-foreground">
                    {preview.draft.prompt}
                  </p>
                </details>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={createAgent}
                    disabled={savingAgent}
                    className="inline-flex min-h-[36px] items-center rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingAgent ? t("creating") : t("createButton")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    disabled={savingAgent}
                    className="inline-flex min-h-[36px] items-center rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground disabled:opacity-50"
                  >
                    {t("discard")}
                  </button>
                </div>
              </div>
            )}

            {!questions && !preview && (
              <button
                type="button"
                onClick={() => build(requestText, false)}
                disabled={building || requestText.trim().length === 0}
                className="inline-flex min-h-[38px] items-center rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {building ? t("designing") : t("designButton")}
              </button>
            )}
            {/* Four real steps — understanding, drafting, checking,
                saving — reported by the worker and, until now, discarded:
                the button said "Designing…" for all of them and the job
                row's stepLabel was never read. */}
            <AiJobProgress job={job} className="w-full" />
          </div>
        )}

        {/* "Run now" was the quietest of the four: a pulsing dot on the
            card's status badge and no words anywhere, for three real steps
            that can take minutes. */}
        {runJob && (runJob.status === "queued" || runJob.status === "running") && (
          <div className="mb-4 rounded-xl border border-orange-500/25 bg-orange-500/5 px-3 py-2">
            <AiJobProgress job={runJob} />
          </div>
        )}

        {agents.length === 0 ? (
          <EmptyState
            icon={Bot}
            title={t("empty.title")}
            example={t("empty.example")}
            onExample={(text) => {
              setRequestText(text);
              requestRef.current?.focus();
              requestRef.current?.setSelectionRange(text.length, text.length);
            }}
          >
            {t("empty.why")}
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState icon={SearchX}>{tModule("noMatches", { query })}</EmptyState>
        ) : (
          <>
            <CardGrid>
              {paginated.map((agent, index) => (
                <EntityCard
                  key={agent.id}
                  index={index}
                  icon={Bot}
                  accentSlug="agents"
                  title={agent.name}
                  description={agent.description || agent.prompt}
                  selected={selectedId === agent.id}
                  onSelect={() => {
                    setSelectedId(selectedId === agent.id ? null : agent.id);
                    setEditing(false);
                    setLastRunOutput(null);
                  }}
                  status={statusFor(agent)}
                  tags={[
                    { key: "schedule", label: scheduleLabel(agent.schedule_cron), tone: "accent" },
                    ...(agent.next_run_at && agent.status === "active"
                      ? [
                          {
                            key: "next",
                            label: t("nextRun", {
                              when: formatDateTimeInZone(agent.next_run_at, locale, agent.timezone),
                            }),
                          },
                        ]
                      : []),
                  ]}
                  menuLabel={tModule("actionsFor", { name: agent.name })}
                  menu={[
                    {
                      key: "run",
                      label: t("menuRunNow"),
                      icon: Play,
                      // Driven by the job row rather than a local flag, so a
                      // run started before a reload still reads as running.
                      disabled: busyId === agent.id || runningNow,
                      onSelect: () => void runNow(agent),
                    },
                    {
                      key: "toggle",
                      label: agent.status === "active" ? t("menuPause") : t("menuResume"),
                      icon: agent.status === "active" ? Pause : Play,
                      disabled: busyId === agent.id,
                      onSelect: () =>
                        void patchAgent(
                          agent,
                          { status: agent.status === "active" ? "paused" : "active" },
                          agent.status === "active" ? t("pauseSuccess") : t("resumeSuccess")
                        ),
                    },
                    {
                      key: "edit",
                      label: t("menuEdit"),
                      icon: Pencil,
                      onSelect: () => startEditing(agent),
                    },
                    {
                      key: "delete",
                      label: t("menuDelete"),
                      icon: Trash2,
                      destructive: true,
                      disabled: busyId === agent.id,
                      onSelect: () => void deleteAgent(agent),
                    },
                  ]}
                />
              ))}
            </CardGrid>
            <PaginationControls page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </ListLayout>

      {selected && (
        <section className="space-y-4 rounded-2xl border border-border bg-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-foreground">{selected.name}</h2>
              <p className="mt-0.5 text-xs text-muted">
                {scheduleLabel(selected.schedule_cron)} · {selected.timezone}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setEditing(false);
              }}
              className="shrink-0 text-xs text-muted transition-colors hover:text-foreground"
            >
              {t("close")}
            </button>
          </div>

          {selected.status === "disabled" && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-xs leading-relaxed text-red-300">
              {t("disabledExplanation", { failures: selected.consecutive_failures })}
            </p>
          )}

          {editing && editDraft ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="edit-name" className="mb-1 block text-xs font-medium text-muted">
                  {t("nameLabel")}
                </label>
                <input
                  id="edit-name"
                  className="input"
                  value={editDraft.name}
                  onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="edit-description" className="mb-1 block text-xs font-medium text-muted">
                  {t("descriptionLabel")}
                </label>
                <input
                  id="edit-description"
                  className="input"
                  value={editDraft.description}
                  onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="edit-prompt" className="mb-1 block text-xs font-medium text-muted">
                  {t("taskLabel")}
                </label>
                <textarea
                  id="edit-prompt"
                  rows={5}
                  className="input"
                  value={editDraft.prompt}
                  onChange={(e) => setEditDraft({ ...editDraft, prompt: e.target.value })}
                />
              </div>
              <ScheduleEditor
                parts={editDraft.parts}
                onChange={(parts) => setEditDraft({ ...editDraft, parts })}
              />
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={editDraft.needsWebSearch}
                  onChange={(e) => setEditDraft({ ...editDraft, needsWebSearch: e.target.checked })}
                />
                {t("webSearchLabel")}
              </label>
              <p className="text-[11px] text-muted">
                {t("nextRunPreview", {
                  when:
                    nextRuns(partsToCron(editDraft.parts), new Date(), selected.timezone, 1)
                      .map((d) => formatDateTimeInZone(d, locale, selected.timezone))
                      .join("") || "—",
                })}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveEdit(selected)}
                  disabled={busyId === selected.id}
                  className="inline-flex min-h-[36px] items-center rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                >
                  {busyId === selected.id ? t("saving") : t("saveButton")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setEditDraft(null);
                  }}
                  className="inline-flex min-h-[36px] items-center rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {selected.prompt}
              </p>

              {lastRunOutput && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] p-3">
                  <p className="mb-1.5 text-xs font-semibold text-emerald-300">{t("latestOutput")}</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {lastRunOutput}
                  </p>
                </div>
              )}

              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("historyTitle")}
                </h3>
                {selectedRuns.length === 0 ? (
                  <p className="text-xs text-muted">{t("historyEmpty")}</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedRuns.map((run) => (
                      <li key={run.id} className="rounded-xl border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`text-xs font-medium ${
                              run.status === "success"
                                ? "text-emerald-400"
                                : run.status === "failed"
                                  ? "text-red-400"
                                  : "text-amber-400"
                            }`}
                          >
                            {run.status === "success"
                              ? t("runSucceeded")
                              : run.status === "failed"
                                ? t("runFailedLabel")
                                : t("runRunning")}
                          </span>
                          <span className="text-[11px] text-muted">
                            {formatDateTimeInZone(run.started_at, locale, selected.timezone)} ·{" "}
                            {run.trigger_source === "manual" ? t("runManual") : t("runScheduled")} ·{" "}
                            {t("runCredits", { credits: formatNumber(run.credits_charged, locale) })}
                          </span>
                        </div>
                        {run.error && <p className="mt-1.5 text-xs text-red-300">{run.error}</p>}
                        {run.status === "success" && !run.output && (
                          <p className="mt-1.5 text-xs text-muted">{t("runNothingToReport")}</p>
                        )}
                        {run.output && (
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-xs text-muted">
                              {t("viewOutput")}
                            </summary>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                              {run.output}
                            </p>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
