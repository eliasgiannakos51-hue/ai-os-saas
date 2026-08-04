"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, ChevronLeft, X } from "lucide-react";
import { getErrorMessage } from "@/lib/get-error-message";
import { isPasswordStrong } from "@/lib/password-strength";
import {
  PLANS,
  CURRENCY_SYMBOL,
  TEAM_SEAT_PRICE,
  isPaidPlanSlug,
  type Plan,
  type PlanSlug,
} from "@/lib/billing/plans";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrengthChecklist } from "@/components/auth/password-strength-checklist";
import { GeneratePasswordButton } from "@/components/auth/generate-password-button";
import { LoginSplash } from "@/components/auth/login-splash";
import { Logo } from "@/components/logo";
import { AuthBackground } from "@/components/auth/auth-background";
import { COUNTRIES } from "@/lib/countries";

const FIELD_CLASS =
  "w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none transition-colors duration-150 focus:border-orange-500";

type Step = 1 | 2;

// Same capability set the /pricing comparison table checks — condensed to a
// quick-scan ✓/✗ list under each plan card here instead of a full table row
// per capability. Only real, server-enforced capabilities go here (see
// lib/billing/plans.ts's PlanCapabilities comment) — things like chat
// memory and data export aren't plan-gated anywhere in the app, so they're
// deliberately not listed as a differentiator here either.
const CAPABILITY_ROWS: { label: string; included: (p: Plan) => boolean }[] = [
  { label: "Website & Automation Builder", included: (p) => p.capabilities.websiteBuilder },
  { label: "Mobile & SaaS Builder", included: (p) => p.capabilities.mobileSaasBuilder },
  { label: "Image & video generation", included: (p) => p.capabilities.imageVideoGeneration },
  { label: "AI Memory", included: (p) => p.capabilities.aiMemory },
  { label: "Team collaboration", included: (p) => p.capabilities.teamCollaboration },
  {
    label: "Team seats",
    included: (p) => p.hasTeamSeats,
  },
  { label: "Team seats included free", included: (p) => Boolean(p.teamSeatsIncluded) },
  { label: "Extended chat memory retention", included: (p) => p.capabilities.chatMemoryLimit > 20 },
  { label: "Custom AI persona name", included: (p) => p.capabilities.customAiPersona },
];

// New accounts start on plan selection instead of being asked to upgrade
// afterward. A ?plan=<slug> query param (used by pricing page's per-plan
// buttons and the team-invite email, which always passes plan=free) skips
// straight to step 2 with that plan pre-selected — read from
// window.location instead of useSearchParams() so this page doesn't need a
// Suspense boundary, same pattern as login-form.tsx's ?mode= handling.
export function SignupFlow() {
  const router = useRouter();
  const t = useTranslations("auth.signup");
  const tPricing = useTranslations("pricing");

  const [step, setStep] = useState<Step>(1);
  const [selectedPlan, setSelectedPlan] = useState<PlanSlug>("free");
  // "Business" isn't a real plan slug (see lib/billing/plans.ts — team
  // collaboration is a Professional+ capability, not a 7th tier), so this
  // doesn't add a new PlanSlug. Picking it just aliases selectedPlan to
  // "professional" (the cheapest team-capable plan) and remembers the
  // intent, so checkout can route straight into team setup afterward —
  // same "Set Up Team" concept /pricing already has, now reachable during
  // signup itself instead of only after the fact.
  const [wantsTeamSetup, setWantsTeamSetup] = useState(false);
  // Where to send Stripe's checkout success redirect once this brand-new
  // account's own checkout call (below) completes — read from ?successPath=
  // so SubscribeButton's 401-redirect-to-signup path (see
  // components/billing/subscribe-button.tsx) can carry a caller-specific
  // destination (e.g. the "Set Up Team" pricing card sending new signups
  // straight to /dashboard/team) through account creation. Falls back to
  // the existing default when absent, so every other entry into signup is
  // unaffected.
  const [successPath, setSuccessPath] = useState<string | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  // Enterprise is Contact Sales only (custom pricing, no Stripe price to
  // self-serve checkout with) — never selectable here.
  const selectablePlans = PLANS.filter((p) => p.slug !== "enterprise");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const planParam = params.get("plan");
    if (planParam && selectablePlans.some((p) => p.slug === planParam)) {
      setSelectedPlan(planParam as PlanSlug);
      setStep(2);
    }
    const successPathParam = params.get("successPath");
    if (successPathParam) {
      setSuccessPath(successPathParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Logs the EXACT raw HTTP response — status + body text — before any
  // JSON.parse runs, then parses it. If a report says the UI shows a raw
  // "{}" string, this is what proves (or disproves) whether that came from
  // the network layer itself rather than from how the parsed object was
  // later handled.
  async function readRawResponse(res: Response, label: string): Promise<unknown> {
    const rawText = await res.text();
    try {
      return JSON.parse(rawText);
    } catch (parseErr) {
      // eslint-disable-next-line no-console
      console.error(`${label} — response body was not valid JSON`, {
        status: res.status,
        rawBody: rawText,
        parseError: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      throw new Error(
        `Server returned an unexpected response (status ${res.status}). Please try again.`
      );
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

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
        body: JSON.stringify({
          email,
          password,
          termsAccepted,
          country: country || undefined,
          inviteCode: inviteCode.trim() || undefined,
        }),
      });
      const signupData = (await readRawResponse(signupRes, "/api/signup")) as {
        ok?: boolean;
        error?: unknown;
      };
      if (!signupRes.ok || !signupData.ok) {
        // eslint-disable-next-line no-console
        console.error("/api/signup returned error:", signupData.error);
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
      const checkoutRes = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan,
          discountCode: discountCode.trim() || undefined,
          // Same successPath the pricing page's "Set Up Team" button uses
          // (see components/billing/subscribe-button.tsx), so picking
          // Business here lands the new account straight on team setup
          // instead of the plain dashboard overview.
          successPath: successPath ?? (wantsTeamSetup ? "/dashboard/team?setup=success" : "/dashboard/overview"),
        }),
      });
      const checkoutData = (await readRawResponse(checkoutRes, "/api/checkout")) as {
        ok?: boolean;
        error?: unknown;
        url?: string;
      };
      if (!checkoutRes.ok || !checkoutData.ok || !checkoutData.url) {
        // eslint-disable-next-line no-console
        console.error("/api/checkout returned error:", checkoutData.error);
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
      // eslint-disable-next-line no-console
      console.error("Signup flow threw:", err);
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
    <main className="relative flex min-h-screen items-center justify-center overflow-x-hidden bg-background px-4 py-10">
      <AuthBackground />
      <div className={`relative z-10 w-full ${step === 1 ? "max-w-3xl" : "max-w-md"}`}>
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center">
            <Logo className="h-[168px] w-auto max-w-full" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {step === 1 ? t("chooseYourPlan") : t("createYourAccount")}
          </h1>
        </div>

        <div className="mx-auto mb-8 max-w-xs">
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-orange-500" />
            <div className={`h-1 flex-1 rounded-full ${step >= 2 ? "bg-orange-500" : "bg-border"}`} />
          </div>
          <p className="mt-2 text-center text-xs text-muted">{t("step", { step })}</p>
        </div>

        {step === 1 && (
          <div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {selectablePlans.map((p) => {
                const selected = p.slug === selectedPlan;
                return (
                  <button
                    key={p.slug}
                    type="button"
                    onClick={() => {
                      setSelectedPlan(p.slug);
                      setWantsTeamSetup(false);
                    }}
                    aria-pressed={selected && !wantsTeamSetup}
                    className={`relative flex flex-col items-start rounded-2xl border p-4 text-left transition-all duration-150 ${
                      selected && !wantsTeamSetup
                        ? "border-orange-500 bg-orange-500/[0.04] shadow-[0_0_16px_rgba(249,115,22,0.12)]"
                        : "border-border bg-panel hover:border-orange-500/40"
                    }`}
                  >
                    {p.highlighted && (
                      <span className="absolute -top-2.5 right-3 inline-flex items-center rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-black">
                        {t("mostPopular")}
                      </span>
                    )}
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-orange-400">{p.name}</span>
                      {selected && <Check className="h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />}
                    </div>
                    <p className="mt-1 text-lg font-bold text-foreground">
                      {typeof p.price === "number" ? `${CURRENCY_SYMBOL}${p.price}` : tPricing("custom")}
                      {typeof p.price === "number" && p.price > 0 && (
                        <span className="text-xs font-normal text-muted">{tPricing("perMonth")}</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {p.monthlyCredits === "custom"
                        ? `${tPricing("custom")} credits`
                        : `${p.monthlyCredits.toLocaleString()} credits/mo`}
                    </p>

                    <ul className="mt-3 w-full space-y-1.5 border-t border-border pt-3">
                      {CAPABILITY_ROWS.map((row) => {
                        const included = row.included(p);
                        return (
                          <li
                            key={row.label}
                            className={`flex items-center gap-1.5 text-[11px] ${
                              included ? "text-foreground/80" : "text-muted/60"
                            }`}
                          >
                            {included ? (
                              <Check className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
                            ) : (
                              <X className="h-3 w-3 shrink-0 text-muted/50" aria-hidden="true" />
                            )}
                            {row.label}
                          </li>
                        );
                      })}
                    </ul>

                    <ul className="mt-3 w-full space-y-1.5 border-t border-border pt-3">
                      {p.features.map((feature) => (
                        <li
                          key={feature.text}
                          className="flex items-start gap-1.5 text-[11px] text-foreground/80"
                        >
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
                          <span>{feature.text}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {/* "Business" — same option /pricing offers via its Business
                card + "Set Up Team" flow, now reachable during signup
                itself instead of only after the fact. Not a 7th plan slug
                (see wantsTeamSetup's own comment above): selecting it
                aliases selectedPlan to "professional" and remembers the
                intent so checkout can route straight into team setup. */}
            <button
              type="button"
              onClick={() => {
                setSelectedPlan("professional");
                setWantsTeamSetup(true);
              }}
              aria-pressed={wantsTeamSetup}
              className={`mt-3 flex w-full flex-col items-start rounded-2xl border p-4 text-left transition-all duration-150 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
                wantsTeamSetup
                  ? "border-orange-500 bg-orange-500/[0.04] shadow-[0_0_16px_rgba(249,115,22,0.12)]"
                  : "border-border bg-panel hover:border-orange-500/40"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-orange-400">
                    {tPricing("businessTitle")}
                  </span>
                  {wantsTeamSetup && (
                    <Check className="h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {tPricing("businessExplanation", { price: `${CURRENCY_SYMBOL}${TEAM_SEAT_PRICE}` })}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
            >
              {t("continue")}
            </button>

            <p className="mt-4 text-center text-xs text-muted">
              {t("alreadyHaveAccount")}{" "}
              <Link href="/login" className="text-orange-400 underline underline-offset-2">
                {t("logIn")}
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
              {wantsTeamSetup ? tPricing("businessTitle") : (plan?.name ?? "Free")} plan — {t("change")}
            </button>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-xs text-muted">
                  {t("email")}
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
                    {t("password")}
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
                <label htmlFor="country" className="mb-1 block text-xs text-muted">
                  {t("country")}
                </label>
                <select
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={FIELD_CLASS}
                >
                  <option value="">{t("countryPlaceholder")}</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="discountCode" className="mb-1 block text-xs text-muted">
                  {t("discountCode")}
                </label>
                <input
                  id="discountCode"
                  type="text"
                  autoComplete="off"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value)}
                  className={FIELD_CLASS}
                  placeholder={t("discountCodePlaceholder")}
                />
              </div>

              <div>
                <label htmlFor="inviteCode" className="mb-1 block text-xs text-muted">
                  {t("inviteCode")}
                </label>
                <input
                  id="inviteCode"
                  type="text"
                  autoComplete="off"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className={FIELD_CLASS}
                  placeholder={t("inviteCodePlaceholder")}
                />
              </div>

              <label className="flex items-start gap-2.5 text-xs text-muted">
                <input
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border bg-input text-orange-500 accent-orange-500 outline-none focus:ring-2 focus:ring-orange-500/40"
                />
                <span>
                  {t("agreeTerms")}{" "}
                  <Link
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-400 underline underline-offset-2"
                  >
                    {t("termsOfService")}
                  </Link>{" "}
                  {t("and")}{" "}
                  <Link
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-400 underline underline-offset-2"
                  >
                    {t("privacyPolicy")}
                  </Link>
                </span>
              </label>

              {error && (
                <p className="rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !termsAccepted || !isPasswordStrong(password)}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:opacity-50"
              >
                {loading
                  ? t("working")
                  : isPaidPlanSlug(selectedPlan)
                    ? t("continueToPayment")
                    : t("createAccount")}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
