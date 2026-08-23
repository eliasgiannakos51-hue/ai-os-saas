import "server-only";
import { sendAgentRunResultEmail } from "@/lib/email/send-agent-emails";
import { postToSlack } from "@/lib/integrations/read";
import { aiGeneratedNotice } from "@/lib/agents/ai-disclosure";
import { logApiError } from "@/lib/log-error";
import { readDeliverySecret } from "@/lib/agents/delivery-store";
import { createNotification } from "@/lib/notifications/store";
import {
  CHANNEL_TEXT_LIMITS,
  fitToChannel,
  isDiscordWebhookUrl,
  type DeliveryChannel,
} from "@/lib/agents/delivery-channels";
import type { AgentDeliveryMethod } from "@/lib/agents/agent-config";

// One place that decides where an agent's result goes.
//
// Split out of execute-agent.ts when Slack became a second destination, so
// the two transports cannot drift apart on the things that must be
// identical for both:
//
//   - the EU AI Act Article 50 notice. It is not an email-template
//     decoration; it is a legal property of AI-generated content, and a
//     Slack message with the notice missing would be exactly as
//     non-compliant as an email without it. The email template takes it as
//     a parameter and the Slack path appends it here.
//   - the never-throws contract. Delivery runs after the run has already
//     been paid for; a transport failure must be reported, not thrown.
//   - the truthful return. `delivered: false` means the user did NOT
//     receive it — which is why the run row records the outcome rather
//     than assuming success.

export type DeliveryOutcome = {
  delivered: boolean;
  via: AgentDeliveryMethod;
  /** Present when delivery failed, for the run row. Short and user-facing. */
  reason?: string;
};

/**
 * One message, assembled once, for whichever transport carries it.
 *
 * The disclosure is part of the ASSEMBLY rather than something each
 * transport remembers to append, because Article 50 is a property of
 * AI-generated content and not a decoration on one template. Cut to the
 * destination's own hard limit, because Telegram and Discord do not
 * truncate an over-long message — they reject it, and the user gets
 * nothing at all on a morning they were expecting something.
 */
function composeMessage(params: {
  channel: DeliveryChannel;
  agentName: string;
  output: string;
  language: string;
}): string {
  const notice = aiGeneratedNotice(params.language);
  const full = `${params.agentName}\n\n${params.output}\n\n— ${notice}`;
  if (full.length <= CHANNEL_TEXT_LIMITS[params.channel]) return full;
  // The notice survives the cut. Trimming the OUTPUT to make room is the
  // only order that keeps the message compliant: dropping the notice
  // instead would produce a shorter message that is no longer legal to
  // send.
  const room = CHANNEL_TEXT_LIMITS[params.channel] - `${params.agentName}\n\n\n\n— ${notice}`.length - 1;
  const body = room > 0 ? fitToChannel(params.output, params.channel).slice(0, room) + "…" : "…";
  return `${params.agentName}\n\n${body}\n\n— ${notice}`;
}

/** Bounded, and never following a redirect: a 302 from an allow-listed
 *  host is how the user's result reaches one that is not. */
const SEND_TIMEOUT_MS = 10_000;

async function postJson(url: string, body: unknown): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: "manual",
    });
    return response.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function deliverAgentResult(params: {
  userId: string;
  email: string;
  method: AgentDeliveryMethod;
  target: string;
  agentName: string;
  output: string;
  language: string;
}): Promise<DeliveryOutcome> {
  const { userId, email, method, target, agentName, output, language } = params;

  if (method === "slack") {
    try {
      const text = composeMessage({ channel: "slack", agentName, output, language });
      const result = await postToSlack({ userId, channel: target, text });
      if (!result.ok) {
        return { delivered: false, via: "slack", reason: slackReason(result.reason) };
      }
      return { delivered: true, via: "slack" };
    } catch (err) {
      logApiError("agents:deliver", err, { userId, method: "slack" });
      return { delivered: false, via: "slack", reason: "Could not post to Slack." };
    }
  }

  if (method === "telegram") {
    try {
      // THE BOT TOKEN IS READ HERE, from the owner's own row. It is never
      // carried on the agent, so an agent cannot name a bot it was not
      // given — and the chat id stored with that token is the one used,
      // not the one the agent row happens to hold.
      const credential = await readDeliverySecret(userId, "telegram");
      if (!credential) {
        return {
          delivered: false,
          via: "telegram",
          reason: "Telegram is no longer connected — reconnect it to keep receiving results.",
        };
      }
      const chat = credential.target || target;
      const status = await postJson(
        `https://api.telegram.org/bot${encodeURIComponent(credential.secret)}/sendMessage`,
        { chat_id: chat, text: composeMessage({ channel: "telegram", agentName, output, language }) }
      );
      if (status === 200) return { delivered: true, via: "telegram" };
      if (status === 401 || status === 403) {
        return {
          delivered: false,
          via: "telegram",
          reason: "Telegram rejected the bot — reconnect it in your agent's delivery settings.",
        };
      }
      return { delivered: false, via: "telegram", reason: "Could not send the result to Telegram." };
    } catch (err) {
      logApiError("agents:deliver", err, { userId, method: "telegram" });
      return { delivered: false, via: "telegram", reason: "Could not send the result to Telegram." };
    }
  }

  if (method === "discord") {
    try {
      // Same reasoning as Telegram, and one step stronger: the webhook URL
      // never appears on the agent row at all (delivery_target holds a
      // constant), so it cannot reach the run history or the GDPR export.
      const credential = await readDeliverySecret(userId, "discord");
      if (!credential) {
        return {
          delivered: false,
          via: "discord",
          reason: "Discord is no longer connected — add the webhook again to keep receiving results.",
        };
      }
      // Re-checked at SEND time, not only at save time. A row written by
      // an older version of this code, or edited directly in the
      // database, must not turn into a POST at a host of somebody else's
      // choosing.
      if (!isDiscordWebhookUrl(credential.secret)) {
        return { delivered: false, via: "discord", reason: "That Discord webhook address is not valid." };
      }
      const status = await postJson(credential.secret, {
        content: composeMessage({ channel: "discord", agentName, output, language }),
      });
      if (status === 204 || status === 200) return { delivered: true, via: "discord" };
      if (status === 401 || status === 403 || status === 404) {
        return {
          delivered: false,
          via: "discord",
          reason: "That Discord webhook no longer exists — add a new one.",
        };
      }
      return { delivered: false, via: "discord", reason: "Could not post the result to Discord." };
    } catch (err) {
      logApiError("agents:deliver", err, { userId, method: "discord" });
      return { delivered: false, via: "discord", reason: "Could not post the result to Discord." };
    }
  }

  if (method === "in_app") {
    // The destination that cannot be got wrong: the user themselves.
    // Nothing leaves the product, there is no address to validate, and
    // there is no third party to be offline.
    // createNotification returns the new row's id (null on failure) so
    // the notification dispatcher can attach engagement events to it;
    // this path only cares whether it landed.
    const createdId = await createNotification({
      userId,
      source: "agent",
      title: agentName,
      body: composeMessage({ channel: "in_app", agentName: "", output, language }).trim(),
      url: "/dashboard/agents",
    });
    return {
      delivered: createdId !== null,
      via: "in_app",
      ...(createdId !== null ? {} : { reason: "Could not save the result to your notifications." }),
    };
  }

  const sent = await sendAgentRunResultEmail({
    userId,
    email,
    agentName,
    output,
    language,
  });
  return {
    delivered: sent.sent,
    via: "email",
    // A blocked send is almost always the user's own preference or the
    // daily cap, not a fault — so it is reported as a fact rather than an
    // error, and the run is still a success.
    ...(sent.sent ? {} : { reason: "The result was not emailed (check your email settings)." }),
  };
}

/** Slack's machine codes, turned into something a person can act on. */
function slackReason(code: string): string {
  switch (code) {
    case "not_connected":
    case "revoked":
      return "Slack is no longer connected — reconnect it in Integrations.";
    case "expired":
      return "The Slack connection expired — reconnect it in Integrations.";
    case "channel_not_found":
      return "That Slack channel no longer exists.";
    case "not_in_channel":
      return "The Ionexa app is not in that channel — invite it, then try again.";
    case "is_archived":
      return "That Slack channel is archived.";
    default:
      return "Could not post to Slack.";
  }
}
