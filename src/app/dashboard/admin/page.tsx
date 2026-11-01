import type { Metadata } from "next";
import { pageTitle } from "@/lib/page-title";
import { notFound, redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { isFeatureOn } from "@/lib/flags/flags";
import { PageHeader } from "@/components/dashboard/page-header";
import { getTranslations } from "next-intl/server";
import { AdminUsersTab } from "@/components/admin/users-tab";
import { AdminCostsTab } from "@/components/admin/costs-tab";
import { AdminTabs } from "@/components/admin/admin-tabs";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("pageTitle.admin");
}
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) notFound();

  const on = await isFeatureOn("admin-dashboard", user);
  if (!on) notFound();

  const t = await getTranslations("adminDashboard");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader icon={Shield} title={t("title")} description={t("description")} />

      <div className="mt-6">
        <AdminTabs
          tabs={[
            { key: "users", label: t("tabs.users"), content: <AdminUsersTab /> },
            { key: "costs", label: t("tabs.costs"), content: <AdminCostsTab /> },
          ]}
        />
      </div>
    </div>
  );
}
