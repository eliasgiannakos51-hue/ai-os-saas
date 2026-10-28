"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { LargeActionConfirm } from "@/components/credits/cost-estimate";
import { useCredits } from "@/components/credits/credits-context";
import { PlanCard, FlowProgress, useFlowWords, type StepView } from "@/components/flows/flow-plan";
import type { FlowRow } from "@/lib/flows/plan";
import { needsLargeActionConfirmation } from "@/lib/billing/credit-formula";
import { DEFAULTS } from "@/lib/billing/pricing-config";
import { LIBRARY_SOURCES } from "@/lib/library/sources";
import { DEFAULT_FLOW_COLOUR, briefFor } from "@/lib/flows/brief";
import type { FlowPrices } from "@/lib/flows/flow-pricing";
import { runStep } from "@/lib/flows/run-step";
import {
  MAX_FLOW_SAID,
  STEP_TABLE,
  canRun,
  planFlow,
  readPlan,
  readStepStates,
  readySteps,
  withoutUnavailable,
  type FlowAvailability,
  type FlowKind,
  type FlowPlan,
  type StepState,
} from "@/lib/flows/plan";

/**
 * «2. PROJECTS: ΝΕΑ ΟΘΟΝΗ» Κομμάτι 6 ("κάτω πεδίο που φτιάχνει μέσα στο
 * project, με Brand Kit", owner's message 2026-10-28) — the SAME "one
 * sentence, several tools" planner flow-shell.tsx carried (MASTER 6.1
 * and 6.3; package 36), LOCKED TO THE PROJECT ALREADY OPEN instead of a
 * picker at the top of an account-wide page: no project list, no "mine"/
 * "examples" drawer, no project ever created here — the sentence's
 * results always join THIS project, whose id this component never lets
 * the server second-guess (api/flows now refuses outright when a
 * requested project does not resolve, rather than silently making a new
 * one — see that route's own comment).
 *
 * lib/flows/plan.ts (what a sentence asks for), lib/flows/run-step.ts
 * (each step through its own tool's request), lib/flows/flow-pricing.ts
 * and api/flows itself are ALL UNCHANGED from the account-wide page
 * (api/flows gained one new, optional branch — see its own file). Only
 * the shell around them is new and smaller: one field, one draft at a
 * time, no chat thread, no side panel — a card, not a conversation.
 *
 * BRAND KIT: the colour a drafted plan's site/pictures steps share
 * defaults to `defaultColour` — the PROJECT'S OWN primary_colour
 * (Κομμάτι 2) when it has one, else the account's business-memory
 * colour (page.tsx works out which) — changeable per draft exactly as
 * it always was, never written back to the project's own colour.
 */
type Draft = {
  said: string;
  plan: FlowPlan & { unavailable: FlowKind[] };
  colour: string;
  file: { name: string } | null;
  analysisRow: string | null;
  analysisPrice: number | null;
};
type Flow = { id: string; said: string; colour: string | null; plan: FlowPlan; states: Record<string, StepState> };

export function ProjectFlowField({
  projectId,
  projectName,
  initialFlows,
  prices,
  available,
  defaultColour,
}: {
  projectId: string;
  projectName: string;
  initialFlows: FlowRow[];
  prices: FlowPrices;
  available: FlowAvailability;
  defaultColour: string | null;
}) {
  const { t, kind, notYet } = useFlowWords();
  const tKey = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { refresh: refreshCredits } = useCredits();
  const brandColour = defaultColour;

  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [flows, setFlows] = useState<Record<string, Flow>>(() =>
    Object.fromEntries(
      initialFlows.map((row) => {
        const plan = readPlan(row.plan);
        return [row.id, { id: row.id, said: row.said, colour: row.colour, plan, states: readStepStates(row.steps, plan) }];
      })
    )
  );
  const [busy, setBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [confirming, setConfirming] = useState<{ credits: number; go: () => void } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // What THIS screen is running now, so a step is never started twice from here.
  const runningHere = useRef(new Set<string>());
  const flowsRef = useRef(flows);
  flowsRef.current = flows;
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const stepPrice = (d: Draft, id: string, k: FlowKind, after: string[]): number | null =>
    k === "analysis" ? d.analysisPrice : k === "slides" && after.includes("research") ? prices.slidesFromResearch : prices[k as Exclude<FlowKind, "analysis">];
  const totalOf = (d: Draft) => d.plan.steps.reduce((sum, s) => sum + (stepPrice(d, s.id, s.kind, s.after) ?? 0), 0);

  function hrefOf(k: FlowKind, row: string): string | null {
    if (k === "images") return `/dashboard/images?record=${encodeURIComponent(row)}`;
    return LIBRARY_SOURCES.find((s) => s.table === STEP_TABLE[k])?.hrefFor(row) ?? null;
  }

  async function report(flowId: string, step: string, body: Record<string, unknown>): Promise<{ ok: boolean; code?: string }> {
    try {
      const response = await fetch(`/api/flows/${flowId}/steps`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step, ...body }) });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; code?: string; steps?: unknown } | null;
      if (data?.ok && data.steps) {
        const flow = flowsRef.current[flowId];
        const states = flow ? readStepStates(data.steps, flow.plan) : {};
        if (flow && mounted.current) {
          flowsRef.current = { ...flowsRef.current, [flowId]: { ...flow, states } };
          setFlows(flowsRef.current);
        }
        return { ok: true };
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
        name: projectName,
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

  function plan() {
    const said = text.trim().slice(0, MAX_FLOW_SAID);
    if (!said) return;
    setNotice(null);
    const p = withoutUnavailable(planFlow(said), (step) => canRun(available, step));
    if (p.steps.length === 0) {
      setNotice(p.notYet.length > 0 ? t("notYet", { names: p.notYet.map((n) => notYet[n]).join(", ") }) : p.unavailable.length > 0 ? t("unavailable", { names: p.unavailable.map((k2) => kind[k2]).join(", ") }) : t("nothing"));
      return;
    }
    setDraft({ said, plan: p, colour: brandColour ?? DEFAULT_FLOW_COLOUR, file: null, analysisRow: null, analysisPrice: null });
  }

  async function pickFile(file: File) {
    setFileBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/data-analysis/upload", { method: "POST", body: form });
      const data = (await response.json().catch(() => null)) as { id?: string } | null;
      if (!response.ok || !data?.id) {
        setNotice(t("errors.file"));
        return;
      }
      const priced = await fetch(`/api/data-analysis/${data.id}/price`).then((r) => r.json()).catch(() => null);
      const credits = typeof priced?.credits === "number" ? priced.credits : null;
      if (credits === null) {
        setNotice(t("errors.file"));
        return;
      }
      setDraft((prev) => (prev ? { ...prev, file: { name: file.name }, analysisRow: data.id!, analysisPrice: credits } : prev));
    } catch {
      setNotice(t("errors.offline"));
    } finally {
      setFileBusy(false);
    }
  }

  async function approve() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          said: draft.said,
          colour: draft.plan.steps.some((s) => s.kind === "site" || s.kind === "images") ? draft.colour : null,
          projectId,
        }),
      });
      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok || !data?.ok) {
        const code = String(data?.code ?? "");
        setNotice(code === "rate_limited" ? t("errors.rateLimited") : t("errors.failed"));
        return;
      }
      const row = data.flow as { id: string; said: string; colour: string | null; plan: unknown; steps: unknown };
      const flowPlan = readPlan(row.plan);
      const flow: Flow = { id: row.id, said: row.said, colour: row.colour, plan: flowPlan, states: {} };
      flowsRef.current = { ...flowsRef.current, [flow.id]: flow };
      setFlows(flowsRef.current);
      setDraft(null);
      setText("");
      router.refresh();
      advance(flow.id, draft.analysisRow ? { analysis: draft.analysisRow } : {});
    } catch {
      setNotice(t("errors.offline"));
    } finally {
      setBusy(false);
    }
  }

  function withConfirm(credits: number, go: () => void) {
    if (needsLargeActionConfirmation(credits, DEFAULTS)) setConfirming({ credits, go });
    else go();
  }

  // Newest first, same order the server already hands them in (page-data.ts).
  const flowList = Object.values(flows);

  return (
    <div className="surface space-y-3" data-testid="project-flow-field">
      <h2 className="text-sm font-semibold text-foreground">{t("placeholder")}</h2>
      <p className="text-[11px] text-muted">{t("help")}</p>
      <div className="flex items-start gap-2">
        <textarea
          data-testid="project-flow-said"
          aria-label={t("placeholder")}
          value={text}
          placeholder={t("placeholder")}
          rows={2}
          disabled={busy}
          onChange={(e) => setText(e.target.value.slice(0, MAX_FLOW_SAID))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              plan();
            }
          }}
          className="w-full min-w-0 resize-y rounded-item border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/40 disabled:opacity-60"
        />
        <button
          type="button"
          data-testid="project-flow-plan"
          disabled={busy || !text.trim()}
          onClick={plan}
          aria-label={tKey("dashboard.createAnything.send")}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-item bg-button text-button-ink hover:bg-button disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {notice && <p data-testid="project-flow-notice" className="text-[11px] text-muted">{notice}</p>}

      {draft && (
        <PlanCard
          steps={draft.plan.steps}
          prices={Object.fromEntries(draft.plan.steps.map((s) => [s.id, stepPrice(draft, s.id, s.kind, s.after)]))}
          total={totalOf(draft)}
          unavailable={draft.plan.unavailable}
          colour={draft.colour}
          colourFromMemory={brandColour !== null && draft.colour === brandColour}
          onColour={(hex) => setDraft((prev) => (prev ? { ...prev, colour: hex } : prev))}
          file={draft.file}
          fileBusy={fileBusy}
          onFile={(file) => void pickFile(file)}
          approved={false}
          busy={busy}
          onApprove={() => withConfirm(totalOf(draft), () => void approve())}
        />
      )}

      {flowList.length > 0 && (
        <div className="space-y-3 border-t border-divider pt-3">
          {flowList.map((flow) => (
            <FlowProgress
              key={flow.id}
              projectHref={`/dashboard/projects?id=${encodeURIComponent(projectId)}`}
              onRetry={(stepId) => void retry(flow.id, stepId)}
              steps={flow.plan.steps.map((s): StepView => {
                const state = flow.states[s.id] ?? null;
                const here = runningHere.current.has(`${flow.id}:${s.id}`);
                return {
                  ...s,
                  state,
                  href: state?.status === "done" && state.row ? hrefOf(s.kind, state.row) : null,
                  retry: !here && ((state?.status === "running" && !(state.row && (s.kind === "site" || s.kind === "research"))) || state?.status === "failed"),
                };
              })}
            />
          ))}
        </div>
      )}

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
    </div>
  );
}
