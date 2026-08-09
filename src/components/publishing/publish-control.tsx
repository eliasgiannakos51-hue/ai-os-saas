"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Globe, Loader2, Check, Copy, ExternalLink, EyeOff } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  validateSubdomain,
  suggestSubdomain,
  SUBDOMAIN_MIN_LENGTH,
  SUBDOMAIN_MAX_LENGTH,
} from "@/lib/publishing/subdomain";

export type PublishedSiteState = {
  id: string;
  subdomain: string;
  status: "live" | "unpublished";
  view_count: number;
  url: string;
};

/**
 * The Publish control in the Website Builder.
 *
 * Self-contained on purpose: it fetches its own state from
 * GET /api/websites/[id]/publish rather than being fed from the builder's
 * props. The builder workspace is the most load-bearing client component
 * in the app and the brief for this feature is explicit that its existing
 * flow must not break — so the integration is one import and one element,
 * and every piece of publish state lives here.
 */
export function PublishControl({
  websiteId,
  websiteName,
  disabled = false,
}: {
  websiteId: string;
  websiteName: string;
  disabled?: boolean;
}) {
  const t = useTranslations("dashboard.publishing");
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState<PublishedSiteState | null>(null);
  const [open, setOpen] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/websites/${websiteId}/publish`);
      const data = await response.json();
      if (data.ok) setSite(data.site ?? null);
    } catch {
      // A failed state read must not break the builder — the control just
      // renders as "not published", and pressing Publish still works.
    } finally {
      setLoading(false);
    }
  }, [websiteId]);

  useEffect(() => {
    setLoading(true);
    setSite(null);
    setOpen(false);
    void load();
  }, [load]);

  useEffect(() => {
    if (open && !subdomain) setSubdomain(site?.subdomain || suggestSubdomain(websiteName));
  }, [open, site, subdomain, websiteName]);

  const check = validateSubdomain(subdomain);
  const isLive = site?.status === "live";

  async function publish() {
    if (!check.ok) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/websites/${websiteId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: check.subdomain }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("publishError"), "error");
        return;
      }
      setSite({
        id: data.publishedSiteId,
        subdomain: data.subdomain,
        status: "live",
        view_count: site?.view_count ?? 0,
        url: data.url,
      });
      setOpen(false);
      addToast(t("publishSuccess"));
    } catch (err) {
      addToast(getErrorMessage(err, t("publishError")), "error");
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    if (!window.confirm(t("confirmUnpublish"))) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/websites/${websiteId}/publish`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("unpublishError"), "error");
        return;
      }
      setSite(site ? { ...site, status: "unpublished" } : null);
      addToast(t("unpublishSuccess"));
    } catch (err) {
      addToast(getErrorMessage(err, t("unpublishError")), "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!site) return;
    try {
      await navigator.clipboard.writeText(site.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast(t("copyFailed"), "error");
    }
  }

  if (loading) {
    return (
      <span className="inline-flex min-h-[40px] items-center gap-1.5 px-3 py-2 text-xs text-muted sm:min-h-0">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      </span>
    );
  }

  return (
    <div className="relative">
      {isLive ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors duration-150 hover:bg-emerald-500/20 sm:min-h-0"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {t("viewLive")}
          </a>
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 sm:min-h-0"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? t("copied") : t("copyLink")}
          </button>
          <button
            type="button"
            onClick={() => void publish()}
            disabled={busy || disabled}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:opacity-40 sm:min-h-0"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {t("publishChanges")}
          </button>
          {/* "There is a Publish button but I cannot find Unpublish."
              It was here the whole time — as the ONLY item in a row of
              four with no icon, in text-muted (the lowest-contrast token
              on the row), last in the wrap order. Rendered, and not
              findable, which are different things.

              Same place, because taking a site down belongs next to
              putting it up. Now with an icon like its neighbours, real
              foreground text, and an amber destructive tone on hover so
              it reads as the action that changes something rather than as
              disabled chrome. */}
          <button
            type="button"
            onClick={() => void unpublish()}
            disabled={busy}
            title={t("unpublishHint")}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-medium text-amber-300 transition-colors duration-150 hover:border-amber-500 hover:bg-amber-500/10 disabled:opacity-40 sm:min-h-0"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {t("unpublish")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0"
        >
          <Globe className="h-3.5 w-3.5" aria-hidden="true" />
          {site ? t("republish") : t("publish")}
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-panel p-4 shadow-xl">
          <p className="mb-2 text-xs font-semibold text-foreground">{t("chooseAddress")}</p>
          <label htmlFor="publish-subdomain" className="mb-1 block text-[11px] text-muted">
            {t("addressLabel")}
          </label>
          <input
            id="publish-subdomain"
            className="input text-sm"
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
            placeholder="my-business"
            maxLength={SUBDOMAIN_MAX_LENGTH}
            autoFocus
          />
          <p className="mt-1.5 break-all text-[11px] text-muted">
            {check.ok ? t("willBeAt", { url: `/s/${check.subdomain}` }) : check.message}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            {t("addressRules", { min: SUBDOMAIN_MIN_LENGTH, max: SUBDOMAIN_MAX_LENGTH })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void publish()}
              disabled={busy || !check.ok}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              {busy ? t("publishing") : t("publishNow")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-[36px] items-center rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
