import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { buildPptx, pptxFilename } from "@/lib/presentations/pptx";
import { fetchDeckImages } from "@/lib/presentations/export-images";
import { normaliseSlides, withUniqueIds } from "@/lib/presentations/slides";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

/**
 * Download the deck as a .pptx.
 *
 * PDF is NOT served here. It is produced by the browser's own print
 * pipeline from /dashboard/presentations/[id]/print, which is a
 * deliberate choice rather than a missing feature: a real PDF writer
 * would have to lay out and embed fonts to match what the user sees, and
 * the thing that already does that perfectly is the renderer the deck is
 * displayed in. Print-to-PDF produces a file that matches the screen
 * exactly, in every theme, with no second layout engine to keep in sync.
 *
 * PPTX cannot work that way — it is not a rendering, it is a document
 * the recipient will edit — so it is written properly, by hand
 * (lib/presentations/pptx.ts).
 *
 * Rate-limited despite making no AI call: each export downloads up to a
 * dozen photos and builds an archive, which is the most CPU and network
 * any non-AI route here spends.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "presentation_export",
      identifier: user.id,
      maxAttempts: 30,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many exports. Try again shortly." }, { status: 429 });
    }

    const { data: deck, error } = await supabase
      .from("user_presentations")
      .select("id, title, theme, slides")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      logApiError("/api/presentations/[id]/export", error, { stage: "select" });
      return NextResponse.json({ ok: false, error: "Could not load the presentation." }, { status: 500 });
    }
    if (!deck) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    const slides = withUniqueIds(normaliseSlides(deck.slides));
    if (slides.length === 0) {
      return NextResponse.json({ ok: false, error: "This presentation has no slides." }, { status: 400 });
    }

    const images = await fetchDeckImages(slides);
    const file = buildPptx({
      title: deck.title ?? "",
      slides,
      themeId: deck.theme ?? "professional",
      images,
    });

    return new NextResponse(new Uint8Array(file), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        // The filename is derived from the deck title, which is
        // user-controlled text. pptxFilename strips everything that is
        // not a letter, digit, space, hyphen or underscore, so it cannot
        // carry the quotes or newlines that would let a title inject a
        // second header field here.
        "Content-Disposition": `attachment; filename="${pptxFilename(deck.title ?? "")}"`,
        "Content-Length": String(file.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logApiError("/api/presentations/[id]/export", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
