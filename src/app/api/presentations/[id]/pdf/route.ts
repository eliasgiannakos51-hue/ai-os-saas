import { NextResponse } from "next/server";
import React from "react";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { pdfResponse } from "@/lib/pdf/render";
import { PdfDeck } from "@/lib/pdf/deck";
import { parseStoredDeck } from "@/lib/presentations/deck";
import { loadDeckImages } from "@/lib/presentations/images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A deck as a PDF — one landscape page per slide, laid out on the same
 * canvas as the .pptx (lib/pdf/deck.tsx), in the deck's own language's
 * font order (lib/pdf/font-stack.ts).
 *
 * Same posture as the .pptx route beside it: the person's own session
 * client reads the row, so RLS decides; no model call, no charge.
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
    if (!deck) return NextResponse.json({ error: "not_ready" }, { status: 409 });

    const images = await loadDeckImages(deck, supabase, "/api/presentations/[id]/pdf");
    const element = React.createElement(PdfDeck, { deck, images });
    return await pdfResponse(element, { filename: deck.title, fallbackName: "presentation" });
  } catch (err) {
    logApiError("/api/presentations/[id]/pdf", err);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
