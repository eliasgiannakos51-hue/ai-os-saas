import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { EmptyState } from "@/components/empty-state";
import { DocumentListRow } from "@/components/documents/document-list-row";
import { loadFavoriteIds } from "@/lib/favorites";
import { NewDocumentButton } from "@/components/documents/new-document-button";
import type { UserDocument } from "@/types/document";

export const metadata: Metadata = { title: "Documents" };

// Live, frequently-mutated per-user data (created/renamed/edited on every
// visit) — same reasoning as dashboard/mission and dashboard/timeline for
// why this must never serve a stale client Router Cache entry (see this
// project's next.config.mjs staleTimes comment) or a stale server render.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function DocumentsPage() {
  const t = await getTranslations("dashboard.documents");
  const locale = await getLocale();
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: documents, error } = await supabase
    .from("user_documents")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });

  const docs = (documents as Pick<UserDocument, "id" | "title" | "updated_at">[] | null) ?? [];
  // Batched, same as every other list — one query for the whole page.
  const favoritedDocIds = await loadFavoriteIds(
    supabase,
    user.id,
    "user_documents",
    docs.map((d) => d.id)
  );

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <PageHeader icon={FileText} title={t("title")} description={t("description")} />
          {docs.length > 0 && <NewDocumentButton label={t("newDocument")} />}
        </div>

        {error && <ErrorMessage message={`loading documents: ${error.message}`} />}

        {docs.length === 0 ? (
          <EmptyState icon={FileText}>
            <p className="text-base font-semibold text-foreground">{t("emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted">{t("emptyHint")}</p>
            <div className="mt-5 flex justify-center">
              <NewDocumentButton label={t("newDocument")} large />
            </div>
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {docs.map((doc) => (
              <DocumentListRow
                key={doc.id}
                doc={doc}
                locale={locale}
                favorited={favoritedDocIds.has(doc.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
