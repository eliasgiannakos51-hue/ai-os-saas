import { NextResponse, after } from "next/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyInteraction } from "@/lib/discord/signatures";
import { hasPermission } from "@/lib/discord/permissions";
import { guildOwner } from "@/lib/discord/store";
import { DiscordRest } from "@/lib/discord/rest";
import { answerAsk, splitForDiscord } from "@/lib/discord/ask";
import { botLocale, botText } from "@/lib/discord/bot-text";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // @function-limit 60

/**
 * DISCORD'S HTTP INTERACTIONS ENDPOINT: `/ionexa ask <text>` (the owner's
 * Discord directive, 2026-11-05). Set as the application's Interactions
 * Endpoint URL (docs/NEEDS-FROM-ELIAS.md, «Discord»).
 *
 * NO SESSION, SO THE SIGNATURE IS THE IDENTITY. Every request is refused
 * with 401 unless its Ed25519 signature over timestamp + raw body verifies
 * against DISCORD_PUBLIC_KEY (lib/discord/signatures.ts, verifyInteraction)
 * — read as raw text first, because a body parsed and re-serialised is not
 * the bytes Discord signed. With no key configured, everything is refused.
 *
 * WHO MAY SPEND WHOSE CREDITS. Only a server connected to an Ionexa
 * account (public.discord_guilds) gets an answer, and the account charged
 * is that one — never one named in the request. Inside the server, only a
 * member whose permissions in that channel include Manage Server (or
 * Administrator), because the credits are the account holder's; the
 * command is registered with the same default (lib/discord/bot.ts). Each
 * server is bounded by checkRateLimit scope discord_ask, thirty an hour.
 *
 * WHAT THE MEMBER TYPED IS DATA (lib/discord/ask.ts). The answer takes
 * longer than the three seconds Discord waits, so the reply is deferred
 * (type 5) and the answer replaces it from after(), through the
 * interaction's own webhook, which needs no bot token.
 */
type Interaction = {
  type?: number;
  id?: string;
  application_id?: string;
  token?: string;
  guild_id?: string;
  locale?: string;
  member?: { permissions?: string };
  data?: { name?: string; options?: { name?: string; options?: { name?: string; value?: unknown }[] }[] };
};

const EPHEMERAL = 64;
const reply = (content: string) => NextResponse.json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } } });

export async function POST(request: Request) {
  const raw = await request.text();
  const verified = verifyInteraction({
    publicKeyHex: process.env.DISCORD_PUBLIC_KEY?.trim(),
    signatureHex: request.headers.get("x-signature-ed25519"),
    timestamp: request.headers.get("x-signature-timestamp"),
    rawBody: raw,
  });
  if (!verified) return NextResponse.json({ error: "invalid request signature" }, { status: 401 });

  let interaction: Interaction;
  try {
    interaction = JSON.parse(raw) as Interaction;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  // PING: Discord checking the endpoint.
  if (interaction.type === 1) return NextResponse.json({ type: 1 });

  const locale = botLocale(interaction.locale);
  if (interaction.type !== 2 || interaction.data?.name !== "ionexa") return reply(botText(locale, "unknownCommand"));
  const sub = interaction.data.options?.[0];
  const question = sub?.name === "ask" ? sub.options?.find((o) => o.name === "text")?.value : undefined;
  if (typeof question !== "string" || !question.trim()) return reply(botText(locale, "empty"));

  try {
    const guildId = typeof interaction.guild_id === "string" && /^\d{15,22}$/.test(interaction.guild_id) ? interaction.guild_id : "";
    const owner = guildId ? await guildOwner(guildId) : null;
    if (!owner) return reply(botText(locale, "notLinked"));
    if (!hasPermission(interaction.member?.permissions, "manage_guild") && !hasPermission(interaction.member?.permissions, "administrator")) return reply(botText(locale, "notAllowed"));

    const limited = await checkRateLimit({ scope: "discord_ask", identifier: guildId, maxAttempts: 30, windowMinutes: 60 });
    if (!limited.allowed) return reply(botText(locale, "tooMany"));

    const appId = String(interaction.application_id ?? "");
    const token = String(interaction.token ?? "");
    if (!/^\d{15,22}$/.test(appId) || !/^[A-Za-z0-9._-]{20,500}$/.test(token)) return reply(botText(locale, "failed"));

    after(async () => {
      const answer = await answerAsk({ userId: owner, guildId, question, locale });
      const parts = splitForDiscord(answer.text);
      const hook = new DiscordRest();
      const first = await hook.request("PATCH", `/webhooks/${appId}/${token}/messages/@original`, { content: parts[0], allowed_mentions: { parse: [] } });
      if (!first.ok) logApiError("/api/discord/interactions", new Error(`answer not delivered: ${first.reason}`), { stage: "deliver" });
      for (const part of parts.slice(1)) await hook.request("POST", `/webhooks/${appId}/${token}`, { content: part, allowed_mentions: { parse: [] } });
    });
    // Deferred: "Ionexa is thinking…", visible to the channel.
    return NextResponse.json({ type: 5 });
  } catch (err) {
    logApiError("/api/discord/interactions", err);
    return reply(botText(locale, "failed"));
  }
}
