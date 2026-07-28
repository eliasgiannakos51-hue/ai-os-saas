import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { PageHeader } from "@/components/dashboard/page-header";
import { PasswordChangeForm } from "@/components/settings/password-change-form";

export default async function SettingsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-background font-mono">
      <DashboardHeader email={user.email ?? ""} />

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <PageHeader eyebrow="dashboard" title="Settings" />

        <div className="mb-6 rounded-md border border-border bg-panel p-5">
          <p className="text-xs text-muted">signed in as</p>
          <p className="mt-1 text-sm text-foreground">{user.email}</p>
        </div>

        <PasswordChangeForm />
      </div>
    </main>
  );
}
