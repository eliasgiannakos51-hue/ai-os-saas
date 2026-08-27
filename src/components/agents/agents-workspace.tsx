"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Bot,
  Plus,
  Play,
  Pause,
  Pencil,
  Trash2,
  SearchX,
  History,
  Check,
  Ban,
  AlertTriangle,
} from "lucide-react";
import { EntityCard, CardGrid, type EntityCardStatus } from "@/components/ui/entity-card";
import { ListLayout } from "@/components/ui/list-layout";
import { VoiceInput } from "@/components/voice/voice-input";
import { VoicePlayer } from "@/components/voice/voice-player";
import { EmptyState } from "@/components/empty-state";
import { SortToggle } from "@/components/sort-toggle";
import { PaginationControls } from "@/components/pagination-controls";
import { ClarificationQuestions } from "@/components/clarification/clarification-questions";
import { useToast } from "@/components/toast/toast-context";
import { useCredits } from "@/components/credits/credits-context";
import { DepthPicker, type DepthFacts } from "@/components/agents/depth-picker";
import { TemplateMatches, type TemplateMatch } from "@/components/agents/template-matches";
import { ShareTemplate } from "@/components/agents/share-template";
import { parseAgentDepth, type AgentDepth } from "@/lib/agents/agent-depth";
import { useSortAndPaginate } from "@/lib/use-sort-and-paginate";
import { formatDateTimeInZone, formatNumber } from "@/lib/format-number";
import { appendClarificationAnswers, alignSuggestions } from "@/lib/clarification-client";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAiJob } from "@/lib/jobs/use-ai-job";
import { AiJobProgress } from "@/components/ui/ai-job-progress";
import { ProblemNotice } from "@/components/errors/problem-notice";
import {
  problemCodeFrom,
  problemCodeForFetchFailure,
  type ProblemCode,
} from "@/lib/errors/problem-codes";
import { DeliveryPicker } from "@/components/agents/delivery-picker";
import { ExamplePrompts } from "@/components/ai/example-prompts";
import { isDeliveryChannel, type DeliveryChannel } from "@/lib/agents/delivery-channels";
import { markJobConsumed } from "@/lib/jobs/consume";
import { JobSeen } from "@/components/jobs/job-seen";
import { resolveBrowserTimeZone, nextRuns } from "@/lib/agents/cron-expression";
import { AGENT_CAN_IDS, AGENT_CANNOT_IDS } from "@/lib/agents/agent-capability";
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

type CapabilityEvidenceItem = { category: string; matched: string };

type BuildResponse = {
  ok: boolean;
  built?: boolean;
  needsClarification?: boolean;
  questions?: string[];
  /** Tappable answers, aligned by index with `questions`. */
  questionSuggestions?: string[][];
  draft?: AgentDraft;
  understood?: string;
  /** The model's one-sentence note about the part that cannot be done. */
  unsupported?: string;
  upcomingRuns?: string[];
  estimatedCreditsPerRun?: number;
  error?: string;
  upgradeRequired?: boolean;
  limitReached?: boolean;
  /** The builder itself judged the request impossible. Credits refunded. */
  reason?: string;
};

/**
 * The pre-charge verdict from api/agents/build.
 *
 * Arrives INSTEAD of a job id, which is the point: no job means no
 * reservation, no AI call and nothing charged. `blocked` and `evidence`
 * are ids and matched words, never sentences — the prose is looked up
 * here so a Greek user reads Greek.
 */
type CapabilityResponse = {
  capabilityBlocked?: boolean;
  capabilityPartial?: boolean;
  blocked?: string[];
  evidence?: CapabilityEvidenceItem[];
  doableParts?: string[];
  /** The builder model's own sentence, already in the user's language.
   *  Only set on the layer-2 path, where there are no category ids to
   *  look up because the verdict came from reading the request rather
   *  than from matching words in it. */
  modelNote?: string;
};

export function AgentsWorkspace({
  agents,
  runs,
  agentCap,
  accountEmail,
  slackChannels = [],
  depthFacts,
  templateCredits,
  buildCredits,
}: {
  agents: UserAgent[];
  runs: AgentRun[];
  agentCap: number;
  accountEmail: string;
  /** Channels from this user's own connected Slack workspace, resolved on
   *  the server. Empty when Slack is not connected — which is what makes
   *  the picker able to say so instead of offering an empty dropdown. */
  slackChannels?: { id: string; name: string }[];
  /** Model, steps, sources, seconds and CREDITS per tier, priced on the
   *  server by the same function that sizes the hold. Required, because a
   *  picker whose options differ twelvefold and shows only adjectives is
   *  a picker that sells the expensive one. */
  depthFacts: DepthFacts;
  /** What "use a ready-made one" costs, and what "build a new one" costs.
   *  Both from the server, so the comparison the user makes is between
   *  the two numbers that will actually be charged. */
  templateCredits: number;
  buildCredits: number;
}) {
  const t = useTranslations("dashboard.agents");
  const tModule = useTranslations("module");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const { refresh: refreshCredits } = useCredits();
  const scheduleLabel = useScheduleLabel();

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [requestText, setRequestText] = useState("");
  const requestRef = useRef<HTMLTextAreaElement | null>(null);
  // Set by the empty-state example press, which also OPENS the form. The
  // focus has to wait for the textarea to mount — setCreating(true) has
  // not committed by the time the press handler returns, so a focus()
  // there reaches for a field that does not exist yet (the same trap
  // generic-add-form.tsx documents).
  const focusRequestOnOpen = useRef(false);
  useEffect(() => {
    if (!creating || !focusRequestOnOpen.current) return;
    focusRequestOnOpen.current = false;
    const input = requestRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [creating]);
  // A toast was the wrong container for all four of these: it disappears,
  // it cannot hold three lines, and the third line is about the user's
  // money. The notice stays under the button they pressed until they act.
  const [problem, setProblem] = useState<ProblemCode | null>(null);
  // The id, not a boolean. "Am I building" is answered by the job row, so
  // it survives a reload — a `building` flag set by pressing a button is
  // exactly what made Deep Research look like it had stopped when the user
  // changed pages.
  const [jobId, setJobId] = useState<string | null>(null);
  const { job, isRunning: building, watchLost: buildWatchLost } = useAiJob(jobId);
  const [runJobId, setRunJobId] = useState<string | null>(null);
  const { job: runJob, isRunning: runningNow, watchLost: runWatchLost } = useAiJob(runJobId);
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [questionSuggestions, setQuestionSuggestions] = useState<string[][]>([]);
  const [preview, setPreview] = useState<BuildResponse | null>(null);
  // WHICH JOB THE THING ON SCREEN CAME FROM. jobId is cleared the moment
  // the row reaches an outcome, but the draft it produced is still in
  // front of the user and has not been paid for twice yet — this is the id
  // that gets marked seen when it is rendered or discarded.
  const [resultJobId, setResultJobId] = useState<string | null>(null);
  // The capability verdict, when the request was refused or reduced
  // BEFORE anything was reserved. Null the rest of the time.
  const [capability, setCapability] = useState<CapabilityResponse | null>(null);
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
    depth: AgentDepth;
    // WHERE IT SENDS, editable at last. The API has supported a second
    // destination since Slack was added and the editor had no field for
    // it, so every agent anyone could create emailed.
    deliveryMethod: DeliveryChannel;
    deliveryTarget: string;
  } | null>(null);
  const [lastRunOutput, setLastRunOutput] = useState<string | null>(null);
  // THE DEPTH ON THE PREVIEW SCREEN, separate from the draft the builder
  // returned so the user can change it before creating without the change
  // being lost by a re-render of the preview.
  const [previewDepth, setPreviewDepth] = useState<AgentDepth>("standard");
  // ONE RUN, DEEPER — never written to the agent. Reset to the agent's own
  // depth whenever the selection changes, so a deeper run of one agent
  // cannot silently become the default for the next one you open.
  const [runDepth, setRunDepth] = useState<AgentDepth>("standard");
  const [matches, setMatches] = useState<TemplateMatch[]>([]);
  const [adopting, setAdopting] = useState(false);

  // WHAT THE COUNTER COUNTS must be what the SERVER enforces. The cap is
  // on ACTIVE agents (lib/agents/agent-cap.ts counts status='active'),
  // but this line counted every row — so two paused agents on a cap of 2
  // disabled the create button the server would have allowed, and the
  // "used" figure disagreed with the limit it was printed next to.
  //
  // Deleting an agent dropping the count to 0 is CORRECT, not the bug it
  // was reported as: delete is a hard delete, and capacity means agents
  // currently scheduled to run. The total row count is a separate, wider
  // ceiling (3x), so it is shown separately when it differs rather than
  // folded into the same number.
  const activeCount = useMemo(() => agents.filter((a) => a.status === "active").length, [agents]);
  const atCapacity = activeCount >= agentCap;

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
  async function build(text: string, skipClarification: boolean, acknowledgedLimits = false) {
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
          acknowledgedLimits,
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        // A code, when the route has one, beats its English sentence: the
        // sentence is written on a server that does not know what language
        // this page is in. Routes without one keep their existing message
        // rather than being handed a guessed code.
        const code = problemCodeFrom(data);
        if (code) setProblem(code);
        else addToast(data.error ?? t("buildError"), "error");
        return;
      }
      setProblem(null);

      // THE CAPABILITY VERDICT, and it arrives instead of a job id.
      //
      // Handled before anything else because the whole value of it is
      // that nothing happened: no job row to watch, no reservation to
      // release, nothing charged. Falling through to `setJobId(undefined)`
      // would leave the user watching a job that does not exist.
      if (data.capabilityBlocked || data.capabilityPartial) {
        setQuestions(null);
        setPreview(null);
        setCapability(data as CapabilityResponse);
        return;
      }

      setQuestions(null);
      setQuestionSuggestions([]);
      setPreview(null);
      setCapability(null);
      setJobId(String(data.jobId));
    } catch (err) {
      // Never reached a route, so it can carry no code from one — the only
      // place a code is inferred, and inferred from the transport failing
      // rather than from the text of a message.
      setProblem(problemCodeForFetchFailure(err));
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
    // Kept after jobId is cleared, because it is what the preview reports
    // as seen — and a draft the user has read must not be offered back to
    // them tomorrow as if it were new.
    setResultJobId(job.id);
    if (result.needsClarification && result.questions?.length) {
      setQuestions(result.questions);
      // Realigned rather than trusted. A build that finished before
      // suggestions existed carries none, and since a finished-but-unseen
      // job is offered back for 24 hours (lib/jobs/resumable.ts), that
      // older result shape can still arrive here after a deploy.
      setQuestionSuggestions(alignSuggestions(result.questions, result.questionSuggestions));
      setPreview(null);
    } else if (result.reason === "not_feasible") {
      // LAYER 2's verdict: the deterministic gate let this through, and
      // the builder itself judged it impossible. The credits are already
      // back (the job refunded), so this is shown as an explanation with
      // that fact stated — not as an error the user should retry, which
      // is what "Couldn't design that agent, try rewording" invited them
      // to do with something no rewording can fix.
      setQuestions(null);
      setPreview(null);
      setCapability({
        capabilityBlocked: true,
        blocked: [],
        evidence: [],
        // Already in the user's language — the builder is told to write
        // it that way. Empty is fine: the panel's generic body stands on
        // its own.
        modelNote: result.unsupported,
      });
    } else if (result.built) {
      setQuestions(null);
      setPreview({ ...result, ok: true });
      // The builder's suggestion becomes the selection — and is LABELLED
      // as a suggestion in the picker, so it is visibly a proposal the
      // user is agreeing to rather than a default they never saw.
      setPreviewDepth(parseAgentDepth(result.draft?.config?.depth));
    } else {
      // The builder ran and could not design it. Real tokens were spent,
      // so this is a completed job carrying a refusal — not an error to
      // retry for free. Nothing will render it, so nothing else will ever
      // mark it seen: it is marked here, or it comes back every time this
      // page opens for the next day.
      addToast(result.error ?? t("buildError"), "error");
      void markJobConsumed(job.id);
    }
    setJobId(null);
  }, [job, addToast, t]);

  // WHAT MAKES CLOSING THE PAGE SAFE. On mount, ask the server what this
  // account was in the middle of. Nothing is remembered in the browser, so
  // it works in a second tab, in a different browser, and after a cleared
  // cache — all three of which a localStorage id gets wrong by telling the
  // user nothing is running while a worker spends their credits.
  //
  // THE ANSWER MAY BE A FINISHED BUILD, and that is the fix for the double
  // charge. Until this query started returning them, a build that
  // completed while the user was on another page was unreachable: the
  // draft existed, was paid for, and nothing on this screen could show it.
  // The only move left was to ask for it again, at full price.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/jobs?kind=agent_build");
        const data = await response.json();
        if (!cancelled && data.ok && data.job) {
          setCreating(true);
          // The sentence the user typed, back where they typed it. Without
          // it a resumed clarifying-questions round would send the answers
          // with nothing to attach them to — appendClarificationAnswers
          // would be building on an empty request.
          const request = (data.job.input as { request?: unknown } | null)?.request;
          if (typeof request === "string" && request.trim()) setRequestText(request);
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
  //
  // EVERY EXIT FROM HERE MARKS THE ROW SEEN. A run's output is saved in
  // the run history, so nothing is lost if this never fires — but the row
  // is now offered back by /api/jobs until someone says it has been shown,
  // and an unmarked one would re-announce "your agent ran" on every single
  // page open for a day.
  useEffect(() => {
    if (!runJob || runJob.status === "queued" || runJob.status === "running") return;
    if (runJob.status === "failed") {
      addToast(runJob.error === "stalled" ? t("buildStalled") : t("runFailed"), "error");
      setRunJobId(null);
      router.refresh();
      return;
    }
    void markJobConsumed(runJob.id);
    const result = (runJob.result ?? {}) as {
      ran?: boolean;
      output?: string;
      creditsCharged?: number;
      // Written by the agent_run handler in the same shape every other
      // billed surface uses (lib/billing/usage-receipt.ts).
      usage?: { creditsCharged?: number; bypass?: boolean; wouldHaveCharged?: number | null };
      error?: string;
      reason?: string;
    };
    if (result.reason === "cannot_complete") {
      // The agent said it cannot do this task. It has been refunded and
      // switched off server-side, so the message says both — "the run
      // failed, try again" would be false on every count.
      addToast(t("runCannotComplete"), "error");
    } else if (!result.ran) {
      addToast(result.error ?? t("runFailed"), "error");
    } else if (result.output) {
      setLastRunOutput(result.output);
      // "Done — 0 credits."
      //
      // That is what an owner, a beta tester and anyone else on an
      // unlimited account was told after every run, because the toast read
      // creditsCharged and a bypass account is charged nothing. Zero is
      // arithmetically true and says the opposite of what happened: it
      // reads as "billing is broken", which is exactly how it was
      // reported. The number that means something to them is what the run
      // WOULD have cost — already computed at settlement and already
      // stored on the ai_cost_log row, and until now never returned to
      // anybody.
      addToast(
        result.usage?.bypass
          ? typeof result.usage.wouldHaveCharged === "number"
            ? t("runSuccessUnlimitedCost", {
                credits: result.usage.wouldHaveCharged,
              })
            : t("runSuccessUnlimited")
          : t("runSuccess", { credits: result.creditsCharged ?? 0 })
      );
    } else {
      addToast(t("runNothingToReport"));
    }
    // The balance in the top nav is seeded once by the server and held in
    // React state, so a run that spent credits left it showing the OLD
    // number until a full reload. router.refresh() below re-renders the
    // server tree but does not reseed that state.
    void refreshCredits();
    setRunJobId(null);
    router.refresh();
  }, [runJob, addToast, t, locale, router, refreshCredits]);

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
        // THE DEPTH THE USER SELECTED, not the one the builder proposed.
        // Sending preview.draft unchanged would make the picker
        // decorative — it would move, show a different price, and create
        // an agent at the builder's tier.
        body: JSON.stringify({
          draft: {
            ...preview.draft,
            config: { ...preview.draft.config, depth: previewDepth },
          },
        }),
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

  /**
   * LOOKING FOR A READY-MADE ONE, WHILE THEY TYPE.
   *
   * Free — the ranking is Postgres full-text over the template library,
   * no model call — and it happens BEFORE the builder runs, because
   * offering a cheaper route after the expensive one has been paid for
   * is offering a refund.
   *
   * Debounced, and last-one-wins for the same reason the command palette
   * is: responses do not arrive in the order they were sent, and a stale
   * answer overwriting a fresher one would offer a template for a
   * sentence the user has already replaced.
   */
  const matchTokenRef = useRef(0);
  useEffect(() => {
    const q = requestText.trim();
    if (!creating || q.length < 3 || preview || questions) {
      setMatches([]);
      return;
    }
    const token = ++matchTokenRef.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/agents/templates?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (token !== matchTokenRef.current) return;
        setMatches(Array.isArray(data?.matches) ? (data.matches as TemplateMatch[]) : []);
      } catch {
        // A library that cannot be reached must not stop somebody
        // building an agent: no matches, and "build a new one" is
        // rendered unconditionally anyway.
        if (token === matchTokenRef.current) setMatches([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [requestText, creating, preview, questions]);

  async function adoptTemplate(match: TemplateMatch) {
    setAdopting(true);
    setProblem(null);
    try {
      const response = await fetch("/api/agents/templates/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          slug: match.slug,
          request: requestText.trim(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("templates.adoptError"), "error");
        return;
      }
      addToast(t("templates.adopted", { subject: String(data.subject ?? "") }));
      resetCreate();
      refreshCredits();
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("templates.adoptError")), "error");
    } finally {
      setAdopting(false);
    }
  }

  // Closing the create panel — by Cancel, or after the agent has been
  // created from the draft. Either way the user is finished with that
  // result, so it is marked seen: (δ) of the brief, "an explicit discard
  // is marked immediately", rather than waiting for a preview render that
  // is never going to happen again.
  function resetCreate() {
    void markJobConsumed(resultJobId);
    setResultJobId(null);
    setCreating(false);
    setRequestText("");
    setMatches([]);
    setQuestions(null);
    setQuestionSuggestions([]);
    setPreview(null);
    setCapability(null);
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
  async function runNow(agent: UserAgent, depth?: AgentDepth) {
    setLastRunOutput(null);
    setSelectedId(agent.id);
    try {
      const response = await fetch(`/api/agents/${agent.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        // SENT ONLY WHEN IT DIFFERS from the agent's own. An override
        // equal to the stored depth is not an override; sending it
        // anyway would put depthOverridden: true on a cost row for a run
        // that was entirely ordinary.
        body: JSON.stringify(
          depth && depth !== parseAgentDepth(agent.config?.depth) ? { depth } : {}
        ),
      });
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
      depth: parseAgentDepth(agent.config?.depth),
      deliveryMethod: isDeliveryChannel(agent.delivery_method) ? agent.delivery_method : "email",
      deliveryTarget: agent.delivery_target ?? "",
    });
    // A per-run override belongs to the agent you are looking at, not to
    // the session. Opening another agent resets it to that agent's own.
    setRunDepth(parseAgentDepth(agent.config?.depth));
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
        depth: editDraft.depth,
        // Sent together, because the server resolves the TARGET from the
        // method: a Discord agent's target is a constant, a Telegram
        // agent's is the chat saved with the token, and sending one
        // without the other would ask the route to guess.
        deliveryMethod: editDraft.deliveryMethod,
        deliveryTarget: editDraft.deliveryTarget,
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
            data-testid="agents-new"
            onClick={() => (creating ? resetCreate() : setCreating(true))}
            disabled={atCapacity && !creating}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
          <span className="text-xs text-muted" data-testid="agents-cap-meta">
            {t("agentsUsed", { used: activeCount, cap: agentCap })}
            {agents.length > activeCount && (
              <span data-testid="agents-total-meta">
                {" · "}
                {t("agentsTotal", { total: agents.length })}
              </span>
            )}
          </span>
        }
      >
        {creating && (
          <div className="mb-5 space-y-4 rounded-2xl border border-border bg-panel p-4">
            <div>
              <label htmlFor="agent-request" className="mb-1 block text-xs font-medium text-muted">
                {t("requestLabel")}
              </label>
              <div className="flex items-start gap-2">
                <textarea
                  id="agent-request"
                  ref={requestRef}
                  value={requestText}
                  onChange={(e) => setRequestText(e.target.value)}
                  placeholder={t("requestPlaceholder")}
                  rows={3}
                  className="input min-w-0 flex-1"
                  disabled={building || savingAgent}
                />
                <VoiceInput
                  compact
                  disabled={building || savingAgent}
                  onTranscript={(text) =>
                    setRequestText((current) => (current.trim() ? `${current.trim()} ${text}` : text))
                  }
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted">{t("deliveryNote", { email: accountEmail })}</p>
              {/* WHAT AN AGENT IS FOR, as three things you can press.
                  "Describe what the agent should do" is a label, not an
                  answer — somebody who has never had a scheduled agent
                  does not know whether this box wants a job title, a
                  prompt, or a sentence. */}
              <ExamplePrompts surface="agents" onPick={setRequestText} className="mt-2.5" />
            </div>

            {/*
              WHAT AN AGENT IS, BEFORE THE USER DESCRIBES ONE.
              Not a tooltip and not a help article: visible on the create
              screen, above the button, without a click. The reported
              incident started with a user who had no way to know that
              "runs tests and fixes errors" was outside the product — and
              nothing on this screen told them.
            */}
            <div className="grid gap-3 rounded-xl border border-border bg-surface/40 p-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("capability.canTitle")}
                </p>
                <ul className="space-y-1">
                  {AGENT_CAN_IDS.map((id) => (
                    <li key={id} className="text-[11px] leading-relaxed text-muted">
                      {t(`capability.can.${id}`)}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-rose-400">
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("capability.cannotTitle")}
                </p>
                <ul className="space-y-1">
                  {AGENT_CANNOT_IDS.map((id) => (
                    <li key={id} className="text-[11px] leading-relaxed text-muted">
                      {t(`capability.cannot.${id}`)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/*
              REFUSED — and nothing was spent. The "no charge" line is not
              reassurance boilerplate: it is the difference between this
              screen and the incident that produced it.
            */}
            {capability?.capabilityBlocked && (
              <div className="space-y-2 rounded-xl border border-rose-500/40 bg-rose-500/[0.06] p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-rose-300">
                  <Ban className="h-4 w-4" aria-hidden="true" />
                  {t("capability.refusedTitle")}
                </p>
                <p className="text-sm leading-relaxed text-foreground">{t("capability.refusedBody")}</p>
                {capability.modelNote && (
                  <p className="text-sm leading-relaxed text-rose-200/90">{capability.modelNote}</p>
                )}
                {(capability.blocked ?? []).length > 0 && (
                  <ul className="space-y-1">
                    {(capability.blocked ?? []).map((id) => (
                      <li key={id} className="text-xs leading-relaxed text-rose-200/90">
                        • {t(`capability.cannot.${id}`)}
                      </li>
                    ))}
                  </ul>
                )}
                {(capability.evidence ?? []).length > 0 && (
                  <p className="text-[11px] leading-relaxed text-muted">
                    {t("capability.detectedIn", {
                      words: (capability.evidence ?? []).map((e) => e.matched).join("; "),
                    })}
                  </p>
                )}
                <p className="text-xs font-medium text-emerald-400">{t("capability.noCharge")}</p>
                <p className="text-xs leading-relaxed text-muted">{t("capability.tryInstead")}</p>
                <button
                  type="button"
                  onClick={() => setCapability(null)}
                  className="min-h-[36px] rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface"
                >
                  {t("capability.rephrase")}
                </button>
              </div>
            )}

            {/*
              PARTIAL — the counter-offer. Requirement 1γ verbatim: name
              the part that is not supported, say what the agent will do
              instead, and ask whether to continue.
            */}
            {capability?.capabilityPartial && (
              <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  {t("capability.partialTitle")}
                </p>
                <ul className="space-y-1">
                  {(capability.blocked ?? []).map((id) => (
                    <li key={id} className="text-xs leading-relaxed text-amber-200/90">
                      • {t(`capability.cannot.${id}`)}
                    </li>
                  ))}
                </ul>
                {(capability.doableParts ?? []).length > 0 && (
                  <p className="text-sm leading-relaxed text-foreground">
                    {t("capability.partialWillDo", {
                      parts: (capability.doableParts ?? []).join("; "),
                    })}
                  </p>
                )}
                <p className="text-xs font-medium text-emerald-400">{t("capability.noChargeYet")}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCapability(null);
                      void build(requestText, true, true);
                    }}
                    className="min-h-[36px] rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90"
                  >
                    {t("capability.partialContinue")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCapability(null)}
                    className="min-h-[36px] rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface"
                  >
                    {t("capability.rephrase")}
                  </button>
                </div>
              </div>
            )}

            {questions && (
              <>
              {/* Questions the user has read are as "seen" as a draft is:
                  answering them starts a NEW job, and re-offering the old
                  one tomorrow would ask the same thing twice. */}
              <JobSeen jobId={resultJobId} />
              <ClarificationQuestions
                questions={questions}
                suggestions={questionSuggestions}
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
              </>
            )}

            {preview?.draft && (
              <div className="space-y-3 rounded-xl border border-orange-500/30 bg-orange-500/[0.04] p-4">
                {/* THE MOMENT THE USER SEES IT. Inside the preview rather
                    than in an effect beside it, so a draft can only be
                    marked seen by actually being on the screen. */}
                <JobSeen jobId={resultJobId} />
                <p className="text-sm font-semibold text-foreground">{t("previewTitle")}</p>
                {preview.understood && (
                  <p className="text-sm leading-relaxed text-foreground">{preview.understood}</p>
                )}
                {preview.unsupported && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
                    <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-400">
                      {t("capability.previewWillNotDo")}
                    </p>
                    <p className="text-xs leading-relaxed text-amber-300">{preview.unsupported}</p>
                  </div>
                )}

                {/*
                  WHAT IT WILL ACTUALLY DO, EVERY RUN — in sentences, not
                  in a name and a price.
                  The preview used to show what the agent was CALLED, when
                  it would run and what it would cost, and left "what does
                  it actually do" to a collapsed <details> holding the raw
                  task prompt. A user pressing Create was agreeing to a
                  label. These three lines are the thing they are agreeing
                  to, spelled out in the order the agent performs them.
                */}
                <div className="rounded-lg border border-border bg-surface/40 p-2.5">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {t("capability.previewWhatItDoes")}
                  </p>
                  <ol className="space-y-1 text-xs leading-relaxed text-foreground">
                    <li>
                      1.{" "}
                      {preview.draft.config?.needsWebSearch
                        ? t("capability.stepSearch")
                        : t("capability.stepNoSearch")}
                    </li>
                    <li>2. {t("capability.stepWrite")}</li>
                    <li>
                      3.{" "}
                      {t("capability.stepDeliver", {
                        target: preview.draft.deliveryTarget,
                        when: scheduleLabel(preview.draft.scheduleCron),
                      })}
                    </li>
                  </ol>
                </div>

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
                    <dt className="text-muted">{t("previewCostPerRun")}</dt>
                    <dd className="text-foreground">
                      {/* THE SELECTED TIER'S PRICE, not the one the
                          builder happened to suggest. Changing the
                          picker below and leaving this line showing the
                          old figure is a quote for something else. */}
                      {t("creditsPerRun", {
                        credits:
                          depthFacts[previewDepth]?.credits ?? preview.estimatedCreditsPerRun ?? 0,
                      })}
                    </dd>
                  </div>
                </dl>

                {/* HOW HARD IT WORKS — chosen BEFORE it is created, with
                    every option's price beside it. */}
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-foreground">{t("depth.legend")}</p>
                  <DepthPicker
                    value={previewDepth}
                    onChange={setPreviewDepth}
                    facts={depthFacts}
                    suggested={parseAgentDepth(preview.draft.config?.depth)}
                    disabled={savingAgent}
                  />
                </div>
                {/* WHERE THE RESULT GOES, decided at creation — not
                    discovered later. The picker used to exist only in the
                    edit panel of an already-created agent, which meant
                    every agent was born emailing and the other four
                    channels were reachable only by someone who already
                    knew to go looking. The reported bug, verbatim: "I
                    made an agent and saw no Telegram/Discord/Slack/in-app.
                    Only email." */}
                <DeliveryPicker
                  value={
                    isDeliveryChannel(preview.draft.deliveryMethod)
                      ? preview.draft.deliveryMethod
                      : "email"
                  }
                  target={preview.draft.deliveryTarget ?? ""}
                  accountEmail={accountEmail}
                  slackChannels={slackChannels}
                  onChange={({ method, target }) =>
                    setPreview((current) =>
                      current?.draft
                        ? {
                            ...current,
                            draft: { ...current.draft, deliveryMethod: method, deliveryTarget: target },
                          }
                        : current
                    )
                  }
                />
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
                    className="inline-flex min-h-[44px] items-center rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingAgent ? t("creating") : t("createButton")}
                  </button>
                  <button
                    type="button"
                    data-testid="agents-discard"
                    onClick={() => {
                      // Explicit discard — marked immediately, not on the
                      // next render, because there will not be one.
                      void markJobConsumed(resultJobId);
                      setResultJobId(null);
                      setPreview(null);
                    }}
                    disabled={savingAgent}
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground disabled:opacity-50"
                  >
                    {t("discard")}
                  </button>
                </div>
              </div>
            )}

            {/* READY-MADE FIRST, BUILD ALWAYS. TemplateMatches renders
                "build a new one" unconditionally — outside its own
                matches branch — so no match, a poor match and a perfect
                one all leave the same button in the same place. */}
            {!questions && !preview && requestText.trim().length > 0 && (
              <TemplateMatches
                matches={matches}
                onUse={(match) => void adoptTemplate(match)}
                onBuildNew={() => build(requestText, false)}
                templateCredits={templateCredits}
                buildNewLabel={
                  building ? t("designing") : t("templates.buildNew", { credits: buildCredits })
                }
                busy={building || adopting}
              />
            )}
            {!questions && !preview && requestText.trim().length === 0 && (
              <button
                type="button"
                disabled
                className="inline-flex min-h-[44px] cursor-not-allowed items-center rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black opacity-50"
              >
                {t("designButton")}
              </button>
            )}
            {problem && (
              <ProblemNotice
                code={problem}
                className="w-full"
                onRetry={() => {
                  setProblem(null);
                  void build(requestText, true);
                }}
                action={
                  problem === "out_of_credits"
                    ? { href: "/pricing", labelKey: "common.viewPlans" }
                    : undefined
                }
              />
            )}
            {/* Four real steps — understanding, drafting, checking,
                saving — reported by the worker and, until now, discarded:
                the button said "Designing…" for all of them and the job
                row's stepLabel was never read. */}
            <AiJobProgress job={job} watchLost={buildWatchLost} className="w-full" />
          </div>
        )}

        {/* "Run now" was the quietest of the four: a pulsing dot on the
            card's status badge and no words anywhere, for three real steps
            that can take minutes. */}
        {runJob && (runJob.status === "queued" || runJob.status === "running") && (
          <div className="mb-4 rounded-xl border border-orange-500/25 bg-orange-500/5 px-3 py-2">
            <AiJobProgress job={runJob} watchLost={runWatchLost} />
          </div>
        )}

        {agents.length === 0 ? (
          <EmptyState
            icon={Bot}
            title={t("empty.title")}
            example={t("empty.example")}
            onExample={(text) => {
              // The build form only exists while `creating` is true — with
              // zero agents it is CLOSED, so writing into requestText alone
              // changed nothing the user could see (the textarea was not
              // even mounted; requestRef.current was null). Open it first;
              // the focus effect below runs after the mount.
              setCreating(true);
              setRequestText(text);
              focusRequestOnOpen.current = true;
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
                      onSelect: () => void runNow(agent, runDepth),
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
                <div className="flex items-start gap-2">
                  <textarea
                    id="edit-prompt"
                    rows={5}
                    className="input min-w-0 flex-1"
                    value={editDraft.prompt}
                    onChange={(e) => setEditDraft({ ...editDraft, prompt: e.target.value })}
                  />
                  <VoiceInput
                    compact
                    onTranscript={(text) =>
                      setEditDraft((draft) =>
                        draft
                          ? {
                              ...draft,
                              prompt: draft.prompt.trim() ? `${draft.prompt.trim()} ${text}` : text,
                            }
                          : draft
                      )
                    }
                  />
                </div>
              </div>
              <DeliveryPicker
                value={editDraft.deliveryMethod}
                target={editDraft.deliveryTarget}
                accountEmail={accountEmail}
                slackChannels={slackChannels}
                onChange={({ method, target }) =>
                  setEditDraft({ ...editDraft, deliveryMethod: method, deliveryTarget: target })
                }
              />
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
              {/* CHANGEABLE AFTER CREATION (#21 a). An agent whose tier
                  could only be chosen once is an agent you delete and
                  rebuild when it turns out to need less. */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">{t("depth.legend")}</p>
                <DepthPicker
                  value={editDraft.depth}
                  onChange={(depth) => setEditDraft({ ...editDraft, depth })}
                  facts={depthFacts}
                  disabled={busyId === selected.id}
                />
              </div>
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
                  className="inline-flex min-h-[44px] items-center rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                >
                  {busyId === selected.id ? t("saving") : t("saveButton")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setEditDraft(null);
                  }}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
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

              {/* ONE RUN, DEEPER — requirement (δ). Changing this does NOT
                  change the agent: the next scheduled run still uses the
                  tier in its config, which is why the label says "this
                  run" and why the value resets to the agent's own every
                  time a different agent is opened. */}
              <div className="space-y-2 rounded-xl border border-border p-3">
                <p className="text-xs font-medium text-foreground">{t("depth.runOnce")}</p>
                <p className="text-[11px] leading-relaxed text-muted">
                  {t("depth.runOnceHint", {
                    depth: t(`depth.${parseAgentDepth(selected.config?.depth)}.title`),
                  })}
                </p>
                <DepthPicker
                  value={runDepth}
                  onChange={setRunDepth}
                  facts={depthFacts}
                  disabled={runningNow || busyId === selected.id}
                  compact
                />
              </div>

              {/* OPT-IN SHARING. Collapsed, never pre-ticked, and it
                  shows the exact sentence that would be published before
                  anybody agrees to publish it. */}
              <ShareTemplate agentId={selected.id} prompt={selected.prompt} />

              {lastRunOutput && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] p-3">
                  <p className="mb-1.5 text-xs font-semibold text-emerald-300">{t("latestOutput")}</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {lastRunOutput}
                  </p>
                  {/* An agent that ran while nobody was looking is
                      exactly the summary somebody wants read to them. */}
                  <div className="mt-2">
                    <VoicePlayer text={lastRunOutput} compact />
                  </div>
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
                          {/* 'queued' IS ITS OWN STATE, not a flavour of
                              running (V4 #13). A run submitted to the
                              batch API is waiting in somebody else's
                              queue, not working — and showing "Running"
                              for up to 24 hours would be a progress
                              indicator that is simply untrue. */}
                          <span
                            className={`text-xs font-medium ${
                              run.status === "success"
                                ? "text-emerald-400"
                                : run.status === "failed"
                                  ? "text-red-400"
                                  : run.status === "queued"
                                    ? "text-sky-400"
                                    : "text-amber-400"
                            }`}
                          >
                            {run.status === "success"
                              ? t("runSucceeded")
                              : run.status === "failed"
                                ? t("runFailedLabel")
                                : run.status === "queued"
                                  ? t("runQueued")
                                  : t("runRunning")}
                          </span>
                          <span className="text-[11px] text-muted">
                            {formatDateTimeInZone(run.started_at, locale, selected.timezone)} ·{" "}
                            {run.trigger_source === "manual" ? t("runManual") : t("runScheduled")} ·{" "}
                            {/* Same zero, second screen. The history row
                                read credits_charged straight out, so an
                                unlimited account saw "0 credits" against
                                every run it had ever made. */}
                            {run.would_have_charged_credits === null
                              ? t("runCredits", { credits: run.credits_charged })
                              : t("runCreditsUnlimited", {
                                  credits: formatNumber(run.would_have_charged_credits, locale),
                                })}
                          </span>
                        </div>
                        {run.error && <p className="mt-1.5 text-xs text-red-300">{run.error}</p>}
                        {run.status === "queued" && (
                          <p className="mt-1.5 text-xs text-muted">{t("runQueuedHint")}</p>
                        )}
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
                            <div className="mt-2">
                              <VoicePlayer text={run.output} compact />
                            </div>
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
