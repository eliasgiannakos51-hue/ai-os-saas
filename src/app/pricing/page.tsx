import type { Metadata } from "next";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Nexa AI pricing — Free, Pro, and Enterprise plans.",
};

type Plan = {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlighted?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    description: "Everything you need to try Nexa AI.",
    features: [
      "All 13 modules",
      "20 Create Anything requests / month",
      "CSV + JSON export",
    ],
    cta: "Sign Up",
    href: "/login?mode=signup",
  },
  {
    name: "Pro",
    price: "$15",
    period: "/month",
    description: "For running your work through Nexa AI day to day.",
    features: [
      "Everything in Free",
      "Unlimited Create Anything",
      "Priority support",
    ],
    cta: "Sign Up",
    href: "/login?mode=signup",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Contact us",
    description: "Custom limits, SSO, and support for teams.",
    features: [
      "Everything in Pro",
      "Custom rate limits",
      "Dedicated support",
    ],
    cta: "Contact Us",
    href: "/login?mode=signup",
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 transition-colors duration-150 hover:text-orange-400"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15 text-orange-400">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-base font-bold tracking-tight text-foreground">
              NEXA
            </span>
          </Link>
          <h1 className="mt-6 text-3xl font-bold text-foreground sm:text-4xl">
            Pricing
          </h1>
          <p className="mt-3 text-sm text-muted">
            Billing isn&apos;t live yet — sign up free while we finish it.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-2xl border p-6 ${
                plan.highlighted
                  ? "border-orange-500/60 bg-orange-500/[0.04] shadow-[0_0_24px_rgba(249,115,22,0.12)]"
                  : "border-border bg-panel"
              }`}
            >
              <h2 className="text-sm font-semibold text-orange-400">
                {plan.name}
              </h2>
              <p className="mt-3 text-2xl font-bold text-foreground">
                {plan.price}
                {plan.period && (
                  <span className="text-sm font-normal text-muted">
                    {plan.period}
                  </span>
                )}
              </p>
              <p className="mt-2 text-xs text-muted">{plan.description}</p>

              <ul className="mt-6 flex-1 space-y-2 text-sm text-muted">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 sm:min-h-0 ${
                  plan.highlighted
                    ? "bg-orange-500 text-black hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
                    : "border border-border text-foreground hover:border-orange-500 hover:text-orange-400"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/"
            className="text-xs text-orange-400 underline underline-offset-2"
          >
            ← Back to Nexa AI
          </Link>
        </div>
      </div>
    </main>
  );
}
