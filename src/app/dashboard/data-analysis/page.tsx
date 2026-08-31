import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BarChart3 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { pageTitle } from "@/lib/page-title";
import { MODULE_TITLE_KEYS } from "@/lib/search/module-title-keys";
import { PageHeader } from "@/components/dashboard/page-header";
import { AnalysisWorkspace, type AnalysisSummary, type AskRecord } from "@/components/data-analysis/analysis-workspace";
import { buildChart, type BuiltChart, type ChartSpec } from "@/lib/data-analysis/charts";
import type { TableProfile } from "@/lib/data-analysis/profile";
import type { AnalysisFindings } from "@/lib/data-analysis/analyse";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  // See the note in coding/page.tsx: one home for the key.
  return pageTitle(MODULE_TITLE_KEYS["data-analysis"]);
}

// THE CHART POINTS ARE COMPUTED HERE, on the server, from the stored
// rows. Sending 50,000 rows to the browser so it can add them up would be
// a slow page AND a second implementation of every aggregation — one that
// could disagree with the export and with the answers.
export default async function DataAnalysisPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const t = await getTranslations("dataAnalysis");
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: list } = await supabase
    .from("data_analyses")
    .select("id, title, row_count, created_at, analysed_at")
    .order("created_at", { ascending: false })
    .limit(30);

  const analyses: AnalysisSummary[] = (list ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    rowCount: Number(row.row_count ?? 0),
    createdAt: String(row.created_at ?? ""),
    analysed: Boolean(row.analysed_at),
  }));

  const selectedId = searchParams.id ?? analyses[0]?.id ?? null;
  let current: React.ComponentProps<typeof AnalysisWorkspace>["current"] = null;

  if (selectedId) {
    // RLS scopes every one of these: an id belonging to somebody else
    // simply comes back empty.
    const [{ data: analysis }, { data: chartRows }, { data: questionRows }, { data: legacyRows }] = await Promise.all([
      supabase
        .from("data_analyses")
        .select("id, title, file_name, row_count, truncated, ragged_rows, headers, rows, profile, findings")
        .eq("id", selectedId)
        .maybeSingle(),
      supabase
        .from("data_analysis_charts")
        .select("kind, title, x_column, y_column, aggregation, reason, position")
        .eq("analysis_id", selectedId)
        .order("position", { ascending: true }),
      supabase
        .from("data_analysis_questions")
        .select("id, question, answer, evidence")
        .eq("analysis_id", selectedId)
        .order("created_at", { ascending: false })
        .limit(10),
      // The old tracker's rows. Read-only, and shown so a user who typed
      // notes into the previous version of this page does not find them
      // gone — see the migration's section 5 for why they were not
      // absorbed into the new tables instead.
      supabase
        .from("ai_data_analysis_requests")
        .select("id, title, description, findings")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (analysis) {
      const profile = (analysis.profile ?? { rowCount: 0, columns: [], duplicateRows: 0, correlations: [] }) as TableProfile;
      const headers = (analysis.headers ?? []) as string[];
      const rows = (analysis.rows ?? []) as string[][];

      const charts: BuiltChart[] = (chartRows ?? []).map((row) => {
        const spec: ChartSpec = {
          kind: row.kind as ChartSpec["kind"],
          title: String(row.title ?? ""),
          x: String(row.x_column ?? ""),
          ...(row.y_column ? { y: String(row.y_column) } : {}),
          aggregation: row.aggregation as ChartSpec["aggregation"],
          ...(row.reason ? { reason: String(row.reason) } : {}),
        };
        return buildChart(spec, profile, headers, rows);
      });

      const questions: AskRecord[] = (questionRows ?? []).map((row) => ({
        id: String(row.id),
        question: String(row.question ?? ""),
        answer: (row.answer as string | null) ?? null,
        evidence: (row.evidence as AskRecord["evidence"]) ?? null,
      }));

      current = {
        id: String(analysis.id),
        title: String(analysis.title ?? ""),
        fileName: String(analysis.file_name ?? ""),
        rowCount: Number(analysis.row_count ?? 0),
        truncated: Boolean(analysis.truncated),
        raggedRows: Number(analysis.ragged_rows ?? 0),
        profile,
        findings: (analysis.findings as AnalysisFindings | null) ?? null,
        charts,
        questions,
        legacyNotes: (legacyRows ?? []).map((row) => ({
          id: String(row.id),
          title: String(row.title ?? ""),
          description: (row.description as string | null) ?? null,
          findings: (row.findings as string | null) ?? null,
        })),
      };
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader
        icon={BarChart3}
        title={t("title")}
        description={t("description")}
        helpKey="help.dataAnalysis"
      />
      <AnalysisWorkspace analyses={analyses} current={current} />
    </div>
  );
}
