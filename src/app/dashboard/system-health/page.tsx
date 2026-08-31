import type { Metadata } from "next";
import { pageTitle } from "@/lib/page-title";
import { notFound, redirect } from "next/navigation";
import { Activity } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/dashboard/page-header";
import { CapabilityStatus, type CapabilityRow } from "@/components/system-health/capability-status";
import { ENV_REQUIREMENTS, environmentWarnings } from "@/lib/env-check";
import { EnvWarnings } from "@/components/system-health/env-warnings";
import { DbExposure, type ExposureRow } from "@/components/system-health/db-exposure";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { logApiError } from "@/lib/log-error";
import { ErrorList, type ProductionErrorRow } from "@/components/system-health/error-list";
import { StorageDiagnostics } from "@/components/system-health/storage-diagnostics";
import { PwaAdoption, type PwaAdoptionRow } from "@/components/system-health/pwa-adoption";
import { formatNumber } from "@/lib/format-number";
import { getLocale } from "next-intl/server";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("pageTitle.systemHealth");
}
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const RECENT_LIMIT = 100;
/** The adoption window. Long enough to include people who visit weekly,
 *  short enough that a number is about the product as it is now. */
const PWA_WINDOW_DAYS = 30;

export default async function SystemHealthPage() {
  const locale = await getLocale();
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  // notFound() rather than a redirect or a "not allowed" message: a
  // non-owner should not learn that this page exists at all.
  if (!isAdminEmail(user.email)) notFound();

  // READ ONCE, ON THE SERVER, AND REDUCED TO BOOLEANS. `process.env` is
  // not available in the browser for anything without a NEXT_PUBLIC_
  // prefix, and the ones that DO have it are exactly the ones whose
  // values are public — but a component that received values could leak
  // one by rendering it, so it never receives any.
  const capabilities: CapabilityRow[] = ENV_REQUIREMENTS.map((req) => ({
    name: req.name,
    level: req.level,
    what: req.what,
    set: (process.env[req.name] ?? "").trim() !== "",
  }));

  // THE PAIRS. A per-variable list cannot show a problem that belongs to
  // two variables — see environmentWarnings' own comment for the one that
  // made this necessary. Computed here, on the server; only prose and
  // variable NAMES cross.
  const warnings = environmentWarnings();

  // WHAT THE DATABASE ITSELF SAYS IT EXPOSES. Read with the service-role
  // client because db_exposure_report() is SECURITY DEFINER and revoked
  // from every signed-in role: the counts are a map of where to attack
  // this database.
  let exposure: ExposureRow[] | null = null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("db_exposure_report");
    if (error) throw error;
    exposure = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      key: String(r.check_key ?? ""),
      found: Number(r.found ?? 0),
      expected: Number(r.expected ?? 0),
      ok: Boolean(r.ok),
      detail: String(r.detail ?? ""),
    }));
  } catch (err) {
    // Not logApiError, for the same reason as the reads below it: this
    // page must render even when a read it depends on cannot.
    console.error("system-health: could not read db_exposure_report", err);
  }

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

  // The three PWA figures. Read with the service-role client because the
  // summary function is SECURITY DEFINER and revoked from every signed-in
  // role — it counts across all accounts, so no user may call it.
  let pwa: PwaAdoptionRow | null = null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("pwa_adoption_summary", { p_days: PWA_WINDOW_DAYS });
    if (error) throw error;
    const first = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (first) {
      const num = (v: unknown) => Number(v ?? 0);
      const pct = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      pwa = {
        devices: num(first.devices),
        iosDevices: num(first.ios_devices),
        iosPercent: pct(first.ios_percent),
        installedDevices: num(first.installed_devices),
        installedPercent: pct(first.installed_percent),
        pushGrantedDevices: num(first.push_granted_devices),
        pushGrantedPercent: pct(first.push_granted_percent),
        pushSubscribedDevices: num(first.push_subscribed_devices),
        pushSubscribedPercent: pct(first.push_subscribed_percent),
        iosInstalledDevices: num(first.ios_installed_devices),
        iosInstalledPercent: pct(first.ios_installed_percent),
      };
    }
  } catch (err) {
    // Same reasoning as above: do not log this into a table whose own read
    // may be what failed. A null row renders as "apply the migration".
    console.error("system-health: could not read pwa_adoption_summary", err);
  }

  return (
    <div className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <PageHeader
          icon={Activity}
          title="System Health"
          description="Production errors, deduplicated. Owner only."
          helpKey="help.systemHealth"
        />

        {/* FIRST, ABOVE THE ERRORS. A half-configured pair is not an
            error anybody will ever see in production_errors: nothing
            throws, nothing is logged, and the thing that would have
            reported it is the thing that is broken. */}
        <EnvWarnings warnings={warnings} />

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

        <PwaAdoption row={pwa} days={PWA_WINDOW_DAYS} />

        <StorageDiagnostics />

        <DbExposure rows={exposure} />

        {/* WHAT IS SILENTLY OFF — V4.6. Every variable's status is
            computed here, on the server, and only its NAME and a boolean
            cross the boundary. checkEnv already refuses to put a secret's
            value in a report; this does not give it the chance. */}
        <CapabilityStatus rows={capabilities} />
      </div>
    </div>
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
