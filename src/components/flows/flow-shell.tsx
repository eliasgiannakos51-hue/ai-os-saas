"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FolderOpen, Lightbulb } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { LargeActionConfirm } from "@/components/credits/cost-estimate";
import { useCredits } from "@/components/credits/credits-context";
import { ToolShell, OPTION, type ShellTurn } from "@/components/shell/tool-shell";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import { FlowProgress, PlanCard, useFlowWords, type StepView } from "@/components/flows/flow-plan";
import { needsLargeActionConfirmation } from "@/lib/billing/credit-formula";
import { DEFAULTS } from "@/lib/billing/pricing-config";
import { LIBRARY_SOURCES } from "@/lib/library/sources";
import { DEFAULT_FLOW_COLOUR, briefFor } from "@/lib/flows/brief";
import type { FlowPrices } from "@/lib/flows/flow-pricing";
import { runStep } from "@/lib/flows/run-step";
import {
  MAX_FLOW_SAID,
  STEP_TABLE,
  planFlow,
  readPlan,
  readStepStates,
  readySteps,
  withoutUnavailable,
  type FlowKind,
  type FlowPlan,
  type StepState,
} from "@/lib/flows/plan";

/**
 * ONE SENTENCE, SEVERAL TOOLS, ONE PROJECT (MASTER 6.1, 6.3; MASTER 16
 * package 36), behind the switch "flows", on the Projects page.
 *
 * «Φτιάξε site για το camping μου, με εικόνες, και posts για να το
 * ανακοινώσω» is answered with the PLAN: the steps, the price of each, the
 * total, the one colour the site and the pictures share (from memory when
 * the business has one), and — for an analysis — the file, read first so
 * its price is known. Nothing starts before «Έγκριση». Then the project
 * is made, and each step runs through its own tool's requests
 * (lib/flows/run-step.ts): side by side where nothing waits, the deck
 * after the research it is made from. Every result goes into the project
 * as it is made, and the pane beside says where each step stands.
 *
 * A flow left half-way is still on this page: a site or a research that
 * was running is followed again from its row, and a step that was cut off
 * says so, with the press that runs it again.
 */
type Draft = {
  said: string;
  plan: FlowPlan & { unavailable: FlowKind[] };
  colour: string;
  file: { name: string } | null;
  analysisRow: string | null;
  analysisPrice: number | null;
  approved: boolean;
};
type Flow = {
  id: string;
  projectId: string;
  projectName: string;
  said: string;
  colour: string | null;
  plan: FlowPlan;
  states: Record<string, StepState>;
};
type Turn = { id: string; role: "user" | "tool"; text: string; draft?: string; flow?: string };
type Open = "flow" | "mine" | "examples" | null;

/** A project in «Τα έργα μου»: its name and how many things are in it. */
export type FlowProject = { id: string; name: string; memberCount: number };

export type FlowRow = { id: string; project_id: string; said: string; colour: string | null; plan: unknown; steps: unknown; status: string; project_name: string };

export function FlowShell({
  initialFlows,
  projects,
  prices,
  available,
  brandColour,
}: {
  initialFlows: FlowRow[];
  projects: FlowProject[];
  prices: FlowPrices;
  available: Record<FlowKind, boolean>;
  /** The business's colour from memory, when there is one. */
  brandColour: string | null;
}) {
  const { t, kind, notYet } = useFlowWords();
  const tProjects = useTranslations("projects");
  const locale = useLocale();
  const router = useRouter();
  const { refresh: refreshCredits } = useCredits();
  const composerRef = useRef<ChatComposerHandle>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [flows, setFlows] = useState<Record<string, Flow>>(() =>
    Object.fromEntries(
      initialFlows.map((row) => {
        const plan = readPlan(row.plan);
        return [row.id, { id: row.id, projectId: row.project_id, projectName: row.project_name, said: row.said, colour: row.colour, plan, states: readStepStates(row.steps, plan) }];
      })
    )
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ credits: number; go: () => void } | null>(null);
  // What THIS screen is running now, so a step is never started twice from here.
  const runningHere = useRef(new Set<string>());
  const flowsRef = useRef(flows);
  flowsRef.current = flows;
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  function say(role: Turn["role"], text: string, extra: Partial<Turn> = {}) {
    setTurns((prev) => [...prev, { id: `${role}${prev.length}`, role, text, ...extra }]);
  }

  const stepPrice = (draft: Draft, id: string, k: FlowKind, after: string[]): number | null =>
    k === "analysis" ? draft.analysisPrice : k === "slides" && after.includes("research") ? prices.slidesFromResearch : prices[k as Exclude<FlowKind, "analysis">];
  const totalOf = (draft: Draft) => draft.plan.steps.reduce((sum, s) => sum + (stepPrice(draft, s.id, s.kind, s.after) ?? 0), 0);

  function hrefOf(k: FlowKind, row: string): string | null {
    if (k === "images") return `/dashboard/images?record=${encodeURIComponent(row)}`;
    return LIBRARY_SOURCES.find((s) => s.table === STEP_TABLE[k])?.hrefFor(row) ?? null;
  }

  async function report(flowId: string, step: string, body: Record<string, unknown>): Promise<{ ok: boolean; code?: string; states?: Record<string, StepState> }> {
    try {
      const response = await fetch(`/api/flows/${flowId}/steps`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step, ...body }) });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; code?: string; steps?: unknown } | null;
      if (data?.ok && data.steps) {
        const flow = flowsRef.current[flowId];
        const states = flow ? readStepStates(data.steps, flow.plan) : {};
        // Into the ref AT ONCE, not on the next render: advance() reads it
        // the moment this step ends, and a deck waiting for its research
        // would otherwise see the research still running, and never start.
        if (flow && mounted.current) {
          flowsRef.current = { ...flowsRef.current, [flowId]: { ...flow, states } };
          setFlows(flowsRef.current);
        }
        return { ok: true, states };
      }
      return { ok: false, code: data?.code ?? "failed" };
    } catch {
      return { ok: false, code: "offline" };
    }
  }

  /** Runs every step that may run now, and again whenever one finishes. */
  function advance(flowId: string, startedRows: Record<string, string> = {}) {
    const flow = flowsRef.current[flowId];
    if (!flow) return;
    const done = new Set(Object.entries(flow.states).filter(([, s]) => s.status === "done").map(([k]) => k));
    const started = new Set([...Object.keys(flow.states), ...[...runningHere.current].filter((k) => k.startsWith(`${flowId}:`)).map((k) => k.slice(flowId.length + 1))]);
    for (const step of readySteps(flow.plan, done, started)) void runOne(flowId, step.id, startedRows[step.id] ?? null, false);
  }

  async function runOne(flowId: string, stepId: string, startedRow: string | null, follow: boolean) {
    const key = `${flowId}:${stepId}`;
    if (runningHere.current.has(key)) return;
    runningHere.current.add(key);
    try {
      const flow = flowsRef.current[flowId];
      const step = flow?.plan.steps.find((s) => s.id === stepId);
      if (!flow || !step) return;
      if (!follow) {
        // CLAIMED FIRST: a second screen on the same flow is told it runs here.
        const claim = await report(flowId, stepId, { status: "running", ...(startedRow ? { row: startedRow } : {}) });
        if (!claim.ok) return;
      }
      const outcome = await runStep({
        kind: step.kind,
        brief: briefFor(step.kind, flow.said, flow.colour),
        name: flow.projectName,
        locale,
        researchId: flowsRef.current[flowId]?.states.research?.row ?? null,
        startedRow,
        onStarted: (row) => void report(flowId, stepId, { status: "running", row }),
        alive: () => mounted.current,
      });
      if (!mounted.current) return;
      void refreshCredits();
      await report(flowId, stepId, outcome.ok ? { status: "done", row: outcome.row } : { status: "failed", error: outcome.error });
      router.refresh();
    } finally {
      runningHere.current.delete(key);
      if (mounted.current) advance(flowId);
    }
  }

  // A FLOW LEFT HALF-WAY: what was running on the server is followed again
  // from its row; what was cut off waits for its own press; the rest goes on.
  useEffect(() => {
    for (const flow of Object.values(flowsRef.current)) {
      for (const step of flow.plan.steps) {
        const state = flow.states[step.id];
        if (state?.status === "running" && state.row && (step.kind === "site" || step.kind === "research")) void runOne(flow.id, step.id, state.row, true);
      }
      advance(flow.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function retry(flowId: string, stepId: string) {
    const marked = await report(flowId, stepId, { status: "failed", error: "interrupted" });
    if (marked.ok || marked.code === "already_done") void runOne(flowId, stepId, null, false);
  }

  function send(text: string) {
    const said = text.trim().slice(0, MAX_FLOW_SAID);
    if (!said) return;
    say("user", said);
    const plan = withoutUnavailable(planFlow(said), (k) => available[k]);
    if (plan.steps.length === 0) {
      if (plan.notYet.length > 0) say("tool", t("notYet", { names: plan.notYet.map((n) => notYet[n]).join(", ") }));
      else if (plan.unavailable.length > 0) say("tool", t("unavailable", { names: plan.unavailable.map((k) => kind[k]).join(", ") }));
      else say("tool", t("nothing"));
      return;
    }
    const id = `d${Date.now()}`;
    setDrafts((prev) => ({ ...prev, [id]: { said, plan, colour: brandColour ?? DEFAULT_FLOW_COLOUR, file: null, analysisRow: null, analysisPrice: null, approved: false } }));
    say("tool", t("planIntro"), { draft: id });
  }

  async function pickFile(draftId: string, file: File) {
    setFileBusy(draftId);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/data-analysis/upload", { method: "POST", body: form });
      const data = (await response.json().catch(() => null)) as { id?: string } | null;
      if (!response.ok || !data?.id) {
        say("tool", t("errors.file"));
        return;
      }
      const priced = await fetch(`/api/data-analysis/${data.id}/price`).then((r) => r.json()).catch(() => null);
      const credits = typeof priced?.credits === "number" ? priced.credits : null;
      if (credits === null) {
        say("tool", t("errors.file"));
        return;
      }
      setDrafts((prev) => ({ ...prev, [draftId]: { ...prev[draftId], file: { name: file.name }, analysisRow: data.id!, analysisPrice: credits } }));
    } catch {
      say("tool", t("errors.offline"));
    } finally {
      setFileBusy(null);
    }
  }

  async function approve(draftId: string) {
    const draft = drafts[draftId];
    if (!draft || draft.approved) return;
    setBusy(draftId);
    try {
      const response = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ said: draft.said, colour: draft.plan.steps.some((s) => s.kind === "site" || s.kind === "images") ? draft.colour : null }),
      });
      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok || !data?.ok) {
        const code = String(data?.code ?? "");
        say("tool", code === "project_limit_reached" ? t("errors.projectLimit", { limit: Number(data?.limit ?? 0) }) : code === "rate_limited" ? t("errors.rateLimited") : t("errors.failed"));
        return;
      }
      const row = data.flow as { id: string; project_id: string; said: string; colour: string | null; plan: unknown; steps: unknown };
      const project = data.project as { id: string; name: string };
      const plan = readPlan(row.plan);
      const flow: Flow = { id: row.id, projectId: project.id, projectName: project.name, said: row.said, colour: row.colour, plan, states: {} };
      flowsRef.current = { ...flowsRef.current, [flow.id]: flow };
      setFlows(flowsRef.current);
      setDrafts((prev) => ({ ...prev, [draftId]: { ...prev[draftId], approved: true } }));
      say("tool", t("started", { name: project.name }), { flow: flow.id });
      setOpenId(flow.id);
      setOpen("flow");
      advance(flow.id, draft.analysisRow ? { analysis: draft.analysisRow } : {});
    } catch {
      say("tool", t("errors.offline"));
    } finally {
      setBusy(null);
    }
  }

  function withConfirm(credits: number, go: () => void) {
    if (needsLargeActionConfirmation(credits, DEFAULTS)) setConfirming({ credits, go });
    else go();
  }

  const shellTurns: ShellTurn[] = turns.map((turn) => {
    const draft = turn.draft ? drafts[turn.draft] : undefined;
    if (draft && turn.draft) {
      const id = turn.draft;
      return {
        id: turn.id,
        role: turn.role,
        text: turn.text,
        extra: (
          <PlanCard
            steps={draft.plan.steps}
            prices={Object.fromEntries(draft.plan.steps.map((s) => [s.id, stepPrice(draft, s.id, s.kind, s.after)]))}
            total={totalOf(draft)}
            unavailable={draft.plan.unavailable}
            colour={draft.colour}
            colourFromMemory={brandColour !== null && draft.colour === brandColour}
            onColour={(hex) => setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], colour: hex } }))}
            file={draft.file}
            fileBusy={fileBusy === id}
            onFile={(file) => void pickFile(id, file)}
            approved={draft.approved}
            busy={busy === id}
            onApprove={() => withConfirm(totalOf(draft), () => void approve(id))}
          />
        ),
      };
    }
    const flow = turn.flow ? flows[turn.flow] : undefined;
    return flow
      ? { id: turn.id, role: turn.role, text: turn.text, card: { title: flow.projectName, open: open === "flow" && openId === flow.id, onOpen: () => { setOpenId(flow.id); setOpen("flow"); } } }
      : { id: turn.id, role: turn.role, text: turn.text };
  });

  const shown = openId ? flows[openId] : undefined;
  const runningFlows = Object.values(flows).filter((f) => f.plan.steps.some((s) => f.states[s.id]?.status !== "done" && f.states[s.id]?.status !== "failed"));
  const work =
    open === "flow" && shown
      ? {
          title: shown.projectName,
          body: (
            <FlowProgress
              projectHref={`/dashboard/projects/${encodeURIComponent(shown.projectId)}`}
              onRetry={(stepId) => void retry(shown.id, stepId)}
              steps={shown.plan.steps.map((s): StepView => {
                const state = shown.states[s.id] ?? null;
                const here = runningHere.current.has(`${shown.id}:${s.id}`);
                return {
                  ...s,
                  state,
                  href: state?.status === "done" && state.row ? hrefOf(s.kind, state.row) : null,
                  // Cut off: it says running, nothing here runs it, and nothing on the server would.
                  retry: !here && ((state?.status === "running" && !(state.row && (s.kind === "site" || s.kind === "research"))) || state?.status === "failed"),
                };
              })}
            />
          ),
        }
      : open === "mine"
        ? {
            title: t("mine"),
            body: (
              <div className="space-y-4">
                {runningFlows.length > 0 && (
                  <ul data-testid="flow-running" className="space-y-2">
                    {runningFlows.map((f) => (
                      <li key={f.id}>
                        <button type="button" onClick={() => { setOpenId(f.id); setOpen("flow"); }} className="flex min-h-[44px] w-full items-center gap-2 rounded-item bg-panel px-3 py-2 text-start text-sm text-foreground hover:bg-panel-hover">
                          <ThinkingIndicator size="sm" />
                          <span className="min-w-0 flex-1 break-words">{f.projectName}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {projects.length === 0 ? (
                  <p className="text-xs text-muted">{tProjects("list.empty")}</p>
                ) : (
                  <ul data-testid="flow-projects" className="space-y-2">
                    {projects.map((p) => (
                      <li key={p.id}>
                        <Link href={`/dashboard/projects/${encodeURIComponent(p.id)}`} className="flex min-h-[44px] w-full items-center gap-3 rounded-item bg-panel px-3 py-2 text-sm text-foreground hover:bg-panel-hover">
                          <span className="min-w-0 flex-1 break-words">{p.name}</span>
                          <span className="shrink-0 text-xs text-muted">{tProjects("list.members", { count: p.memberCount })}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ),
          }
        : open === "examples"
          ? {
              title: t("examples"),
              body: (
                <ul data-testid="flow-examples" className="space-y-2">
                  {[t("example.research"), t("example.site"), t("example.analysis")].map((example) => (
                    <li key={example}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(null);
                          composerRef.current?.setText(example);
                          composerRef.current?.focus();
                        }}
                        className="flex min-h-[44px] w-full items-center rounded-item bg-panel px-3 py-2 text-start text-sm text-foreground hover:bg-panel-hover"
                      >
                        {example}
                      </button>
                    </li>
                  ))}
                </ul>
              ),
            }
          : null;

  return (
    <>
      <ToolShell
        ref={composerRef}
        name={t("name")}
        turns={shellTurns}
        working={busy ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <ThinkingIndicator size="sm" />
            {t("approving")}
          </span>
        ) : null}
        placeholder={t("placeholder")}
        sending={false}
        onSend={send}
        options={[
          <button key="mine" type="button" onClick={() => setOpen((v) => (v === "mine" ? null : "mine"))} aria-pressed={open === "mine"} data-testid="flow-mine" className={OPTION}>
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
            {runningFlows.length > 0 ? t("mineRunning", { count: runningFlows.length }) : t("mine")}
          </button>,
          <button key="examples" type="button" onClick={() => setOpen((v) => (v === "examples" ? null : "examples"))} aria-pressed={open === "examples"} data-testid="flow-examples-open" className={OPTION}>
            <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
            {t("examples")}
          </button>,
        ]}
        footer={turns.length === 0 ? <p className="mt-1.5 text-[11px] text-muted">{t("help")}</p> : null}
        work={work}
        onCloseWork={() => setOpen(null)}
      />
      {confirming && (
        <LargeActionConfirm
          credits={confirming.credits}
          onConfirm={() => {
            const go = confirming.go;
            setConfirming(null);
            go();
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}
