import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { getSiteUrl } from "@/lib/site-url";
import { discordMissing } from "@/lib/discord/config";
import { DISCORD_STATE_COOKIE, verifyState } from "@/lib/discord/signatures";
import { DISCORD_API } from "@/lib/discord/rest";
import { botGuild, registerCommands } from "@/lib/discord/bot";
import { linkGuild } from "@/lib/discord/store";

export const dynamic = "force-dynamic";

/**
 * WHERE DISCORD SENDS THE PERSON BACK after they add the bot to a server
 * (the owner's Discord directive, 2026-11-05).
 *
 * WHICH SERVER, AND WHO SAYS SO. The redirect carries `guild_id` in its
 * query string, and that is NOT what is stored: a query string is
 * whatever the browser sends. The code is exchanged with the client
 * secret, and Discord's token response names the server the bot was
 * really added to (`guild.id`); then the BOT is asked for that server
 * (GET /guilds/{id}), which answers only when it is a member. Only a
 * server that passes both is linked, to the session's account, and only
 * if no other account has it (lib/discord/store.ts, linkGuild).
 *
 * Nothing of the person's Discord account is kept: the access token in
 * the exchange's answer is not stored, not logged, and not used.
 */
export async function GET(request: Request) {
  const base = getSiteUrl().replace(/\/+$/, "");
  const back = (status: string) => {
    const res = NextResponse.redirect(`${base}/dashboard/discord?discord=${status}`);
    res.cookies.set({ name: DISCORD_STATE_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/discord", maxAge: 0 });
    return res;
  };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(`${base}/login`);
    if (!(await isFeatureOn("discord-bot", user))) return back("unavailable");
    if (discordMissing().length > 0) return back("not_configured");

    const limited = await checkRateLimit({ scope: "discord_connect", identifier: user.id, maxAttempts: 10, windowMinutes: 60 });
    if (!limited.allowed) return back("rate_limited");

    const url = new URL(request.url);
    if (url.searchParams.get("error")) return back("cancelled");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return back("invalid_response");

    const secret = (process.env.DISCORD_CLIENT_SECRET ?? "").trim();
    const cookieStore = await cookies();
    const check = verifyState(state, { secret, userId: user.id, cookieNonce: cookieStore.get(DISCORD_STATE_COOKIE)?.value });
    if (!check.ok) return back(check.reason === "expired" ? "expired" : "invalid_state");

    const exchange = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: (process.env.DISCORD_CLIENT_ID ?? "").trim(),
        client_secret: secret,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${base}/api/discord/callback`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!exchange.ok) return back("exchange_failed");
    const token = (await exchange.json().catch(() => null)) as { guild?: { id?: unknown } } | null;
    const guildId = typeof token?.guild?.id === "string" ? token.guild.id : "";
    if (!/^\d{15,22}$/.test(guildId)) return back("no_server");

    const guild = await botGuild(guildId);
    if (!guild) return back("bot_not_in_server");

    const linked = await linkGuild(user.id, guild.id, guild.name);
    if (linked === "taken") return back("taken");
    if (linked === "failed") return back("save_failed");

    // The slash command on this one server. A failure here leaves the
    // server connected and the plan screen working; it is logged, and
    // connecting again registers it again.
    if (!(await registerCommands(guild.id))) logApiError("/api/discord/callback", new Error("slash command not registered"), { userId: user.id });
    return back("connected");
  } catch (err) {
    logApiError("/api/discord/callback", err);
    return back("error");
  }
}
