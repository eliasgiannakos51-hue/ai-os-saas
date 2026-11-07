import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { checkRateLimit } from "@/lib/rate-limit";
import { discordMissing } from "@/lib/discord/config";
import { botLeave } from "@/lib/discord/bot";
import { ownsGuild, unlinkGuild } from "@/lib/discord/store";

export const dynamic = "force-dynamic";

/**
 * «Αποσύνδεση» of one Discord server (the owner's Discord directive,
 * 2026-11-05): the bot leaves it and the account forgets it. What an apply
 * made there STAYS in Discord — after this, Ionexa can no longer undo it,
 * and the screen says so before the press. Only the session's own server
 * (lib/discord/store.ts filters by user id); bounded by checkRateLimit
 * scope discord_disconnect.
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
    if (!(await isFeatureOn("discord-bot", user))) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });

    const limited = await checkRateLimit({ scope: "discord_disconnect", identifier: user.id, maxAttempts: 20, windowMinutes: 60 });
    if (!limited.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });

    const guildId = new URL(request.url).searchParams.get("guild") ?? "";
    if (!/^\d{15,22}$/.test(guildId) || !(await ownsGuild(user.id, guildId))) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    if (discordMissing().length === 0 && !(await botLeave(guildId))) return NextResponse.json({ ok: false, code: "leave_failed" }, { status: 502 });
    if (!(await unlinkGuild(user.id, guildId))) return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/discord", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
