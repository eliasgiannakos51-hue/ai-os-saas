import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { appendVersion } from "@/lib/presentations/versions";
import { normaliseSlides, withUniqueIds } from "@/lib/presentations/slides";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Restore an earlier version.
 *
 * APPENDS rather than rewinds — the restored content becomes a NEW
 * version on top of the history, and nothing is deleted. Two things
 * follow, both of which matter more than the storage they cost:
 * rolling back a rollback works, and no button in this feature can
 * destroy what the user had. The same call the published-sites rollback
 * made in Task 2.
 *
 * Free: no AI call, so nothing is charged.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "presentation_rollback",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const versionNumber = Number(body?.versionNumber);
    if (!Number.isInteger(versionNumber) || versionNumber <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid version." }, { status: 400 });
    }

    // Both the version AND the deck are fetched under the user's id.
    // Matching only on presentation_id would let a caller name someone
    // else's deck and their own version number.
    const { data: version, error: versionError } = await supabase
      .from("presentation_versions")
      .select("id, version_number, title, slides")
      .eq("presentation_id", params.id)
      .eq("user_id", user.id)
      .eq("version_number", versionNumber)
      .maybeSingle();

    if (versionError) {
      logApiError("/api/presentations/[id]/rollback", versionError, { stage: "select_version" });
      return NextResponse.json({ ok: false, error: "Could not load that version." }, { status: 500 });
    }
    if (!version) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    const slides = withUniqueIds(normaliseSlides(version.slides));
    if (slides.length === 0) {
      return NextResponse.json({ ok: false, error: "That version has no slides." }, { status: 400 });
    }

    const { data: saved, error: saveError } = await supabase
      .from("user_presentations")
      .update({ title: version.title, slides })
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("id, title, brief, language, theme, slides, sources, status, credits_charged, share_slug, share_enabled, created_at, updated_at")
      .maybeSingle();

    if (saveError) {
      logApiError("/api/presentations/[id]/rollback", saveError, { stage: "update" });
      return NextResponse.json({ ok: false, error: "Could not restore that version." }, { status: 500 });
    }
    if (!saved) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    await appendVersion({
      supabase,
      presentationId: params.id,
      userId: user.id,
      title: version.title,
      slides,
      changeSummary: `restored version ${version.version_number}`,
    });

    return NextResponse.json({ ok: true, presentation: saved });
  } catch (err) {
    logApiError("/api/presentations/[id]/rollback", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
