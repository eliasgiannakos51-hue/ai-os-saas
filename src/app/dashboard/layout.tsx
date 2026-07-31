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
  const credits = await getOrInitCredits(user.id, plan);
  const isAdmin = isAdminEmail(user.email);

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
