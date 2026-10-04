import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { GreetingHeader } from "@/components/overview/greeting-header";
import { greetingName } from "@/lib/greeting";
import { onboardingRedirectTarget } from "@/lib/nav/early-redirects";
import { CreateChat } from "@/components/create/create-chat";
import { WidgetBoundary } from "@/components/ui/widget-boundary";
import { QuickActions } from "@/components/home/quick-actions";
import { getTranslations } from "next-intl/server";
import { logApiError } from "@/lib/log-error";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.home");
}

export const dynamic = "force-dynamic";

/**
 * HOME — ONE BLOCK IN THE MIDDLE OF THE SCREEN (docs/CONTEXT.md, ΣΥΣΤΗΜΑ
 * DESIGN, «ΑΡΧΙΚΗ», 2026-10-04):
 *
 *   1. one line: the small earth and «Good morning, [όνομα]»;
 *   2. the field, «What do you want to accomplish?»;
 *   3. four quick actions — Research, Create, Run, Analyze.
 *
 * «Τίποτα άλλο στην οθόνη. Όχι κάρτες, όχι στατιστικά, όχι λίστες.» The
 * cards that stood here are on /dashboard/activity, unchanged, because
 * the design's other rule is that no feature is lost.
 */
export default async function OverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = createClient();
  const tErr = await getTranslations("errors");

  // A brand-new account goes through the first-run flow once.
  // AN ERROR IS NOT A STATE: a failed read is never treated as "has not
  // onboarded" — that guess once bounced every established account out
  // of Home (scripts/tests/error-is-not-a-state.test.mjs). middleware.ts
  // makes this decision first, with the same function; this is the
  // fallback.
  const { data: onboardingState, error: onboardingError } = await supabase
    .from("user_onboarding")
    .select("completed_at, skipped_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (onboardingError) {
    logApiError("/dashboard/overview", onboardingError, { stage: "user_onboarding_query" });
  }
  const onboardingTarget = onboardingRedirectTarget({ error: onboardingError, state: onboardingState });
  if (onboardingTarget) redirect(onboardingTarget);

  // The two client widgets — the greeting with its earth (a canvas) and
  // the field (the router, the microphone, the attachments) — each keep
  // their own boundary, so one failing leaves the rest of the block on
  // screen (scripts/tests/error-boundaries.test.mjs).
  const boundary = { title: tErr("boundary.section"), body: tErr("boundary.sectionBody") };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-2xl">
        <WidgetBoundary label="greeting" {...boundary}>
          <GreetingHeader name={greetingName(user.user_metadata)} />
        </WidgetBoundary>
        <div className="mt-6">
          <WidgetBoundary label="create-chat" {...boundary}>
            <CreateChat showHeading={false} hero />
          </WidgetBoundary>
        </div>
        <QuickActions />
      </div>
    </div>
  );
}
