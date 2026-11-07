import "server-only";
import { botRest } from "@/lib/discord/config";
import type { DiscordRest } from "@/lib/discord/rest";
import { PERMISSION_BITS } from "@/lib/discord/permissions";

/**
 * WHAT THE BOT ASKS DISCORD, BY NAME (the owner's Discord directive,
 * 2026-11-05): the server check at connect and before an apply, the slash
 * command's registration, and the bot's own id. Every call goes through
 * lib/discord/rest.ts.
 */

export type GuildInfo = { id: string; name: string; community: boolean };

/** The server, as the BOT sees it: 200 only when the bot is in it. Null otherwise. */
export async function botGuild(guildId: string, rest: DiscordRest = botRest()): Promise<GuildInfo | null> {
  if (!/^\d{15,22}$/.test(guildId)) return null;
  const res = await rest.request<{ id?: string; name?: string; features?: string[] }>("GET", `/guilds/${guildId}`);
  if (!res.ok || res.body?.id !== guildId) return null;
  return { id: guildId, name: String(res.body.name ?? "").slice(0, 100), community: Array.isArray(res.body.features) && res.body.features.includes("COMMUNITY") };
}

export async function botUserId(rest: DiscordRest = botRest()): Promise<string | null> {
  const res = await rest.request<{ id?: string }>("GET", "/users/@me");
  return res.ok && typeof res.body?.id === "string" ? res.body.id : null;
}

/** The bot leaves a server: what «Αποσύνδεση» does in Discord. */
export async function botLeave(guildId: string, rest: DiscordRest = botRest()): Promise<boolean> {
  const res = await rest.request("DELETE", `/users/@me/guilds/${guildId}`);
  return res.ok || res.reason === "not_found";
}

/**
 * `/ionexa ask <text>`, registered on ONE server — the one just connected —
 * not globally, so it exists only where an account answers for it.
 * default_member_permissions is Manage Server: by default only the people
 * who manage the server see it, because what it spends is the connected
 * account's credits (api/discord/interactions checks the same bit again).
 */
export const IONEXA_COMMAND = {
  name: "ionexa",
  description: "Ionexa",
  default_member_permissions: PERMISSION_BITS.manage_guild.toString(),
  contexts: [0],
  options: [
    {
      type: 1,
      name: "ask",
      description: "Ask Ionexa (uses the connected account's credits)",
      description_localizations: { el: "Ρώτα το Ionexa (με τα credits του συνδεδεμένου λογαριασμού)" },
      options: [{ type: 3, name: "text", description: "Your question", description_localizations: { el: "Η ερώτησή σου" }, required: true, max_length: 1000 }],
    },
  ],
};

export async function registerCommands(guildId: string, rest: DiscordRest = botRest()): Promise<boolean> {
  const appId = (process.env.DISCORD_CLIENT_ID ?? "").trim();
  if (!/^\d{15,22}$/.test(appId)) return false;
  const res = await rest.request("PUT", `/applications/${appId}/guilds/${guildId}/commands`, [IONEXA_COMMAND]);
  return res.ok;
}
