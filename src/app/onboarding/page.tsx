import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Rocket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { activationAvailable } from "@/lib/import/activation";
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
  // they have answered.
  const { data: state } = await supabase
    .from("user_onboarding")
    .select("completed_at, skipped_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (state?.completed_at || state?.skipped_at) {
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
