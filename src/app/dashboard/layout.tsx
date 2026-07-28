import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { SidebarProvider } from "@/components/dashboard/sidebar-context";
import { ToastProvider } from "@/components/toast/toast-context";
import { ToastContainer } from "@/components/toast/toast-container";
import { KeyboardShortcuts } from "@/components/dashboard/keyboard-shortcuts";

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

  return (
    <ToastProvider>
      <SidebarProvider>
        <div className="flex min-h-screen bg-background">
          <Sidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
        <ToastContainer />
        <KeyboardShortcuts />
      </SidebarProvider>
    </ToastProvider>
  );
}
