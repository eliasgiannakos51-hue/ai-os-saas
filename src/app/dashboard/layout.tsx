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
import { getOrInitCredits, resolvePlan } from "@/lib/billing/credits";
import { isAdminEmail } from "@/lib/admin";
import { logApiError } from "@/lib/log-error";

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

  const plan = resolvePlan(user);
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

  return (
    <ToastProvider>
      <SidebarProvider>
        <CommandPaletteProvider>
          <CreditsProvider initialCredits={credits.credits_remaining} isAdmin={isAdmin}>
            <div className="flex min-h-screen bg-background">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <TopNav email={user.email ?? ""} />
                <div className="flex-1">{children}</div>
              </div>
            </div>
            <ToastContainer />
            <CommandPalette />
          </CreditsProvider>
        </CommandPaletteProvider>
      </SidebarProvider>
    </ToastProvider>
  );
}
