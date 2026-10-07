import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FolderOpen } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
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
import { FilesShell } from "@/components/files/files-shell";
import { isFeatureOn } from "@/lib/flags/flags";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.files");
}

export default async function FilesPage() {
  const supabase = await createClient();

  const user = await getCurrentUser();

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

  // THE SHELL, BEHIND ITS SWITCH (MASTER 14.3, package 3): the same files
  // and the same answers, drawn as conversation and work. Collections stay
  // on the page; the shell asks of what is ticked.
  if (await isFeatureOn("tool-shell", user)) {
    return (
      <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
        <FilesShell initialFiles={rows} />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <PageHeader helpKey="help.files" helpArticle="upload-files" icon={FolderOpen} title={t("title")} description={t("description")} />

        {/* Said once, at the top: this page is where somebody hands a
            contract to an AI, and the terms of that belong here rather
            than in a policy nobody opens. */}
        <p className="mb-4 surface-tight text-[11px] leading-relaxed text-muted">
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
    </div>
  );
}
