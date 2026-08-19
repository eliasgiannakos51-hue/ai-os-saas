import type { Metadata } from "next";
import { pageTitle } from "@/lib/page-title";
import { notFound, redirect } from "next/navigation";
import { Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/dashboard/page-header";
import { isAdminEmail } from "@/lib/admin";
import { logApiError } from "@/lib/log-error";
import { ErrorList, type ProductionErrorRow } from "@/components/system-health/error-list";
import { StorageDiagnostics } from "@/components/system-health/storage-diagnostics";
import { formatNumber } from "@/lib/format-number";
import { getLocale } from "next-intl/server";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("pageTitle.systemHealth");
}
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const RECENT_LIMIT = 100;

export default async function SystemHealthPage() {
  const locale = await getLocale();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // notFound() rather than a redirect or a "not allowed" message: a
  // non-owner should not learn that this page exists at all.
  if (!isAdminEmail(user.email)) notFound();

  let rows: ProductionErrorRow[] = [];
  let failed = false;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("production_errors")
      .select(
        "id, error_message, stack_trace, route, occurrence_count, affected_user_ids, first_seen_at, occurred_at, resolved"
      )
      // Unresolved first, then most recent — the question this page
      // answers is "what is broken now", not "what has ever broken".
      .order("resolved", { ascending: true })
      .order("occurred_at", { ascending: false })
      .limit(RECENT_LIMIT);
    if (error) throw error;

    rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      errorMessage: String(r.error_message ?? ""),
      stackTrace: r.stack_trace ? String(r.stack_trace) : null,
      route: String(r.route ?? "unknown"),
      occurrenceCount: Number(r.occurrence_count ?? 0),
      affectedUsers: Array.isArray(r.affected_user_ids) ? r.affected_user_ids.length : 0,
      firstSeenAt: String(r.first_seen_at),
      occurredAt: String(r.occurred_at),
      resolved: Boolean(r.resolved),
    }));
  } catch (err) {
    // NOT logApiError: that would record this failure into the very table
    // that just failed to read, on every page load.
    console.error("system-health: could not load production_errors", err);
    failed = true;
  }

  const unresolved = rows.filter((r) => !r.resolved);

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <PageHeader
          icon={Activity}
          title="System Health"
          description="Production errors, deduplicated. Owner only."
        />

        {failed ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/[0.05] p-4 text-xs text-red-300">
            Could not load errors. Check that the production_errors table exists.
          </p>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Open issues" value={unresolved.length} tone={unresolved.length > 0 ? "bad" : "good"} />
              <Stat
                label="Occurrences (open)"
                value={unresolved.reduce((sum, r) => sum + r.occurrenceCount, 0)}
              />
              <Stat
                label="Users affected (open)"
                value={unresolved.reduce((sum, r) => sum + r.affectedUsers, 0)}
              />
            </div>
            <ErrorList rows={rows} />
          </>
        )}

        <StorageDiagnostics />
      </div>
    </main>
  );
}

async function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "good" | "bad" | "neutral";
}) {
  const locale = await getLocale();
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          tone === "bad" ? "text-red-400" : tone === "good" ? "text-emerald-400" : "text-foreground"
        }`}
      >
        {formatNumber(value, locale)}
      </p>
    </div>
  );
}
