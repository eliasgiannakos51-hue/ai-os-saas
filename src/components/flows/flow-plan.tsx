"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, FileUp, Play, RotateCcw, X, Zap } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { OPTION } from "@/components/shell/tool-shell";
import type { FlowKind, FlowStep, NotYet, StepState } from "@/lib/flows/plan";

/**
 * THE PLAN OF A FLOW, AND WHAT EACH STEP DID (package 36). Drawn by
 * components/flows/flow-shell.tsx: the plan under the sentence, with the
 * price of each step, the total, the colour they share, the file an
 * analysis reads, and the one press that starts it; then, beside the
 * conversation, each step's state and the press that opens what it made.
 *
 * Every word is a literal key (dashboard.flows.*), so the message slicer
 * sees them all.
 */
function useKinds() {
  const t = useTranslations("dashboard.flows");
  const kind: Record<FlowKind, string> = {
    research: t("kinds.research"),
    site: t("kinds.site"),
    images: t("kinds.images"),
    posts: t("kinds.posts"),
    slides: t("kinds.slides"),
    analysis: t("kinds.analysis"),
  };
  const does: Record<FlowKind, string> = {
    research: t("does.research"),
    site: t("does.site"),
    images: t("does.images"),
    posts: t("does.posts"),
    slides: t("does.slides"),
    analysis: t("does.analysis"),
  };
  const notYet: Record<NotYet, string> = {
    video: t("notYetNames.video"),
    translation: t("notYetNames.translation"),
    game: t("notYetNames.game"),
    meeting: t("notYetNames.meeting"),
  };
  const error: Record<string, string> = {
    no_credits: t("stepErrors.no_credits"),
    not_included: t("stepErrors.not_included"),
    not_configured: t("stepErrors.not_configured"),
    rate_limited: t("stepErrors.rate_limited"),
    refused: t("stepErrors.refused"),
    offline: t("stepErrors.offline"),
    stopped: t("stepErrors.stopped"),
    no_file: t("stepErrors.no_file"),
    interrupted: t("stepErrors.interrupted"),
    failed: t("stepErrors.failed"),
  };
  return { t, kind, does, notYet, error };
}

export function useFlowWords() {
  return useKinds();
}

export function PlanCard({
  steps,
  prices,
  total,
  unavailable,
  colour,
  colourFromMemory,
  onColour,
  file,
  fileBusy,
  onFile,
  approved,
  busy,
  onApprove,
}: {
  steps: FlowStep[];
  /** Each step's price; null while it cannot be known yet (an analysis before its file). */
  prices: Record<string, number | null>;
  total: number;
  unavailable: FlowKind[];
  colour: string;
  colourFromMemory: boolean;
  onColour: (hex: string) => void;
  file: { name: string } | null;
  fileBusy: boolean;
  onFile: (file: File) => void;
  approved: boolean;
  busy: boolean;
  onApprove: () => void;
}) {
  const { t, kind, does } = useKinds();
  const needsFile = steps.some((s) => s.kind === "analysis");
  const usesColour = steps.some((s) => s.kind === "site" || s.kind === "images");
  const ready = !needsFile || (file !== null && prices.analysis !== null);
  return (
    <div data-testid="flow-plan" className="mt-2 space-y-3">
      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={step.id} data-testid="flow-plan-step" data-kind={step.kind} className="flex items-start gap-3 rounded-item bg-panel px-3 py-2">
            <span className="mt-0.5 w-5 shrink-0 text-xs text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-foreground">{kind[step.kind]}</span>
              <span className="block text-[11px] text-muted">
                {does[step.kind]}
                {step.after.length > 0 ? ` · ${t("afterResearch")}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-[11px] text-muted">{prices[step.id] === null ? t("priceAfterFile") : t("price", { count: prices[step.id] ?? 0 })}</span>
          </li>
        ))}
      </ol>
      {unavailable.length > 0 && <p data-testid="flow-unavailable" className="text-[11px] text-warning">{t("unavailable", { names: unavailable.map((k) => kind[k]).join(", ") })}</p>}
      {usesColour && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {t("colour")}
          <input
            type="color"
            value={colour}
            disabled={approved}
            onChange={(e) => onColour(e.target.value)}
            data-testid="flow-colour"
            className="h-11 w-11 cursor-pointer rounded-item bg-panel"
            aria-label={t("colour")}
          />
          <span className="text-[11px]">{colourFromMemory ? t("colourFromMemory") : t("colourHelp")}</span>
        </label>
      )}
      {needsFile && (
        <label className={`${OPTION} min-h-[44px] w-fit cursor-pointer`}>
          {fileBusy ? <ThinkingIndicator size="sm" /> : <FileUp className="h-3.5 w-3.5" aria-hidden="true" />}
          {file ? t("fileChosen", { name: file.name }) : t("file")}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="sr-only"
            disabled={approved || fileBusy}
            data-testid="flow-file"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) onFile(picked);
              e.target.value = "";
            }}
          />
        </label>
      )}
      <p data-testid="flow-total" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Zap className="h-3 w-3 text-foreground/70" aria-hidden="true" />
        {t("total", { count: total })}
      </p>
      <p className="text-[11px] text-muted">{t("totalNote")}</p>
      {!approved && (
        <button type="button" disabled={busy || !ready} onClick={onApprove} data-testid="flow-approve" className={`${OPTION} min-h-[44px] disabled:opacity-60`}>
          {busy ? <ThinkingIndicator size="sm" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
          {t("approve")}
        </button>
      )}
    </div>
  );
}

export type StepView = FlowStep & { state: StepState | null; href: string | null; retry: boolean };

export function FlowProgress({
  steps,
  projectHref,
  onRetry,
}: {
  steps: StepView[];
  projectHref: string;
  onRetry: (stepId: string) => void;
}) {
  const { t, kind, does, error } = useKinds();
  const done = steps.filter((s) => s.state?.status === "done").length;
  return (
    <div className="space-y-4">
      <ol data-testid="flow-steps" className="space-y-2">
        {steps.map((step) => {
          const status = step.state?.status ?? "waiting";
          return (
            <li key={step.id} data-testid="flow-step" data-kind={step.kind} data-status={status} className="flex items-start gap-3 rounded-item bg-panel px-3 py-2.5">
              <span className="mt-0.5 shrink-0" aria-hidden="true">
                {status === "done" ? <Check className="h-4 w-4 text-foreground" /> : status === "failed" ? <X className="h-4 w-4 text-danger" /> : status === "running" ? <ThinkingIndicator size="sm" /> : <span className="block h-4 w-4 rounded-full bg-panel-hover" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground">{kind[step.kind]}</span>
                <span className={`block text-[11px] ${status === "failed" ? "text-danger" : "text-muted"}`}>
                  {status === "waiting"
                    ? step.after.length > 0
                      ? t("waitingFor")
                      : t("status.waiting")
                    : status === "running"
                      ? `${t("status.running")} · ${does[step.kind]}`
                      : status === "done"
                        ? t("status.done")
                        : error[step.state?.error ?? "failed"] ?? error.failed}
                </span>
              </span>
              {step.href && status === "done" && (
                <Link href={step.href} data-testid="flow-step-open" className={`${OPTION} min-h-[44px] shrink-0`}>
                  {t("openStep")}
                </Link>
              )}
              {step.retry && (
                <button type="button" onClick={() => onRetry(step.id)} data-testid="flow-step-retry" className={`${OPTION} min-h-[44px] shrink-0`}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("retry")}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <p data-testid="flow-summary" className="text-xs text-muted">
        {t("doneOf", { done, total: steps.length })}
      </p>
      <Link href={projectHref} data-testid="flow-project" className={`${OPTION} min-h-[44px] w-fit`}>
        {t("openProject")}
      </Link>
    </div>
  );
}
