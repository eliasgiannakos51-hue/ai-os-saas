import "server-only";
import { CONTROL_TIMEOUT_MS } from "@/lib/ai/providers/failover";
import type { ChannelSend } from "@/lib/notify/channels/telegram";

/**
 * DISCORD, as a webhook post.
 *
 * NO GLOBAL KEY, and that is the difference from Telegram: a Discord
 * webhook URL IS the credential. Anybody holding it can post into that
 * channel, as us, forever, with no further authentication and no way for
 * the owner to tell it apart from a legitimate message. So it is stored
 * encrypted (lib/integrations/crypto.ts) and it is never logged, never
 * echoed in an error, and never returned to the browser after it is
 * saved.
 *
 * THE URL IS VALIDATED BY SHAPE BEFORE IT IS STORED. A user pasting a
 * Slack webhook, a pastebin link, or their own server's URL into this
 * field would otherwise turn our sender into a request generator pointed
 * wherever they like — which is the shape of an SSRF, using our IP.
 */

const ALLOWED_HOSTS = new Set(["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"]);

export type WebhookCheck = { ok: true; url: string } | { ok: false; reason: string };

/**
 * Is this a Discord webhook, and only that?
 *
 * HTTPS, a Discord host, and the documented path shape. Everything else
 * is refused — including http, including a redirect-looking URL, and
 * including a Discord host with a path we do not recognise.
 */
export function checkDiscordWebhook(raw: unknown): WebhookCheck {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, reason: "empty" };
  const value = raw.trim();
  if (value.length > 400) return { ok: false, reason: "too long" };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "not a URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not https" };
  if (!ALLOWED_HOSTS.has(url.hostname)) return { ok: false, reason: "not a Discord host" };
  if (!/^\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+$/.test(url.pathname)) {
    return { ok: false, reason: "not a webhook path" };
  }
  // A webhook URL carries no query and no fragment. Refusing them rather
  // than stripping them keeps this a validator rather than a rewriter:
  // if somebody pasted something with a query on it, we did not get what
  // they think they gave us.
  if (url.search || url.hash) return { ok: false, reason: "unexpected query or fragment" };
  return { ok: true, url: url.toString() };
}

export function discordConfigured(): boolean {
  // Per-user, not per-deployment: the credential is the webhook itself,
  // which each user supplies. Nothing to configure on the server.
  return true;
}

export async function sendDiscord(params: {
  /** The decrypted webhook URL. Never logged, never returned. */
  webhookUrl: string;
  title: string;
  body: string;
  url?: string | null;
}): Promise<ChannelSend> {
  const check = checkDiscordWebhook(params.webhookUrl);
  if (!check.ok) {
    // RE-VALIDATED AT SEND TIME, not just at save time. A row written by
    // an older version, or edited in a SQL console, must not be able to
    // point this at an arbitrary host.
    return { ok: false, kind: "rejected", detail: `stored target is not a Discord webhook (${check.reason})` };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTROL_TIMEOUT_MS);
  try {
    const response = await fetch(check.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // ONE EMBED, no @everyone, no mentions. `allowed_mentions: {}`
        // is what stops a title containing "@everyone" from pinging a
        // whole server — which a website form submission or an agent
        // result could easily contain.
        embeds: [
          {
            title: params.title.slice(0, 250),
            description: params.body.slice(0, 2000),
            ...(params.url ? { url: params.url } : {}),
          },
        ],
        allowed_mentions: { parse: [] },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // THE URL IS NOT IN THE DETAIL. It is the credential.
      return { ok: false, kind: "rejected", detail: `HTTP ${response.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      kind: "unreachable",
      detail: err instanceof Error ? err.message.slice(0, 200) : "send failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
