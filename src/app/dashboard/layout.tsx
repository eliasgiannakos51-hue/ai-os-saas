import { redirect } from "next/navigation";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { SidebarProvider } from "@/components/dashboard/sidebar-context";
import { ToastProvider } from "@/components/toast/toast-context";
import { ToastContainer } from "@/components/toast/toast-container";
import { OfflineBanner } from "@/components/network/offline-banner";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { CommandPaletteProvider } from "@/components/dashboard/command-palette-context";
import { CreditsProvider } from "@/components/credits/credits-context";
import { TopNav } from "@/components/dashboard/top-nav";
import { acceptPendingTeamInvite } from "@/lib/team/accept-pending-invite";
import { getOrInitCredits, resolveEffectivePlan, getPurchasedPackCreditPriceEur } from "@/lib/billing/credits";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { isAdminEmail } from "@/lib/admin";
import { logApiError } from "@/lib/log-error";
import { AmbientDots } from "@/components/ui/ambient-dots";
import { DashboardBackground } from "@/components/dashboard/dashboard-background";
import { checkAndUnlockAchievements } from "@/lib/achievements";
import { AchievementUnlockBridge } from "@/components/achievements/achievement-unlock-bridge";
import { PageTransition } from "@/components/page-transition";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fire-and-forget: if this email has a pending team invite, join it now.
  // Any effect lands on the user's *next* request (this one already fetched
  // `user` above), which is fine for a low-frequency, best-effort check.
  void acceptPendingTeamInvite(user.id, user.email ?? "");

  const plan = await resolveEffectivePlan(user);
  const isAdmin = isAdminEmail(user.email);

  // getOrInitCredits creates a service-role Supabase client under the hood
  // (see lib/supabase/admin.ts), which throws synchronously if
  // SUPABASE_SERVICE_ROLE_KEY (or the Supabase URL) isn't set in this
  // environment — and since this layout wraps every dashboard route, an
  // unhandled throw here takes down the entire dashboard, not just one
  // page, and does it before dashboard/error.tsx's boundary can catch it
  // (a layout can't be caught by its own segment's error boundary). Degrade
  // to a zero balance instead so the shell still renders; admins are
  // unaffected since CreditsProvider treats isAdmin as unlimited regardless
  // of the numeric balance.
  let credits: { credits_remaining: number; credits_total: number };
  try {
    credits = await getOrInitCredits(user.id, plan);
  } catch (err) {
    logApiError("/dashboard (layout)", err, { stage: "get_or_init_credits", userId: user.id });
    credits = { credits_remaining: 0, credits_total: 0 };
  }

  // Gamification — no cron/background worker in this app, so achievements
  // are reconciled opportunistically on every dashboard navigation (see
  // lib/achievements.ts; it fast-paths to one query once everything is
  // unlocked). Best-effort: a failure here just means no toast fires this
  // request, not a broken dashboard.
  let newlyUnlockedAchievements: string[] = [];
  try {
    newlyUnlockedAchievements = await checkAndUnlockAchievements(supabase, user.id);
  } catch (err) {
    logApiError("/dashboard (layout)", err, { stage: "check_achievements", userId: user.id });
  }

  return (
    <ToastProvider>
      <SidebarProvider>
        <CommandPaletteProvider>
          <CreditsProvider
            initialCredits={credits.credits_remaining}
            initialTotal={credits.credits_total}
            initialCreditPriceEur={effectiveCreditPriceEurForAccount(
              plan,
              await getPurchasedPackCreditPriceEur(user.id),
              resolvePricingConfig()
            )}
            initialPlanSlug={plan.slug}
            isAdmin={isAdmin}
          >
            {/* Same wireframe globe as login/signup/landing, now behind every
                dashboard page for visual continuity with the auth pages —
                fixed to the viewport, z-0. The whole app shell below is
                explicitly `relative z-10` (one wrap here, not per-page) so
                it stacks above the globe as a unit: Sidebar/TopNav's own
                z-index values (z-50/z-30) still order correctly *within*
                that shell, and every page's content, opaque or not, paints
                on top of the globe by default instead of needing its own
                stacking fix. DashboardBackground (not AuthBackground
                directly) picks the opacity per-route, since Chat/Create
                need a higher one — see its own comment for why. */}
            <DashboardBackground />
            {/* A second, much quieter ambient layer above the globe: ten
                slowly drifting dots and two breathing glows, pure CSS. The
                globe is a canvas with its own render loop and is not
                touched — this sits on top of it at z-0 and costs nothing
                per frame. */}
            <div className="pointer-events-none fixed inset-0 z-0">
              <AmbientDots />
            </div>
            {/* WHAT A PAGE SAYS WHEN IT CANNOT REACH THE SERVER.
                Mounted once, above the whole dashboard, because the
                service worker will happily serve the last version of any
                page from cache — which is right, and is exactly why the
                user has to be told that what they are reading stopped
                updating. Renders nothing while the connection is fine. */}
            <OfflineBanner />
            <div className="relative z-10 flex min-h-screen">
              <Sidebar email={user.email ?? ""} planName={plan.name} />
              <div className="flex min-w-0 flex-1 flex-col">
                <TopNav email={user.email ?? ""} />
                {/* Wraps only the page body, not the Sidebar/TopNav —
                    the chrome must stay visually fixed while the content
                    beneath it fades/slides in on each navigation. */}
                <div className="flex-1">
                  <PageTransition>{children}</PageTransition>
                </div>
              </div>
            </div>
            <ToastContainer />
            <AchievementUnlockBridge unlockedKeys={newlyUnlockedAchievements} />
            <CommandPalette />
          </CreditsProvider>
          {/* Service worker + add-to-home-screen prompt. Mounted here, not
              in the root layout, so the offline shell and push are
              features of the signed-in app only. */}
          <PwaProvider />
        </CommandPaletteProvider>
      </SidebarProvider>
    </ToastProvider>
  );
}
