import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Route } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { pageTitle } from "@/lib/page-title";
import { PageHeader } from "@/components/dashboard/page-header";
import { formatNumber } from "@/lib/format-number";
import { loadRoutingDashboard, loadLearnedRates, DEFAULT_MIN_SAMPLES } from "@/lib/ai/routing/outcome-store";
import { DEFAULT_MIN_SUCCESS_RATE } from "@/lib/ai/routing/route";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.routing");
}

/**
 * WHICH MODEL WENT WHERE, WHAT IT COST, AND WHAT ROUTING SAVED (V4 #35).
 *
 * OWNER-ONLY, and a NOT-FOUND rather than a 403 — the same choice the
 * margin report and the financial dashboard make. A 403 tells a stranger
 * the page exists and is worth coming back for.
 *
 * THE COLUMN THAT MATTERS IS "ABSORBED". A router saves money by trying
 * a cheap model first; when that fails, the customer is charged for the
 * successful attempt only and WE eat the failed one. If absorbed spend
 * ever approaches what the cheap tiers save, the routing is not saving
 * anything — it is moving the cost from the invoice to the margin, and
 * that is invisible in every other report in this application.
 *
 * NO NUMBERS ARE INVENTED. An empty table means no routing decisions
 * have been recorded, and it says so rather than rendering zeros that
 * would read as "the router is doing nothing".
 */
export default async function RoutingPage() {
  const t = await getTranslations("routing");
  // THE LOCALE IS PASSED, never left to the server's own. A bare
  // toLocaleString() formats by whatever the Node process happens to be
  // set to, so the same page renders 1,234 for one reader and 1.234 for
  // another with nothing choosing between them.
  const locale = await getLocale();
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) notFound();

  const [rows, learned] = await Promise.all([loadRoutingDashboard(30), loadLearnedRates(30)]);

  const totalCharged = rows.reduce((s, r) => s + r.chargedUsd, 0);
  const totalAbsorbed = rows.reduce((s, r) => s + r.absorbedUsd, 0);
  const totalOverrideSaving = rows.reduce((s, r) => s + r.overrideSavingUsd, 0);
  const totalDecisions = rows.reduce((s, r) => s + r.decisions, 0);

  const learnedRows = Object.entries(learned.successRates)
    .map(([key, rate]) => {
      const [feature, ...rest] = key.split(":");
      return { feature, modelId: rest.join(":"), rate, samples: learned.sampleCounts[key] ?? 0 };
    })
    .sort((a, b) => a.rate - b.rate);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <PageHeader
        icon={Route}
        title={t("title")}
        description={t("description")}
        helpKey="help.routing"
      />

      {totalDecisions === 0 ? (
        // NOTHING RECORDED IS NOT ZERO SPEND. Saying so beats a table of
        // zeros that reads as "routing is running and saving nothing".
        <p className="rounded-2xl border border-border bg-panel p-5 text-sm text-muted">
{t("empty")}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card label={t("decisions")} value={formatNumber(totalDecisions, locale)} />
            <Card label={t("charged")} value={`$${totalCharged.toFixed(4)}`} />
            <Card
              label={t("absorbed")}
              value={`$${totalAbsorbed.toFixed(4)}`}
              note={t("absorbedNote")}
              alarming={totalAbsorbed > totalOverrideSaving && totalOverrideSaving > 0}
            />
            <Card
              label={t("saved")}
              value={`$${totalOverrideSaving.toFixed(4)}`}
              note={t("savedNote")}
            />
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-panel">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="p-3 font-medium">{t("model")}</th>
                  <th className="p-3 font-medium">{t("decisions")}</th>
                  <th className="p-3 font-medium">{t("charged")}</th>
                  <th className="p-3 font-medium">{t("absorbed")}</th>
                  <th className="p-3 font-medium">{t("overrides")}</th>
                  <th className="p-3 font-medium">{t("overrideSaving")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.modelId} className="border-b border-border/60 last:border-0">
                    <td className="p-3 font-mono text-xs text-foreground">{row.modelId}</td>
                    <td className="p-3 text-foreground">{formatNumber(row.decisions, locale)}</td>
                    <td className="p-3 text-foreground">${row.chargedUsd.toFixed(5)}</td>
                    <td className={`p-3 ${row.absorbedUsd > 0 ? "text-orange-400" : "text-muted"}`}>
                      ${row.absorbedUsd.toFixed(5)}
                    </td>
                    <td className="p-3 text-foreground">{formatNumber(row.overrides, locale)}</td>
                    <td className="p-3 text-emerald-400">${row.overrideSavingUsd.toFixed(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-panel p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("learnedTitle")}</h2>
        <p className="mt-1 text-xs text-muted">
          {t("learnedIntro", {
            rate: (DEFAULT_MIN_SUCCESS_RATE * 100).toFixed(0),
            samples: DEFAULT_MIN_SAMPLES,
          })}
        </p>
        {learnedRows.length === 0 ? (
          <p className="mt-3 text-xs text-muted">{t("learnedEmpty")}</p>
        ) : (
          <ul className="mt-3 space-y-1 text-xs">
            {learnedRows.map((row) => {
              const enough = row.samples >= DEFAULT_MIN_SAMPLES;
              const failing = enough && row.rate < DEFAULT_MIN_SUCCESS_RATE;
              return (
                <li key={`${row.feature}:${row.modelId}`} className="flex flex-wrap justify-between gap-2">
                  <span className="text-muted">
                    {row.feature} <span className="font-mono">{row.modelId}</span>
                  </span>
                  <span className={failing ? "text-orange-400" : "text-foreground"}>
                    {t("runs", { rate: (row.rate * 100).toFixed(1), samples: row.samples })}
                    {failing ? ` — ${t("routedUp")}` : enough ? "" : ` (${t("notEnough")})`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  note,
  alarming,
}: {
  label: string;
  value: string;
  note?: string;
  alarming?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${alarming ? "text-orange-400" : "text-foreground"}`}>{value}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}
