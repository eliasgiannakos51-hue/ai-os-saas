"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Clock, Download, Sparkles, Upload } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useToast } from "@/components/toast/toast-context";
import { AnalysisChart } from "@/components/data-analysis/analysis-chart";
import { FactText, useExplainFact } from "@/components/data-analysis/fact-text";
import { formatFact } from "@/lib/data-analysis/facts";
import { ToolShell, OPTION, type ShellTurn } from "@/components/shell/tool-shell";
import { MAX_UPLOAD_BYTES } from "@/lib/data-analysis/limits";
import { describeColumn, type AnalysisSummary, type AnalysisView } from "@/lib/data-analysis/view";

/**
 * ANALYZE IN THE SHELL (MASTER 14.3, package 3), behind the switch
 * "tool-shell". The same routes as components/data-analysis/analysis-workspace.tsx,
 * which stays the page for everybody the switch is off for, and the same
 * rule: every number was computed on the server, this only draws it.
 *
 * The conversation IS the questions asked of the open file: each one and
 * its answer, with the rows the answer stands on. The field asks the next
 * one. The file itself — what its columns are, what was found, the charts
 * — is the work beside the conversation. Three options: upload a file,
 * find patterns in this one, and the files uploaded before.
 *
 * WITH THE SWITCH "analysis-provenance" (package 16), every number in what
 * was found is a fact computed from the file and pressable, all of them
 * are listed under «How the numbers were made», and every chart says how
 * each value was made and from how many rows.
 */
export function AnalysisShell({
  analyses,
  current,
  provenance = false,
}: {
  analyses: AnalysisSummary[];
  current: AnalysisView | null;
  provenance?: boolean;
}) {
  const t = useTranslations("dataAnalysis");
  const locale = useLocale();
  const explain = useExplainFact();
  const tShell = useTranslations("dashboard.toolShell");
  const tNames = useTranslations("dashboard.tools.names");
  const router = useRouter();
  const { addToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [notes, setNotes] = useState<{ id: string; role: "user" | "tool"; text: string }[]>([]);
  const [pane, setPane] = useState<"file" | "files" | null>(null);

  // THE FILE IS OPEN BESIDE THE CONVERSATION ON A COMPUTER, where there is
  // room; on a phone it would cover the field, so there it waits for the card.
  useEffect(() => {
    if (current && window.matchMedia("(min-width: 1024px)").matches) setPane("file");
  }, [current]);

  const note = (role: "user" | "tool", text: string) => setNotes((prev) => [...prev, { id: `n${role}${prev.length}`, role, text }]);

  async function upload(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      note("tool", t("upload.tooLarge"));
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/data-analysis/upload", { method: "POST", body: form });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.id) {
        note("tool", t("upload.failed"));
        return;
      }
      addToast(t("upload.done", { rows: body.rowCount }));
      router.push(`/dashboard/data-analysis?id=${body.id}`);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  // FIND PATTERNS is an option, not the screen's action: the field is.
  async function findPatterns() {
    if (!current) return;
    setAnalysing(true);
    try {
      const response = await fetch(`/api/data-analysis/${current.id}/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        note("tool", body?.error === "ai_unavailable" ? t("analyse.unavailable") : t("analyse.failed"));
        return;
      }
      note("tool", t("analyse.done"));
      if (provenance && Number(body?.dropped) > 0) note("tool", t("how.dropped", { count: Number(body.dropped) }));
      setPane("file");
      router.refresh();
    } finally {
      setAnalysing(false);
    }
  }

  async function ask(question: string) {
    if (!current) {
      note("user", question);
      note("tool", tShell("analyze.needFile"));
      return;
    }
    setAsking(true);
    try {
      const response = await fetch(`/api/data-analysis/${current.id}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        note("user", question);
        note("tool", t("ask.failed"));
        return;
      }
      if (body?.cannotAnswer) {
        note("user", question);
        note("tool", String(body.cannotAnswer));
      }
      router.refresh();
    } finally {
      setAsking(false);
    }
  }

  // THE QUESTIONS ASKED OF THIS FILE, oldest first, each with its answer
  // and the rows it stands on — read from the server, so a reload keeps them.
  const asked: ShellTurn[] = current
    ? [...current.questions].reverse().flatMap((record) => [
        { id: `${record.id}-q`, role: "user" as const, text: record.question },
        {
          id: `${record.id}-a`,
          role: "tool" as const,
          text: record.answer ?? "",
          extra: record.evidence ? (
            <div data-testid="analysis-evidence" className="mt-2">
              <p className="text-[11px] text-muted">{t("ask.matched", { matched: record.evidence.matchedRows, total: record.evidence.totalRows })}</p>
              <table className="mt-1 w-full text-start text-xs">
                <tbody>
                  {record.evidence.rows.map((row) => (
                    <tr key={row.group}>
                      <td className="py-1 text-muted">{row.group}</td>
                      <td className="py-1 text-end text-foreground">{Math.round(row.value * 100) / 100}</td>
                      <td className="py-1 ps-3 text-end text-[11px] text-muted">{t("ask.rowCount", { count: row.rows })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : undefined,
        },
      ])
    : [];

  const turns: ShellTurn[] = [
    ...(current
      ? [
          {
            id: "file",
            role: "tool" as const,
            text: t("summary.counts", { rows: current.rowCount, columns: current.profile.columns.length }),
            card: { title: current.title, open: pane === "file", onOpen: () => setPane("file") },
          },
        ]
      : []),
    ...asked,
    ...notes,
  ];

  const facts = current?.findings?.facts ?? [];

  const work =
    pane === "file" && current
      ? {
          title: current.title,
          actions: (
            <>
              <a href={`/api/data-analysis/${current.id}/export?format=csv`} className={OPTION}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                CSV
              </a>
              <a href={`/api/data-analysis/${current.id}/export?format=json`} className={OPTION}>
                JSON
              </a>
            </>
          ),
          body: (
            <div data-testid="analysis-file" className="space-y-5">
              <div>
                <p className="text-xs text-muted">
                  {t("summary.counts", { rows: current.rowCount, columns: current.profile.columns.length })}
                  {current.profile.duplicateRows > 0 ? ` · ${t("summary.duplicates", { count: current.profile.duplicateRows })}` : ""}
                </p>
                {current.truncated ? <p className="mt-1 text-xs text-warning">{t("summary.truncated")}</p> : null}
                {current.raggedRows > 0 ? <p className="mt-1 text-xs text-warning">{t("summary.ragged", { count: current.raggedRows })}</p> : null}
              </div>
              {current.findings ? (
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{t("findings.title")}</h3>
                  {provenance && facts.length > 0 ? <p className="mt-1 text-[11px] text-muted">{t("how.press")}</p> : null}
                  {current.findings.summary ? (
                    <p className="mt-1 text-sm text-body">
                      {provenance && current.findings.summaryParts ? <FactText parts={current.findings.summaryParts} facts={facts} /> : current.findings.summary}
                    </p>
                  ) : null}
                  <ul className="mt-2 space-y-2">
                    {current.findings.findings.map((finding) => (
                      <li key={finding.headline} data-testid="analysis-finding">
                        <p className="text-sm text-foreground">
                          {provenance && finding.headlineParts ? <FactText parts={finding.headlineParts} facts={facts} /> : finding.headline}
                        </p>
                        <p className="text-xs text-muted">
                          {provenance && finding.detailParts ? <FactText parts={finding.detailParts} facts={facts} /> : finding.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {provenance && facts.length > 0 ? (
                    <details data-testid="analysis-how" className="mt-3 text-xs">
                      <summary className="flex min-h-[44px] cursor-pointer items-center text-foreground">{t("how.title")}</summary>
                      <ul className="space-y-1">
                        {facts.map((fact) => (
                          <li key={fact.id} data-testid="analysis-how-fact">
                            <span className="font-medium text-foreground">{formatFact(fact, locale)}</span>
                            <span className="text-muted"> — {explain(fact)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted">{t("findings.none")}</p>
              )}
              {current.charts.length > 0 && (
                <div className="grid gap-4 xl:grid-cols-2">
                  {current.charts.map((chart, index) => (
                    <AnalysisChart key={`${chart.spec.title}-${index}`} chart={chart} how={provenance} />
                  ))}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-start text-xs">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-1 font-normal">{t("columns.name")}</th>
                      <th className="py-1 font-normal">{t("columns.filled")}</th>
                      <th className="py-1 font-normal">{t("columns.distinct")}</th>
                      <th className="py-1 font-normal">{t("columns.stats")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.profile.columns.map((column) => (
                      <tr key={column.name}>
                        <td className="py-2 text-foreground">{column.name}</td>
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
              {current.legacyNotes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{t("legacy.title")}</h3>
                  <p className="text-xs text-muted">{t("legacy.description")}</p>
                  <ul className="mt-2 space-y-2">
                    {current.legacyNotes.map((n) => (
                      <li key={n.id} className="text-xs">
                        <p className="text-foreground">{n.title}</p>
                        {n.description ? <p className="text-muted">{n.description}</p> : null}
                        {n.findings ? <p className="text-muted">{n.findings}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ),
        }
      : pane === "files"
        ? {
            title: tNames("analyze"),
            body: (
              <ul className="row-list">
                {analyses.map((item) => (
                  <li key={item.id} className="py-2">
                    <button
                      type="button"
                      onClick={() => {
                        router.push(`/dashboard/data-analysis?id=${item.id}`);
                        setPane("file");
                      }}
                      aria-current={current?.id === item.id ? "true" : undefined}
                      className="w-full min-w-0 text-start"
                    >
                      <p className="break-words text-sm text-foreground">{item.title}</p>
                      <p className="text-[11px] text-muted">{t("upload.done", { rows: item.rowCount })}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ),
          }
        : null;

  return (
    <ToolShell
      name={tNames("analyze")}
      turns={turns}
      working={
        uploading || analysing || asking ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <ThinkingIndicator size="sm" />
            {uploading ? t("upload.working") : analysing ? t("analyse.working") : t("ask.working")}
          </span>
        ) : null
      }
      placeholder={current ? t("ask.placeholder") : t("upload.description")}
      sending={asking}
      onSend={(text) => void ask(text)}
      options={[
        <span key="upload">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label={t("upload.title")}
            data-testid="analysis-upload-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
          <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} data-testid="analysis-upload" className={OPTION}>
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {t("upload.title")}
          </button>
        </span>,
        <button key="analyse" type="button" onClick={() => void findPatterns()} disabled={!current || analysing} data-testid="analysis-analyse" className={`${OPTION} disabled:opacity-40`}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {t("analyse.button")}
        </button>,
        <button key="files" type="button" onClick={() => setPane((v) => (v === "files" ? null : "files"))} aria-pressed={pane === "files"} disabled={analyses.length === 0} data-testid="analysis-files" className={`${OPTION} disabled:opacity-40`}>
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {tShell("recent")}
        </button>,
      ]}
      work={work}
      onCloseWork={() => setPane(null)}
    />
  );
}
