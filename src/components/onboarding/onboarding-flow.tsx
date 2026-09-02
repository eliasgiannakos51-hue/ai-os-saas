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
} from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";
import { MAX_CSV_BYTES } from "@/lib/import/csv-parse";
import { MAX_PASTE_CHARS, MIN_PASTE_CHARS } from "@/lib/import/paste-limits";
import { formatBytes } from "@/lib/files/file-types";
import { InsightList, type Insight } from "@/components/onboarding/insight-list";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";

type Step = "goal" | "source" | "csv" | "paste" | "quick" | "analysing" | "insights";

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

/**
 * The first two minutes.
 *
 * The whole screen exists to get from "I just signed up" to "it told me
 * something about my business I didn't know" without a detour. Three
 * decisions follow from that:
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
export function OnboardingFlow({ activationFree }: { activationFree: boolean }) {
  const t = useTranslations("dashboard.onboarding");
  const tPromise = useTranslations("promise");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();

  const [step, setStep] = useState<Step>("goal");
  const [goal, setGoal] = useState<string | null>(null);
  /**
   * WHICH action is running, not merely THAT one is — and the whole
   * point is the mark it chooses.
   *
   * This was a single boolean, and all three buttons rendered
   * the same generic ring spinner from it. Two of those three
   * buttons wait on a MODEL:
   *
   *   "reading"   -> /api/import/csv/analyse, which imports the Anthropic
   *                  SDK, reserves credits and asks a model to read the
   *                  columns of the file you just chose.
   *   "pasting"   -> /api/import/paste, the same, over text you pasted.
   *   "importing" -> /api/import/csv/apply, which writes rows. No model.
   *
   * So this screen — a new account's FIRST wait on the AI in this
   * product — showed the generic spinner every wrapper uses, at the one
   * moment the product's own mark is worth the most. The label beside it
   * already said "reading", which is the model reading.
   *
   * A single boolean could not be fixed in place: `busy ? spinner :
   * globe` has no way to know which of the three it is in. So the flag
   * NAMES the action, and `busy` stays as a derived value, which leaves
   * every `disabled=` below unchanged.
   *
   * scripts/tests/globe-mark.test.mjs enforces the general rule — a
   * state that a model-calling handler sets may not render a spinner —
   * so collapsing this back into one boolean fails the build instead of
   * quietly restoring the spinner.
   */
  const [pending, setPending] = useState<null | "reading" | "importing" | "pasting">(null);
  const busy = pending !== null;

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

  async function chooseGoal(value: string) {
    setGoal(value);
    setStep("source");
    void saveProgress({ goal: value });
  }

  async function skip() {
    await saveProgress({ skipped: true });
    router.push("/dashboard/overview");
  }

  async function finish() {
    await saveProgress({ completed: true });
    router.push("/dashboard/overview");
  }

  async function analyse(chosen: File) {
    if (chosen.size > MAX_CSV_BYTES) {
      addToast(t("tooLarge", { max: formatBytes(MAX_CSV_BYTES) }), "error");
      return;
    }
    setPending("reading");
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
      setPending(null);
    }
  }

  async function applyImport() {
    if (!file || !analysis) return;
    setPending("importing");
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
      setPending(null);
    }
  }

  async function applyPaste() {
    const text = pasteText.trim();
    if (text.length < MIN_PASTE_CHARS) return;
    setPending("pasting");
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
      setPending(null);
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
        <p className="text-[11px] text-muted">{t("stepLabel", { step: stepNumber(step), total: 3 })}</p>
        {step !== "insights" && (
          <button
            type="button"
            onClick={() => void skip()}
            // 66x17 measured on a phone, on the first screen a new user
            // meets. Seventeen pixels is not a target anyone hits on
            // purpose — the padding is what makes it hittable; the text
            // stays the same size so the layout is unchanged.
            className="-my-2 inline-flex min-h-[44px] items-center px-2 text-[11px] font-medium text-muted underline decoration-dotted transition-colors duration-150 hover:text-foreground sm:min-h-0 sm:my-0 sm:px-0"
          >
            {t("skip")}
          </button>
        )}
      </div>

      {step === "goal" && (
        <section className="space-y-3">
          {/* THE SAME SENTENCE THE LANDING PAGE AND THE HOME SCREEN SHOW.
              One tester left during onboarding. Whatever else was wrong,
              this screen never said what the product was — it went
              straight to asking what their goal is, which is a question
              you can only answer if you already know what you are being
              offered. */}
          <p className="mb-3 text-sm font-medium text-foreground">{tPromise("oneSentence")}</p>
          <h2 className="text-sm font-semibold text-foreground">{t("goalTitle")}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {GOALS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => void chooseGoal(value)}
                // 343x42 measured — two pixels short of the size a finger
                // reliably hits, on the screen that decides whether a new
                // user gets past the first minute.
                className={`flex min-h-[44px] items-center rounded-xl border p-3 text-left text-xs font-medium transition-colors duration-150 ${
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
                className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-60"
              >
                {pending === "reading" ? (
                  <>
                    {/* THE GLOBE, not a spinner: this button waits on a
                        model. `inherit` because the button ground IS the
                        accent — an accent-toned mark here would be orange
                        on orange and simply not there. */}
                    <ThinkingIndicator size="sm" tone="inherit" />
                    {t("reading")}
                  </>
                ) : busy ? (
                  t("reading")
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
                        className={`inline-flex min-h-[44px] items-center rounded-lg border px-3 py-1 text-[11px] font-medium transition-colors duration-150 ${
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
                        className="min-h-[44px] rounded-lg border border-border bg-background px-2 py-1 text-[11px] text-foreground"
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
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-60"
                >
                  {/* THE ONE SPINNER THAT STAYS. /api/import/csv/apply
                      writes rows and calls no model; spending the globe on
                      a database write would make the mark read as "busy",
                      which is the one thing it exists not to mean. */}
                  {pending === "importing" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      {t("importing")}
                    </>
                  ) : busy ? (
                    t("importing")
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
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
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
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-60"
          >
            {pending === "pasting" ? (
              <>
                {/* Also a model call — /api/import/paste. Same mark. */}
                <ThinkingIndicator size="sm" tone="inherit" />
                {t("reading")}
              </>
            ) : busy ? (
              t("reading")
            ) : (
              t("extract")
            )}
          </button>
        </section>
      )}

      {step === "analysing" && (
        <section className="space-y-2 rounded-2xl border border-orange-500/30 bg-orange-500/[0.04] p-6 text-center">
          <ThinkingIndicator className="mx-auto" />
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
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90"
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
  if (step === "goal") return 1;
  if (step === "insights") return 3;
  return 2;
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
      className="flex min-h-[44px] items-center rounded-xl border border-border bg-panel/60 p-3 text-left transition-colors duration-150 hover:border-orange-500/40"
    >
      <Icon className="mb-1.5 h-4 w-4 text-orange-400" aria-hidden="true" />
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{description}</p>
    </button>
  );
}
