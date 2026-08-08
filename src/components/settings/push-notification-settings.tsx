"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";

// Per-type push opt-in for THIS browser.
//
// Push permission is granted per device, not per account: the same user
// may want agent results on their phone and nothing on a shared laptop.
// So the toggles below act on this browser's subscription endpoint, and
// the panel reads its state from the live PushSubscription rather than
// from the server — the browser is the source of truth for whether
// notifications are actually possible here.

const TYPES = [
  { key: "agent_results", label: "Agent results", hint: "When a scheduled agent finishes a run" },
  { key: "mission_reminders", label: "Mission reminders", hint: "When a scheduled mission step runs" },
  { key: "low_credits", label: "Low credits", hint: "When work stops because the balance ran out" },
  { key: "collaboration", label: "Collaboration", hint: "Team invites and shared-workspace activity" },
] as const;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  // VAPID keys are published base64url; PushManager wants raw bytes.
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushNotificationSettings({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const { addToast } = useToast();
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean>>(
    Object.fromEntries(TYPES.map((t) => [t.key, true]))
  );
  const [endpoint, setEndpoint] = useState<string | null>(null);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      Boolean(vapidPublicKey);
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setSubscribed(Boolean(sub));
        setEndpoint(sub?.endpoint ?? null);
      })
      .catch(() => undefined);
  }, [vapidPublicKey]);

  const enable = useCallback(async () => {
    if (!vapidPublicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        addToast("Notifications are blocked in your browser settings.", "error");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("save failed");
      setSubscribed(true);
      setEndpoint(sub.endpoint);
      addToast("Notifications are on for this device.", "success");
    } catch {
      addToast("Could not turn on notifications here.", "error");
    } finally {
      setBusy(false);
    }
  }, [vapidPublicKey, addToast]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setEndpoint(null);
      addToast("Notifications are off for this device.", "success");
    } catch {
      addToast("Could not turn notifications off.", "error");
    } finally {
      setBusy(false);
    }
  }, [addToast]);

  const toggleType = useCallback(
    async (key: string) => {
      if (!endpoint) return;
      const next = !(prefs[key] ?? true);
      setPrefs((p) => ({ ...p, [key]: next }));
      const res = await fetch("/api/push/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, type: key, enabled: next }),
      });
      if (!res.ok) {
        setPrefs((p) => ({ ...p, [key]: !next }));
        addToast("Could not save that preference.", "error");
      }
    },
    [endpoint, prefs, addToast]
  );

  if (!supported) {
    return (
      <div className="rounded-xl border border-border bg-panel p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <BellOff className="h-4 w-4 text-muted" aria-hidden="true" />
          Push notifications
        </h2>
        <p className="mt-2 text-xs text-muted">
          {vapidPublicKey
            ? "This browser doesn't support push notifications. On iPhone, add Ionexa to your home screen first (iOS 16.4+)."
            : "Push notifications are not configured on this deployment."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="h-4 w-4 text-orange-400" aria-hidden="true" />
            Push notifications
          </h2>
          <p className="mt-1 text-xs text-muted">
            Per device. Turning these on here doesn&apos;t affect your other devices.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={subscribed ? disable : enable}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:text-orange-400 disabled:opacity-50"
        >
          {busy ? "…" : subscribed ? "Turn off" : "Turn on"}
        </button>
      </div>

      {subscribed && (
        <ul className="mt-4 space-y-2">
          {TYPES.map((t) => (
            <li key={t.key} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium">{t.label}</p>
                <p className="text-[11px] text-muted">{t.hint}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[t.key] ?? true}
                aria-label={t.label}
                onClick={() => toggleType(t.key)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                  (prefs[t.key] ?? true) ? "bg-orange-500" : "bg-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                    (prefs[t.key] ?? true) ? "left-[1.125rem]" : "left-0.5"
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
