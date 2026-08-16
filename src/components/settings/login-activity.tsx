"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ShieldCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { parseUserAgent } from "@/lib/parse-user-agent";
import { formatDateTime } from "@/lib/format-number";

export type KnownDevice = {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
  last_seen: string;
};

export function LoginActivity({ devices: initialDevices }: { devices: KnownDevice[] }) {
  const formatRelativeTime = useFormatRelativeTime();
  const t = useTranslations("settings.loginActivity");
  const locale = useLocale();
  const supabase = createClient();
  const { addToast } = useToast();
  const [devices, setDevices] = useState(initialDevices);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function removeDevice(device: KnownDevice) {
    setRemovingId(device.id);
    // known_devices has an owner-only RLS delete policy (auth.uid() =
    // user_id) — removing an entry just means it'll be treated as a new
    // device (and get the "new sign-in" email again) next time.
    const { error } = await supabase.from("known_devices").delete().eq("id", device.id);
    setRemovingId(null);

    if (error) {
      // eslint-disable-next-line no-console
      console.error("Remove known device error:", error);
      addToast(t("couldNotRemoveDevice"), "error");
      return;
    }

    setDevices((prev) => prev.filter((d) => d.id !== device.id));
    addToast(t("deviceRemoved"));
  }

  return (
    <div className="mb-6 space-y-3 rounded-2xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ShieldCheck className="h-4 w-4 text-orange-400" /> {t("title")}
      </h2>
      <p className="text-xs text-muted">{t("description")}</p>

      {devices.length === 0 ? (
        <p className="text-xs text-muted">{t("noDevices")}</p>
      ) : (
        <div className="space-y-2">
          {devices.map((device) => {
            const { label } = parseUserAgent(device.user_agent ?? "");
            return (
              <div
                key={device.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-input px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{label}</p>
                  <p
                    className="text-xs text-muted"
                    title={formatDateTime(device.last_seen, locale)}
                    suppressHydrationWarning
                  >
                    {t("lastSeen", { time: formatRelativeTime(device.last_seen) })}
                    {device.ip_address ? ` · ${device.ip_address}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeDevice(device)}
                  disabled={removingId === device.id}
                  aria-label={t("removeDeviceAria", { device: label })}
                  title={t("removeDevice")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-red-950/30 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
