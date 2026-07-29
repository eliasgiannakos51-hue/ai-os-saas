import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
  description: "AI_OS pricing — Free, Pro, and Enterprise plans.",
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
    description: "Everything you need to try AI_OS.",
    features: [
      "all 13 modules",
      "20 Create Anything requests / month",
      "CSV + JSON export",
    ],
    cta: "sign_up()",
    href: "/login?mode=signup",
  },
  {
    name: "Pro",
    price: "$15",
    period: "/month",
    description: "For running your work through AI_OS day to day.",
    features: [
      "everything in Free",
      "unlimited Create Anything",
      "priority support",
    ],
    cta: "sign_up()",
    href: "/login?mode=signup",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "contact us",
    description: "Custom limits, SSO, and support for teams.",
    features: [
      "everything in Pro",
      "custom rate limits",
      "dedicated support",
    ],
    cta: "contact_us()",
    href: "/login?mode=signup",
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-16 font-mono text-foreground sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <Link
            href="/"
            className="text-sm tracking-widest text-amber-500 transition-colors hover:text-amber-400"
          >
            AI_OS //
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">
            pricing
          </h1>
          <p className="mt-3 text-sm text-muted">
            Billing isn&apos;t live yet — sign up free while we finish it.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-md border p-6 ${
                plan.highlighted
                  ? "border-amber-500 bg-amber-950/10 shadow-[0_0_0_1px_rgba(245,158,11,0.15)]"
                  : "border-border bg-panel"
              }`}
            >
              <h2 className="text-sm font-semibold text-amber-500">
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
                    <span className="text-amber-500" aria-hidden="true">
                      ✓
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`mt-6 inline-flex min-h-[44px] items-center justify-center rounded px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 sm:min-h-0 ${
                  plan.highlighted
                    ? "bg-amber-500 text-black"
                    : "border border-border text-foreground transition-colors hover:border-amber-500 hover:text-amber-400"
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
            className="text-xs text-amber-500 underline underline-offset-2"
          >
            ← back to AI_OS
          </Link>
        </div>
      </div>
    </main>
  );
}
