"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Mail, Hash, Send, MessageSquare, Bell, Check, Loader2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  DELIVERY_CHANNELS,
  isDiscordWebhookUrl,
  isTelegramBotToken,
  isTelegramChat,
  type DeliveryChannel,
} from "@/lib/agents/delivery-channels";

/**
 * Where an agent sends its result — the control that decides it.
 *
 * IT DID NOT EXIST. Slack delivery was implemented in the API, validated,
 * ownership-checked and completely unreachable: the agent editor had no
 * delivery field of any kind, so every agent anyone could create emailed,
 * and the one alternative was a feature only a developer with curl could
 * use. A capability nobody can find is not a capability.
 *
 * The connected channels are asked of the server on mount rather than
 * assumed, because "you have Telegram connected" is a fact about the
 * account, not about this browser.
 */

const CHANNEL_ICONS: Record<DeliveryChannel, typeof Mail> = {
  email: Mail,
  slack: Hash,
  telegram: Send,
  discord: MessageSquare,
  in_app: Bell,
};

type SavedChannel = { channel: string; target: string; secretHint: string; verifiedAt: string | null };

export function DeliveryPicker({
  value,
  target,
  accountEmail,
  slackChannels,
  onChange,
}: {
  value: DeliveryChannel;
  target: string;
  accountEmail: string;
  /** Channels from the user's own connected Slack workspace, resolved
   *  server-side. Empty when Slack is not connected. */
  slackChannels: { id: string; name: string }[];
  onChange: (next: { method: DeliveryChannel; target: string }) => void;
}) {
  const t = useTranslations("dashboard.agents.delivery");
  const { addToast } = useToast();
  const [saved, setSaved] = useState<SavedChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<DeliveryChannel | null>(null);
  const [testing, setTesting] = useState<"telegram" | "discord" | null>(null);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChat, setTelegramChat] = useState("");
  const [discordUrl, setDiscordUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/delivery-channels");
        const data = await response.json();
        if (!cancelled && data.ok) setSaved(data.channels as SavedChannel[]);
      } catch {
        // Nothing connected is the common answer, and a failed check is
        // not evidence of one. The picker still works for email and
        // in-app, which need nothing.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connected = (channel: string) => saved.some((c) => c.channel === channel);

  async function connect(channel: "telegram" | "discord") {
    const secret = channel === "telegram" ? telegramToken.trim() : discordUrl.trim();
    // Refused here as well as on the server, so an obvious typo is
    // answered instantly instead of after a round trip and a real
    // outbound call to a third party.
    if (channel === "telegram" && !isTelegramBotToken(secret)) {
      addToast(t("telegramTokenInvalid"), "error");
      return;
    }
    if (channel === "telegram" && !isTelegramChat(telegramChat)) {
      addToast(t("telegramChatInvalid"), "error");
      return;
    }
    if (channel === "discord" && !isDiscordWebhookUrl(secret)) {
      addToast(t("discordUrlInvalid"), "error");
      return;
    }
    setConnecting(channel);
    try {
      const response = await fetch("/api/delivery-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          secret,
          ...(channel === "telegram" ? { chat: telegramChat.trim() } : {}),
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("connectFailed"), "error");
        return;
      }
      setSaved((current) => [...current.filter((c) => c.channel !== channel), data.channel as SavedChannel]);
      setTelegramToken("");
      setDiscordUrl("");
      // The connection was proved by an actual test message, so saying so
      // is a fact rather than a reassurance.
      addToast(t("connectSuccess"));
      onChange({ method: channel, target: channel === "telegram" ? telegramChat.trim() : "" });
    } catch (err) {
      addToast(getErrorMessage(err, t("connectFailed")), "error");
    } finally {
      setConnecting(null);
    }
  }

  /**
   * Sends a REAL message to an already-connected channel.
   *
   * "The five channels are shown but I don't know if they send" — the
   * only previous proof was at the moment of pasting, and a token can be
   * revoked or a webhook deleted the day after. Success says where to
   * look; failure says what the platform actually objected to.
   */
  async function test(channel: "telegram" | "discord") {
    setTesting(channel);
    try {
      const response = await fetch("/api/delivery-channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("testFailed"), "error");
        return;
      }
      addToast(t(channel === "telegram" ? "testSentTelegram" : "testSentDiscord"));
    } catch (err) {
      addToast(getErrorMessage(err, t("testFailed")), "error");
    } finally {
      setTesting(null);
    }
  }

  async function disconnect(channel: "telegram" | "discord") {
    setConnecting(channel);
    try {
      const response = await fetch(`/api/delivery-channels?channel=${channel}`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("connectFailed"), "error");
        return;
      }
      setSaved((current) => current.filter((c) => c.channel !== channel));
      if (value === channel) onChange({ method: "email", target: accountEmail });
      addToast(t("disconnected"));
    } catch (err) {
      addToast(getErrorMessage(err, t("connectFailed")), "error");
    } finally {
      setConnecting(null);
    }
  }

  function select(channel: DeliveryChannel) {
    if (channel === "email") return onChange({ method: "email", target: accountEmail });
    if (channel === "in_app") return onChange({ method: "in_app", target: "" });
    if (channel === "slack") return onChange({ method: "slack", target: slackChannels[0]?.id ?? "" });
    const savedChannel = saved.find((c) => c.channel === channel);
    onChange({ method: channel, target: savedChannel?.target ?? "" });
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-medium text-muted">{t("label")}</p>
      <div className="flex flex-wrap gap-1.5">
        {DELIVERY_CHANNELS.map((channel) => {
          const Icon = CHANNEL_ICONS[channel];
          const active = value === channel;
          return (
            <button
              key={channel}
              type="button"
              data-testid={`delivery-channel-${channel}`}
              onClick={() => select(channel)}
              aria-pressed={active}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition-colors duration-150 sm:min-h-[36px] ${
                active
                  ? "border-orange-500 bg-orange-500/15 font-medium text-orange-300"
                  : "border-border text-muted hover:border-orange-500/50 hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {t(`channels.${channel}`)}
              {(channel === "telegram" || channel === "discord") && connected(channel) && (
                <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      {/* WHAT EACH ONE ACTUALLY DOES, next to the choice rather than in a
          help article. "Telegram" is not self-explanatory when the
          question is where a briefing arrives at 8am. */}
      {value === "email" && <p className="text-[11px] text-muted">{t("emailNote", { email: accountEmail })}</p>}
      {value === "in_app" && <p className="text-[11px] text-muted">{t("inAppNote")}</p>}

      {value === "slack" && (
        <div>
          {slackChannels.length === 0 ? (
            <p className="text-[11px] text-amber-400/90">{t("slackNotConnected")}</p>
          ) : (
            <select
              value={target}
              onChange={(e) => onChange({ method: "slack", target: e.target.value })}
              aria-label={t("slackChannelLabel")}
              className="input min-h-[44px] text-sm sm:min-h-0"
            >
              {slackChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {value === "telegram" && !loading && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          {connected("telegram") ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted">
                {t("telegramConnected", {
                  chat: saved.find((c) => c.channel === "telegram")?.target ?? "",
                  hint: saved.find((c) => c.channel === "telegram")?.secretHint ?? "",
                })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="delivery-test-telegram"
                  onClick={() => void test("telegram")}
                  disabled={testing === "telegram" || connecting === "telegram"}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-orange-500/40 px-3 py-1 text-xs font-medium text-orange-300 transition-colors duration-150 hover:bg-orange-500/10 disabled:opacity-50"
                >
                  {testing === "telegram" ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-3 w-3" aria-hidden="true" />
                  )}
                  {t("sendTest")}
                </button>
                <button
                  type="button"
                  onClick={() => void disconnect("telegram")}
                  disabled={connecting === "telegram"}
                  className="inline-flex min-h-[36px] items-center rounded-lg border border-border px-3 py-1 text-xs text-muted transition-colors duration-150 hover:text-foreground disabled:opacity-50"
                >
                  {t("disconnect")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Numbered, because "create a bot with @BotFather" is one
                  sentence describing seven actions, and somebody who has
                  never heard of BotFather cannot start. */}
              <ol className="list-decimal space-y-0.5 pl-4 text-[11px] leading-relaxed text-muted">
                {/* The keys are written out, not built with a template
                    literal: a key assembled at runtime is invisible to
                    the i18n scanner, so a missing translation would ship
                    as a raw key on the screen. */}
                {(["telegramStep1", "telegramStep2", "telegramStep3", "telegramStep4", "telegramStep5", "telegramStep6", "telegramStep7"] as const).map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ol>
              <input
                type="password"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                placeholder={t("telegramTokenPlaceholder")}
                aria-label={t("telegramTokenPlaceholder")}
                autoComplete="off"
                className="input text-sm"
              />
              <input
                type="text"
                value={telegramChat}
                onChange={(e) => setTelegramChat(e.target.value)}
                placeholder={t("telegramChatPlaceholder")}
                aria-label={t("telegramChatPlaceholder")}
                className="input text-sm"
              />
              <button
                type="button"
                onClick={() => void connect("telegram")}
                disabled={connecting === "telegram"}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-50 sm:min-h-[36px]"
              >
                {connecting === "telegram" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {t("connect")}
              </button>
            </>
          )}
        </div>
      )}

      {value === "discord" && !loading && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          {connected("discord") ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted">
                {t("discordConnected", { hint: saved.find((c) => c.channel === "discord")?.secretHint ?? "" })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="delivery-test-discord"
                  onClick={() => void test("discord")}
                  disabled={testing === "discord" || connecting === "discord"}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-orange-500/40 px-3 py-1 text-xs font-medium text-orange-300 transition-colors duration-150 hover:bg-orange-500/10 disabled:opacity-50"
                >
                  {testing === "discord" ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-3 w-3" aria-hidden="true" />
                  )}
                  {t("sendTest")}
                </button>
                <button
                  type="button"
                  onClick={() => void disconnect("discord")}
                  disabled={connecting === "discord"}
                  className="inline-flex min-h-[36px] items-center rounded-lg border border-border px-3 py-1 text-xs text-muted transition-colors duration-150 hover:text-foreground disabled:opacity-50"
                >
                  {t("disconnect")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Numbered, because "create a bot with @BotFather" is one
                  sentence describing seven actions, and somebody who has
                  never heard of BotFather cannot start. */}
              <ol className="list-decimal space-y-0.5 pl-4 text-[11px] leading-relaxed text-muted">
                {/* The keys are written out, not built with a template
                    literal: a key assembled at runtime is invisible to
                    the i18n scanner, so a missing translation would ship
                    as a raw key on the screen. */}
                {(["discordStep1", "discordStep2", "discordStep3", "discordStep4", "discordStep5"] as const).map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ol>
              <input
                type="password"
                value={discordUrl}
                onChange={(e) => setDiscordUrl(e.target.value)}
                placeholder={t("discordUrlPlaceholder")}
                aria-label={t("discordUrlPlaceholder")}
                autoComplete="off"
                className="input text-sm"
              />
              <button
                type="button"
                onClick={() => void connect("discord")}
                disabled={connecting === "discord"}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-50 sm:min-h-[36px]"
              >
                {connecting === "discord" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {t("connect")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
