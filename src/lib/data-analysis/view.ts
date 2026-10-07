import type { BuiltChart } from "@/lib/data-analysis/charts";
import type { AnalysisFindings } from "@/lib/data-analysis/analyse";
import type { ColumnProfile, TableProfile } from "@/lib/data-analysis/profile";
import type { QueryResult } from "@/lib/data-analysis/query";

export type AnalysisSummary = { id: string; title: string; rowCount: number; createdAt: string; analysed: boolean };

export type AskRecord = {
  id: string;
  question: string;
  answer: string | null;
  evidence: QueryResult | null;
};

/** One uploaded file as Analyze draws it: what it is, what was found in
 *  it, its charts and the questions asked of it (app/dashboard/data-analysis/page.tsx). */
export type AnalysisView = {
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
};

/** One line on a column: its range and mean, its dates, or its commonest values. */
export function describeColumn(column: ColumnProfile): string {
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
