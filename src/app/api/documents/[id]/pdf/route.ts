import { NextResponse } from "next/server";
import React from "react";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { htmlToBlocks } from "@/lib/pdf/blocks";
import { PdfDocument } from "@/lib/pdf/document";
import { pdfResponse } from "@/lib/pdf/render";
import { resolveLanguage } from "@/lib/text/resolve-language";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A written document, as a PDF the user can keep.
 *
 * The Documents module has stored `{ html }` since it replaced the legacy
 * Build-module tracker, and until now there was no way to get a document out
 * of it at all: no download, no export, no print view. The editor was the
 * only place the text existed.
 *
 * READ UNDER THE USER'S OWN SESSION, not the service role, so row level
 * security is what decides whether this document may be read. A route that
 * used the admin client and filtered by user_id in TypeScript would be one
 * forgotten `.eq()` away from serving somebody else's writing.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const { data: doc, error } = await supabase
      .from("user_documents")
      .select("title, content, updated_at")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const html = typeof doc.content?.html === "string" ? doc.content.html : "";
    const blocks = htmlToBlocks(html);
    const title = String(doc.title ?? "").trim() || "Untitled";
    // The language of the DOCUMENT, not of the interface: a reader whose app
    // is in Greek can be holding an Arabic document, and it is the document
    // that has to be laid out right to left.
    const locale = resolveLanguage(
      `${title} ${blocks.map((b) => ("runs" in b ? b.runs.map((r) => r.text).join(" ") : "")).join(" ")}`,
      "en"
    );

    const element = React.createElement(PdfDocument, {
      title,
      subtitle: new Date(doc.updated_at).toISOString().slice(0, 10),
      blocks,
      locale,
    });
    return await pdfResponse(element, { filename: title, fallbackName: "document" });
  } catch (err) {
    logApiError("/api/documents/[id]/pdf", err, { stage: "render" });
    return NextResponse.json({ error: "pdf_failed" }, { status: 500 });
  }
}
