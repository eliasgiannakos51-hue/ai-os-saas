import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * The share token.
 *
 * 16 bytes of crypto randomness — 128 bits, the same strength as a v4
 * UUID and far past guessing. This is the ONLY thing protecting a shared
 * deck: there is no login on the public view, so the URL is the
 * credential, and a token from Math.random() would be a credential
 * derived from a predictable sequence.
 *
 * Hex rather than base64url so the link survives being pasted into
 * anything that mangles case or punctuation — a share link's whole job
 * is to be copied through chat clients and email.
 */
function mintShareSlug(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Turn sharing on or off, or rotate the link.
 *
 * Three actions rather than a boolean, because "off" and "rotate" are
 * genuinely different intentions and conflating them gets one of them
 * wrong:
 *
 *   enable  — mint a token if there is none, and turn sharing on. An
 *             existing token is REUSED, so a user who toggles the switch
 *             off and on again does not silently break every copy of the
 *             URL they already sent out.
 *   disable — turn sharing off, keep the token. Reversible.
 *   rotate  — mint a NEW token. This is the deliberate way to invalidate
 *             a link that reached the wrong person, and the only one.
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
      scope: "presentation_share",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const action = body?.action;
    if (action !== "enable" && action !== "disable" && action !== "rotate") {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    const { data: deck, error: readError } = await supabase
      .from("user_presentations")
      .select("id, share_slug, share_enabled")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (readError) {
      logApiError("/api/presentations/[id]/share", readError, { stage: "select" });
      return NextResponse.json({ ok: false, error: "Could not load the presentation." }, { status: 500 });
    }
    if (!deck) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    const update: Record<string, unknown> = {};
    if (action === "disable") {
      update.share_enabled = false;
    } else {
      update.share_enabled = true;
      update.shared_at = new Date().toISOString();
      if (action === "rotate" || !deck.share_slug) {
        update.share_slug = mintShareSlug();
      }
    }

    const { data, error } = await supabase
      .from("user_presentations")
      .update(update)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("id, share_slug, share_enabled, shared_at")
      .maybeSingle();

    if (error) {
      logApiError("/api/presentations/[id]/share", error, { stage: "update", action });
      return NextResponse.json({ ok: false, error: "Could not update sharing." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      shareSlug: data.share_enabled ? data.share_slug : null,
      shareEnabled: data.share_enabled,
    });
  } catch (err) {
    logApiError("/api/presentations/[id]/share", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
