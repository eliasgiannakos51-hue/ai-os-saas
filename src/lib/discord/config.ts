import "server-only";
import { DiscordRest } from "@/lib/discord/rest";

/**
 * THE FOUR VALUES DISCORD NEEDS, AND WHAT IS MISSING (the owner's Discord
 * directive, 2026-11-05). All four come from the application the owner
 * creates at discord.com/developers (docs/NEEDS-FROM-ELIAS.md, «Discord»):
 *
 *   DISCORD_CLIENT_ID      the application id: the invite link, and the
 *                          slash command's answers
 *   DISCORD_CLIENT_SECRET  exchanges the invite's code, and keys the state
 *   DISCORD_BOT_TOKEN      every call the bot makes
 *   DISCORD_PUBLIC_KEY     verifies that an interaction came from Discord
 *
 * With any of them missing the screen names which, and offers nothing
 * that needs it: no connect button without the first three, and the
 * interactions route refuses everything without the fourth.
 */
export const DISCORD_ENV = ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_BOT_TOKEN", "DISCORD_PUBLIC_KEY"] as const;
export type DiscordEnvName = (typeof DISCORD_ENV)[number];

export function discordMissing(env: Record<string, string | undefined> = process.env): DiscordEnvName[] {
  return DISCORD_ENV.filter((name) => !(env[name] ?? "").trim());
}

export function discordConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return discordMissing(env).length === 0;
}

/** The client every bot call goes through (lib/discord/rest.ts). */
export function botRest(): DiscordRest {
  return new DiscordRest({ authorization: `Bot ${(process.env.DISCORD_BOT_TOKEN ?? "").trim()}` });
}
