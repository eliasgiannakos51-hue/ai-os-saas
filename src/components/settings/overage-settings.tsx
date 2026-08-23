"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { MIN_CAP_EUR, MAX_CAP_EUR } from "@/lib/billing/overage";

/**
 * THE OVERAGE OPT-IN, AS A QUESTION.
 *
 * THE COST IS ON SCREEN BEFORE THE BUTTON THAT AGREES TO IT — the price
 * per credit, the cap the user typed, and how many credits that cap buys,
 * all recomputed as they type. A consent dialog whose price is one click
 * away is a consent dialog nobody read.
 *
 * THE CAP IS TYPED, NOT DEFAULTED. There is no pre-filled amount, because
 * a pre-filled cap is a limit we chose on somebody else's behalf and then
 * billed them against.
 *
 * OFF IS ONE CLICK, always visible, never behind a confirmation that
 * argues. The hard thing to do should be the one that costs money.
 *
 * The arithmetic shown here is the SERVER'S: `creditsAtCap` and the price
 * come from /api/billing/overage, so the number in the dialog cannot
 * disagree with the number that gets charged.
 */

type State = {
  enabled: boolean;
  capEur: number | null;
  pricePerCreditEur: number;
  spentEur: number;
  month: string;
  listPriceEur: number;
};

export function OverageSettings() {
  const t = useTranslations("settings.overage");
  const tCommon = useTranslations("common");
  const [state, setState] = useState<State | null>(null);
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/overage");
      if (!res.ok) return;
      setState((await res.json()) as State);
    } catch {
      // A settings panel that could not load its own state shows nothing
      // rather than a default that looks like the truth.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state) return null;

  const price = state.pricePerCreditEur || state.listPriceEur;
  const capNumber = Number(cap);
  const capValid = Number.isFinite(capNumber) && capNumber >= MIN_CAP_EUR && capNumber <= MAX_CAP_EUR;
  const creditsAtCap = capValid && price > 0 ? Math.floor(capNumber / price) : 0;
  const usedPercent =
    state.enabled && state.capEur ? Math.min(100, Math.round((state.spentEur / state.capEur) * 100)) : 0;

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/overage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capEur: capNumber }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(String(data.detail ?? data.error ?? tCommon("networkError")));
        return;
      }
      setSaved(true);
      setCap("");
      await load();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/overage", { method: "DELETE" });
      if (!res.ok) {
        setError(tCommon("networkError"));
        return;
      }
      setSaved(false);
      await load();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      id="overage"
      className="mb-6 scroll-mt-20 space-y-4 rounded-2xl border border-border bg-panel p-5"
    >
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-xs text-muted">{t("description", { price: price.toFixed(2) })}</p>
      </div>

      {state.enabled ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-foreground">{t("thisMonth")}</span>
              <span className="font-semibold text-foreground">
                €{state.spentEur.toFixed(2)}{" "}
                <span className="font-normal text-muted">
                  {t("ofCap", { cap: (state.capEur ?? 0).toFixed(2) })}
                </span>
              </span>
            </div>
            {/* The bar is decoration; the figures above it are the record,
                and they are readable with the bar switched off. */}
            <div
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-valuenow={usedPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("thisMonth")}
            >
              <div
                className={usedPercent >= 100 ? "h-full bg-red-500" : "h-full bg-orange-500"}
                style={{ width: `${usedPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted">{t("agreedRate", { price: price.toFixed(2) })}</p>
          </div>

          {usedPercent >= 100 ? (
            <p className="flex items-start gap-2 text-xs text-red-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("capReached")}
            </p>
          ) : null}

          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-border px-4 text-sm text-foreground transition-colors duration-150 hover:border-red-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t("turnOff")}
          </button>
          <p className="text-xs text-muted">{t("turnOffNote")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">{t("offNow")}</p>

          <label className="block text-xs font-medium text-foreground" htmlFor="overage-cap">
            {t("capLabel")}
          </label>
          <input
            id="overage-cap"
            type="number"
            inputMode="decimal"
            min={MIN_CAP_EUR}
            max={MAX_CAP_EUR}
            step="1"
            value={cap}
            onChange={(event) => setCap(event.target.value)}
            placeholder={t("capPlaceholder")}
            className="w-full max-w-[200px] rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />

          {/* WHAT IT COSTS, BEFORE THE BUTTON. Shown from the moment a
              valid cap is typed — not after clicking, not on a next
              screen. */}
          {capValid ? (
            <div className="rounded-xl border border-orange-500/40 bg-orange-500/5 p-4 text-xs text-foreground">
              <p className="font-semibold">{t("preview.heading")}</p>
              <ul className="mt-2 space-y-1 text-muted">
                <li>{t("preview.rate", { price: price.toFixed(2) })}</li>
                <li>{t("preview.cap", { cap: capNumber.toFixed(2) })}</li>
                <li>{t("preview.credits", { credits: creditsAtCap })}</li>
                <li>{t("preview.invoice")}</li>
              </ul>
            </div>
          ) : (
            <p className="text-xs text-muted">{t("capHint", { min: MIN_CAP_EUR, max: MAX_CAP_EUR })}</p>
          )}

          <button
            type="button"
            onClick={enable}
            disabled={busy || !capValid}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t("agree")}
          </button>
        </div>
      )}

      {saved ? (
        <p className="flex items-center gap-2 text-xs text-emerald-400">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          {t("saved")}
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
