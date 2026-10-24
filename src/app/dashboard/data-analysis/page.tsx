import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { pageTitle } from "@/lib/page-title";
import { MODULE_TITLE_KEYS } from "@/lib/search/module-title-keys";
import type { AnalysisWorkspace, AnalysisSummary, AskRecord } from "@/components/data-analysis/analysis-workspace";
import { AnalyzeShell } from "@/components/analyze/analyze-shell";
import { buildChart, type BuiltChart, type ChartSpec } from "@/lib/data-analysis/charts";
import type { TableProfile } from "@/lib/data-analysis/profile";
import type { AnalysisFindings } from "@/lib/data-analysis/analyse";
import { FILE_LIST_COLUMNS } from "@/lib/files/store";
import type { WorkspaceCollection, WorkspaceFile } from "@/lib/files/answer";
import { readRequestedId } from "@/lib/library/requested";
import { readExampleParam } from "@/lib/overview/first-screen-examples";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  // See the note in coding/page.tsx: one home for the key.
  return pageTitle(MODULE_TITLE_KEYS["data-analysis"]);
}

// THE CHART POINTS ARE COMPUTED HERE, on the server, from the stored
// rows. Sending 50,000 rows to the browser so it can add them up would be
// a slow page AND a second implementation of every aggregation — one that
// could disagree with the export and with the answers.
export default async function DataAnalysisPage(
  props: {
    searchParams: Promise<{ id?: string; record?: string; ask?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
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

  // THE SHELL, FOR EVERYBODY (MASTER 14.3, package 3; its switch was removed
  // 2026-10-23): Analyze and Files, merged into one tool (owner's message of
  // 2026-10-22) — the same spreadsheets, charts and questions AND the same
  // documents and collections, drawn as one conversation and one work pane
  // (components/analyze/analyze-shell.tsx). /dashboard/files redirects
  // here; this is now the one address for both.
  const [{ data: fileRows }, { data: collectionRows }, { data: itemRows }] = await Promise.all([
    supabase
      .from("user_files")
      .select(FILE_LIST_COLUMNS)
      .eq("user_id", user.id)
      .order("uploaded_at", { ascending: false })
      .limit(1000),
    supabase
      .from("file_collections")
      .select("id, name, description")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("file_collection_items")
      .select("collection_id, file_id")
      .eq("user_id", user.id)
      .limit(5000),
  ]);
  const byCollection = new Map<string, string[]>();
  for (const item of itemRows ?? []) {
    const key = String(item.collection_id);
    byCollection.set(key, [...(byCollection.get(key) ?? []), String(item.file_id)]);
  }
  const initialFiles = (fileRows ?? []) as unknown as WorkspaceFile[];
  const initialCollections: WorkspaceCollection[] = (collectionRows ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name),
    description: c.description === null ? null : String(c.description),
    fileIds: byCollection.get(String(c.id)) ?? [],
  }));

  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <AnalyzeShell
        analyses={analyses}
        current={current}
        initialFiles={initialFiles}
        initialCollections={initialCollections}
        initialOpenId={readRequestedId(searchParams.record)}
        pages
        initialText={readExampleParam(searchParams.ask)}
      />
    </div>
  );
}
