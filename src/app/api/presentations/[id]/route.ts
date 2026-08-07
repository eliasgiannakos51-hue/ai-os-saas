import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { isThemeId } from "@/lib/presentations/themes";
import {
  MAX_DECK_TITLE_CHARS,
  MIN_SLIDES,
  normaliseSlides,
  withUniqueIds,
} from "@/lib/presentations/slides";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const DECK_COLUMNS =
  "id, title, brief, language, theme, slides, sources, status, error, credits_charged, share_slug, share_enabled, created_at, updated_at";

/**
 * One deck.
 *
 * Ownership is a FILTER on the query, not a check after it. Both are
 * correct today; only one stays correct when somebody adds a branch
 * between the read and the check. It also means another user's id
 * returns 404 rather than 403 — a 403 confirms the row exists, which
 * turns this endpoint into an existence oracle for every deck in the
 * database.
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

    const { data, error } = await supabase
      .from("user_presentations")
      .select(DECK_COLUMNS)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      logApiError("/api/presentations/[id]", error, { stage: "select" });
      return NextResponse.json({ ok: false, error: "Could not load the presentation." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    const { data: versions } = await supabase
      .from("presentation_versions")
      .select("id, version_number, title, change_summary, created_at")
      .eq("presentation_id", params.id)
      .eq("user_id", user.id)
      .order("version_number", { ascending: false });

    return NextResponse.json({ ok: true, presentation: data, versions: versions ?? [] });
  } catch (err) {
    logApiError("/api/presentations/[id]", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * Save manual edits: the slide array (inline text edits, reordering,
 * adding and deleting), the title, the theme.
 *
 * No AI call, so nothing is charged. No version is appended either —
 * the editor saves as the user types, and a history entry per keystroke
 * is not history. Versions come from the operations that are discrete
 * and expensive to redo: a generation, an accepted AI edit, a rollback.
 *
 * Every field is optional and applied only if present, so the editor can
 * PATCH just the theme without having to send the whole deck back.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Rate-limited despite being a plain write, because it is the
    // AUTOSAVE endpoint: the editor calls it on a 2.5-second debounce
    // for as long as somebody is typing. The ceiling is set well above
    // real editing (a save every nine seconds, sustained for an hour)
    // so it never interrupts the person it exists for, and still bounds
    // a client that has been modified to write in a loop.
    const limited = await checkRateLimit({
      scope: "presentation_save",
      identifier: user.id,
      maxAttempts: 400,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many saves. Try again shortly." }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    if (typeof body.title === "string") {
      update.title = body.title.trim().slice(0, MAX_DECK_TITLE_CHARS);
    }
    if (body.theme !== undefined) {
      if (!isThemeId(body.theme)) {
        return NextResponse.json({ ok: false, error: "Unknown theme." }, { status: 400 });
      }
      update.theme = body.theme;
    }
    if (body.slides !== undefined) {
      // Normalised server-side, never trusted from the wire. The editor
      // already enforces the same limits, but the editor is a program
      // running on someone else's computer.
      const slides = withUniqueIds(normaliseSlides(body.slides));
      if (slides.length < MIN_SLIDES) {
        return NextResponse.json(
          { ok: false, error: `A presentation needs at least ${MIN_SLIDES} slides.` },
          { status: 400 }
        );
      }
      update.slides = slides;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_presentations")
      .update(update)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select(DECK_COLUMNS)
      .maybeSingle();

    if (error) {
      logApiError("/api/presentations/[id]", error, { stage: "update" });
      return NextResponse.json({ ok: false, error: "Could not save the presentation." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, presentation: data });
  } catch (err) {
    logApiError("/api/presentations/[id]", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/** Delete a deck. Versions go with it via ON DELETE CASCADE — they are
 *  the deck's history, not a separate record of it, and leaving them
 *  behind would keep the slides of a deck the user deleted. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "presentation_delete",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const { data, error } = await supabase
      .from("user_presentations")
      .delete()
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      logApiError("/api/presentations/[id]", error, { stage: "delete" });
      return NextResponse.json({ ok: false, error: "Could not delete the presentation." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/presentations/[id]", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
