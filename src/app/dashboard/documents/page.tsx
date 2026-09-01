import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { DocumentsList, type DocumentListItem } from "@/components/documents/documents-list";
import { loadFavoriteIds } from "@/lib/favorites";
import { documentPreviewText } from "@/lib/document-preview";
import type { DocumentContent, UserDocument } from "@/types/document";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.documents");
}

// Live, frequently-mutated per-user data (created/renamed/edited on every
// visit) — same reasoning as dashboard/mission and dashboard/timeline for
// why this must never serve a stale client Router Cache entry (see this
// project's next.config.mjs staleTimes comment) or a stale server render.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function DocumentsPage() {
  const t = await getTranslations("dashboard.documents");
  const supabase = createClient();

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // `content` is now selected too: every card carries a two-line preview
  // of the note's own text, which is the only thing that tells two
  // "Untitled" documents apart at a glance.
  const { data: documents, error } = await supabase
    .from("user_documents")
    .select("id, title, updated_at, content")
    .order("updated_at", { ascending: false });

  const rows =
    (documents as (Pick<UserDocument, "id" | "title" | "updated_at"> & {
      content: DocumentContent | null;
    })[] | null) ?? [];

  const docs: DocumentListItem[] = rows.map((doc) => ({
    id: doc.id,
    title: doc.title,
    updated_at: doc.updated_at,
    preview: documentPreviewText(doc.content),
  }));

  // Batched, same as every other list — one query for the whole page.
  const favoritedDocIds = await loadFavoriteIds(
    supabase,
    user.id,
    "user_documents",
    docs.map((d) => d.id)
  );

  return (
    <div className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader
          icon={FileText}
          title={t("title")}
          description={t("description")}
          helpKey="help.documents"
        />

        {error && <ErrorMessage detail={`loading documents: ${error.message}`} />}

        <DocumentsList documents={docs} favoritedIds={[...favoritedDocIds]} />
      </div>
    </div>
  );
}
