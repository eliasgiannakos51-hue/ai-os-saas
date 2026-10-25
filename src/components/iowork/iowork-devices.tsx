"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Laptop, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";

/** How long the screen keeps looking for a computer that accepted a code:
 *  ten tries, three seconds apart. Longer than any pairing should need,
 *  and bounded so a computer that never comes back stops being waited for. */
const JOIN_TRIES = 10;
const JOIN_WAIT_MS = 3000;

export type IoworkDevice = {
  id: string;
  label: string;
  platform: string;
  created_at: string;
  last_seen_at: string;
  idle: boolean;
};

/**
 * THE ACCOUNT'S SIDE OF iowork (Φάση 1, κομμάτι 2): the computers this
 * account has connected, and the field for the code one of them is
 * showing.
 *
 * WHAT THIS SCREEN IS CAREFUL NOT TO IMPLY. There is no desktop app to
 * download yet — docs/IOWORK-TECH.md, κομμάτι 1, is the technology
 * decision and nothing has been packaged. A screen with a code field and
 * a device list reads as "install it and type this", so the first thing
 * on it says plainly that the app has not been released. The half that
 * works is real; the half that does not is labelled.
 */
export function IoworkDevices({ initialDevices, max }: { initialDevices: IoworkDevice[]; max: number }) {
  const t = useTranslations("dashboard.iowork");
  const { addToast } = useToast();
  const [devices, setDevices] = useState(initialDevices);
  const [code, setCode] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Set false when this screen goes away, so a wait that is still counting
  // stops asking instead of calling setState on a component nobody is on.
  const onScreen = useRef(true);
  useEffect(() => {
    onScreen.current = true;
    return () => {
      onScreen.current = false;
    };
  }, []);

  // Literal keys, one per code the routes can answer with: the i18n slicer
  // cannot follow a key built at run time, so a template literal here would
  // make every one of these read as unused and get dropped.
  const errors: Record<string, string> = {
    bad_code: t("errors.bad_code"),
    not_found: t("errors.not_found"),
    expired: t("errors.expired"),
    tooMany: t("errors.tooMany", { max }),
    rateLimited: t("errors.rateLimited"),
    not_enabled: t("errors.not_enabled"),
    not_signed_in: t("errors.not_signed_in"),
    failed: t("errors.failed"),
  };
  const say = (code: unknown) => (typeof code === "string" && errors[code]) || t("errors.failed");

  /** Asks the server for the list again. Returns how many came back, or
   *  -1 when it could not ask — which is not the same as none, and the
   *  caller must not treat it as none. */
  async function loadDevices(): Promise<number> {
    try {
      const res = await fetch("/api/iowork/devices");
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.devices)) return -1;
      if (onScreen.current) setDevices(data.devices as IoworkDevice[]);
      return data.devices.length;
    } catch {
      return -1;
    }
  }

  /**
   * AFTER THE CODE IS ACCEPTED, THE COMPUTER IS STILL NOT THERE. It joins
   * a few seconds later, when its own app comes back for the token
   * (api/iowork/pair/token), and nothing pushes that to this page. So the
   * list looks again a handful of times and then stops, rather than
   * leaving a person staring at an empty list they were told to expect
   * something in — or asking them to refresh, which is the same thing
   * said less kindly.
   */
  async function waitForComputer(before: number) {
    for (let tries = 0; tries < JOIN_TRIES; tries++) {
      await new Promise((r) => setTimeout(r, JOIN_WAIT_MS));
      if (!onScreen.current) return;
      if ((await loadDevices()) > before) return;
    }
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim() || connecting) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/iowork/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!data.ok) {
        addToast(say(data.code), "error");
        return;
      }
      // NOT "connected": typing the code binds the pairing to this
      // account, and the computer joins only when its app comes back for
      // the token a few seconds later. Saying "connected" here would be
      // ahead of what happened — iowork-devices.prodtest.mjs asserts that
      // the list is still empty at exactly this moment.
      addToast(t("codeAccepted", { name: data.label }), "success");
      setCode("");
      void waitForComputer(devices.length);
    } catch (err) {
      addToast(getErrorMessage(err, t("errors.failed")), "error");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect(device: IoworkDevice) {
    if (!window.confirm(t("confirmDisconnect", { name: device.label }))) return;
    setBusy(device.id);
    try {
      const res = await fetch(`/api/iowork/devices/${device.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        addToast(say(data.code), "error");
        return;
      }
      setDevices((list) => list.filter((d) => d.id !== device.id));
      void loadDevices();
    } catch (err) {
      addToast(getErrorMessage(err, t("errors.failed")), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <p className="notice-warning px-4 py-3 text-sm">{t("noAppYet")}</p>

      <form onSubmit={connect} className="surface-tight space-y-3">
        <div>
          <label htmlFor="iowork-code" className="text-sm font-medium text-foreground">
            {t("connectHeading")}
          </label>
          <p className="mt-1 text-xs text-muted">{t("connectHint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            id="iowork-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("codePlaceholder")}
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            className="field-box min-h-[44px] w-full px-3 font-mono tracking-widest sm:w-48"
          />
          <button
            type="submit"
            disabled={connecting || !code.trim()}
            className="btn-outline shrink-0 disabled:opacity-50"
            data-testid="iowork-connect"
          >
            {connecting ? t("connecting") : t("connect")}
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">{t("listHeading", { count: devices.length, max })}</h2>
        {devices.length === 0 ? (
          <p className="surface-tight text-sm text-muted" data-testid="iowork-empty">
            {t("empty")}
          </p>
        ) : (
          <ul className="row-list" data-testid="iowork-list">
            {devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid="iowork-device">
                <div className="flex min-w-0 items-center gap-3">
                  <Laptop className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{device.label}</p>
                    <p className="text-[11px] text-muted">
                      {device.platform === "mac" ? t("platform.mac") : t("platform.windows")}
                      {device.idle ? ` · ${t("idle")}` : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => disconnect(device)}
                  disabled={busy === device.id}
                  aria-label={t("disconnectLabel", { name: device.label })}
                  title={t("disconnect")}
                  data-testid="iowork-disconnect"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-danger/70 transition-colors duration-150 hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted">{t("safetyLine")}</p>
    </div>
  );
}
