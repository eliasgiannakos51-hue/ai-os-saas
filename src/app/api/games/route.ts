import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { SUPPORTED_LOCALES } from "@/i18n/constants";
import { resolveLanguage } from "@/lib/text/resolve-language";
import { gameGate } from "@/lib/games/game-access";
import { chargedGameStep } from "@/lib/games/charge";
import { planGame } from "@/lib/games/game-call";
import { MAX_GAME_DESCRIPTION_CHARS, planMessage } from "@/lib/games/game-plan";
import { gameSystemPrompt } from "@/lib/games/game-system";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // @function-limit 120

/**
 * A GAME, PLANNED FROM A DESCRIPTION (MASTER 16, package 26), behind the
 * switch "games". The plan is five boxes — rules, levels, characters,
 * controls, how you win — and nothing is written yet: the person reads
 * the plan, changes any box with words, and only then has the game
 * written (api/games/[id], action "build").
 *
 * The row is written with the service role, scoped to the caller: the
 * account reads and deletes its games but cannot write one itself
 * (supabase/migrations/20261024000000_user_games.sql), so every stored
 * game went through lib/games/game-html.ts's check.
 */
export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, code: "not_configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) return NextResponse.json({ ok: false, code: "empty" }, { status: 400 });
  if (description.length > MAX_GAME_DESCRIPTION_CHARS) return NextResponse.json({ ok: false, code: "too_long", limit: MAX_GAME_DESCRIPTION_CHARS }, { status: 400 });
  const uiLocale = typeof body.locale === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(body.locale) ? body.locale : "en";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  const gate = await gameGate(user);
  if (!gate.ok) return NextResponse.json({ ok: false, code: gate.code }, { status: 403 });

  try {
    const locale = resolveLanguage(description, uiLocale);
    const message = planMessage(description, locale);
    const step = await chargedGameStep({
      user,
      gate,
      action: "gamePlan",
      feature: "game_generate",
      inputChars: gameSystemPrompt().length + message.length,
      fingerprint: description,
      route: "/api/games",
      metadata: { step: "plan", descriptionChars: description.length },
      run: (costs) => planGame({ apiKey, description, locale, costs, signal: request.signal }),
    });
    if (!step.ok) return step.response;

    const { data: row, error } = await createAdminClient()
      .from("user_games")
      .insert({ user_id: user.id, title: step.value.title, description, locale, plan: step.value })
      .select("id, title, plan, html, versions, locale, updated_at")
      .single();
    if (error || !row) {
      logApiError("/api/games", error, { stage: "save" });
      return NextResponse.json({ ok: false, code: "not_saved", creditsCharged: step.creditsCharged }, { status: 500 });
    }
    return NextResponse.json({ ok: true, game: row, creditsCharged: step.creditsCharged });
  } catch (err) {
    logApiError("/api/games", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
