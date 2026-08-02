import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { SidebarProvider } from "@/components/dashboard/sidebar-context";
import { ToastProvider } from "@/components/toast/toast-context";
import { ToastContainer } from "@/components/toast/toast-container";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { CommandPaletteProvider } from "@/components/dashboard/command-palette-context";
import { CreditsProvider } from "@/components/credits/credits-context";
import { TopNav } from "@/components/dashboard/top-nav";
import { acceptPendingTeamInvite } from "@/lib/team/accept-pending-invite";
import { getOrInitCredits, resolveEffectivePlan } from "@/lib/billing/credits";
import { isAdminEmail } from "@/lib/admin";
import { logApiError } from "@/lib/log-error";
import { DashboardBackground } from "@/components/dashboard/dashboard-background";
import { checkAndUnlockAchievements } from "@/lib/achievements";
import { AchievementUnlockBridge } from "@/components/achievements/achievement-unlock-bridge";

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
  let credits: { credits_remaining: number };
  try {
    credits = await getOrInitCredits(user.id, plan);
  } catch (err) {
    logApiError("/dashboard (layout)", err, { stage: "get_or_init_credits", userId: user.id });
    credits = { credits_remaining: 0 };
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
          <CreditsProvider initialCredits={credits.credits_remaining} isAdmin={isAdmin}>
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
            <div className="relative z-10 flex min-h-screen">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <TopNav email={user.email ?? ""} />
                <div className="flex-1">{children}</div>
              </div>
            </div>
            <ToastContainer />
            <AchievementUnlockBridge unlockedKeys={newlyUnlockedAchievements} />
            <CommandPalette />
          </CreditsProvider>
        </CommandPaletteProvider>
      </SidebarProvider>
    </ToastProvider>
  );
}
