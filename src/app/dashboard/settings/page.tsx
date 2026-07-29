import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { PageHeader } from "@/components/dashboard/page-header";
import { PasswordChangeForm } from "@/components/settings/password-change-form";
import { ExportDataButton } from "@/components/settings/export-data-button";
import { DangerZone } from "@/components/settings/danger-zone";

export const metadata: Metadata = {
  title: "Settings",
};

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

        <div className="mb-6 mt-6 space-y-3 rounded-md border border-border bg-panel p-5">
          <h2 className="text-sm text-amber-500">export.all_data()</h2>
          <p className="text-xs text-muted">
            Download everything you&apos;ve logged across all 13 modules as a
            single JSON file.
          </p>
          <ExportDataButton />
        </div>

        <DangerZone email={user.email ?? ""} />
      </div>
    </main>
  );
}
