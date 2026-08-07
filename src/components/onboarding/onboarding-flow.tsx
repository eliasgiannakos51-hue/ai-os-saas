"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Upload,
  ClipboardPaste,
  Plug,
  PencilLine,
  Loader2,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  Check,
  Globe,
  Target,
  Table2,
  MessageCircle,
} from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";
import { MAX_CSV_BYTES } from "@/lib/import/csv-parse";
import { MAX_PASTE_CHARS, MIN_PASTE_CHARS } from "@/lib/import/paste-limits";
import { formatBytes } from "@/lib/files/file-types";
import { InsightList, type Insight } from "@/components/onboarding/insight-list";
import {
  FIRST_ACTIONS,
  firstActionCompletes,
  firstActionDestination,
  type FirstAction,
  type OnboardingEntryStep,
} from "@/lib/onboarding-flow";

type Step = "action" | "goal" | "source" | "csv" | "paste" | "quick" | "analysing" | "insights";

type MappingEntry = { column: string; field: string | null };

type Proposal = {
  targetSlug: string;
  mappings: MappingEntry[];
  summary: string;
};

type Analysis = {
  proposal: Proposal;
  headers: string[];
  targetLabel: string;
  fields: { key: string; label: string; type: string; required?: boolean }[];
  dateOrder: "dmy" | "mdy" | "ymd";
  dateAmbiguous: boolean;
  counts: { totalRows: number; readyRows: number; rejectedRows: number; truncated: boolean };
  rejected: { rowNumber: number; reason: string }[];
  preview: { source: Record<string, string>; result: Record<string, unknown> }[];
};

const GOALS = ["trading", "freelance", "startup", "agency", "other"] as const;

const ACTION_ICONS: Record<FirstAction, typeof Globe> = {
  website: Globe,
  mission: Target,
  data: Table2,
  chat: MessageCircle,
};

/**
 * The first 60 seconds.
 *
 * ONE QUESTION, FOUR DOORS. The first screen asks what the user wants to
 * DO — build a website, set a goal, organise their data, or just ask
 * something — and a click goes straight there with the input ready. No
 * feature tour, no plan picker: the documented failure this replaces is
 * a tester looking at a capability presentation and concluding the
 * product was "several LLMs in one, cheaper". Plans appear only at limit
 * moments (the smart upgrade triggers), and the capability overview
 * lives behind "What can Ionexa do?" in the sidebar for whoever asks.
 *
 * The data door continues into the import flow below, which keeps its
 * own three decisions:
 *
 *   1. SKIP IS ALWAYS VISIBLE. Nobody is trapped in a wizard. An empty
 *      dashboard is a worse first impression than an optional step, but
 *      a mandatory one is worse than both.
 *   2. THE CSV STEP SHOWS THE CONVERSION, not a description of it.
 *      "1.234,56 → 1234.56" is checkable at a glance; "we handle
 *      European number formats" is a promise.
 *   3. WHEN THERE IS NOTHING TO SAY, IT SAYS SO. The one thing this
 *      screen must never do is manufacture a finding to justify itself.
 */
export function OnboardingFlow({
  activationFree,
  initialStep = "action",
}: {
  activationFree: boolean;
  /** Where a refresh resumes — resolved server-side from the progress
   *  row (see lib/onboarding-flow.ts's resolveInitialStep). */
  initialStep?: OnboardingEntryStep;
}) {
  const t = useTranslations("dashboard.onboarding");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();

  const [step, setStep] = useState<Step>(initialStep);
  const [goal, setGoal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mappings, setMappings] = useState<MappingEntry[]>([]);
  const [dateOrder, setDateOrder] = useState<"dmy" | "mdy" | "ymd">("dmy");

  const [pasteText, setPasteText] = useState("");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [needMoreData, setNeedMoreData] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  const saveProgress = useCallback(
    async (payload: Record<string, unknown>) => {
      try {
        await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // Progress is a convenience. Failing to record it must never
        // block somebody from getting on with the actual import.
      }
    },
    []
  );

  async function chooseAction(action: FirstAction) {
    if (busy) return;
    const destination = firstActionDestination(action);
    if (destination === null) {
      // The data door stays here and continues into the import flow.
      // Recording it is what a mid-flow refresh resumes from.
      setStep("goal");
      void saveProgress({ firstAction: action });
      return;
    }
    // The other three doors leave. The same write records the choice AND
    // completes the flow — a user who clicked through has had their
    // first 60 seconds, and showing the question again next login would
    // be the double-show bug. The write is awaited so the destination's
    // own guards see a settled row; if it fails, the navigation still
    // happens (worst case: the question shows once more, which beats a
    // dead button).
    //
    // REPLACE, not push. The Router Cache serves back/forward
    // navigations from cache regardless of staleTimes, so a pushed
    // /onboarding entry re-shows the already-answered question on the
    // browser's Back button. Replacing removes the transient question
    // from history entirely — Back from the destination goes to wherever
    // the user was before the flow, same as before it existed.
    setBusy(true);
    await saveProgress({ firstAction: action, completed: firstActionCompletes(action) });
    router.replace(destination);
  }

  async function chooseGoal(value: string) {
    setGoal(value);
    setStep("source");
    void saveProgress({ goal: value });
  }

  // replace() for the same reason as chooseAction: a finished flow must
  // not be one Back-press away, and the Router Cache replays history
  // entries without asking the server.
  async function skip() {
    await saveProgress({ skipped: true });
    router.replace("/dashboard/overview");
  }

  async function finish() {
    await saveProgress({ completed: true });
    router.replace("/dashboard/overview");
  }

  async function analyse(chosen: File) {
    if (chosen.size > MAX_CSV_BYTES) {
      addToast(t("tooLarge", { max: formatBytes(MAX_CSV_BYTES) }), "error");
      return;
    }
    setBusy(true);
    setAnalysis(null);
    try {
      const body = new FormData();
      body.append("file", chosen);
      const response = await fetch("/api/import/csv/analyse", { method: "POST", body });
      const data = await response.json();

      if (!data.ok) {
        addToast(data.error ?? t("analyseError"), "error");
        return;
      }
      setFile(chosen);
      setAnalysis(data as Analysis);
      setMappings(data.proposal.mappings);
      setDateOrder(data.dateOrder);
    } catch (err) {
      addToast(getErrorMessage(err, t("analyseError")), "error");
    } finally {
      setBusy(false);
    }
  }

  async function applyImport() {
    if (!file || !analysis) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append(
        "mapping",
        JSON.stringify({ targetSlug: analysis.proposal.targetSlug, mappings, dateOrder })
      );
      const response = await fetch("/api/import/csv/apply", { method: "POST", body });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("importError"), "error");
        return;
      }
      setImportedCount(data.imported);
      addToast(t("imported", { count: data.imported }));
      await generateInsights(data.importId);
    } catch (err) {
      addToast(getErrorMessage(err, t("importError")), "error");
    } finally {
      setBusy(false);
    }
  }

  async function applyPaste() {
    const text = pasteText.trim();
    if (text.length < MIN_PASTE_CHARS) return;
    setBusy(true);
    try {
      const response = await fetch("/api/import/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: locale }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("importError"), "error");
        return;
      }
      if (data.nothingFound) {
        // A correct answer, said plainly. Inventing three entries out of
        // a greeting would be worse than this message.
        addToast(t("nothingInText"), "error");
        return;
      }
      setImportedCount(data.imported);
      addToast(t("imported", { count: data.imported }));
      await generateInsights(data.importId);
    } catch (err) {
      addToast(getErrorMessage(err, t("importError")), "error");
    } finally {
      setBusy(false);
    }
  }

  async function generateInsights(importId?: string) {
    setStep("analysing");
    try {
      const response = await fetch("/api/insights/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: locale, importId }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("insightsError"), "error");
        setStep("insights");
        return;
      }
      setInsights(data.insights ?? []);
      setNeedMoreData(Boolean(data.needMoreData));
      setStep("insights");
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("insightsError")), "error");
      setStep("insights");
    }
  }

  return (
    <div className="space-y-6">
      {/* Always available, at every step. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted">{t("stepLabel", { step: stepNumber(step), total: 4 })}</p>
        {step !== "insights" && (
          <button
            type="button"
            onClick={() => void skip()}
            className="text-[11px] font-medium text-muted underline decoration-dotted transition-colors duration-150 hover:text-foreground"
          >
            {t("skip")}
          </button>
        )}
      </div>

      {step === "action" && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">{t("actionTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIRST_ACTIONS.map((action) => {
              const Icon = ACTION_ICONS[action];
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => void chooseAction(action)}
                  disabled={busy}
                  className="min-h-[92px] rounded-2xl border border-border bg-panel/60 p-4 text-left transition-colors duration-150 hover:border-orange-500/50 disabled:opacity-60"
                >
                  <Icon className="mb-2 h-5 w-5 text-orange-400" aria-hidden="true" />
                  <p className="text-sm font-semibold text-foreground">{t(`actions.${action}.title`)}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{t(`actions.${action}.hint`)}</p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Said before anything is uploaded — the moment someone decides
          whether to hand over their books. Only on the data path: the
          action question above asks for nothing. */}
      {(step === "goal" || step === "source" || step === "csv" || step === "paste") && (
        <p className="rounded-xl border border-border bg-panel/60 p-3 text-[11px] leading-relaxed text-muted">
          {t("privacyNotice")}
        </p>
      )}

      {step === "goal" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{t("goalTitle")}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {GOALS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => void chooseGoal(value)}
                className={`rounded-xl border p-3 text-left text-xs font-medium transition-colors duration-150 ${
                  goal === value
                    ? "border-orange-500 bg-orange-500/[0.06] text-foreground"
                    : "border-border bg-panel/60 text-muted hover:text-foreground"
                }`}
              >
                {t(`goals.${value}`)}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "source" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{t("sourceTitle")}</h2>
          <p className="text-xs leading-relaxed text-muted">{t("sourceIntro")}</p>

          <div className="grid gap-2 sm:grid-cols-2">
            <SourceCard
              icon={Upload}
              title={t("sourceCsv")}
              description={t("sourceCsvHint")}
              onSelect={() => setStep("csv")}
            />
            <SourceCard
              icon={ClipboardPaste}
              title={t("sourcePaste")}
              description={t("sourcePasteHint")}
              onSelect={() => setStep("paste")}
            />
            <SourceCard
              icon={Plug}
              title={t("sourceIntegrations")}
              description={t("sourceIntegrationsHint")}
              onSelect={() => router.push("/dashboard/integrations")}
            />
            <SourceCard
              icon={PencilLine}
              title={t("sourceManual")}
              description={t("sourceManualHint")}
              onSelect={() => void finish()}
            />
          </div>

          {activationFree && (
            <p className="rounded-xl border border-border bg-panel/60 p-3 text-[11px] leading-relaxed text-muted">
              {t("firstFree")}
            </p>
          )}
        </section>
      )}

      {step === "csv" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{t("csvTitle")}</h2>

          {!analysis && (
            <div className="rounded-2xl border-2 border-dashed border-border bg-panel/40 p-6 text-center">
              <Upload className="mx-auto mb-2 h-5 w-5 text-muted" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-muted">
                {t("csvHint", { max: formatBytes(MAX_CSV_BYTES) })}
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.tsv,.txt"
                className="sr-only"
                onChange={(e) => {
                  const chosen = e.target.files?.[0];
                  if (chosen) void analyse(chosen);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    {t("reading")}
                  </>
                ) : (
                  t("chooseFile")
                )}
              </button>
            </div>
          )}

          {analysis && (
            <div className="space-y-3">
              <p className="rounded-xl border border-border bg-panel/60 p-3 text-xs leading-relaxed text-foreground">
                {t("looksLike", { label: analysis.targetLabel })}{" "}
                <span className="text-muted">{analysis.proposal.summary}</span>
              </p>

              {/* The date order, ASKED rather than assumed when the column
                  cannot decide. A silently-wrong date order poisons every
                  time-based insight and is invisible afterwards. */}
              {analysis.dateAmbiguous && (
                <div className="space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                  <p className="flex items-start gap-1.5 text-[11px] font-medium leading-relaxed text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    {t("dateAmbiguous")}
                  </p>
                  <div className="flex gap-2">
                    {(["dmy", "mdy"] as const).map((order) => (
                      <button
                        key={order}
                        type="button"
                        onClick={() => setDateOrder(order)}
                        className={`inline-flex min-h-[32px] items-center rounded-lg border px-3 py-1 text-[11px] font-medium transition-colors duration-150 ${
                          dateOrder === order
                            ? "border-orange-500 text-foreground"
                            : "border-border text-muted hover:text-foreground"
                        }`}
                      >
                        {t(`dateOrder.${order}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* The mapping, editable. The AI's proposal is a starting
                  point, not a decision. */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted">{t("mappingTitle")}</p>
                <ul className="space-y-1">
                  {mappings.map((entry, index) => (
                    <li key={entry.column} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
                        {entry.column}
                      </span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
                      <select
                        value={entry.field ?? ""}
                        onChange={(e) => {
                          const next = [...mappings];
                          next[index] = { ...entry, field: e.target.value || null };
                          setMappings(next);
                        }}
                        aria-label={t("mapColumn", { column: entry.column })}
                        className="min-h-[32px] rounded-lg border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                      >
                        <option value="">{t("ignoreColumn")}</option>
                        {analysis.fields.map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label}
                            {field.required ? " *" : ""}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Source next to result. The user checks the CONVERSION,
                  which is the part they cannot verify from a description. */}
              {analysis.preview.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-muted">{t("previewTitle")}</p>
                  <div className="overflow-x-auto rounded-xl border border-border bg-panel/60">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="p-2 font-medium text-muted">{t("previewSource")}</th>
                          <th className="p-2 font-medium text-muted">{t("previewStored")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.preview.map((pair, i) => (
                          <tr key={i} className="border-b border-border/50 last:border-0">
                            <td className="p-2 align-top font-mono text-muted">
                              {Object.values(pair.source).filter(Boolean).slice(0, 4).join(" · ")}
                            </td>
                            <td className="p-2 align-top font-mono text-foreground">
                              {Object.entries(pair.result)
                                .filter(([, v]) => v !== null && v !== "")
                                .slice(0, 4)
                                .map(([k, v]) => `${k}=${String(v).slice(0, 24)}`)
                                .join(" · ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-muted">
                {t("counts", {
                  ready: analysis.counts.readyRows,
                  total: analysis.counts.totalRows,
                })}
                {analysis.counts.rejectedRows > 0 && ` · ${t("skippedRows", { count: analysis.counts.rejectedRows })}`}
                {analysis.counts.truncated && ` · ${t("truncated")}`}
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void applyImport()}
                  disabled={busy || analysis.counts.readyRows === 0}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      {t("importing")}
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("importRows", { count: analysis.counts.readyRows })}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnalysis(null);
                    setFile(null);
                  }}
                  className="inline-flex min-h-[36px] items-center rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
                >
                  {t("chooseAnother")}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {step === "paste" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{t("pasteTitle")}</h2>
          <p className="text-xs leading-relaxed text-muted">{t("pasteHint")}</p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={t("pastePlaceholder")}
            rows={8}
            maxLength={MAX_PASTE_CHARS}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
          <button
            type="button"
            onClick={() => void applyPaste()}
            disabled={busy || pasteText.trim().length < MIN_PASTE_CHARS}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                {t("reading")}
              </>
            ) : (
              t("extract")
            )}
          </button>
        </section>
      )}

      {step === "analysing" && (
        <section className="space-y-2 rounded-2xl border border-orange-500/30 bg-orange-500/[0.04] p-6 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-orange-400" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">{t("analysing")}</p>
          <p className="text-[11px] leading-relaxed text-muted">{t("analysingHint")}</p>
        </section>
      )}

      {step === "insights" && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-orange-400" aria-hidden="true" />
            {t("insightsTitle")}
          </h2>

          {importedCount > 0 && (
            <p className="text-xs text-muted">{t("importedSummary", { count: importedCount })}</p>
          )}

          {insights.length > 0 ? (
            <InsightList
              insights={insights}
              onDismissed={(id) => setInsights((current) => current.filter((i) => i.id !== id))}
            />
          ) : (
            // THE HONEST EMPTY STATE. No hedged sentence, no generic
            // advice — just what is missing and what would fix it.
            <div className="space-y-1.5 rounded-2xl border border-border bg-panel/60 p-4">
              <p className="text-sm font-medium text-foreground">{t("noneTitle")}</p>
              <p className="text-xs leading-relaxed text-muted">
                {needMoreData ? t("noneNeedMore") : t("noneYet")}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => void finish()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90"
          >
            {t("goToDashboard")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </section>
      )}
    </div>
  );
}

function stepNumber(step: Step): number {
  if (step === "action") return 1;
  if (step === "goal") return 2;
  if (step === "analysing" || step === "insights") return 4;
  return 3;
}

function SourceCard({
  icon: Icon,
  title,
  description,
  onSelect,
}: {
  icon: typeof Upload;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded-xl border border-border bg-panel/60 p-3 text-left transition-colors duration-150 hover:border-orange-500/40"
    >
      <Icon className="mb-1.5 h-4 w-4 text-orange-400" aria-hidden="true" />
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{description}</p>
    </button>
  );
}
