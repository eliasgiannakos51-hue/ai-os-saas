import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { allowExport } from "@/lib/export-guard";
import { gameGate } from "@/lib/games/game-access";
import { sealGame } from "@/lib/games/game-html";

export const dynamic = "force-dynamic";

/**
 * THE GAME'S CODE, DOWNLOADED (package 26; BUILD-SPECS «λήψη του κώδικα»):
 * one HTML file that plays when opened, sealed the way it is played
 * (lib/games/game-html.ts sealGame). A file of what is already the
 * person's, so free — bounded by lib/export-guard.ts like every other
 * download of that kind.
 */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  const gate = await gameGate(user);
  if (!gate.ok) return NextResponse.json({ ok: false, code: gate.code }, { status: 403 });
  if (!(await allowExport(user.id))) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
  try {
    const { data: game, error } = await supabase.from("user_games").select("title, html").eq("id", params.id).eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!game || typeof game.html !== "string" || !game.html) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    const name = String(game.title ?? "game").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 60) || "game";
    return new NextResponse(sealGame(game.html), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="game.html"; filename*=UTF-8''${encodeURIComponent(name)}.html`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    logApiError("/api/games/[id]/download", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
