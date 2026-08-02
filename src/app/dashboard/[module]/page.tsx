import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { GenericAddForm } from "@/components/modules/generic-add-form";
import { GenericList } from "@/components/modules/generic-list";
import { getModule } from "@/lib/modules";
import { MODULE_ICONS } from "@/lib/module-icons";
import type { ModuleRecord } from "@/types/module-record";
import { loadLinkedEntities } from "@/lib/entity-links";

export function generateMetadata({
  params,
}: {
  params: { module: string };
}): Metadata {
  const moduleConfig = getModule(params.module);
  return { title: moduleConfig?.title ?? "Not Found" };
}

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

  const linkedEntities = await loadLinkedEntities(
    supabase,
    user.id,
    moduleConfig.table,
    (records as ModuleRecord[] | null)?.map((r) => r.id) ?? []
  );

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader icon={MODULE_ICONS[moduleConfig.slug]} title={moduleConfig.title} />

        <div className="mb-6">
          <GenericAddForm module={moduleConfig} />
        </div>

        {error && (
          <ErrorMessage message={`loading ${moduleConfig.table}: ${error.message}`} />
        )}

        <GenericList
          module={moduleConfig}
          records={(records as ModuleRecord[]) ?? []}
          linkedEntities={linkedEntities}
        />
      </div>
    </main>
  );
}
