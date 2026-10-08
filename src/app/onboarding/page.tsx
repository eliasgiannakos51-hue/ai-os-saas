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
import { providerConfigured } from "@/lib/integrations/oauth";
import { isFeatureOn } from "@/lib/flags/flags";
import { greetingName } from "@/lib/greeting";
import { FirstTask } from "@/components/onboarding/first-task";

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
export default async function OnboardingPage(props: { searchParams: Promise<{ classic?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();

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

  // THE FIRST TASK (MASTER 16, package 39), behind the switch
  // "first-task": three tasks that finish on any plan, one press each,
  // INSTEAD of the questionnaire below — which stays one press away
  // (?classic=1), because the free first import lives in it.
  if ((await isFeatureOn("first-task", user)) && searchParams.classic !== "1") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-2xl">
          <FirstTask name={greetingName(user.user_metadata)} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <PageHeader icon={Rocket} title={t("title")} description={t("description")} />

        {/* Said before anything is uploaded, because this is the moment
            someone decides whether to hand over their books. */}
        <p className="mb-5 surface-tight text-[11px] leading-relaxed text-muted">
          {t("privacyNotice")}
        </p>

        <OnboardingFlow
          activationFree={await activationAvailable(user.id)}
          integrationsAvailable={providerConfigured("gmail") || providerConfigured("google_drive")}
        />
      </div>
    </main>
  );
}
