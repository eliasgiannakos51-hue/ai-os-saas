"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Download, Loader2, Sparkles, Upload } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useToast } from "@/components/toast/toast-context";
import { AnalysisChart } from "@/components/data-analysis/analysis-chart";
import type { BuiltChart } from "@/lib/data-analysis/charts";
import type { AnalysisFindings } from "@/lib/data-analysis/analyse";
import type { ColumnProfile, TableProfile } from "@/lib/data-analysis/profile";
import type { QueryResult } from "@/lib/data-analysis/query";
import { MAX_UPLOAD_BYTES } from "@/lib/data-analysis/limits";

export type AnalysisSummary = { id: string; title: string; rowCount: number; createdAt: string; analysed: boolean };

export type AskRecord = {
  id: string;
  question: string;
  answer: string | null;
  evidence: QueryResult | null;
};

// The whole tool, on one screen: what you uploaded, what the columns
// really are, what was found, the charts, and a box to ask it something.
//
// EVERY NUMBER ON THIS PAGE WAS COMPUTED ON THE SERVER. The profile came
// out of lib/data-analysis/profile.ts at upload time, the chart points out
// of buildChart, and an answer's figures out of runQuery. This component
// renders and never calculates — so there is no second implementation of
// a mean here to disagree with the one in the export.
export function AnalysisWorkspace({
  analyses,
  current,
}: {
  analyses: AnalysisSummary[];
  current: {
    id: string;
    title: string;
    fileName: string;
    rowCount: number;
    truncated: boolean;
    raggedRows: number;
    profile: TableProfile;
    findings: AnalysisFindings | null;
    charts: BuiltChart[];
    questions: AskRecord[];
    legacyNotes: { id: string; title: string; description: string | null; findings: string | null }[];
  } | null;
}) {
  const t = useTranslations("dataAnalysis");
  const router = useRouter();
  const { addToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  async function handleUpload(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      addToast(t("upload.tooLarge"), "error");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/data-analysis/upload", { method: "POST", body: form });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.id) {
        addToast(t("upload.failed"), "error");
        return;
      }
      addToast(t("upload.done", { rows: body.rowCount }));
      router.push(`/dashboard/data-analysis?id=${body.id}`);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function handleAnalyse() {
    if (!current) return;
    setAnalysing(true);
    try {
      const response = await fetch(`/api/data-analysis/${current.id}/analyse`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        addToast(body?.error === "ai_unavailable" ? t("analyse.unavailable") : t("analyse.failed"), "error");
        return;
      }
      addToast(t("analyse.done"));
      router.refresh();
    } finally {
      setAnalysing(false);
    }
  }

  async function handleAsk() {
    if (!current || !question.trim()) return;
    setAsking(true);
    try {
      const response = await fetch(`/api/data-analysis/${current.id}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        addToast(t("ask.failed"), "error");
        return;
      }
      if (body?.cannotAnswer) addToast(String(body.cannotAnswer), "error");
      setQuestion("");
      router.refresh();
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ---- upload ---- */}
      <div className="rounded-2xl border border-border bg-panel p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("upload.title")}</h2>
        <p className="mt-1 text-xs text-muted">{t("upload.description")}</p>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label={t("upload.title")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? t("upload.working") : t("upload.button")}
        </button>
      </div>

      {/* ---- the files you have ---- */}
      {analyses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {analyses.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => router.push(`/dashboard/data-analysis?id=${item.id}`)}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                current?.id === item.id
                  ? "border-orange-500 bg-orange-500/10 text-foreground"
                  : "border-border bg-panel text-muted"
              }`}
            >
              {item.title} · {item.rowCount}
            </button>
          ))}
        </div>
      )}

      {current && (
        <>
          {/* ---- what the file actually is ---- */}
          <div className="rounded-2xl border border-border bg-panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{current.title}</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {t("summary.counts", { rows: current.rowCount, columns: current.profile.columns.length })}
                  {current.profile.duplicateRows > 0
                    ? ` · ${t("summary.duplicates", { count: current.profile.duplicateRows })}`
                    : ""}
                </p>
                {/* SAID, NOT HIDDEN. A file we only partly read, or one
                    whose rows did not line up, produces charts that are
                    true of what we read and not of what they uploaded. */}
                {current.truncated ? <p className="mt-1 text-xs text-amber-400">{t("summary.truncated")}</p> : null}
                {current.raggedRows > 0 ? (
                  <p className="mt-1 text-xs text-amber-400">{t("summary.ragged", { count: current.raggedRows })}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/data-analysis/${current.id}/export?format=csv`}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground"
                >
                  <Download className="h-3.5 w-3.5" /> CSV
                </a>
                <a
                  href={`/api/data-analysis/${current.id}/export?format=json`}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground"
                >
                  <Download className="h-3.5 w-3.5" /> JSON
                </a>
                <button
                  type="button"
                  onClick={() => void handleAnalyse()}
                  disabled={analysing}
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black disabled:opacity-50"
                >
                  {/* THE GLOBE for the analysis, because that wait is
                      the model thinking. The ring above it stays on the
                      UPLOAD button, which is a file read and a network
                      round trip — mechanical, and marking it with the
                      signature would spend the signature on a POST. */}
                  {analysing ? <ThinkingIndicator size="sm" tone="inherit" /> : <Sparkles className="h-4 w-4" />}
                  {analysing ? t("analyse.working") : t("analyse.button")}
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="py-1 font-normal">{t("columns.name")}</th>
                    <th className="py-1 font-normal">{t("columns.type")}</th>
                    <th className="py-1 font-normal">{t("columns.filled")}</th>
                    <th className="py-1 font-normal">{t("columns.distinct")}</th>
                    <th className="py-1 font-normal">{t("columns.stats")}</th>
                  </tr>
                </thead>
                <tbody>
                  {current.profile.columns.map((column) => (
                    <tr key={column.name} className="border-t border-border">
                      <td className="py-2 text-foreground">{column.name}</td>
                      <td className="py-2 text-muted">{t(`types.${column.type}`)}</td>
                      <td className="py-2 text-muted">
                        {column.filled}
                        {column.missing > 0 ? ` (${column.missing} ${t("columns.missing")})` : ""}
                      </td>
                      <td className="py-2 text-muted">{column.unique}</td>
                      <td className="py-2 text-muted">{describeColumn(column)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---- what was found ---- */}
          {current.findings ? (
            <div className="rounded-2xl border border-border bg-panel p-5">
              <h2 className="text-sm font-semibold text-foreground">{t("findings.title")}</h2>
              {current.findings.summary ? (
                <p className="mt-2 text-sm text-muted">{current.findings.summary}</p>
              ) : null}
              <ul className="mt-3 space-y-3">
                {current.findings.findings.map((finding) => (
                  <li key={finding.headline} className="border-l-2 border-orange-500 pl-3">
                    <p className="text-sm text-foreground">{finding.headline}</p>
                    <p className="mt-0.5 text-xs text-muted">{finding.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-muted">{t("findings.none")}</p>
          )}

          {/* ---- charts ---- */}
          {current.charts.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {current.charts.map((chart, index) => (
                <AnalysisChart key={`${chart.spec.title}-${index}`} chart={chart} />
              ))}
            </div>
          )}

          {/* ---- ask it something ---- */}
          <div className="rounded-2xl border border-border bg-panel p-5">
            <h2 className="text-sm font-semibold text-foreground">{t("ask.title")}</h2>
            <p className="mt-1 text-xs text-muted">{t("ask.description")}</p>

            {current.findings && current.findings.suggestedQuestions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {current.findings.suggestedQuestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setQuestion(suggestion)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={t("ask.placeholder")}
                aria-label={t("ask.title")}
                className="min-w-0 flex-1 rounded-lg border border-border bg-panel-hover px-3 py-2 text-sm text-foreground"
              />
              <button
                type="button"
                onClick={() => void handleAsk()}
                disabled={asking || !question.trim()}
                className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black disabled:opacity-50"
              >
                {asking ? t("ask.working") : t("ask.button")}
              </button>
            </div>

            <ul className="mt-4 space-y-4">
              {current.questions.map((record) => (
                <li key={record.id} className="rounded-xl border border-border p-3">
                  <p className="text-sm text-foreground">{record.question}</p>
                  {record.answer ? <p className="mt-1 text-xs text-muted">{record.answer}</p> : null}
                  {record.evidence ? (
                    <div className="mt-2">
                      <p className="text-[11px] text-muted">
                        {t("ask.matched", {
                          matched: record.evidence.matchedRows,
                          total: record.evidence.totalRows,
                        })}
                      </p>
                      <table className="mt-1 w-full text-left text-xs">
                        <tbody>
                          {record.evidence.rows.map((row) => (
                            <tr key={row.group} className="border-t border-border">
                              <td className="py-1 text-muted">{row.group}</td>
                              <td className="py-1 text-right text-foreground">
                                {Math.round(row.value * 100) / 100}
                              </td>
                              <td className="py-1 pl-3 text-right text-[11px] text-muted">
                                {t("ask.rowCount", { count: row.rows })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          {/* ---- the notes from the old tracker ---- */}
          {current.legacyNotes.length > 0 && (
            <div className="rounded-2xl border border-border bg-panel p-5">
              <h2 className="text-sm font-semibold text-foreground">{t("legacy.title")}</h2>
              <p className="mt-1 text-xs text-muted">{t("legacy.description")}</p>
              <ul className="mt-3 space-y-2">
                {current.legacyNotes.map((note) => (
                  <li key={note.id} className="border-t border-border pt-2 text-xs">
                    <p className="text-foreground">{note.title}</p>
                    {note.description ? <p className="mt-0.5 text-muted">{note.description}</p> : null}
                    {note.findings ? <p className="mt-0.5 text-muted">{note.findings}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function describeColumn(column: ColumnProfile): string {
  if (column.numeric) {
    const n = column.numeric;
    const round = (v: number) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100);
    return `${round(n.min)} – ${round(n.max)} · x̄ ${round(n.mean)}${n.outlierCount > 0 ? ` · ${n.outlierCount}⚠` : ""}`;
  }
  if (column.dateRange) return `${column.dateRange.min} → ${column.dateRange.max}`;
  return column.topValues
    .slice(0, 3)
    .map((v) => `${v.value} (${v.count})`)
    .join(", ");
}
