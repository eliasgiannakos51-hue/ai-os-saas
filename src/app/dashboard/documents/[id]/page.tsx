import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DocumentEditor } from "@/components/documents/document-editor";
import { loadFavoriteIds } from "@/lib/favorites";
import type { UserDocument } from "@/types/document";

export const metadata: Metadata = { title: "Document" };

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function DocumentEditorPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // RLS already scopes this to the caller's own rows — a doc belonging to
  // someone else (or a bad id) just comes back null, same as "not found".
  const { data: doc } = await supabase
    .from("user_documents")
    .select("id, title, content, updated_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!doc) {
    notFound();
  }

  const favorited = await loadFavoriteIds(supabase, user.id, "user_documents", [doc.id as string]);

  return (
    <DocumentEditor
      doc={doc as Pick<UserDocument, "id" | "title" | "content" | "updated_at">}
      initialFavorited={favorited.has(doc.id as string)}
    />
  );
}
