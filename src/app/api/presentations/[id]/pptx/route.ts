import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { safeFilename } from "@/lib/pdf/blocks";
import { parseStoredDeck } from "@/lib/presentations/deck";
import { loadDeckImages } from "@/lib/presentations/images";
import { renderDeckPptx } from "@/lib/presentations/pptx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A deck as a .pptx the person keeps.
 *
 * READ UNDER THE USER'S OWN SESSION, not the service role, so row level
 * security decides whether this deck may be read — the same rule as
 * api/documents/[id]/pdf, and for the same reason: a route that used the
 * admin client and filtered by user_id in TypeScript would be one
 * forgotten `.eq()` away from serving somebody else's deck. The photos
 * are fetched through the same client, so an own-photo path outside the
 * person's folder downloads nothing.
 *
 * No model call, no charge: the deck was paid for when it was written.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const { data: row, error } = await supabase
      .from("ai_presentations")
      .select("title, slides")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const deck = parseStoredDeck(row.slides);
    // A hand-typed note from the old form has no slides to export.
    if (!deck) return NextResponse.json({ error: "not_ready" }, { status: 409 });

    const images = await loadDeckImages(deck, supabase, "/api/presentations/[id]/pptx");
    const buffer = await renderDeckPptx(deck, images);
    const name = `${safeFilename(deck.title, "presentation")}.pptx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${name}"`,
        // Per-user and freshly rendered; a cached copy is one person's
        // deck served to the next.
        "Cache-Control": "private, no-store",
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    logApiError("/api/presentations/[id]/pptx", err);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
