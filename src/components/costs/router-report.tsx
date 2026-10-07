import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { RoutingReport, Bucket } from "@/lib/billing/routing-report";
import type { ExpandedRow, TableProblem } from "@/lib/ai/routing/model-table";
import { formatNumber } from "@/lib/format-number";

/**
 * The router section of /dashboard/costs (BUILD-SPECS 2.13 Ζ).
 *
 * Rendered only from src/app/dashboard/costs/page.tsx, after its
 * isAdminEmail check: nothing here — model names, dollar costs, the
 * table — is ever sent to anybody else's browser (scenario 10), and
 * scripts/tests/routing-report.test.mjs holds that this component is
 * imported nowhere else.
 */

export const ROUTER_PERIODS = [1, 7, 30] as const;
export type RouterPeriod = (typeof ROUTER_PERIODS)[number];

export function readRouterPeriod(value: unknown): RouterPeriod {
  const n = Number(value);
  return (ROUTER_PERIODS as readonly number[]).includes(n) ? (n as RouterPeriod) : 30;
}

export type RouterReportProps = {
  report: RoutingReport;
  period: RouterPeriod;
  table: ExpandedRow[];
  tableVersion: string;
  tableSource: "env" | "default";
  tableRejected: TableProblem[] | null;
  /** Set when the row cap was hit: the figures cover only the newest rows. */
  truncatedAt: number | null;
  locale: string;
};

const PERIOD_KEY: Record<RouterPeriod, "day" | "week" | "month"> = { 1: "day", 7: "week", 30: "month" };

export async function RouterReport(props: RouterReportProps) {
  const t = await getTranslations("routerReport");
  const { report, locale } = props;
  const nf = (v: number, opts: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, opts).format(v);
  const eur = (v: number, digits = 4) => `€${nf(v, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  const pct = (v: number | null) => (v === null ? null : `${nf(v * 100, { maximumFractionDigits: 1 })}%`);

  return (
    <section className="mb-6 surface" aria-labelledby="router-report-title">
      <h2 id="router-report-title" className="mb-1 text-sm font-semibold text-foreground">
        {t("title")}
      </h2>
      <p className="mb-3 text-xs text-muted">{t("intro")}</p>

      <nav aria-label={t("period")} className="mb-4 flex flex-wrap gap-2">
        {ROUTER_PERIODS.map((p) => (
          <Link
            key={p}
            href={`/dashboard/costs?days=${p}`}
            aria-current={p === props.period ? "page" : undefined}
            className={`inline-flex min-h-[44px] items-center rounded-item px-3 text-xs ${
              p === props.period ? "bg-panel-hover text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {t(PERIOD_KEY[p])}
          </Link>
        ))}
      </nav>

      {props.truncatedAt !== null && (
        <p className="mb-3 text-xs text-warning">{t("truncated", { cap: formatNumber(props.truncatedAt, locale) })}</p>
      )}

      {report.requests === 0 ? (
        <p className="text-xs text-muted">{t("empty")}</p>
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label={t("requests")} value={formatNumber(report.requests, locale)} />
            <Figure label={t("avgCost")} value={report.avgCostPerRequestEur === null ? "—" : eur(report.avgCostPerRequestEur)} />
            <Figure label={t("revenue")} value={eur(report.revenueEur, 2)} />
            <Figure label={t("margin")} value={report.margin === null ? "—" : `${nf(report.margin, { maximumFractionDigits: 2 })}×`} />
            <Figure label={t("cached")} value={pct(report.cachedTokenShare) ?? "—"} />
            <Figure label={t("fallback")} value={pct(report.fallbackShare) ?? t("unavailable")} />
            <Figure label={t("escalated")} value={t("notRecorded")} />
            <Figure label={t("bumped")} value={pct(report.bumpedShare) ?? "—"} />
          </dl>
          {report.unclassified > 0 && (
            <p className="mb-3 text-xs text-muted">{t("unclassified", { count: report.unclassified })}</p>
          )}

          <BucketTable title={t("byCategory")} buckets={report.byCategory} total={report.requests} t={t} eur={eur} pct={pct} />
          <BucketTable title={t("byTier")} buckets={report.byTier} total={report.requests} t={t} eur={eur} pct={pct} />
          <BucketTable title={t("byModel")} buckets={report.byModel} total={report.requests} t={t} eur={eur} pct={pct} />
          <BucketTable title={t("byFeature")} buckets={report.byFeature} total={report.requests} t={t} eur={eur} pct={pct} />

          <h3 className="mb-1 mt-4 text-xs font-semibold text-foreground">{t("shadowTitle")}</h3>
          <p className="text-xs text-muted">
            {report.shadow.rows === 0
              ? t("shadowNone")
              : t("shadowBody", {
                  projected: eur(report.shadow.projectedCostEur),
                  actual: eur(report.shadow.actualCostEur),
                  rows: formatNumber(report.shadow.rows, locale),
                })}
          </p>
        </>
      )}

      <details className="mt-4">
        <summary className="min-h-[44px] cursor-pointer py-3 text-xs font-semibold text-foreground">
          {t("tableTitle", { version: props.tableVersion, source: t(props.tableSource === "env" ? "sourceEnv" : "sourceDefault") })}
        </summary>
        {props.tableRejected && (
          <p className="mb-2 text-xs text-warning">
            {t("tableRejected", { problems: props.tableRejected.map((p) => `${p.where}: ${p.problem}`).join("; ") })}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1 pe-3 font-normal">{t("colCategory")}</th>
                <th scope="col" className="py-1 pe-3 font-normal">{t("colTier")}</th>
                <th scope="col" className="py-1 pe-3 font-normal">{t("colPrimary")}</th>
                <th scope="col" className="py-1 pe-3 font-normal">{t("colFallback")}</th>
                <th scope="col" className="py-1 pe-3 font-normal">{t("colPrice")}</th>
                <th scope="col" className="py-1 pe-3 font-normal">{t("colWait")}</th>
                <th scope="col" className="py-1 font-normal">{t("colQuality")}</th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              {props.table.map((r) => (
                <tr key={`${r.category}:${r.tier}`}>
                  <td className="py-1 pe-3">{r.category}</td>
                  <td className="py-1 pe-3">{r.tier}</td>
                  <td className="py-1 pe-3">{r.primary}</td>
                  <td className="py-1 pe-3">{r.fallback ?? "—"}</td>
                  <td className="py-1 pe-3 tabular-nums">
                    {t("pricePer1k", { input: nf(r.inputPer1k, { maximumFractionDigits: 5 }), output: nf(r.outputPer1k, { maximumFractionDigits: 5 }) })}
                  </td>
                  <td className="py-1 pe-3 tabular-nums">{t("seconds", { n: formatNumber(r.maxWaitMs / 1000, locale) })}</td>
                  <td className="py-1">
                    {r.quality ? `${nf(r.quality.score * 100, { maximumFractionDigits: 1 })}% · ${r.quality.measuredAt}` : t("notMeasured")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-tight">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function BucketTable({
  title,
  buckets,
  total,
  t,
  eur,
  pct,
}: {
  title: string;
  buckets: Bucket[];
  total: number;
  t: Awaited<ReturnType<typeof getTranslations<"routerReport">>>;
  eur: (v: number, digits?: number) => string;
  pct: (v: number | null) => string | null;
}) {
  if (buckets.length === 0) return null;
  return (
    <div className="mb-4 overflow-x-auto">
      <h3 className="mb-1 text-xs font-semibold text-foreground">{title}</h3>
      <table className="w-full text-start text-xs">
        <thead className="text-muted">
          <tr>
            <th scope="col" className="py-1 pe-3 font-normal">{t("colName")}</th>
            <th scope="col" className="py-1 pe-3 font-normal">{t("colRequests")}</th>
            <th scope="col" className="py-1 pe-3 font-normal">{t("colShare")}</th>
            <th scope="col" className="py-1 pe-3 font-normal">{t("colCost")}</th>
            <th scope="col" className="py-1 font-normal">{t("colAvg")}</th>
          </tr>
        </thead>
        <tbody className="text-foreground">
          {buckets.map((b) => (
            <tr key={b.key}>
              <td className="py-1 pe-3">{b.key}</td>
              <td className="py-1 pe-3 tabular-nums">{b.requests}</td>
              <td className="py-1 pe-3 tabular-nums">{pct(total > 0 ? b.requests / total : null)}</td>
              <td className="py-1 pe-3 tabular-nums">{eur(b.costEur)}</td>
              <td className="py-1 tabular-nums">{eur(b.avgEur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
