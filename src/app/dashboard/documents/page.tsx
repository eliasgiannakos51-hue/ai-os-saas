import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { EmptyState } from "@/components/empty-state";
import { DeleteButton } from "@/components/delete-button";
import { NewDocumentButton } from "@/components/documents/new-document-button";
import { formatRelativeTime } from "@/lib/format-time";
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
              <li
                key={doc.id}
                className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-panel px-4 py-3 transition-colors duration-150 hover:border-orange-500/40"
              >
                <Link
                  href={`/dashboard/documents/${doc.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <FileText
                    className="h-4 w-4 shrink-0 text-orange-500/60 group-hover:text-orange-400"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {doc.title || t("untitled")}
                    </span>
                    <span className="block text-xs text-muted" suppressHydrationWarning>
                      {formatRelativeTime(doc.updated_at)}
                    </span>
                  </span>
                </Link>
                <DeleteButton
                  table="user_documents"
                  id={doc.id}
                  label={t("deleteLabel")}
                  itemName={doc.title}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
