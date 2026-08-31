import "server-only";
// TELEGRAM'S HTML PARSE MODE IS NOT HTML — see lib/html-escape.ts.
// This file escaped the FEWEST characters of the eight escapers in src/,
// which read as the worst drift and was the one deliberate case.
import { escapeTelegramHtml } from "@/lib/html-escape";
import { CONTROL_TIMEOUT_MS } from "@/lib/ai/providers/failover";

/**
 * TELEGRAM, as an outbound bot message.
 *
 * OFF UNLESS A BOT TOKEN IS SET. `TELEGRAM_BOT_TOKEN` is read BY NAME,
 * first, before anything is constructed — the `new Resend(undefined)`
 * lesson, which cost this project a debugging session: an SDK that throws
 * from its own constructor makes "no key" and "the network is down" the
 * same stack trace.
 *
 * WHAT IS SENT: the title, the body, and one link. Never the full result
 * of an agent run — a notification is a pointer at the product, not a
 * copy of it, and a private chat is not somewhere to spray somebody's
 * research report.
 *
 * NOTHING HERE WAS EVER CALLED. There is no TELEGRAM_BOT_TOKEN in the
 * environment this was written in, so no message was ever delivered. The
 * request shape is Telegram's documented sendMessage; the round trip is
 * not verified.
 */

const API = "https://api.telegram.org";

export function telegramConfigured(): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return typeof token === "string" && token.trim().length > 0;
}

export type ChannelSend =
  | { ok: true }
  | { ok: false; kind: "not_configured" | "rejected" | "unreachable"; detail: string };

export async function sendTelegram(params: {
  /** The decrypted chat id. Never logged. */
  chatId: string;
  title: string;
  body: string;
  /** An absolute URL built from the app's own origin. */
  url?: string | null;
}): Promise<ChannelSend> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !token.trim()) {
    return { ok: false, kind: "not_configured", detail: "TELEGRAM_BOT_TOKEN is not set" };
  }
  if (!params.chatId.trim()) {
    return { ok: false, kind: "rejected", detail: "no chat id" };
  }

  // HTML rather than Markdown: Telegram's Markdown parser rejects a
  // message containing an unescaped underscore, which agent titles
  // contain constantly, and a rejected message is a notification that
  // silently never arrives.
  const text =
    `<b>${escapeTelegramHtml(params.title)}</b>` +
    (params.body ? `\n${escapeTelegramHtml(params.body)}` : "") +
    (params.url ? `\n\n${escapeTelegramHtml(params.url)}` : "");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTROL_TIMEOUT_MS);
  try {
    const response = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: params.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      // THE BODY IS READ FOR THE CALLER, NEVER LOGGED WITH THE TOKEN.
      // Telegram echoes the chat id in its errors and the URL contains
      // the bot token, so neither the URL nor the request goes anywhere
      // near a log line.
      const detail = await response.text().catch(() => "");
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

