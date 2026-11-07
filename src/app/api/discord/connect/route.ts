import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { getSiteUrl } from "@/lib/site-url";
import { discordMissing } from "@/lib/discord/config";
import { botPermissionInteger } from "@/lib/discord/permissions";
import { DISCORD_STATE_COOKIE, signState } from "@/lib/discord/signatures";

export const dynamic = "force-dynamic";

/**
 * «Σύνδεσε το Ionexa» (the owner's Discord directive, 2026-11-05): the
 * bot-invite flow, `scope=bot applications.commands`, with the permission
 * integer from lib/discord/permissions.ts's explicit list — never
 * Administrator — and a state bound to THIS person: signed, ten minutes,
 * its nonce also in an httpOnly cookie scoped to /api/discord
 * (lib/discord/signatures.ts). The server is chosen on Discord's own
 * screen; api/discord/callback learns which one from Discord, not from
 * the browser.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });
    if (!(await isFeatureOn("discord-bot", user))) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    if (discordMissing().length > 0) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

    const limited = await checkRateLimit({ scope: "discord_connect", identifier: user.id, maxAttempts: 10, windowMinutes: 60 });
    if (!limited.allowed) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

    const nonce = randomBytes(24).toString("base64url");
    const state = signState({ n: nonce, u: user.id, t: Date.now() }, (process.env.DISCORD_CLIENT_SECRET ?? "").trim());
    const params = new URLSearchParams({
      client_id: (process.env.DISCORD_CLIENT_ID ?? "").trim(),
      scope: "bot applications.commands",
      permissions: botPermissionInteger(),
      response_type: "code",
      redirect_uri: `${getSiteUrl().replace(/\/+$/, "")}/api/discord/callback`,
      state,
    });
    const response = NextResponse.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
    response.cookies.set({
      name: DISCORD_STATE_COOKIE,
      value: nonce,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/discord",
      maxAge: 600,
    });
    return response;
  } catch (err) {
    logApiError("/api/discord/connect", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
