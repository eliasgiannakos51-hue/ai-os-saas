import type { Metadata } from "next";
import { pageTitle } from "@/lib/page-title";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Rocket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { PageHeader } from "@/components/dashboard/page-header";
import { activationAvailable } from "@/lib/import/activation";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("pageTitle.onboarding");
}

/**
 * The first two minutes.
 *
 * Deliberately OUTSIDE /dashboard: it has no sidebar and no widgets,
 * because the one thing it is for is getting the user's real data in and
 * one true sentence back out. A dashboard chrome around that is an
 * invitation to wander off into an empty product.
 */
export default async function OnboardingPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.onboarding");

  // Already been through it — going round again would re-ask questions
  // they have answered.
  // THE ERROR IS READ, for the reason /dashboard/overview went down: a
  // discarded error makes `state` null, and null is then read as an
  // answer about the user rather than as "the question could not be
  // asked". Here the falsy direction is the SAFE one — a failed read
  // leaves someone on onboarding rather than bouncing them out — but the
  // two pages redirect at each other, so the same silence on both sides
  // is what turns one broken read into a loop with no way through.
  //
  // Enforced by scripts/tests/error-is-not-a-state.test.mjs.
  const { data: state, error: stateError } = await supabase
    .from("user_onboarding")
    .select("completed_at, skipped_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (stateError) {
    logApiError("/onboarding", stateError, { stage: "user_onboarding_query" });
  }

  // Only a successful read may move them.
  if (!stateError && (state?.completed_at || state?.skipped_at)) {
    redirect("/dashboard/overview");
  }

  return (
    <main className="min-h-screen bg-dot-grid">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <PageHeader icon={Rocket} title={t("title")} description={t("description")} />

        {/* Said before anything is uploaded, because this is the moment
            someone decides whether to hand over their books. */}
        <p className="mb-5 rounded-xl border border-border bg-panel/60 p-3 text-[11px] leading-relaxed text-muted">
          {t("privacyNotice")}
        </p>

        <OnboardingFlow activationFree={await activationAvailable(user.id)} />
      </div>
    </main>
  );
}
