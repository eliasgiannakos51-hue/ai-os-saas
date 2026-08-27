import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { pageTitle } from "@/lib/page-title";
import { PageHeader } from "@/components/dashboard/page-header";
import { MODULE_ICONS } from "@/lib/module-icons";
import { CodingWorkspace, type CodeSession } from "@/components/coding/coding-workspace";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.coding");
}

// /dashboard/coding was a CRUD form for describing code the user would go
// and write themselves. This is the version that writes it: five
// operations, and four things it still does not do — stated on the screen
// by CodingWorkspace rather than left to the name.
export default async function CodingPage() {
  const t = await getTranslations("coding");
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS scopes this to the caller. The imported notes from the old
  // tracker are in here too, marked `source = 'note'` — see the
  // migration's section 5.
  const { data: rows } = await supabase
    .from("code_sessions")
    .select("id, operation, title, input, language, target_language, output, folder, status, source, created_at")
    .order("created_at", { ascending: false })
    .limit(60);

  const sessions: CodeSession[] = (rows ?? []).map((row) => ({
    id: String(row.id),
    operation: String(row.operation ?? "generate"),
    title: String(row.title ?? ""),
    input: String(row.input ?? ""),
    language: (row.language as string | null) ?? null,
    targetLanguage: (row.target_language as string | null) ?? null,
    output: (row.output as string | null) ?? null,
    folder: (row.folder as string | null) ?? null,
    status: String(row.status ?? "done"),
    source: String(row.source ?? "run"),
    createdAt: String(row.created_at ?? ""),
  }));

  const folders = [...new Set(sessions.map((s) => s.folder).filter((f): f is string => Boolean(f)))].sort();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader
        icon={MODULE_ICONS.coding}
        title={t("title")}
        description={t("description")}
        helpKey="help.coding"
      />
      <CodingWorkspace sessions={sessions} folders={folders} />
    </div>
  );
}
