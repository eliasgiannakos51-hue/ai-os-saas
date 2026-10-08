import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { gameGate } from "@/lib/games/game-access";
import { chargedGameStep } from "@/lib/games/charge";
import { changeGame, rewriteGameBox, writeGame } from "@/lib/games/game-call";
import { MAX_INSTRUCTION_CHARS, boxMessage, buildMessage, changeMessage, isGameBoxKind, readPlan, withBox } from "@/lib/games/game-plan";
import { gameSystemPrompt } from "@/lib/games/game-system";
import { pushVersion } from "@/lib/games/game-html";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // @function-limit 300

/**
 * EVERYTHING DONE TO ONE GAME AFTER ITS PLAN (package 26), one action per
 * request:
 *
 *   "box"     one box of the plan changed with words; every other box as it was
 *   "build"   the game written from the plan, checked, and kept as version 1
 *   "change"  the written game changed with words, kept as the next version
 *   "restore" an earlier version made the current one again — no model, no charge
 *
 * The game is read by id AND owner with the person's own client; it is
 * written with the service role, scoped by id AND owner, because the
 * account cannot write games itself (20261024000000_user_games.sql).
 */
type Action = "box" | "build" | "change" | "restore";
const isAction = (v: unknown): v is Action => v === "box" || v === "build" || v === "change" || v === "restore";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  const action = body.action;
  if (!isAction(action)) return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, MAX_INSTRUCTION_CHARS) : "";
  if ((action === "box" || action === "change") && !instruction) return NextResponse.json({ ok: false, code: "empty" }, { status: 400 });
  if (action === "box" && !isGameBoxKind(body.kind)) return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  const gate = await gameGate(user);
  if (!gate.ok) return NextResponse.json({ ok: false, code: gate.code }, { status: 403 });

  try {
    const { data: game, error } = await supabase
      .from("user_games")
      .select("id, title, plan, html, versions, locale")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!game) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    const plan = readPlan(game.plan);
    if (!plan) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    const locale = typeof game.locale === "string" ? game.locale : "en";
    const html = typeof game.html === "string" ? game.html : "";
    const save = async (patch: Record<string, unknown>) =>
      createAdminClient()
        .from("user_games")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", params.id)
        .eq("user_id", user.id)
        .select("id, title, plan, html, versions, locale, updated_at")
        .single();
    const answer = async (patch: Record<string, unknown>, creditsCharged: number) => {
      const { data: row, error: saveError } = await save(patch);
      if (saveError || !row) {
        logApiError("/api/games/[id]", saveError, { action, stage: "save" });
        return NextResponse.json({ ok: false, code: "not_saved", creditsCharged }, { status: 500 });
      }
      return NextResponse.json({ ok: true, game: row, creditsCharged });
    };

    if (action === "restore") {
      const at = Number(body.version);
      const versions = Array.isArray(game.versions) ? (game.versions as { html: string; at: string; note: string }[]) : [];
      const chosen = Number.isInteger(at) ? versions[at] : undefined;
      if (!chosen || typeof chosen.html !== "string") return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
      return answer({ html: chosen.html, versions: pushVersion(versions, { html: chosen.html, at: new Date().toISOString(), note: "restore" }) }, 0);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, code: "not_configured" }, { status: 503 });

    if (action === "box") {
      const kind = body.kind as Parameters<typeof withBox>[1];
      const message = boxMessage(plan, kind, instruction, locale);
      const step = await chargedGameStep({
        user, gate, action: "gameBoxEdit", feature: "game_edit",
        inputChars: gameSystemPrompt().length + message.length,
        fingerprint: `${params.id}:${kind}:${instruction}`, route: "/api/games/[id]",
        metadata: { step: "box", kind, gameId: params.id },
        run: (costs) => rewriteGameBox({ apiKey, plan, kind, instruction, locale, costs, signal: request.signal }),
      });
      if (!step.ok) return step.response;
      return answer({ plan: withBox(plan, kind, step.value) }, step.creditsCharged);
    }

    if (action === "build") {
      const message = buildMessage(plan, locale);
      const step = await chargedGameStep({
        user, gate, action: "gameWrite", feature: "game_generate",
        inputChars: gameSystemPrompt().length + message.length,
        fingerprint: `${params.id}:build`, route: "/api/games/[id]",
        metadata: { step: "build", gameId: params.id },
        run: (costs) => writeGame({ apiKey, plan, locale, costs, signal: request.signal }),
      });
      if (!step.ok) return step.response;
      return answer({ html: step.value, versions: pushVersion(game.versions, { html: step.value, at: new Date().toISOString(), note: "build" }) }, step.creditsCharged);
    }

    // action === "change"
    if (!html) return NextResponse.json({ ok: false, code: "not_built" }, { status: 409 });
    const message = changeMessage(html, instruction, locale);
    const step = await chargedGameStep({
      user, gate, action: "gameChange", feature: "game_edit",
      inputChars: gameSystemPrompt().length + message.length,
      fingerprint: `${params.id}:${instruction}`, route: "/api/games/[id]",
      metadata: { step: "change", gameId: params.id, htmlChars: html.length },
      run: (costs) => changeGame({ apiKey, html, instruction, locale, costs, signal: request.signal }),
    });
    if (!step.ok) return step.response;
    return answer({ html: step.value, versions: pushVersion(game.versions, { html: step.value, at: new Date().toISOString(), note: instruction.slice(0, 120) }) }, step.creditsCharged);
  } catch (err) {
    logApiError("/api/games/[id]", err, { action });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}

/** A game the person no longer wants: their own client, their own row. */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  const { error } = await supabase.from("user_games").delete().eq("id", params.id).eq("user_id", user.id);
  if (error) {
    logApiError("/api/games/[id]", error, { action: "delete" });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
