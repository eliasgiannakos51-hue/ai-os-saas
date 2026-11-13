import "server-only";
import { discordMissing, type DiscordEnvName } from "@/lib/discord/config";
import { latestBuild, listGuilds, listItems, screenBuild, type BuildStatus } from "@/lib/discord/store";
import { discordPlanPrice } from "@/lib/discord/pricing";
import { getPurchasedPackCreditPriceEur, resolveEffectivePlan } from "@/lib/billing/credits";
import type { Blueprint, BoxKind } from "@/lib/discord/blueprint";
import { logApiError } from "@/lib/log-error";

/**
 * WHAT /dashboard/discord DRAWS, read once on the server: which of the
 * four values are missing, the connected servers, the newest plan with
 * what its apply made, and the price of a plan. Only the fields the screen
 * needs — no Discord token, no other account's row, no model name.
 */
export type DiscordScreenItem = { boxKey: string; kind: BoxKind; note: string | null; deleted: boolean };
export type DiscordScreen = {
  missing: DiscordEnvName[];
  guilds: { id: string; name: string }[];
  build: { id: string; guildId: string; said: string; blueprint: Blueprint; version: number; status: BuildStatus } | null;
  items: DiscordScreenItem[];
  price: number;
  /** The tables are not there yet: the migration has not been run. */
  unreadable: boolean;
};

export async function readDiscordScreen(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null }): Promise<DiscordScreen> {
  const missing = discordMissing();
  const plan = await resolveEffectivePlan(user);
  const price = discordPlanPrice(plan, await getPurchasedPackCreditPriceEur(user.id));
  try {
    const [guilds, build] = await Promise.all([listGuilds(user.id), latestBuild(user.id)]);
    const items = build ? await listItems(user.id, build.id) : [];
    return {
      missing,
      guilds: guilds.map((g) => ({ id: g.guild_id, name: g.guild_name ?? g.guild_id })),
      build: build ? screenBuild(build) : null,
      items: items.map((i) => ({ boxKey: i.boxKey, kind: i.kind, note: i.note, deleted: i.deletedAt !== null })),
      price,
      unreadable: false,
    };
  } catch (err) {
    logApiError("/dashboard/discord", err, { stage: "read" });
    return { missing, guilds: [], build: null, items: [], price, unreadable: true };
  }
}
