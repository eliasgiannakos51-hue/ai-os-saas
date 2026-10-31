"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useLimitText } from "@/lib/errors/use-error-text";
import { Ban, AlertTriangle, Check, CircleDot, Clock, Inbox, Play, Pause, Search } from "lucide-react";
import { ACTION, ChosenBox, OPTION, ToolShell, type ShellTurn } from "@/components/shell/tool-shell";
import { ShellHistoryColumn, type ShellHistoryRow } from "@/components/shell/shell-history-column";
import { VoicePlayer } from "@/components/voice/voice-player";
import { ClarificationQuestions } from "@/components/clarification/clarification-questions";
import { useToast } from "@/components/toast/toast-context";
import { useCredits } from "@/components/credits/credits-context";
import { DepthPicker, type DepthFacts } from "@/components/agents/depth-picker";
import { TemplateMatches, type TemplateMatch } from "@/components/agents/template-matches";
import { ShareTemplate } from "@/components/agents/share-template";
import { parseAgentDepth, type AgentDepth } from "@/lib/agents/agent-depth";
import { effectiveRunDepth, runRequestBody, type RunDepthOverride } from "@/lib/agents/run-depth";
import { formatDateTimeInZone, formatNumber } from "@/lib/format-number";
import { appendClarificationAnswers, alignSuggestions } from "@/lib/clarification-client";
import { AGENT_MAX_CONSECUTIVE_FAILURES } from "@/lib/agents/agent-failure-limits";
import { useAiJob } from "@/lib/jobs/use-ai-job";
import { AiJobProgress } from "@/components/ui/ai-job-progress";
import { AiJobTimeline } from "@/components/ui/ai-job-timeline";
import { JOB_STEPS } from "@/lib/jobs/job-types";
import type { ClientStep } from "@/lib/jobs/job-timeline";
import { ProblemNotice } from "@/components/errors/problem-notice";
import {
  problemCodeFrom,
  problemCodeForFetchFailure,
  type ProblemCode,
} from "@/lib/errors/problem-codes";
import { DeliveryPicker } from "@/components/agents/delivery-picker";
import { exampleKeys } from "@/lib/ai/example-prompts";
import { isDeliveryChannel, type DeliveryChannel } from "@/lib/agents/delivery-channels";
import { markJobConsumed } from "@/lib/jobs/consume";
import { JobSeen } from "@/components/jobs/job-seen";
import { ListCappedNotice } from "@/components/ui/list-capped-notice";
import { resolveBrowserTimeZone, nextRuns } from "@/lib/agents/cron-expression";
import { AGENT_CAN_IDS, AGENT_CANNOT_IDS } from "@/lib/agents/agent-capability";
import type { AgentDraft, AgentRun, UserAgent } from "@/lib/agents/agent-config";
import {
  ScheduleEditor,
  cronToParts,
  partsToCron,
  useScheduleLabel,
  DEFAULT_SCHEDULE_PARTS,
  type ScheduleParts,
} from "@/components/agents/schedule-editor";
import { forgetExampleParam } from "@/lib/overview/first-screen-examples";

/**
 * AGENTS IN THE COMMON SHELL — the owner's directive 25 («AGENTS:
 * ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΔΙΚΟ ΤΟΥΣ EMAIL», 2026-10-31), ΚΟΜΜΑΤΙ 1 ONLY, which
 * carries his own stop-gate: the screen, and nothing wired further until
 * he writes «εγκρίνω».
 *
 * THIS FILE WAS agents-workspace.tsx (git mv, so its history follows it).
 * The rename is not cosmetic: scripts/tests/tool-shell.test.mjs §3 fails
 * any page that still mentions a `-workspace` component beside the shell
 * it draws, because that is how a page keeps an old body behind a new one.
 * The ~30 gates that read this file by path were repointed in the same
 * commit — a gate naming a file no page renders is a gate measuring
 * nothing (CLAUDE.md, «a number PRINTED and never judged»).
 *
 * WHAT MOVED, AND WHAT THAT COST (docs/TOOL-RULES.md §46-47: no function
 * is lost, old addresses keep working).
 *
 *   the list        -> `history` ([◧] column), which brings search,
 *                      rename, delete-with-Undo and «Προσθήκη σε
 *                      Project» (linkTable="user_agents", already
 *                      declared in lib/projects/linkable-extras.ts) for
 *                      free. The SortToggle and the pager are gone: the
 *                      column is one scrolling list with its own search.
 *   the create form -> the shell's ONE field. Typing no longer builds;
 *                      it puts the request on the table, and the turn
 *                      under it offers the ready-made agents and the
 *                      price of building new — the same order as before,
 *                      which the old file explains is the whole point
 *                      ("offering a cheaper route after the expensive
 *                      one has been paid for is offering a refund").
 *   name / task /   -> rename is the column's own ⋯; task and
 *   description        description are written through that same one
 *                      field, chosen by the option under it. There is no
 *                      second thing to type into on this screen, which
 *                      tool-shell.test.mjs checks literally.
 *   schedule,       -> the right panel, through the SAME components as
 *   delivery, depth,   before (ScheduleEditor, DeliveryPicker,
 *   web search         DepthPicker, one checkbox). Nothing was rebuilt.
 *   the mic         -> the shared field's own (chat-composer.tsx). This
 *                      file no longer renders <VoiceInput and does not
 *                      need to; <VoicePlayer stays, twice, because
 *                      listening to a result is this tool's own.
 *
 * THE PLAN BOXES ARE REAL, AND ONE OF THE THREE STATES IS DERIVED.
 * JOB_STEPS.agent_run declares the three steps the worker reports, in
 * order (lib/jobs/job-types.ts), and ai_jobs.timeline records each one as
 * it is passed (lib/jobs/job-timeline.ts, migration
 * 20261004200000_ai_jobs_timeline.sql). So: a step with no timeline entry
 * has not started (Waiting), an entry whose `seconds` is null while the
 * job runs is the one working, and anything else is Done. Nothing is
 * invented and no percentage creeps on a timer.
 *
 * WHAT THE SCREEN SAYS IT DOES NOT HAVE, rather than drawing a blank.
 * Κομμάτι 1 is the screen; four of the things the panel is asked to show
 * have no data anywhere yet, and each says so in its own words: the
 * agent's own address (Κομμάτι 5), a per-agent tool allowlist, a credit
 * limit that STOPS it (Κομμάτι 3 — what the panel shows is the cost,
 * labelled as cost), and approval rules (Κομμάτι 3). The Inbox tab is
 * built and empty for the same reason, and says which of the two halves
 * is empty for which reason.
 */

type Turn = { id: string; role: "user" | "tool"; text: string };

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
  /** The builder model's own sentence, already in the user's language. */
  modelNote?: string;
};

/** What the field writes while an agent is open. */
type FieldTarget = "task" | "description";

/** Done, Working or Waiting — the owner's own three words. */
type StepState = "done" | "working" | "waiting";

/**
 * HOW MANY TIMES A MONTH THIS SCHEDULE FIRES. Arithmetic on the
 * frequency the schedule editor already parses (cronToParts), not a
 * walk of the next N runs: an hourly agent fires 730 times and
 * nextRuns() would have to be asked for 730 dates to find that out.
 * Labelled «περίπου» on screen because a month is not 30 days.
 */
const RUNS_PER_MONTH: Record<ScheduleParts["frequency"], number> = {
  hourly: 730,
  daily: 30,
  weekly: 4,
  monthly: 1,
};

/**
 * THE STATE OF ONE DECLARED STEP, from the timeline of the run in flight.
 *
 * `timeline` is only ever this agent's own run (the caller checks the job
 * row's own input.agentId), so a run started on one agent cannot colour
 * another agent's boxes.
 */
function planStepState(token: string, timeline: ClientStep[] | undefined, running: boolean): StepState {
  const entry = (timeline ?? []).find((s) => s.label === token);
  if (!entry) return "waiting";
  return entry.seconds === null && running ? "working" : "done";
}

/** One box in the plan: the step, what it does for THIS agent, its state. */
function PlanBox({
  label,
  detail,
  state,
  stateLabel,
}: {
  label: string;
  detail: string;
  state: StepState;
  stateLabel: string;
}) {
  const tone =
    state === "done" ? "text-success" : state === "working" ? "text-warning" : "text-muted";
  const Icon = state === "done" ? Check : state === "working" ? CircleDot : Clock;
  return (
    <li
      data-testid="agents-plan-box"
      data-state={state}
      className="flex items-start gap-3 rounded-item border border-border bg-panel p-3"
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block break-words text-xs leading-relaxed text-muted">{detail}</span>
      </span>
      <span data-testid="agents-plan-state" className={`shrink-0 text-[11px] font-medium ${tone}`}>
        {stateLabel}
      </span>
    </li>
  );
}

export function AgentsShell({
  agents,
  runs,
  agentCap,
  accountEmail,
  slackChannels = [],
  depthFacts,
  templateCredits,
  buildCredits,
  aiDisclosure,
  capped,
  cap,
  initialAgent,
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
   *  server by the same function that sizes the hold. */
  depthFacts: DepthFacts;
  /** What "use a ready-made one" costs, and what "build a new one" costs.
   *  Both from the server, so the comparison the user makes is between
   *  the two numbers that will actually be charged. */
  templateCredits: number;
  buildCredits: number;
  /** EU AI Act Article 50, resolved on the server so the string stays in
   *  app/dashboard/agents/page.tsx where agents.test.mjs §13 looks for it.
   *  Drawn under the one field, which is this screen's "above the button". */
  aiDisclosure: string;
  /** The row list hit lib/record-cap.ts's ceiling. Far above any plan's
   *  agent cap, so nobody reaches it in practice — but a list with no
   *  ceiling is a list that grows without one, and a cap announced on one
   *  page and silent on the next teaches people the silent ones are
   *  complete. */
  capped: boolean;
  cap: number;
  /**
   * A request to start on arrival, from the Home screen's "repeat"
   * example (lib/overview/first-screen-examples).
   *
   * It puts the sentence in the thread, which starts the ready-made
   * template search — real work, and what the user sees is a screen
   * already offering agents that do this. It does NOT call build(): the
   * cheap route has to be offered BEFORE the expensive builder runs.
   */
  initialAgent?: string;
}) {
  const t = useTranslations("dashboard.agents");
  // A limit the route named, with the time it opens again, in the reader's
  // language (lib/errors/use-error-text.ts) — not the route's English `message`.
  const limitText = useLimitText();
  const tNames = useTranslations("dashboard.tools.names");
  const tExamples = useTranslations("aiExamples.agents");
  const tSteps = useTranslations("aiSteps.agent_run");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const { refresh: refreshCredits } = useCredits();
  const scheduleLabel = useScheduleLabel();

  const [turns, setTurns] = useState<Turn[]>([]);
  /**
   * OPEN BESIDE THE LANDING, CLOSED OVER IT.
   *
   * The owner's Αρχική is «η λίστα με τους βοηθούς μου ΚΑΙ το πεδίο», so
   * on a computer the column belongs open: components/shell/tool-shell.tsx
   * draws it `md:relative md:w-[280px]` there, beside the conversation,
   * taking nothing away from it.
   *
   * On a phone the same column is a drawer — `absolute inset-y-0 z-30
   * w-[85%]` with a scrim over everything else — so "open" means the
   * landing arrives behind a veil and the first tap on an example hits
   * the scrim. That is what this started as, and what this piece's own
   * prodtest caught on the phone pass (2026-10-31); every other tool in
   * the shell starts it closed for exactly that reason.
   *
   * So: false at first render on both (no hydration mismatch — the server
   * cannot know the width), then opened on mount at the width where the
   * column is beside rather than over. 768px is not a guess: it is the
   * `md:` breakpoint those two class sets switch at, in that file.
   */
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) setHistoryOpen(true);
  }, []);
  const [requestText, setRequestText] = useState("");
  const [tab, setTab] = useState<"plan" | "inbox">("plan");
  /**
   * WHICH AGENT IS CHOSEN, AND WHETHER ITS WORK IS SHOWING — two things,
   * because on a phone they have to be able to differ.
   *
   * ToolShell draws the work area `fixed inset-0 z-[60]` below `lg`, so
   * while it is open the one field is behind it. If «back» also forgot
   * the agent, there would be no state in which a phone could change an
   * agent's task by words at all: open it and the field is covered,
   * close it and the field writes a new agent instead. Found 2026-10-31
   * by this piece's own prodtest, phone pass only.
   *
   * So «back» closes the work and keeps the choice, and the shell's own
   * `ChosenBox` (the same «Μόνο σε: …» Slides and Site draw) says under
   * the field which agent the next sentence lands on, with the press that
   * clears it. The [◧] row opens the work again.
   */
  const [workOpen, setWorkOpen] = useState(false);
  const [fieldTarget, setFieldTarget] = useState<FieldTarget>("task");

  // A toast was the wrong container for all four of these: it disappears,
  // it cannot hold three lines, and the third line is about the user's
  // money. The notice stays under the field they used until they act.
  const [problem, setProblem] = useState<ProblemCode | null>(null);
  // The id, not a boolean. "Am I building" is answered by the job row, so
  // it survives a reload — a `building` flag set by pressing a button is
  // exactly what made Deep Research look like it had stopped when the user
  // changed pages.
  const [jobId, setJobId] = useState<string | null>(null);
  const { job, isRunning: building, watchLost: buildWatchLost } = useAiJob(jobId);
  const [runJobId, setRunJobId] = useState<string | null>(null);
  // WHICH AGENT THE RUN IN FLIGHT BELONGS TO. Without it, selecting a
  // second agent while the first one runs would paint the second one's
  // plan boxes with the first one's timeline.
  const [runAgentId, setRunAgentId] = useState<string | null>(null);
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
  const [editDraft, setEditDraft] = useState<{
    parts: ScheduleParts;
    needsWebSearch: boolean;
    depth: AgentDepth;
    deliveryMethod: DeliveryChannel;
    deliveryTarget: string;
  } | null>(null);
  const [lastRunOutput, setLastRunOutput] = useState<string | null>(null);
  // THE DEPTH ON THE PREVIEW SCREEN, separate from the draft the builder
  // returned so the user can change it before creating without the change
  // being lost by a re-render of the preview.
  const [previewDepth, setPreviewDepth] = useState<AgentDepth>("standard");
  // ONE RUN, DEEPER — never written to the agent, and KEYED BY THE AGENT
  // IT WAS MADE FOR (V4.6). An override that carries the agent's id
  // cannot be read for any other agent. See lib/agents/run-depth.ts.
  const [runOverride, setRunOverride] = useState<RunDepthOverride>(null);
  const [matches, setMatches] = useState<TemplateMatch[]>([]);
  const [adopting, setAdopting] = useState(false);

  /**
   * OPENING AN AGENT PUTS THE COLUMN AWAY, CLOSING IT BRINGS IT BACK.
   *
   * Three things cannot share 1440px: the [◧] column is 280px, the work
   * area is 60%, and what is left for the conversation is about 200px —
   * which is the width tool-shell.tsx's own comment records as the one
   * that wrapped a heading to a letter per line (Image Κομμάτι 2,
   * 2026-10-30). Seen here on the first desktop screenshot of this piece:
   * the field was a slot two words wide. Every other tool in the shell
   * avoids it by starting the column closed; Agents cannot, because its
   * Αρχική IS the list. So the column belongs to the landing and the
   * width belongs to the work, and the toggle still overrides either.
   */
  function showAgent(id: string) {
    setSelectedId(id);
    setWorkOpen(true);
    setHistoryOpen(false);
  }
  function hideWork() {
    setWorkOpen(false);
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) setHistoryOpen(true);
  }

  function say(role: "user" | "tool", text: string) {
    setTurns((current) => [...current, { id: `${role}-${current.length}-${text.slice(0, 12)}`, role, text }]);
  }


  // WHAT THE COUNTER COUNTS must be what the SERVER enforces. The cap is
  // on ACTIVE agents (lib/agents/agent-cap.ts counts status='active'), so
  // two paused agents on a cap of 2 must not read as full.
  const activeCount = useMemo(() => agents.filter((a) => a.status === "active").length, [agents]);
  const atCapacity = activeCount >= agentCap;

  const selected = useMemo(
    () => agents.find((a) => a.id === selectedId) ?? null,
    [agents, selectedId]
  );

  /**
   * ?agent=<…> CARRIES TWO MEANINGS, AND ONE EFFECT DECIDES WHICH — on
   * purpose, because two effects got it wrong (found 2026-10-31, the
   * first prodtest run of this piece).
   *
   *   an id of one of THIS account's agents  -> open that agent
   *   anything else                          -> a request on the table
   *
   * Both addresses already shipped and both still work (docs/TOOL-RULES.md
   * §47): lib/create-studio/use-create-studio.ts has sent people to
   * `?agent=<id>` since the agent branch was added, and the Home screen's
   * «repeat» example sends free text (lib/overview/first-screen-examples).
   *
   * WHY ONE EFFECT. The two used to be separate, and the arrival one ran
   * first and called forgetExampleParam("agent") — which deletes the
   * parameter from the address bar. By the time the deep-link effect read
   * window.location.search there was nothing in it, so a link straight to
   * an agent opened the landing with the agent's own UUID sitting in the
   * thread as if somebody had typed it. React runs effects in declaration
   * order, so the bug was invisible in either effect read on its own.
   *
   * The ref is the guard, not a state flag, which is false at mount and
   * would let React's development double-invoke run this twice.
   */
  const arrivedRef = useRef(false);
  useEffect(() => {
    if (arrivedRef.current) return;
    const requested = new URLSearchParams(window.location.search).get("agent") ?? initialAgent ?? "";
    if (!requested) return;
    arrivedRef.current = true;
    if (agents.some((a) => a.id === requested)) {
      setSelectedId(requested);
      setWorkOpen(true);
      setHistoryOpen(false);
    } else {
      setRequestText(requested);
      setTurns([{ id: "arrived", role: "user", text: requested }]);
    }
    forgetExampleParam("agent");
    // `[initialAgent]` AND the ref, the same pair chat-workspace.tsx uses
    // for its own arrival: the dependency is what makes a request that
    // arrives after mount run at all (a client-side navigation to the
    // same route with a different `?agent=` re-renders without
    // remounting), and the ref is what stops React's development
    // double-invoke from running one arrival twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAgent]);

  const selectedRuns = useMemo(
    () => (selected ? runs.filter((r) => r.agent_id === selected.id) : []),
    [runs, selected]
  );

  // THE SETTINGS DRAFT FOLLOWS THE OPEN AGENT. The old screen hid these
  // behind an «Επεξεργασία» button; the panel is the edit surface now, so
  // the draft is seeded whenever the open agent changes.
  useEffect(() => {
    if (!selected) {
      setEditDraft(null);
      return;
    }
    setEditDraft({
      parts: cronToParts(selected.schedule_cron) ?? DEFAULT_SCHEDULE_PARTS,
      needsWebSearch: selected.config?.needsWebSearch === true,
      depth: parseAgentDepth(selected.config?.depth),
      deliveryMethod: isDeliveryChannel(selected.delivery_method) ? selected.delivery_method : "email",
      deliveryTarget: selected.delivery_target ?? "",
    });
    setTab("plan");
    setLastRunOutput(null);
  }, [selected]);

  // ---- create flow ---------------------------------------------------

  // BUILDING IS A BACKGROUND JOB. This used to await the whole design —
  // two sequential model calls — on one fetch, so closing the tab aborted
  // it and a platform kill left the credit hold stranded. The route
  // returns a job id immediately; the row is the record; this only watches.
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
        // this page is in.
        const code = problemCodeFrom(data);
        if (code) setProblem(code);
        else addToast(limitText(data) ?? t("buildError"), "error");
        return;
      }
      setProblem(null);

      // THE CAPABILITY VERDICT, and it arrives instead of a job id.
      // Handled before anything else because the whole value of it is
      // that nothing happened: no job row to watch, nothing charged.
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
      // Never reached a route, so it can carry no code from one — inferred
      // from the transport failing rather than from the text of a message.
      setProblem(problemCodeForFetchFailure(err));
    }
  }

  // THE RESULT ARRIVES FROM THE ROW, not from the fetch that started it.
  useEffect(() => {
    if (!job || job.status === "queued" || job.status === "running") return;
    if (job.status === "failed") {
      // Never the raw server string: it is English. "stalled" is the
      // reaper's code for a worker that died — the credits are already
      // back, and saying so is the difference between a scare and an
      // inconvenience.
      addToast(job.error === "stalled" ? t("buildStalled") : t("buildError"), "error");
      setJobId(null);
      return;
    }
    const result = (job.result ?? {}) as BuildResponse;
    // Kept after jobId is cleared, because it is what the preview reports
    // as seen — a draft the user has read must not be offered back to them
    // tomorrow as if it were new.
    setResultJobId(job.id);
    if (result.needsClarification && result.questions?.length) {
      setQuestions(result.questions);
      // Realigned rather than trusted: a build that finished before
      // suggestions existed carries none, and a finished-but-unseen job is
      // offered back for 24 hours (lib/jobs/resumable.ts).
      setQuestionSuggestions(alignSuggestions(result.questions, result.questionSuggestions));
      setPreview(null);
    } else if (result.reason === "not_feasible") {
      // LAYER 2's verdict: the deterministic gate let this through, and
      // the builder itself judged it impossible. The credits are already
      // back, so this is an explanation with that fact stated — not an
      // error the user should retry with something no rewording can fix.
      setQuestions(null);
      setPreview(null);
      setCapability({
        capabilityBlocked: true,
        blocked: [],
        evidence: [],
        modelNote: result.unsupported,
      });
    } else if (result.built) {
      setQuestions(null);
      setPreview({ ...result, ok: true });
      // The builder's suggestion becomes the selection — and is LABELLED
      // as a suggestion in the picker, so it is visibly a proposal.
      setPreviewDepth(parseAgentDepth(result.draft?.config?.depth));
    } else {
      // The builder ran and could not design it. Real tokens were spent,
      // so this is a completed job carrying a refusal. Nothing will render
      // it, so nothing else will ever mark it seen.
      addToast(t("buildError"), "error");
      void markJobConsumed(job.id);
    }
    setJobId(null);
  }, [job, addToast, t]);

  // WHAT MAKES CLOSING THE PAGE SAFE. On mount, ask the server what this
  // account was in the middle of. Nothing is remembered in the browser, so
  // it works in a second tab, in a different browser, and after a cleared
  // cache — all three of which a localStorage id gets wrong.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/jobs?kind=agent_build");
        const data = await response.json();
        if (!cancelled && data.ok && data.job) {
          // The sentence the user typed, back where they typed it. Without
          // it a resumed clarifying-questions round would send the answers
          // with nothing to attach them to.
          const request = (data.job.input as { request?: unknown } | null)?.request;
          if (typeof request === "string" && request.trim()) {
            setRequestText(request);
            setTurns((current) => (current.length ? current : [{ id: "resumed", role: "user", text: request }]));
          }
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
  // EVERY EXIT FROM HERE MARKS THE ROW SEEN: a run's output is saved in
  // the run history, but the row is offered back by /api/jobs until
  // someone says it has been shown.
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
      // switched off server-side, so the message says both.
      addToast(t("runCannotComplete"), "error");
    } else if (!result.ran) {
      addToast(t("runFailed"), "error");
    } else if (result.output) {
      setLastRunOutput(result.output);
      // "Done — 0 credits." is what an owner, a beta tester and anyone
      // else on an unlimited account was told after every run, because the
      // toast read creditsCharged and a bypass account is charged nothing.
      // Zero is arithmetically true and reads as "billing is broken". The
      // number that means something to them is what it WOULD have cost.
      addToast(
        result.usage?.bypass
          ? typeof result.usage.wouldHaveCharged === "number"
            ? t("runSuccessUnlimitedCost", { credits: result.usage.wouldHaveCharged })
            : t("runSuccessUnlimited")
          : t("runSuccess", { credits: result.creditsCharged ?? 0 })
      );
    } else {
      addToast(t("runNothingToReport"));
    }
    // The balance in the top nav is seeded once by the server and held in
    // React state, so a run that spent credits left it showing the OLD
    // number until a full reload. router.refresh() re-renders the server
    // tree but does not reseed that state.
    void refreshCredits();
    setRunJobId(null);
    router.refresh();
  }, [runJob, addToast, t, locale, router, refreshCredits]);

  // A run started before a reload is picked back up the same way a build
  // is — with the agent it belongs to, which the job row carries.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/jobs?kind=agent_run");
        const data = await response.json();
        if (!cancelled && data.ok && data.job) {
          setRunJobId(String(data.job.id));
          const agentId = (data.job.input as { agentId?: unknown } | null)?.agentId;
          if (typeof agentId === "string") setRunAgentId(agentId);
        }
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
        addToast(limitText(data) ?? t("createError"), "error");
        return;
      }
      addToast(t("createSuccess"));
      say("tool", t("createSuccess"));
      resetCreate();
      router.refresh();
    } catch (err) {
      addToast(t("createError"), "error");
    } finally {
      setSavingAgent(false);
    }
  }

  /**
   * LOOKING FOR A READY-MADE ONE, WHILE THE REQUEST SITS ON THE TABLE.
   *
   * Free — the ranking is Postgres full-text over the template library,
   * no model call — and it happens BEFORE the builder runs, because
   * offering a cheaper route after the expensive one has been paid for
   * is offering a refund.
   *
   * Debounced, and last-one-wins for the same reason the command palette
   * is: responses do not arrive in the order they were sent.
   */
  const matchTokenRef = useRef(0);
  useEffect(() => {
    const q = requestText.trim();
    if (q.length < 3 || preview || questions) {
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
        // A library that cannot be reached must not stop somebody building
        // an agent: no matches, and "build a new one" renders anyway.
        if (token === matchTokenRef.current) setMatches([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [requestText, preview, questions]);

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
        addToast(limitText(data) ?? t("templates.adoptError"), "error");
        return;
      }
      addToast(t("templates.adopted", { subject: String(data.subject ?? "") }));
      say("tool", t("templates.adopted", { subject: String(data.subject ?? "") }));
      resetCreate();
      refreshCredits();
      router.refresh();
    } catch (err) {
      addToast(t("templates.adoptError"), "error");
    } finally {
      setAdopting(false);
    }
  }

  // Finished with that result — by «Νέος», or after the agent has been
  // created from the draft. Either way it is marked seen: an explicit
  // discard is marked immediately, rather than waiting for a preview
  // render that is never going to happen again.
  function resetCreate() {
    void markJobConsumed(resultJobId);
    setResultJobId(null);
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
        addToast(limitText(data) ?? t("saveError"), "error");
        return false;
      }
      addToast(successMessage);
      router.refresh();
      return true;
    } catch (err) {
      addToast(t("saveError"), "error");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAgent(id: string) {
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;
    setBusyId(agent.id);
    try {
      const response = await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        addToast(limitText(data) ?? t("saveError"), "error");
        return;
      }
      addToast(t("deleteSuccess"));
      if (selectedId === agent.id) setSelectedId(null);
      router.refresh();
    } catch (err) {
      addToast(t("saveError"), "error");
    } finally {
      setBusyId(null);
    }
  }

  // RUNNING IS A BACKGROUND JOB, for the same reason building is: a
  // search-enabled run plus a retry plus an email is the slowest thing
  // this feature does, and awaiting it meant closing the tab aborted the
  // fetch while the run itself carried on unseen.
  async function runNow(agent: UserAgent, depth: AgentDepth) {
    setLastRunOutput(null);
    showAgent(agent.id);
    setTab("plan");
    try {
      const response = await fetch(`/api/agents/${agent.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        // SENT ONLY WHEN IT DIFFERS from the agent's own — decided by
        // lib/agents/run-depth.ts, the same function that decides what the
        // picker shows, so what is shown and what is sent cannot disagree.
        body: JSON.stringify(runRequestBody(agent, { agentId: agent.id, depth })),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(limitText(data) ?? t("runFailed"), "error");
        return;
      }
      setRunAgentId(agent.id);
      setRunJobId(String(data.jobId));
    } catch (err) {
      addToast(t("runFailed"), "error");
    }
  }

  async function saveSettings(agent: UserAgent) {
    if (!editDraft) return;
    await patchAgent(
      agent,
      {
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
  }

  // ---- the one field -------------------------------------------------

  /**
   * ONE FIELD, TWO MEANINGS, AND THE PLACEHOLDER SAYS WHICH — the same
   * shape presentations-shell.tsx already uses (`editing ? change :
   * write`). With an agent open it writes that agent's task or
   * description, through the PATCH route that the old edit form used;
   * with nothing open it puts a request on the table, and the turn under
   * it offers the ready-made agents and the price of building new.
   *
   * SENDING NEVER SPENDS. Neither branch calls the builder: a press on
   * «Φτιάξε νέο» does, with its price on the button.
   */
  function onSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    say("user", trimmed);
    if (selected) {
      const body = fieldTarget === "task" ? { prompt: trimmed } : { description: trimmed };
      const done = fieldTarget === "task" ? t("shell.taskChanged") : t("shell.descriptionChanged");
      void patchAgent(selected, body, done).then((ok) => {
        if (ok) say("tool", done);
      });
      return;
    }
    setProblem(null);
    setCapability(null);
    setPreview(null);
    setQuestions(null);
    setRequestText(trimmed);
  }

  // ---- the plan ------------------------------------------------------

  /** This agent's own run, or nothing: never another agent's timeline. */
  const ownRunJob = selected && runAgentId === selected.id ? runJob : null;

  const planSteps = useMemo(() => {
    if (!selected) return [];
    const searching = selected.config?.needsWebSearch === true;
    const detailFor: Record<string, string> = {
      preparing: searching ? t("capability.stepSearch") : t("capability.stepNoSearch"),
      working: t("capability.stepWrite"),
      delivering: t("capability.stepDeliver", {
        target: selected.delivery_target || accountEmail,
        when: scheduleLabel(selected.schedule_cron),
      }),
    };
    return JOB_STEPS.agent_run.map((token) => ({
      token,
      label: tSteps(token as never),
      detail: detailFor[token] ?? "",
      state: planStepState(token, ownRunJob?.timeline, runningNow),
    }));
  }, [selected, ownRunJob, runningNow, accountEmail, scheduleLabel, t, tSteps]);

  const stateLabels: Record<StepState, string> = {
    done: t("shell.stateDone"),
    working: t("shell.stateWorking"),
    waiting: t("shell.stateWaiting"),
  };

  const monthlyRuns = editDraft ? RUNS_PER_MONTH[editDraft.parts.frequency] : 0;
  const perRunCredits = editDraft ? (depthFacts[editDraft.depth]?.credits ?? 0) : 0;

  // ---- the thread ----------------------------------------------------

  const previewRuns = preview?.upcomingRuns ?? [];
  const requestOnTable = requestText.trim().length > 0 && !selected;

  const stage = requestOnTable ? (
    <div className="mt-2 space-y-3">
      {/*
        WHAT AN AGENT IS, AT THE MOMENT OF THE DECISION. The reported
        incident started with a user who had no way to know that "runs
        tests and fixes errors" was outside the product — and nothing on
        that screen told them. On the old page this box sat above the
        button; here it sits in the turn, which is the moment the request
        exists and the price is about to be shown.
      */}
      <div className="grid gap-3 rounded-card border border-border bg-panel p-3 sm:grid-cols-2" data-testid="agents-capability-box">
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-success">
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
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-danger">
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
        reassurance boilerplate: it is the difference between this screen
        and the incident that produced it.
      */}
      {capability?.capabilityBlocked && (
        <div className="space-y-2 rounded-card border border-danger/40 bg-danger/[0.06] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <Ban className="h-4 w-4" aria-hidden="true" />
            {t("capability.refusedTitle")}
          </p>
          <p className="text-sm leading-relaxed text-foreground">{t("capability.refusedBody")}</p>
          {capability.modelNote && <p className="text-sm leading-relaxed text-danger/90">{capability.modelNote}</p>}
          {(capability.blocked ?? []).length > 0 && (
            <ul className="space-y-1">
              {(capability.blocked ?? []).map((id) => (
                <li key={id} className="text-xs leading-relaxed text-danger/90">
                  • {t(`capability.cannot.${id}`)}
                </li>
              ))}
            </ul>
          )}
          {(capability.evidence ?? []).length > 0 && (
            <p className="text-[11px] leading-relaxed text-muted">
              {t("capability.detectedIn", { words: (capability.evidence ?? []).map((e) => e.matched).join("; ") })}
            </p>
          )}
          <p className="text-xs font-medium text-success">{t("capability.noCharge")}</p>
          <p className="text-xs leading-relaxed text-muted">{t("capability.tryInstead")}</p>
          <button type="button" onClick={() => setCapability(null)} className="btn-outline min-h-[44px] px-3 py-1.5 text-xs">
            {t("capability.rephrase")}
          </button>
        </div>
      )}

      {/*
        PARTIAL — the counter-offer. Requirement 1γ verbatim: name the part
        that is not supported, say what the agent will do instead, and ask
        whether to continue.
      */}
      {capability?.capabilityPartial && (
        <div className="space-y-2 rounded-card border border-warning/40 bg-warning/[0.06] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {t("capability.partialTitle")}
          </p>
          <ul className="space-y-1">
            {(capability.blocked ?? []).map((id) => (
              <li key={id} className="text-xs leading-relaxed text-warning/90">
                • {t(`capability.cannot.${id}`)}
              </li>
            ))}
          </ul>
          {(capability.doableParts ?? []).length > 0 && (
            <p className="text-sm leading-relaxed text-foreground">
              {t("capability.partialWillDo", { parts: (capability.doableParts ?? []).join("; ") })}
            </p>
          )}
          <p className="text-xs font-medium text-success">{t("capability.noChargeYet")}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setCapability(null);
                void build(requestText, true, true);
              }}
              className="btn-outline min-h-[44px] px-3 py-1.5 text-xs font-semibold"
            >
              {t("capability.partialContinue")}
            </button>
            <button type="button" onClick={() => setCapability(null)} className="btn-outline min-h-[44px] px-3 py-1.5 text-xs">
              {t("capability.rephrase")}
            </button>
          </div>
        </div>
      )}

      {questions && (
        <>
          {/* Questions the user has read are as "seen" as a draft is:
              answering them starts a NEW job, and re-offering the old one
              tomorrow would ask the same thing twice. */}
          <JobSeen jobId={resultJobId} />
          <ClarificationQuestions
            questions={questions}
            suggestions={questionSuggestions}
            submitting={building}
            title={t("clarificationTitle")}
            skipLabel={t("clarificationSkip")}
            continueLabel={t("clarificationContinue")}
            answerPlaceholder={t("clarificationAnswerPlaceholder")}
            onAnswer={(answers) => build(appendClarificationAnswers(requestText, questions, answers), true)}
            onSkip={() => build(requestText, true)}
          />
        </>
      )}

      {preview?.draft && (
        <div className="space-y-3 rounded-card border border-foreground/30 bg-foreground/[0.04] p-4" data-testid="agents-preview">
          {/* THE MOMENT THE USER SEES IT. Inside the preview rather than in
              an effect beside it, so a draft can only be marked seen by
              actually being on the screen. */}
          <JobSeen jobId={resultJobId} />
          <p className="text-sm font-semibold text-foreground">{t("previewTitle")}</p>
          {preview.understood && <p className="text-sm leading-relaxed text-foreground">{preview.understood}</p>}
          {preview.unsupported && (
            <div className="rounded-item border border-warning/40 bg-warning/10 p-2.5">
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning">
                {t("capability.previewWillNotDo")}
              </p>
              <p className="text-xs leading-relaxed text-warning">{preview.unsupported}</p>
            </div>
          )}

          {/*
            WHAT IT WILL ACTUALLY DO, EVERY RUN — in sentences, not in a
            name and a price. The preview used to show what the agent was
            CALLED and left "what does it actually do" to a collapsed
            <details> holding the raw task prompt. A user pressing Create
            was agreeing to a label. These are the three steps
            JOB_STEPS.agent_run declares, in the order the worker runs them.
          */}
          <div className="rounded-item border border-border bg-panel p-2.5">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t("capability.previewWhatItDoes")}
            </p>
            <ol className="space-y-1 text-xs leading-relaxed text-foreground">
              <li>
                1. {preview.draft.config?.needsWebSearch ? t("capability.stepSearch") : t("capability.stepNoSearch")}
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
                {/* THE SELECTED TIER'S PRICE, not the one the builder
                    happened to suggest. Changing the picker below and
                    leaving this line showing the old figure is a quote for
                    something else. */}
                {t("creditsPerRun", {
                  credits: depthFacts[previewDepth]?.credits ?? preview.estimatedCreditsPerRun ?? 0,
                })}
              </dd>
            </div>
          </dl>

          {/* HOW HARD IT WORKS — chosen BEFORE it is created, with every
              option's price beside it. */}
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
          {/* WHERE THE RESULT GOES, decided at creation — not discovered
              later. The reported bug, verbatim: "I made an agent and saw no
              Telegram/Discord/Slack/in-app. Only email." */}
          <DeliveryPicker
            value={isDeliveryChannel(preview.draft.deliveryMethod) ? preview.draft.deliveryMethod : "email"}
            target={preview.draft.deliveryTarget ?? ""}
            accountEmail={accountEmail}
            slackChannels={slackChannels}
            onChange={({ method, target }) =>
              setPreview((current) =>
                current?.draft
                  ? { ...current, draft: { ...current.draft, deliveryMethod: method, deliveryTarget: target } }
                  : current
              )
            }
          />
          {previewRuns.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-muted">{t("previewNextRuns")}</p>
              <ul className="space-y-0.5 text-xs text-foreground">
                {previewRuns.map((iso) => (
                  <li key={iso}>{formatDateTimeInZone(iso, locale, preview.draft?.timezone)}</li>
                ))}
              </ul>
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted">{t("previewTask")}</summary>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed text-foreground">{preview.draft.prompt}</p>
          </details>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={createAgent}
              disabled={savingAgent}
              data-testid="agents-create"
              className="btn-outline min-h-[44px] px-4 py-1.5 text-xs font-semibold"
            >
              {savingAgent ? t("creating") : t("createButton")}
            </button>
            <button
              type="button"
              data-testid="agents-discard"
              onClick={() => {
                // Explicit discard — marked immediately, not on the next
                // render, because there will not be one.
                void markJobConsumed(resultJobId);
                setResultJobId(null);
                setPreview(null);
              }}
              disabled={savingAgent}
              className="btn-outline min-h-[44px] px-4 py-1.5 text-xs"
            >
              {t("discard")}
            </button>
          </div>
        </div>
      )}

      {/* READY-MADE FIRST, BUILD ALWAYS. TemplateMatches renders "build a
          new one" unconditionally — outside its own matches branch — so no
          match, a poor match and a perfect one all leave the same button in
          the same place. */}
      {!questions && !preview && (
        <TemplateMatches
          matches={matches}
          onUse={(match) => void adoptTemplate(match)}
          onBuildNew={() => build(requestText, false)}
          templateCredits={templateCredits}
          buildNewLabel={building ? t("designing") : t("templates.buildNew", { credits: buildCredits })}
          busy={building || adopting}
        />
      )}
      {problem && (
        <ProblemNotice
          code={problem}
          className="w-full"
          onRetry={() => {
            setProblem(null);
            void build(requestText, true);
          }}
          action={problem === "out_of_credits" ? { href: "/pricing", labelKey: "common.viewPlans" } : undefined}
        />
      )}
      {/* Four real steps — understanding, drafting, checking, saving —
          reported by the worker and, until the timeline existed, discarded:
          the button said "Designing…" for all of them. */}
      <AiJobProgress job={job} watchLost={buildWatchLost} className="w-full" />
      <AiJobTimeline job={job} className="mt-1 w-full" />
    </div>
  ) : null;

  const shellTurns: ShellTurn[] = [
    ...turns.map((turn) => ({ id: turn.id, role: turn.role, text: turn.text })),
    ...(stage ? [{ id: "stage", role: "tool" as const, text: "", extra: stage }] : []),
  ];

  // ---- the list ------------------------------------------------------

  const rows: ShellHistoryRow[] = agents.map((agent) => ({
    id: agent.id,
    title: agent.name,
    status: `${scheduleLabel(agent.schedule_cron)} · ${
      agent.status === "active" ? t("statusActive") : agent.status === "paused" ? t("statusPaused") : t("statusDisabled")
    }`,
  }));

  // ---- the work ------------------------------------------------------

  const lastFailure = selectedRuns.find((r) => r.status === "failed" && r.error);

  const work = selected && workOpen
    ? {
        title: selected.name,
        actions: (
          <>
            <span
              data-testid="agents-bar-status"
              data-status={runningNow && runAgentId === selected.id ? "running" : selected.status}
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                selected.status === "active"
                  ? "bg-success/15 text-success"
                  : selected.status === "paused"
                    ? "bg-panel text-muted"
                    : "bg-danger/15 text-danger"
              }`}
            >
              {runningNow && runAgentId === selected.id
                ? t("runRunning")
                : selected.status === "active"
                  ? t("statusActive")
                  : selected.status === "paused"
                    ? t("statusPaused")
                    : t("statusDisabled")}
            </span>
            {/* THE LABEL IS THE FIRST THING TO GO ON A PHONE. The work
                area's bar is one flex row: a back button, the title at
                `min-w-0 flex-1 break-words`, these three, and a close.
                Three labelled controls at 390px left the title about
                twenty pixels, and `break-words` then broke «Πρωινά νέα
                Nvidia» to ONE LETTER PER LINE — the exact shape
                tool-shell.tsx's own comment records from Image Κομμάτι 2,
                here pushing the whole bar 340px down the screen. Seen on
                this piece's first phone screenshot, 2026-10-31. The icon
                and its aria-label carry the press below `sm`; the words
                come back as soon as there is room for them. */}
            <button
              type="button"
              onClick={() => void runNow(selected, effectiveRunDepth(selected, runOverride))}
              disabled={busyId === selected.id || runningNow}
              aria-label={t("menuRunNow")}
              title={t("menuRunNow")}
              data-testid="agents-run-now"
              className={`${ACTION} w-auto gap-1.5 px-2 disabled:opacity-40 sm:px-3`}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              <span className="hidden text-xs sm:inline">{t("menuRunNow")}</span>
            </button>
            {/* THE SCREEN'S ONE WHITE BUTTON, and the thing the whole
                screen is about: whether this agent runs on its schedule or
                not. scripts/tests/one-primary-action.test.mjs carries the
                raised baseline and the reason. */}
            <button
              type="button"
              onClick={() =>
                void patchAgent(
                  selected,
                  { status: selected.status === "active" ? "paused" : "active" },
                  selected.status === "active" ? t("pauseSuccess") : t("resumeSuccess")
                )
              }
              disabled={busyId === selected.id}
              data-testid="agents-toggle"
              aria-label={selected.status === "active" ? t("menuPause") : t("menuResume")}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-card bg-button px-2.5 text-sm font-semibold text-button-ink transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
            >
              {selected.status === "active" ? (
                <Pause className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{selected.status === "active" ? t("menuPause") : t("menuResume")}</span>
            </button>
          </>
        ),
        body: (
          /*
            TWO SCROLLING COLUMNS ON A COMPUTER, ONE SCROLLING PAGE ON A
            PHONE — and the second half is not a nicety.
            `flex h-full flex-col` with a `shrink-0` panel inside it gives
            the panel its full natural height and leaves the centre column
            whatever is left; this panel is six rows, three pickers, a
            schedule editor, a Save and a share block, so on a 390x844
            screen "whatever is left" was nothing. The tab row was pushed
            out of the viewport entirely and the panel sat over the place
            it had been: tapping «Inbox» reached the panel instead
            (Playwright: "subtree intercepts pointer events"). Found
            2026-10-31 by this piece's own prodtest, phone pass only.
            So the height and the inner scrollers are `lg:` only, and
            below that the shell's own work scroller
            (components/shell/tool-shell.tsx, `min-h-0 flex-1
            overflow-y-auto`) carries both columns as one page.
          */
          <div className="flex flex-col gap-4 lg:h-full lg:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-4 lg:overflow-y-auto">
              <div role="tablist" aria-label={t("shell.tabsLabel")} className="flex gap-1.5">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "plan"}
                  onClick={() => setTab("plan")}
                  data-testid="agents-tab-plan"
                  className={`${OPTION} ${tab === "plan" ? "bg-panel-hover" : ""}`}
                >
                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("shell.tabPlan")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "inbox"}
                  onClick={() => setTab("inbox")}
                  data-testid="agents-tab-inbox"
                  className={`${OPTION} ${tab === "inbox" ? "bg-panel-hover" : ""}`}
                >
                  <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("shell.tabInbox")}
                </button>
              </div>

              {/* WHY IT DIED, AND THAT IT IS DYING — V4.6. Two gaps, both
                  silent. An agent at three failures of five showed NOTHING:
                  consecutive_failures was rendered only once the agent was
                  already off. And the disabled notice gave a COUNT without
                  saying what went wrong — the reason existed and went only
                  into an email. The last failed run already carries it. */}
              {selected.status === "disabled" ? (
                <div className="rounded-item border border-danger/40 bg-danger/10 p-2.5 text-xs leading-relaxed text-danger">
                  <p>{t("disabledExplanation", { failures: selected.consecutive_failures })}</p>
                  {lastFailure?.error && <p className="mt-1.5 text-danger/90">{t("disabledReason", { reason: lastFailure.error })}</p>}
                </div>
              ) : selected.consecutive_failures > 0 ? (
                <div className="rounded-item border border-warning/40 bg-warning/10 p-2.5 text-xs leading-relaxed text-warning">
                  <p>{t("failingWarning", { failures: selected.consecutive_failures, max: AGENT_MAX_CONSECUTIVE_FAILURES })}</p>
                  {lastFailure?.error && <p className="mt-1.5 text-warning/80">{t("disabledReason", { reason: lastFailure.error })}</p>}
                </div>
              ) : null}

              {tab === "plan" ? (
                <>
                  <div data-testid="agents-plan">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("capability.previewWhatItDoes")}
                    </p>
                    <ol className="space-y-2">
                      {planSteps.map((step) => (
                        <PlanBox
                          key={step.token}
                          label={step.label}
                          detail={step.detail}
                          state={step.state}
                          stateLabel={stateLabels[step.state]}
                        />
                      ))}
                    </ol>
                    {!ownRunJob && <p className="mt-2 text-[11px] leading-relaxed text-muted">{t("shell.noRunYet")}</p>}
                  </div>

                  {ownRunJob && (ownRunJob.status === "queued" || ownRunJob.status === "running") && (
                    <div className="rounded-card border border-foreground/25 bg-foreground/5 px-3 py-2">
                      <AiJobProgress job={ownRunJob} watchLost={runWatchLost} />
                      <AiJobTimeline job={ownRunJob} className="mt-1" />
                    </div>
                  )}
                  {ownRunJob && (ownRunJob.status === "done" || ownRunJob.status === "failed") && (
                    <AiJobTimeline job={ownRunJob} />
                  )}

                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground" data-testid="agents-task">
                    {selected.prompt}
                  </p>

                  {lastRunOutput && (
                    <div className="rounded-card border border-success/30 bg-success/[0.05] p-3">
                      <p className="mb-1.5 text-xs font-semibold text-success">{t("latestOutput")}</p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{lastRunOutput}</p>
                      {/* An agent that ran while nobody was looking is
                          exactly the summary somebody wants read to them. */}
                      <div className="mt-2">
                        <VoicePlayer text={lastRunOutput} compact />
                      </div>
                    </div>
                  )}

                  <div data-testid="agents-history">
                    <h3 className="mb-2 text-xs font-semibold text-muted">{t("historyTitle")}</h3>
                    {selectedRuns.length === 0 ? (
                      <p className="text-xs text-muted">{t("historyEmpty")}</p>
                    ) : (
                      <ul className="space-y-2">
                        {selectedRuns.map((run) => (
                          <li key={run.id} className="surface-tight">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              {/* 'queued' IS ITS OWN STATE, not a flavour of
                                  running (V4 #13): a run submitted to the
                                  batch API is waiting in somebody else's
                                  queue, and showing "Running" for up to 24
                                  hours would simply be untrue. */}
                              <span
                                className={`text-xs font-medium ${
                                  run.status === "success"
                                    ? "text-success"
                                    : run.status === "failed"
                                      ? "text-danger"
                                      : run.status === "queued"
                                        ? "text-muted"
                                        : "text-warning"
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
                            {run.error && <p className="mt-1.5 text-xs text-danger">{run.error}</p>}
                            {run.status === "queued" && <p className="mt-1.5 text-xs text-muted">{t("runQueuedHint")}</p>}
                            {run.status === "success" && !run.output && (
                              <p className="mt-1.5 text-xs text-muted">{t("runNothingToReport")}</p>
                            )}
                            {run.output && (
                              <details className="mt-1.5">
                                <summary className="cursor-pointer text-xs text-muted">{t("viewOutput")}</summary>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{run.output}</p>
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
              ) : (
                /*
                  THE INBOX IS BUILT AND EMPTY, AND SAYS WHY FOR EACH HALF.
                  «Όσα έλαβε» needs an address of its own, which Κομμάτι 5
                  of the directive is; «όσα περιμένουν έγκριση» needs an
                  action that is not reversible, which this agent does not
                  take (it searches, writes, and sends to the one channel
                  its owner chose) and which Κομμάτι 3 is. Two honest empty
                  halves beat one fabricated list.
                */
                <div className="space-y-4" data-testid="agents-inbox">
                  <div>
                    <h3 className="mb-1 text-xs font-semibold text-muted">{t("shell.inboxReceived")}</h3>
                    <p className="text-xs leading-relaxed text-muted" data-testid="agents-inbox-received-empty">
                      {t("shell.inboxReceivedNone")}
                    </p>
                  </div>
                  <div>
                    <h3 className="mb-1 text-xs font-semibold text-muted">{t("shell.inboxApprovals")}</h3>
                    <p className="text-xs leading-relaxed text-muted" data-testid="agents-inbox-approvals-empty">
                      {t("shell.inboxApprovalsNone")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* THE PANEL THE DIRECTIVE ASKS FOR, in the order it asks:
                name, email, tools and connections, credit limits,
                schedule, approval rules. */}
            {editDraft && (
              <div className="w-full space-y-4 lg:w-72 lg:shrink-0 lg:overflow-y-auto" data-testid="agents-settings-panel">
                <div>
                  <p className="text-xs font-medium text-muted">{t("nameLabel")}</p>
                  <p className="break-words text-sm text-foreground">{selected.name}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{t("shell.renameHint")}</p>
                </div>

                <div data-testid="agents-panel-email">
                  <p className="text-xs font-medium text-muted">{t("shell.ownEmail")}</p>
                  <p className="text-[11px] leading-relaxed text-muted">{t("shell.ownEmailNone")}</p>
                </div>

                <div data-testid="agents-panel-tools">
                  <p className="mb-1.5 text-xs font-medium text-foreground">{t("shell.toolsTitle")}</p>
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input type="checkbox" checked={editDraft.needsWebSearch} onChange={(e) => setEditDraft({ ...editDraft, needsWebSearch: e.target.checked })} />
                    {t("webSearchLabel")}
                  </label>
                  <div className="mt-2">
                    <DeliveryPicker
                      value={editDraft.deliveryMethod}
                      target={editDraft.deliveryTarget}
                      accountEmail={accountEmail}
                      slackChannels={slackChannels}
                      onChange={({ method, target }) => setEditDraft({ ...editDraft, deliveryMethod: method, deliveryTarget: target })}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{t("shell.toolsNone")}</p>
                </div>

                <div data-testid="agents-panel-caps">
                  <p className="mb-1.5 text-xs font-medium text-foreground">{t("shell.capsTitle")}</p>
                  {/* THE COST, LABELLED AS COST. Both figures are derived
                      where they print: the per-run one is depthFacts, priced
                      on the server by the same function that sizes the hold
                      (app/dashboard/agents/page.tsx), and the monthly one is
                      that times how often this schedule fires. Neither is a
                      limit, and the line under them says so rather than
                      letting a reader assume a cap exists. */}
                  <dl className="space-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">{t("shell.capPerRun")}</dt>
                      <dd className="text-foreground" data-testid="agents-cap-run">{t("runCredits", { credits: perRunCredits })}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">{t("shell.capPerMonth")}</dt>
                      <dd className="text-foreground" data-testid="agents-cap-month">
                        {t("shell.capPerMonthValue", { credits: perRunCredits * monthlyRuns, runs: monthlyRuns })}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                    {t("shell.capNoHardStop", { max: AGENT_MAX_CONSECUTIVE_FAILURES })}
                  </p>
                  <div className="mt-2 space-y-2">
                    <p className="text-xs font-medium text-foreground">{t("depth.legend")}</p>
                    <DepthPicker value={editDraft.depth} onChange={(depth) => setEditDraft({ ...editDraft, depth })} facts={depthFacts} disabled={busyId === selected.id} compact />
                  </div>
                  {/* ONE RUN, DEEPER — requirement (δ). Changing this does
                      NOT change the agent: the next scheduled run still uses
                      the tier in its config, which is why the label says
                      "this run". */}
                  <div className="mt-2 space-y-1.5">
                    <p className="text-xs font-medium text-foreground">{t("depth.runOnce")}</p>
                    <p className="text-[11px] leading-relaxed text-muted">
                      {t("depth.runOnceHint", { depth: t(`depth.${parseAgentDepth(selected.config?.depth)}.title`) })}
                    </p>
                    <DepthPicker
                      value={effectiveRunDepth(selected, runOverride)}
                      onChange={(depth) => setRunOverride({ agentId: selected.id, depth })}
                      facts={depthFacts}
                      disabled={runningNow || busyId === selected.id}
                      compact
                    />
                  </div>
                </div>

                <div data-testid="agents-panel-schedule">
                  <p className="mb-1.5 text-xs font-medium text-foreground">{t("shell.scheduleTitle")}</p>
                  <ScheduleEditor parts={editDraft.parts} onChange={(parts) => setEditDraft({ ...editDraft, parts })} />
                  <p className="mt-1.5 text-[11px] text-muted">
                    {t("nextRunPreview", {
                      when:
                        nextRuns(partsToCron(editDraft.parts), new Date(), selected.timezone, 1)
                          .map((d) => formatDateTimeInZone(d, locale, selected.timezone))
                          .join("") || "—",
                    })}
                  </p>
                </div>

                <div data-testid="agents-panel-approvals">
                  <p className="text-xs font-medium text-foreground">{t("shell.approvalsTitle")}</p>
                  <p className="text-[11px] leading-relaxed text-muted">{t("shell.approvalsNone")}</p>
                </div>

                <button
                  type="button"
                  onClick={() => void saveSettings(selected)}
                  disabled={busyId === selected.id}
                  data-testid="agents-save-settings"
                  className="btn-outline min-h-[44px] w-full px-4 py-1.5 text-xs font-semibold"
                >
                  {busyId === selected.id ? t("saving") : t("saveButton")}
                </button>

                {/* OPT-IN SHARING. Collapsed, never pre-ticked, and it
                    shows the exact sentence that would be published before
                    anybody agrees to publish it. */}
                <ShareTemplate agentId={selected.id} prompt={selected.prompt} />
              </div>
            )}
          </div>
        ),
      }
    : null;

  return (
    <ToolShell
      name={tNames("agents")}
      turns={shellTurns}
      placeholder={
        selected
          ? fieldTarget === "task"
            ? t("shell.placeholderTask")
            : t("shell.placeholderDescription")
          : t("requestPlaceholder")
      }
      sending={building || adopting || savingAgent || busyId !== null}
      onSend={onSend}
      options={[
        ...(selected
          ? [
              // FLEX-WRAP ON THE INNER SPAN TOO, not only on the row
              // that holds it. The options row is `flex flex-wrap`, and
              // wrapping there moves whole items — so this one item, a
              // label plus two chips with nothing allowed to wrap inside
              // it, kept its intrinsic width and simply overflowed the
              // conversation column to the right. On a computer that put
              // «Περιγραφή» physically underneath the work pane, which
              // swallowed the press: found 2026-10-31 by this piece's own
              // prodtest, which could click the chip's coordinates and
              // reach the work area instead (Playwright: "subtree
              // intercepts pointer events").
              <span key="target" className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted">{t("shell.fieldTarget")}</span>
                <button
                  type="button"
                  aria-pressed={fieldTarget === "task"}
                  onClick={() => setFieldTarget("task")}
                  data-testid="agents-target-task"
                  className={`${OPTION} ${fieldTarget === "task" ? "bg-panel-hover" : ""}`}
                >
                  {t("taskLabel")}
                </button>
                <button
                  type="button"
                  aria-pressed={fieldTarget === "description"}
                  onClick={() => setFieldTarget("description")}
                  data-testid="agents-target-description"
                  className={`${OPTION} ${fieldTarget === "description" ? "bg-panel-hover" : ""}`}
                >
                  {t("descriptionLabel")}
                </button>
              </span>,
            ]
          : []),
      ]}
      footer={
        <>
          {selected && !workOpen && (
            <ChosenBox label={selected.name} onClear={() => setSelectedId(null)} />
          )}
          <p className="mt-1.5 text-[11px] text-muted" data-testid="agents-cap-meta">
            {t("agentsUsed", { used: activeCount, cap: agentCap })}
            {agents.length > activeCount && (
              <span data-testid="agents-total-meta">
                {" · "}
                {t("agentsTotal", { total: agents.length })}
              </span>
            )}
            {atCapacity && <span data-testid="agents-at-capacity">{" · "}{t("shell.atCapacity")}</span>}
          </p>
          {/* WHAT IT DOES NOT DO, as one line rather than a box — the same
              honest half ExamplePrompts carried on the old screen, from the
              same message key, so the two cannot drift apart. */}
          <p className="mt-1 text-[11px] leading-relaxed text-muted" data-testid="agents-limits">
            {tExamples("limits")}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted" data-testid="agents-delivery-note">
            {t("deliveryNote", { email: accountEmail })}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted" data-testid="agents-ai-disclosure">
            {aiDisclosure}
          </p>
          {capped && (
            <div className="mt-1.5">
              <ListCappedNotice cap={cap} />
            </div>
          )}
        </>
      }
      empty={{
        // THE REGISTRY'S OWN TWO KEYS (lib/list-empty-states.ts): the
        // heading is the owner's own question, the sentence under it is
        // the one that already explained what a scheduled agent is for,
        // and the three examples are the shared AI chips — the same
        // strings the old screen's <ExamplePrompts> drew, now sent
        // through the shell's one field.
        heading: t("empty.title"),
        why: t("empty.why"),
        examples: exampleKeys("agents").map((key) => ({ key, label: tExamples(key as never) })),
      }}
      history={{
        open: historyOpen,
        onToggle: () => setHistoryOpen((open) => !open),
        onNew: () => {
          setSelectedId(null);
          setWorkOpen(false);
          resetCreate();
          setTurns([]);
        },
        newLabel: t("newAgent"),
        column: (
          <ShellHistoryColumn
            rows={rows}
            activeId={selectedId}
            onOpen={(id) => showAgent(id)}
            onDelete={deleteAgent}
            onRename={async (id, title) => {
              const agent = agents.find((a) => a.id === id);
              if (agent) await patchAgent(agent, { name: title }, t("updateSuccess"));
            }}
            onNavigate={() => setHistoryOpen(false)}
            linkTable="user_agents"
          />
        ),
      }}
      work={work}
      onCloseWork={hideWork}
    />
  );
}
