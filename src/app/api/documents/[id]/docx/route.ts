import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { allowExport } from "@/lib/export-guard";
import { htmlToBlocks, safeFilename } from "@/lib/pdf/blocks";
import { resolveLanguage } from "@/lib/text/resolve-language";
import { blockText } from "@/lib/documents/writer";
import { renderDocx } from "@/lib/documents/docx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A DOCUMENT AS A WORD FILE (MASTER 16, package 14) — any document of the
 * person's own, written by the writer or typed in the editor, drawn from
 * the same blocks as its PDF (lib/documents/docx.ts).
 *
 * The person's own session reads the row, so RLS decides, and the owner
 * filter says it. No model call and no charge: a file of what is already
 * theirs. Bounded, like every export (lib/export-guard.ts).
 */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });

  try {
    if (!(await allowExport(user.id))) return NextResponse.json({ ok: false, code: "too_many_exports" }, { status: 429 });
    const { data: row, error } = await supabase
      .from("user_documents")
      .select("title, content")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });

    const content = (row.content ?? {}) as { html?: unknown; locale?: unknown };
    const blocks = htmlToBlocks(typeof content.html === "string" ? content.html : "");
    const title = String(row.title ?? "");
    const locale = typeof content.locale === "string" && content.locale ? content.locale : resolveLanguage(`${title} ${blocks.map(blockText).join(" ")}`, "en");
    const bytes = renderDocx(title, blocks, locale);
    const name = `${safeFilename(title, "document")}.docx`;
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
        "Content-Length": String(bytes.length),
      },
    });
  } catch (err) {
    logApiError("/api/documents/[id]/docx", err);
    return NextResponse.json({ ok: false, code: "export_failed" }, { status: 500 });
  }
}
