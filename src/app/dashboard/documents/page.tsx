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
import { isFeatureOn } from "@/lib/flags/flags";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { planMeetsMinimum } from "@/lib/billing/plans";
import { htmlToBlocks } from "@/lib/pdf/blocks";
import { DOCUMENT_WRITER_MIN_PLAN } from "@/lib/documents/writer-access";
import { DocumentsShell, type WrittenDocRow } from "@/components/documents/documents-shell";
import { readRequestedId } from "@/lib/library/requested";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.documents");
}

// Live, frequently-mutated per-user data (created/renamed/edited on every
// visit) — same reasoning as dashboard/mission and dashboard/timeline for
// why this must never serve a stale client Router Cache entry (see this
// project's next.config.mjs staleTimes comment) or a stale server render.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function DocumentsPage(props: { searchParams?: Promise<{ record?: string }> }) {
  const searchParams = await props.searchParams;
  const t = await getTranslations("dashboard.documents");
  const supabase = await createClient();

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

  // THE WRITER (MASTER 16, package 14), behind the switch "document-writer"
  // and for the plans that include it (lib/documents/writer-access.ts; the
  // routes refuse the same two): every document of the person's, written
  // or typed, opens beside the conversation as its blocks. The notes list
  // below stays the page for everybody else, and the editor stays one
  // press away from the writer.
  if ((await isFeatureOn("document-writer", user)) && (isAdminEmail(user.email) || planMeetsMinimum(await resolveEffectivePlanSlug(user), DOCUMENT_WRITER_MIN_PLAN))) {
    const written: WrittenDocRow[] = rows.map((doc) => ({
      id: doc.id,
      title: doc.title,
      blocks: htmlToBlocks(typeof doc.content?.html === "string" ? doc.content.html : ""),
      updatedAt: doc.updated_at,
    }));
    return (
      <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
        <DocumentsShell initialOpenId={readRequestedId(typeof searchParams?.record === "string" ? searchParams.record : null)} docs={written} translate={await isFeatureOn("translate", user)} />
      </div>
    );
  }

  // Batched, same as every other list — one query for the whole page.
  const favoritedDocIds = await loadFavoriteIds(
    supabase,
    user.id,
    "user_documents",
    docs.map((d) => d.id)
  );

  return (
    <div className="min-h-full">
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
