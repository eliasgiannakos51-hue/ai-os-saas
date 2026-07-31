import type { Metadata } from "next";
import Link from "next/link";
import { Check, Clock, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { PLANS, TEAM_SEAT_PRICE_USD, type Plan, type PaidPlanSlug } from "@/lib/billing/plans";
import { SubscribeButton } from "@/components/billing/subscribe-button";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Veron AI pricing — Free, Starter, Growth, Professional, and Ultimate plans.",
};

type ComparisonCell =
  | { type: "value"; text: string }
  | { type: "check" }
  | { type: "cross" }
  | { type: "soon" };

// Mirrors the cumulative "Everything in X" feature lists in
// src/lib/billing/plans.ts as a flat, per-plan matrix — kept here rather
// than restructuring PLANS itself, since that array is also consumed
// elsewhere (Settings, Team page) in its current cumulative-bullet shape.
const COMPARISON_ROWS: { label: string; cell: (plan: Plan) => ComparisonCell }[] = [
  {
    label: "AI requests / month",
    cell: (p) => ({
      type: "value",
      text: p.aiRequestsPerMonth === "unlimited" ? "Unlimited" : p.aiRequestsPerMonth.toLocaleString(),
    }),
  },
  { label: "Access to all 13 modules", cell: () => ({ type: "check" }) },
  {
    label: "Veron Chat history",
    cell: (p) => ({ type: "value", text: p.slug === "free" ? "7 days" : "Unlimited" }),
  },
  {
    label: "Pinned conversations",
    cell: (p) => (p.slug === "free" ? { type: "cross" } : { type: "check" }),
  },
  {
    label: "CSV export (every module)",
    cell: (p) => (p.slug === "free" ? { type: "cross" } : { type: "check" }),
  },
  {
    label: "Full data export (JSON, all modules)",
    cell: (p) => (p.slug === "free" || p.slug === "starter" ? { type: "cross" } : { type: "check" }),
  },
  {
    label: "Team seats",
    cell: (p) => (p.hasTeamSeats ? { type: "check" } : { type: "cross" }),
  },
  {
    label: "Priority email support",
    cell: (p) => (p.slug === "professional" || p.slug === "ultimate" ? { type: "check" } : { type: "cross" }),
  },
  {
    label: "Dedicated support",
    cell: (p) => (p.slug === "ultimate" ? { type: "check" } : { type: "cross" }),
  },
  {
    label: "Automation Builder",
    cell: (p) =>
      p.slug === "growth" || p.slug === "professional" || p.slug === "ultimate"
        ? { type: "soon" }
        : { type: "cross" },
  },
  {
    label: "AI Agent Builder",
    cell: (p) => (p.slug === "professional" || p.slug === "ultimate" ? { type: "soon" } : { type: "cross" }),
  },
  {
    label: "Website Builder",
    cell: (p) => (p.slug === "professional" || p.slug === "ultimate" ? { type: "soon" } : { type: "cross" }),
  },
  {
    label: "Video/Image Studio",
    cell: (p) => (p.slug === "ultimate" ? { type: "soon" } : { type: "cross" }),
  },
  {
    label: "Marketplace access",
    cell: (p) => (p.slug === "ultimate" ? { type: "soon" } : { type: "cross" }),
  },
];

function ComparisonCellContent({ cell }: { cell: ComparisonCell }) {
  if (cell.type === "value") {
    return <span className="text-sm text-foreground">{cell.text}</span>;
  }
  if (cell.type === "check") {
    return <Check className="mx-auto h-4 w-4 text-emerald-400" aria-hidden="true" />;
  }
  if (cell.type === "soon") {
    return (
      <span className="inline-flex items-center rounded-full border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-orange-400">
        Soon
      </span>
    );
  }
  return <X className="mx-auto h-4 w-4 text-muted/50" aria-hidden="true" />;
}

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 transition-colors duration-150 hover:text-orange-400"
          >
            <Logo iconOnly className="h-6 w-6" />
            <span className="text-base font-bold tracking-tight text-foreground">
              VERON
            </span>
          </Link>
          <h1 className="mt-6 text-3xl font-bold text-foreground sm:text-4xl">
            Pricing
          </h1>
          <p className="mt-3 text-sm text-muted">
            Start free. Upgrade whenever you need more AI requests or team seats.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {PLANS.map((plan) => (
            <div
              key={plan.slug}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.highlighted
                  ? "border-orange-500/60 bg-orange-500/[0.04] shadow-[0_0_24px_rgba(249,115,22,0.12)]"
                  : "border-border bg-panel"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-orange-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-black">
                  Most Popular
                </span>
              )}
              <h2 className="text-sm font-semibold text-orange-400">{plan.name}</h2>
              <p className="mt-3 text-2xl font-bold text-foreground">
                ${plan.price}
                {plan.price > 0 && (
                  <span className="text-sm font-normal text-muted">/month</span>
                )}
              </p>
              <p className="mt-2 text-xs text-muted">
                {plan.aiRequestsPerMonth === "unlimited"
                  ? "Unlimited AI requests/month"
                  : `${plan.aiRequestsPerMonth.toLocaleString()} AI requests/month`}
              </p>

              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-muted">
                {plan.features.map((feature) => (
                  <li key={feature.text} className="flex items-start gap-2">
                    {feature.comingSoon ? (
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    ) : (
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-orange-400"
                        aria-hidden="true"
                      />
                    )}
                    <span className={feature.comingSoon ? "text-muted" : undefined}>
                      {feature.text}
                      {feature.comingSoon && (
                        <span className="ml-1.5 inline-flex items-center rounded-full border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-400">
                          Coming Soon
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {plan.hasTeamSeats && (
                <p className="mt-4 border-t border-border pt-4 text-[11px] leading-relaxed text-muted">
                  + ${TEAM_SEAT_PRICE_USD}/month per team member — each member
                  gets full access at your plan&apos;s tier
                </p>
              )}

              <div className="mt-6">
                {plan.slug === "free" ? (
                  <Link
                    href="/signup?plan=free"
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-all duration-200 hover:border-orange-500 hover:text-orange-400 sm:min-h-0"
                  >
                    Sign Up
                  </Link>
                ) : (
                  <SubscribeButton
                    plan={plan.slug as PaidPlanSlug}
                    label={`Get ${plan.name}`}
                    className={`inline-flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 ${
                      plan.highlighted
                        ? "bg-orange-500 text-black hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
                        : "border border-border text-foreground hover:border-orange-500 hover:text-orange-400"
                    }`}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-border bg-panel p-6 text-center">
          <h2 className="text-sm font-semibold text-orange-400">Need it for your team?</h2>
          <p className="mt-2 text-sm text-muted">
            Add members to any paid plan for +${TEAM_SEAT_PRICE_USD}/member/month — everyone
            gets full access at your plan&apos;s tier.
          </p>
        </div>

        <div className="mt-16">
          <h2 className="mb-5 text-center text-xl font-bold text-foreground">
            Compare plans
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-panel">
                  <th className="px-4 py-3 text-left font-semibold text-muted">Feature</th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan.slug}
                      className={`px-4 py-3 text-center font-semibold ${
                        plan.highlighted ? "text-orange-400" : "text-foreground"
                      }`}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, index) => (
                  <tr
                    key={row.label}
                    className={`border-b border-border last:border-b-0 ${
                      index % 2 === 1 ? "bg-panel/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-left text-muted">{row.label}</td>
                    {PLANS.map((plan) => (
                      <td key={plan.slug} className="px-4 py-3 text-center">
                        <ComparisonCellContent cell={row.cell(plan)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/"
            className="text-xs text-orange-400 underline underline-offset-2"
          >
            ← Back to Veron AI
          </Link>
        </div>
      </div>
    </main>
  );
}
