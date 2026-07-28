import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { GenericAddForm } from "@/components/modules/generic-add-form";
import { GenericList } from "@/components/modules/generic-list";
import { getModule } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";

export default async function ModulePage({
  params,
}: {
  params: { module: string };
}) {
  const moduleConfig = getModule(params.module);

  if (!moduleConfig) {
    notFound();
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: records, error } = await supabase
    .from(moduleConfig.table)
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-background font-mono">
      <DashboardHeader email={user.email ?? ""} />

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader eyebrow="dashboard" title={moduleConfig.title} />

        <div className="mb-6">
          <GenericAddForm module={moduleConfig} />
        </div>

        {error && (
          <ErrorMessage message={`loading ${moduleConfig.table}: ${error.message}`} />
        )}

        <GenericList
          module={moduleConfig}
          records={(records as ModuleRecord[]) ?? []}
        />
      </div>
    </main>
  );
}
