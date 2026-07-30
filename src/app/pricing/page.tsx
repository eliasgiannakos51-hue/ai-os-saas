import type { Metadata } from "next";
import Link from "next/link";
import { Check, Clock } from "lucide-react";
import { Logo } from "@/components/logo";
import { PLANS, TEAM_SEAT_PRICE_USD, type PaidPlanSlug } from "@/lib/billing/plans";
import { SubscribeButton } from "@/components/billing/subscribe-button";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Veron AI pricing — Free, Starter, Growth, Professional, and Ultimate plans.",
};

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
                    href="/login?mode=signup"
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
