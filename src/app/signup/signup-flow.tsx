"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronLeft } from "lucide-react";
import { getErrorMessage } from "@/lib/get-error-message";
import { isPasswordStrong } from "@/lib/password-strength";
import { PLANS, isPaidPlanSlug, type PlanSlug } from "@/lib/billing/plans";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrengthChecklist } from "@/components/auth/password-strength-checklist";
import { GeneratePasswordButton } from "@/components/auth/generate-password-button";
import { LoginSplash } from "@/components/auth/login-splash";
import { Logo } from "@/components/logo";

const FIELD_CLASS =
  "w-full rounded-xl border border-border bg-black/40 px-3 py-2.5 text-sm text-foreground outline-none transition-colors duration-150 focus:border-orange-500";

type Step = 1 | 2;

// New accounts start on plan selection instead of being asked to upgrade
// afterward. A ?plan=<slug> query param (used by pricing page's per-plan
// buttons and the team-invite email, which always passes plan=free) skips
// straight to step 2 with that plan pre-selected — read from
// window.location instead of useSearchParams() so this page doesn't need a
// Suspense boundary, same pattern as login-form.tsx's ?mode= handling.
export function SignupFlow() {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [selectedPlan, setSelectedPlan] = useState<PlanSlug>("free");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugDump, setDebugDump] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const planParam = params.get("plan");
    if (planParam && PLANS.some((p) => p.slug === planParam)) {
      setSelectedPlan(planParam as PlanSlug);
      setStep(2);
    }
  }, []);

  // Same debug pattern used in login-form.tsx / forgot-password-form.tsx —
  // dumps every own property of the raw error so a real failure shows its
  // full shape instead of a guess.
  function dumpErrorForDebugging(label: string, raw: unknown) {
    const info = {
      label,
      typeofRaw: typeof raw,
      isErrorInstance: raw instanceof Error,
      constructorName: raw && typeof raw === "object" ? raw.constructor?.name : undefined,
      keysEnumerable: raw && typeof raw === "object" ? Object.keys(raw) : [],
      allOwnProps: raw && typeof raw === "object" ? Object.getOwnPropertyNames(raw) : [],
      jsonStringifyAllProps: (() => {
        try {
          return raw && typeof raw === "object"
            ? JSON.stringify(raw, Object.getOwnPropertyNames(raw))
            : String(raw);
        } catch {
          return "<threw>";
        }
      })(),
    };
    // eslint-disable-next-line no-console
    console.error(`[signup debug] ${label}:`, raw);
    setDebugDump(JSON.stringify(info, null, 2));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDebugDump(null);

    if (!termsAccepted) {
      setError("You must agree to the Terms of Service and Privacy Policy to create an account.");
      return;
    }
    if (!isPasswordStrong(password)) {
      setError("Please choose a password that meets every requirement above.");
      return;
    }

    setLoading(true);
    try {
      const signupRes = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, termsAccepted }),
      });
      const signupData = await signupRes.json();
      if (!signupRes.ok || !signupData.ok) {
        dumpErrorForDebugging("/api/signup returned error", signupData.error);
        setError(getErrorMessage(signupData.error, "Signup failed."));
        return;
      }

      // Free plan: no Stripe involved, straight to the dashboard.
      if (!isPaidPlanSlug(selectedPlan)) {
        setAuthenticated(true);
        return;
      }

      // Paid plan: the account already exists at this point — now start
      // Stripe Checkout for it. This depends on the STRIPE_PRICE_* env vars
      // documented in src/lib/billing/price-ids.ts / the README's Billing
      // section; /api/checkout returns "Billing is not configured yet." if
      // they aren't set.
      // TODO: Price ID needed here — confirm STRIPE_PRICE_STARTER /
      // STRIPE_PRICE_GROWTH / STRIPE_PRICE_PROFESSIONAL / STRIPE_PRICE_ULTIMATE
      // are set before this path can complete a real checkout.
      const checkoutRes = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan,
          discountCode: discountCode.trim() || undefined,
          successPath: "/dashboard/overview",
        }),
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok || !checkoutData.ok) {
        dumpErrorForDebugging("/api/checkout returned error", checkoutData.error);
        setError(
          getErrorMessage(
            checkoutData.error,
            "Your account was created, but checkout couldn't start. You can subscribe from Settings."
          )
        );
        return;
      }

      window.location.href = checkoutData.url;
    } catch (err) {
      dumpErrorForDebugging("signup flow threw", err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function goToDashboard() {
    router.push("/dashboard/overview");
    router.refresh();
  }

  if (authenticated) {
    return <LoginSplash onDone={goToDashboard} />;
  }

  const plan = PLANS.find((p) => p.slug === selectedPlan);

  return (
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-background px-4 py-10">
      <div className={`w-full ${step === 1 ? "max-w-3xl" : "max-w-md"}`}>
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center">
            <Logo className="h-14 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {step === 1 ? "Choose your plan" : "Create your account"}
          </h1>
        </div>

        <div className="mx-auto mb-8 max-w-xs">
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-orange-500" />
            <div className={`h-1 flex-1 rounded-full ${step >= 2 ? "bg-orange-500" : "bg-border"}`} />
          </div>
          <p className="mt-2 text-center text-xs text-muted">Step {step} of 2</p>
        </div>

        {step === 1 && (
          <div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PLANS.map((p) => {
                const selected = p.slug === selectedPlan;
                return (
                  <button
                    key={p.slug}
                    type="button"
                    onClick={() => setSelectedPlan(p.slug)}
                    aria-pressed={selected}
                    className={`relative flex flex-col items-start rounded-2xl border p-4 text-left transition-all duration-150 ${
                      selected
                        ? "border-orange-500 bg-orange-500/[0.04] shadow-[0_0_16px_rgba(249,115,22,0.12)]"
                        : "border-border bg-panel hover:border-orange-500/40"
                    }`}
                  >
                    {p.highlighted && (
                      <span className="absolute -top-2.5 right-3 inline-flex items-center rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-black">
                        Most Popular
                      </span>
                    )}
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-orange-400">{p.name}</span>
                      {selected && <Check className="h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />}
                    </div>
                    <p className="mt-1 text-lg font-bold text-foreground">
                      ${p.price}
                      {p.price > 0 && <span className="text-xs font-normal text-muted">/mo</span>}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {p.aiRequestsPerMonth === "unlimited"
                        ? "Unlimited AI requests"
                        : `${p.aiRequestsPerMonth.toLocaleString()} AI requests/mo`}
                    </p>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
            >
              Continue
            </button>

            <p className="mt-4 text-center text-xs text-muted">
              Already have an account?{" "}
              <Link href="/login" className="text-orange-400 underline underline-offset-2">
                Log in
              </Link>
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="rounded-2xl border border-border bg-panel p-6 shadow-[0_0_0_1px_rgba(249,115,22,0.05)]">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="mb-4 inline-flex items-center gap-1 text-xs text-muted transition-colors duration-150 hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {plan?.name ?? "Free"} plan — change
            </button>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-xs text-muted">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={FIELD_CLASS}
                  placeholder="you@domain.com"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor="password" className="block text-xs text-muted">
                    Password
                  </label>
                  <GeneratePasswordButton onGenerate={setPassword} />
                </div>
                <PasswordInput
                  id="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={FIELD_CLASS}
                  placeholder="••••••••"
                />
                <div className="mt-2">
                  <PasswordStrengthChecklist password={password} />
                </div>
              </div>

              <div>
                <label htmlFor="discountCode" className="mb-1 block text-xs text-muted">
                  Discount code <span className="text-muted/70">(optional)</span>
                </label>
                <input
                  id="discountCode"
                  type="text"
                  autoComplete="off"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value)}
                  className={FIELD_CLASS}
                  placeholder="e.g. WELCOME20"
                />
              </div>

              <label className="flex items-start gap-2.5 text-xs text-muted">
                <input
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border bg-black/40 text-orange-500 accent-orange-500 outline-none focus:ring-2 focus:ring-orange-500/40"
                />
                <span>
                  I agree to the{" "}
                  <Link
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-400 underline underline-offset-2"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-400 underline underline-offset-2"
                  >
                    Privacy Policy
                  </Link>
                </span>
              </label>

              {error && (
                <p className="rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                  {error}
                </p>
              )}

              {debugDump && (
                <div className="rounded-xl border border-orange-800 bg-orange-950/20 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-orange-500">
                    temporary debug info — include this in your bug report
                  </p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-orange-200/90">
                    {debugDump}
                  </pre>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !termsAccepted || !isPasswordStrong(password)}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:opacity-50"
              >
                {loading
                  ? "Working..."
                  : isPaidPlanSlug(selectedPlan)
                    ? "Continue to Payment"
                    : "Create Account"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
