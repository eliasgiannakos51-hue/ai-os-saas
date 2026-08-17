import "server-only";
import { listSlackChannels } from "@/lib/integrations/read";
import { listDeliveryChannels } from "@/lib/agents/delivery-store";
import { isDeliveryChannel, type DeliveryOwnership } from "@/lib/agents/delivery-channels";

/**
 * "Where is this user allowed to send?", asked of the DATABASE.
 *
 * ONE FUNCTION, called by every write path — create, edit, and anything
 * added later. The ownership rules themselves are pure and live in
 * delivery-channels.ts; this is the half that has to touch the database,
 * and it exists separately so that the two routes cannot resolve
 * ownership from two different sets of facts.
 *
 * The failure mode it removes is specific and quiet: the create route
 * checked Slack and the edit route checked Slack, and when a third
 * channel arrives the odds of both being updated are exactly the odds of
 * whoever adds it remembering there are two. A channel that is
 * ownership-checked on create and unchecked on edit is not
 * ownership-checked at all — the edit route is one PATCH away.
 */
export type OwnershipResolution =
  | { ok: true; context: Pick<DeliveryOwnership, "allowedSlackChannels" | "telegramChat" | "hasDiscordWebhook"> }
  | { ok: false; message: string };

export async function resolveDeliveryOwnership(
  userId: string,
  channel: unknown
): Promise<OwnershipResolution> {
  // An unknown channel resolves to an EMPTY context rather than an error,
  // so the validator gives the one message that names the real problem
  // ("that delivery method is not available") instead of this function
  // guessing at a second one.
  if (!isDeliveryChannel(channel)) return { ok: true, context: {} };

  if (channel === "slack") {
    const channels = await listSlackChannels(userId);
    if (!channels.ok) {
      return { ok: false, message: "Connect Slack in Integrations before an agent can post to it." };
    }
    return { ok: true, context: { allowedSlackChannels: channels.channels.map((c) => c.id) } };
  }

  if (channel === "telegram" || channel === "discord") {
    const saved = await listDeliveryChannels(userId);
    const telegram = saved.find((c) => c.channel === "telegram");
    const discord = saved.find((c) => c.channel === "discord");
    if (channel === "telegram" && !telegram) {
      return { ok: false, message: "Connect Telegram first — an agent needs your bot token and chat." };
    }
    if (channel === "discord" && !discord) {
      return { ok: false, message: "Add a Discord webhook first — an agent needs somewhere to post." };
    }
    return {
      ok: true,
      context: { telegramChat: telegram?.target ?? null, hasDiscordWebhook: Boolean(discord) },
    };
  }

  // email and in_app need nothing looked up: one is the account's own
  // address, the other is the account itself.
  return { ok: true, context: {} };
}
