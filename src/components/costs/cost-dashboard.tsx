import type { MonthlyRevenue } from "@/lib/billing/monthly-revenue";
import { formatNumber } from "@/lib/format-number";

/**
 * The owner's view of spend. Server-rendered, no client state: every
 * number here comes from one page load, and a chart that re-fetches
 * would be a second source of truth for the same figures.
 *
 * THE TREND IS DRAWN AS BARS IN CSS rather than as an SVG chart library.
 * A published-site CSP and a 30-point series do not need one, and the
 * numbers are also printed — a shape somebody has to squint at is not a
 * measurement.
 */

export type CostDashboardData = {
  daily: { day: string; costEur: number; calls: number; creditsCharged: number }[];
  features: {
    feature: string;
    costEur: number;
    calls: number;
    creditsCharged: number;
    chargedCalls: number;
    margin: number | null;
  }[];
  topUsers: { userId: string; costEur: number; calls: number; creditsCharged: number }[];
  alerts: {
    id: string;
    type: string;
    payload: Record<string, unknown>;
    delivered: boolean;
    createdAt: string;
  }[];
  revenue: MonthlyRevenue;
  marginTarget: number;
  unavailable: string[];
};

const eur = (v: number) => `€${v.toFixed(2)}`;

export function CostDashboard({ data, locale }: { data: CostDashboardData; locale: string }) {
  const total = data.daily.reduce((s, d) => s + d.costEur, 0);
  const calls = data.daily.reduce((s, d) => s + d.calls, 0);
  const peak = Math.max(1, ...data.daily.map((d) => d.costEur));
  const belowTarget = data.features.filter(
    (f) => f.margin !== null && f.margin < data.marginTarget
  );

  return (
    <>
      {data.unavailable.length > 0 && (
        <p className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 text-xs text-amber-300">
          {/* NOT "no data": a query that failed is not a quiet month, and
              showing €0.00 for one would be the most misleading number on
              the page. */}
          Could not read: {data.unavailable.join(", ")}. The figures below are incomplete.
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="30-day cost" value={eur(total)} />
        <Stat label="AI calls" value={formatNumber(calls, locale)} />
        <Stat
          label="MRR"
          value={data.revenue.complete ? eur(data.revenue.eur) : `${eur(data.revenue.eur)}+`}
          note={
            data.revenue.complete
              ? undefined
              : `${data.revenue.unpricedSubscribers} subscriber(s) on ${data.revenue.unpricedTiers.join(", ")} have no listed price`
          }
        />
        <Stat
          label="Features below target"
          value={String(belowTarget.length)}
          tone={belowTarget.length > 0 ? "bad" : "good"}
        />
      </div>

      <Section title="Cost per day (30 days)">
        {data.daily.length === 0 ? (
          <Empty>No settled usage in the last 30 days.</Empty>
        ) : (
          <ol className="space-y-1">
            {data.daily.map((d) => (
              <li key={d.day} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 tabular-nums text-muted">{d.day}</span>
                <span className="h-2 min-w-[2px] rounded-sm bg-orange-500/70" style={{ width: `${(d.costEur / peak) * 100}%` }} />
                <span className="tabular-nums text-foreground">{eur(d.costEur)}</span>
                <span className="tabular-nums text-muted">{d.calls} calls</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Cost and margin per feature (30 days)">
        {data.features.length === 0 ? (
          <Empty>No settled usage in the last 30 days.</Empty>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-medium">Feature</th>
                <th className="py-1 text-right font-medium">Cost</th>
                <th className="py-1 text-right font-medium">Calls</th>
                <th className="py-1 text-right font-medium">Charged</th>
                <th className="py-1 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {data.features.map((f) => (
                <tr key={f.feature} className="border-t border-border">
                  <td className="py-1.5 text-foreground">{f.feature}</td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">{eur(f.costEur)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted">{f.calls}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted">{f.chargedCalls}</td>
                  <td
                    className={`py-1.5 text-right tabular-nums ${
                      f.margin === null
                        ? "text-muted"
                        : f.margin < data.marginTarget
                          ? "text-red-400"
                          : "text-emerald-400"
                    }`}
                  >
                    {/* An em dash, not 0x. A feature whose calls were all
                        bypass has NO measured margin — printing a number
                        there would invent one. */}
                    {f.margin === null ? "—" : `${f.margin.toFixed(2)}x`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Top spenders (30 days)">
        {data.topUsers.length === 0 ? (
          <Empty>No settled usage in the last 30 days.</Empty>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-medium">Account</th>
                <th className="py-1 text-right font-medium">Cost</th>
                <th className="py-1 text-right font-medium">Calls</th>
                <th className="py-1 text-right font-medium">Credits</th>
              </tr>
            </thead>
            <tbody>
              {data.topUsers.map((u) => (
                <tr key={u.userId} className="border-t border-border">
                  <td className="py-1.5 font-mono text-[11px] text-muted">{u.userId}</td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">{eur(u.costEur)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted">{u.calls}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted">{u.creditsCharged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Alerts">
        {data.alerts.length === 0 ? (
          <Empty>Nothing has fired.</Empty>
        ) : (
          <ul className="space-y-2">
            {data.alerts.map((a) => (
              <li key={a.id} className="rounded-lg border border-border bg-input px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground">{a.type}</span>
                  <span className="tabular-nums text-muted">{a.createdAt.slice(0, 16).replace("T", " ")}</span>
                </div>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-muted">
                  {JSON.stringify(a.payload)}
                </pre>
                {/* A row that claimed the hour's slot and then failed to
                    send is the worst outcome — silent for an hour AND
                    nothing delivered — so it is named, not hidden. */}
                {!a.delivered && (
                  <p className="mt-1 text-[11px] text-red-400">Claimed the hour but was never delivered.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-2xl border border-border bg-panel p-5">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>;
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-xl border border-border bg-panel p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          tone === "bad" ? "text-red-400" : tone === "good" ? "text-emerald-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-amber-400">{note}</p>}
    </div>
  );
}
