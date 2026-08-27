import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FolderOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { maxFilesForPlan, maxStorageBytesForPlan } from "@/lib/files/limits";
import { FILE_LIST_COLUMNS } from "@/lib/files/store";
import {
  FilesWorkspace,
  type WorkspaceCollection,
  type WorkspaceFile,
} from "@/components/files/files-workspace";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.files");
}

export default async function FilesPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.files");
  const isAdmin = isAdminEmail(user.email);
  const planSlug = await resolveEffectivePlanSlug(user);

  const [{ data: files }, { data: collections }, { data: items }] = await Promise.all([
    supabase
      .from("user_files")
      .select(FILE_LIST_COLUMNS)
      .eq("user_id", user.id)
      .order("uploaded_at", { ascending: false })
      .limit(1000),
    supabase
      .from("file_collections")
      .select("id, name, description")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("file_collection_items")
      .select("collection_id, file_id")
      .eq("user_id", user.id)
      .limit(5000),
  ]);

  const byCollection = new Map<string, string[]>();
  for (const item of items ?? []) {
    const key = String(item.collection_id);
    byCollection.set(key, [...(byCollection.get(key) ?? []), String(item.file_id)]);
  }

  const rows = (files ?? []) as unknown as WorkspaceFile[];
  const collectionRows: WorkspaceCollection[] = (collections ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name),
    description: c.description === null ? null : String(c.description),
    fileIds: byCollection.get(String(c.id)) ?? [],
  }));

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <PageHeader helpKey="help.files" helpArticle="upload-files" icon={FolderOpen} title={t("title")} description={t("description")} />

        {/* Said once, at the top: this page is where somebody hands a
            contract to an AI, and the terms of that belong here rather
            than in a policy nobody opens. */}
        <p className="mb-4 rounded-xl border border-border bg-panel/60 p-3 text-[11px] leading-relaxed text-muted">
          {t("privacyNotice")}
        </p>

        <FilesWorkspace
          initialFiles={rows}
          initialCollections={collectionRows}
          usage={{
            fileCap: isAdmin ? null : maxFilesForPlan(planSlug),
            storageBytes: rows.reduce((sum, f) => sum + Number(f.size_bytes ?? 0), 0),
            storageCap: isAdmin ? null : maxStorageBytesForPlan(planSlug),
          }}
        />
      </div>
    </main>
  );
}
