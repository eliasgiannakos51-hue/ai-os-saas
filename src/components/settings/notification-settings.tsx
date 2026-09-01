"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, MessageSquare, Moon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_SPECS,
  NOTIFICATION_TYPES,
  resolveChannels,
  type NotificationChannel,
  type NotificationType,
} from "@/lib/notify/types";
import { formatClock, parseClock } from "@/lib/notify/quiet-hours";

// PER TYPE, PER CHANNEL — the brief's "ο χρήστης επιλέγει ΑΝΑ ΤΥΠΟ πού
// θέλει", as a grid rather than as a wall of switches. Seven types times
// four channels is twenty-eight decisions, and the only layout in which
// that is readable is one where the channels are columns and you can see
// down a column at a glance.
//
// WHAT THE UI IS NOT ALLOWED TO PRETEND. A channel with nothing connected
// is shown DISABLED rather than hidden: hiding it makes "why does
// Telegram not work" unanswerable from the screen where it is configured.
// And the in-app box for a critical type is checked and disabled, because
// the server will keep the record whatever this says — a switch that
// looks free and is not is worse than one that says so.
//
// Writes go straight to Supabase through the user's own RLS-scoped
// client, the same pattern as the email panel next to it. The dispatcher
// reads the same rows with the service-role client, so a change takes
// effect on the very next notification with no cache to invalidate.

type Preference = { enabled: boolean; channels: NotificationChannel[] | null };
type ChatRow = { kind: string; label: string | null; verified_at: string | null };

export function NotificationSettings({ userId }: { userId: string }) {
  const t = useTranslations("settings.notifications");
  const supabase = createClient();
  const { addToast } = useToast();

  const [prefs, setPrefs] = useState<Partial<Record<NotificationType, Preference>>>({});
  const [quietOn, setQuietOn] = useState(false);
  const [quietFrom, setQuietFrom] = useState("22:00");
  const [quietTo, setQuietTo] = useState("08:00");
  const [offset, setOffset] = useState(0);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [telegramAvailable, setTelegramAvailable] = useState(false);
  // TRUE UNTIL THE SERVER SAYS OTHERWISE. The fetch below is the only
  // thing that can set it false, and a panel that rendered "email is not
  // set up" for the half-second before that answer arrived would be
  // saying something false to every user on every load.
  const [emailAvailable, setEmailAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connectTarget, setConnectTarget] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: settings }, { data: rows }, channelsResponse] = await Promise.all([
        supabase
          .from("notification_settings")
          .select("quiet_start_minute, quiet_end_minute, utc_offset_minutes")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase.from("notification_preferences").select("type, enabled, channels").eq("user_id", userId),
        fetch("/api/notifications/channels").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!alive) return;

      if (settings) {
        const start = settings.quiet_start_minute;
        const end = settings.quiet_end_minute;
        if (typeof start === "number" && typeof end === "number") {
          setQuietOn(true);
          setQuietFrom(formatClock(start));
          setQuietTo(formatClock(end));
        }
        setOffset(Number(settings.utc_offset_minutes ?? 0) || 0);
      } else {
        // THE BROWSER KNOWS. getTimezoneOffset is minutes to ADD to local
        // to get UTC — the opposite sign of what the column stores — so a
        // straight copy would put every user on the wrong side of
        // midnight. Negated here, once, where it is visible.
        setOffset(-new Date().getTimezoneOffset());
      }

      const loaded: Partial<Record<NotificationType, Preference>> = {};
      for (const row of rows ?? []) {
        const type = String(row.type) as NotificationType;
        if (!(NOTIFICATION_TYPES as readonly string[]).includes(type)) continue;
        loaded[type] = {
          enabled: row.enabled !== false,
          channels: Array.isArray(row.channels) ? (row.channels as NotificationChannel[]) : null,
        };
      }
      setPrefs(loaded);

      if (channelsResponse) {
        setChats((channelsResponse.channels ?? []) as ChatRow[]);
        setTelegramAvailable(Boolean(channelsResponse.telegramAvailable));
        setEmailAvailable(channelsResponse.emailAvailable !== false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase, userId]);

  const connected = useMemo(
    () => new Set(chats.filter((c) => c.verified_at).map((c) => c.kind)),
    [chats]
  );

  const channelUsable = useCallback(
    (channel: NotificationChannel) => {
      if (channel === "in_app") return true;
      // NOT ALWAYS TRUE. See the comment in api/notifications/channels.
      if (channel === "email") return emailAvailable;
      if (channel === "telegram") return telegramAvailable && connected.has("telegram");
      return connected.has("discord");
    },
    [connected, telegramAvailable, emailAvailable]
  );

  const effective = useCallback(
    (type: NotificationType): NotificationChannel[] => {
      const pref = prefs[type];
      // THE SAME FUNCTION THE SERVER USES. If the screen decided for
      // itself which boxes are ticked, the two could disagree — and the
      // one the user believes is the screen.
      return resolveChannels({
        type,
        chosen: pref?.channels ?? undefined,
        disabled: pref ? !pref.enabled : false,
        available: NOTIFICATION_CHANNELS.filter(channelUsable),
      });
    },
    [prefs, channelUsable]
  );

  async function writePreference(type: NotificationType, next: Preference) {
    setPrefs((prev) => ({ ...prev, [type]: next }));
    setBusy(true);
    const { error } = await supabase.from("notification_preferences").upsert(
      {
        user_id: userId,
        type,
        enabled: next.enabled,
        channels: next.channels ?? [...NOTIFICATION_SPECS[type].defaultChannels],
      },
      { onConflict: "user_id,type" }
    );
    setBusy(false);
    if (error) {
      addToast(t("saveError"), "error");
      return;
    }
    addToast(t("saved"));
  }

  function toggleChannel(type: NotificationType, channel: NotificationChannel) {
    const pref = prefs[type];
    const current = pref?.channels ?? [...NOTIFICATION_SPECS[type].defaultChannels];
    const next = current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel];
    void writePreference(type, { enabled: pref?.enabled ?? true, channels: next });
  }

  function toggleType(type: NotificationType) {
    const pref = prefs[type];
    void writePreference(type, {
      enabled: !(pref?.enabled ?? true),
      channels: pref?.channels ?? [...NOTIFICATION_SPECS[type].defaultChannels],
    });
  }

  async function saveQuietHours(next: { on: boolean; from: string; to: string; offsetMinutes: number }) {
    const start = next.on ? parseClock(next.from) : null;
    const end = next.on ? parseClock(next.to) : null;
    // Both or neither — the column CHECK says so, and half a window
    // cannot mean anything.
    if (next.on && (start === null || end === null)) {
      addToast(t("saveError"), "error");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("notification_settings").upsert(
      {
        user_id: userId,
        quiet_start_minute: start,
        quiet_end_minute: end,
        utc_offset_minutes: next.offsetMinutes,
      },
      { onConflict: "user_id" }
    );
    setBusy(false);
    if (error) {
      addToast(t("saveError"), "error");
      return;
    }
    addToast(t("saved"));
  }

  async function connectChat(kind: "telegram" | "discord") {
    const target = (connectTarget[kind] ?? "").trim();
    if (!target) return;
    setConnecting(kind);
    try {
      const response = await fetch("/api/notifications/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, target }),
      });
      if (!response.ok) {
        addToast(t("chat.testFailed"), "error");
        return;
      }
      setChats((prev) => [
        ...prev.filter((c) => c.kind !== kind),
        { kind, label: null, verified_at: new Date().toISOString() },
      ]);
      setConnectTarget((prev) => ({ ...prev, [kind]: "" }));
      addToast(t("chat.testSent"));
    } finally {
      setConnecting(null);
    }
  }

  async function disconnectChat(kind: "telegram" | "discord") {
    setConnecting(kind);
    try {
      const response = await fetch(`/api/notifications/channels?kind=${kind}`, { method: "DELETE" });
      if (!response.ok) {
        addToast(t("saveError"), "error");
        return;
      }
      setChats((prev) => prev.filter((c) => c.kind !== kind));
      addToast(t("saved"));
    } finally {
      setConnecting(null);
    }
  }

  return (
    <div className="mb-6 space-y-5 rounded-2xl border border-border bg-panel p-5" id="notifications">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Bell className="h-4 w-4 text-orange-400" /> {t("title")}
        </h2>
        <p className="mt-1 text-xs text-muted">{t("description")}</p>
        {/* SAID ONCE, AT THE TOP, RATHER THAN PER ROW. The Email column
            is greyed out by channelUsable for every type when this is
            false; without a sentence saying why, a greyed column reads as
            a plan limit or a bug. It is neither — it is the operator's
            deployment, and the user cannot do anything about it, which is
            precisely why they should not be left guessing.

            Not an error tone: nothing the reader did is wrong, and
            nothing they are owed has been lost yet. */}
        {!emailAvailable && (
          <p
            role="status"
            className="mt-3 rounded-xl border border-amber-800 bg-amber-950/20 px-3 py-2 text-xs text-amber-300"
          >
            {t("emailNotConfigured")}
          </p>
        )}
      </div>

      {/* The matrix. Scrolls inside itself on a phone rather than making
          the page scroll sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr>
              <th className="pb-2 text-xs font-normal text-muted">&nbsp;</th>
              {NOTIFICATION_CHANNELS.map((channel) => (
                <th key={channel} className="pb-2 text-center text-xs font-normal text-muted">
                  {t(`channels.${channel}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_TYPES.map((type) => {
              const spec = NOTIFICATION_SPECS[type];
              const pref = prefs[type];
              const enabled = pref?.enabled ?? true;
              const active = effective(type);
              return (
                <tr key={type} className="border-t border-border align-top">
                  <td className="py-3 pr-4">
                    <button
                      type="button"
                      onClick={() => toggleType(type)}
                      disabled={busy}
                      className="text-left disabled:opacity-50"
                    >
                      <span className={`block text-sm ${enabled ? "text-foreground" : "text-muted line-through"}`}>
                        {t(`types.${type}.label`)}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{t(`types.${type}.description`)}</span>
                    </button>
                  </td>
                  {NOTIFICATION_CHANNELS.map((channel) => {
                    const usable = channelUsable(channel);
                    // A critical type's in-app record cannot be switched
                    // off — the server keeps it either way, so the box
                    // says what is true rather than offering a choice
                    // that is not honoured.
                    const locked = channel === "in_app" && spec.critical;
                    const checked = active.includes(channel);
                    return (
                      <td key={channel} className="py-3 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy || locked || !usable || !enabled}
                          onChange={() => toggleChannel(type, channel)}
                          aria-label={`${t(`types.${type}.label`)} — ${t(`channels.${channel}`)}`}
                          className="h-5 w-5 accent-orange-500 disabled:opacity-40"
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">{t("criticalNote")}</p>

      {/* ---- quiet hours ---- */}
      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Moon className="h-4 w-4 text-orange-400" /> {t("quiet.title")}
        </h3>
        <p className="text-xs text-muted">{t("quiet.description")}</p>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={quietOn}
            disabled={busy}
            onChange={(e) => {
              setQuietOn(e.target.checked);
              void saveQuietHours({ on: e.target.checked, from: quietFrom, to: quietTo, offsetMinutes: offset });
            }}
            className="h-5 w-5 accent-orange-500"
          />
          {t("quiet.enable")}
        </label>
        {quietOn && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted">
              <span className="mb-1 block">{t("quiet.from")}</span>
              <input
                type="time"
                value={quietFrom}
                disabled={busy}
                onChange={(e) => setQuietFrom(e.target.value)}
                onBlur={() => void saveQuietHours({ on: true, from: quietFrom, to: quietTo, offsetMinutes: offset })}
                className="rounded-lg border border-border bg-panel-hover px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted">
              <span className="mb-1 block">{t("quiet.to")}</span>
              <input
                type="time"
                value={quietTo}
                disabled={busy}
                onChange={(e) => setQuietTo(e.target.value)}
                onBlur={() => void saveQuietHours({ on: true, from: quietFrom, to: quietTo, offsetMinutes: offset })}
                className="rounded-lg border border-border bg-panel-hover px-3 py-2 text-sm text-foreground"
              />
            </label>
            <p className="text-xs text-muted">
              {t("quiet.offset")}: UTC{offset >= 0 ? "+" : "−"}
              {formatClock(Math.abs(offset))}
            </p>
          </div>
        )}
        <p className="text-xs text-muted">{t("quiet.deferNote")}</p>
      </div>

      {/* ---- chat channels ---- */}
      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquare className="h-4 w-4 text-orange-400" /> {t("chat.title")}
        </h3>
        <p className="text-xs text-muted">{t("chat.description")}</p>

        {(["telegram", "discord"] as const).map((kind) => {
          const isConnected = connected.has(kind);
          const unavailable = kind === "telegram" && !telegramAvailable;
          return (
            <div key={kind} className="space-y-1">
              <p className="text-sm text-foreground">{t(`channels.${kind}`)}</p>
              {unavailable ? (
                <p className="text-xs text-amber-400">{t("chat.notConfigured")}</p>
              ) : isConnected ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-emerald-400">{t("chat.connected")}</span>
                  <button
                    type="button"
                    onClick={() => void disconnectChat(kind)}
                    disabled={connecting !== null}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground disabled:opacity-50"
                  >
                    {t("chat.disconnect")}
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {/* `chat.${kind}.help` rather than a ternary over two literal
                      keys: the orphan-key gate understands a `${prop}.literalSuffix`
                      template and cannot see inside a ternary, so the ternary form
                      made four real, rendered keys look unreachable. */}
                  <p className="text-xs text-muted">{t(`chat.${kind}.help`)}</p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={connectTarget[kind] ?? ""}
                      onChange={(e) => setConnectTarget((prev) => ({ ...prev, [kind]: e.target.value }))}
                      placeholder={t(`chat.${kind}.placeholder`)}
                      aria-label={t(`channels.${kind}`)}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-panel-hover px-3 py-2 text-sm text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => void connectChat(kind)}
                      disabled={connecting !== null || !(connectTarget[kind] ?? "").trim()}
                      className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black disabled:opacity-50"
                    >
                      {connecting === kind ? t("chat.connecting") : t("chat.connect")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
