import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Rocket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { activationAvailable } from "@/lib/import/activation";
import { resolveInitialStep } from "@/lib/onboarding-flow";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Get started" };

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
  // they have answered. This is also what a hand-typed /onboarding URL
  // hits after completion: straight back to the dashboard.
  const { data: state } = await supabase
    .from("user_onboarding")
    .select("goal, first_action, completed_at, skipped_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (state?.completed_at || state?.skipped_at) {
    redirect("/dashboard/overview");
  }

  // A refresh mid-flow resumes where the user was, from the recorded
  // progress row — the steps themselves are client state and would
  // otherwise restart from the first question.
  const initialStep = resolveInitialStep({
    firstAction: state?.first_action ?? null,
    goal: state?.goal ?? null,
  });

  return (
    <main className="min-h-screen bg-dot-grid">
      {/* pt-24 below sm: the floating language/theme controls sit fixed in
          the top-right corner, and at 375px the page title ran underneath
          them. Wider screens have margin to spare and keep py-10. */}
      <div className="mx-auto max-w-2xl px-4 pb-10 pt-24 sm:px-6 sm:py-10">
        <PageHeader icon={Rocket} title={t("title")} description={t("welcomeIntro")} />

        {/* The privacy notice moved INTO the flow: it is said before
            anything is uploaded (the moment someone decides whether to
            hand over their books), which is the data path's steps — not
            the action question, where nothing is being handed over. */}
        <OnboardingFlow
          activationFree={await activationAvailable(user.id)}
          initialStep={initialStep}
        />
      </div>
    </main>
  );
}
