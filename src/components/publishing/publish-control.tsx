"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Globe, Loader2, Check, Copy, ExternalLink, EyeOff, X, AlertCircle } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  validateSubdomain,
  suggestSubdomain,
  SUBDOMAIN_MIN_LENGTH,
  SUBDOMAIN_MAX_LENGTH,
  SUBDOMAIN_TOKEN,
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
  disabledReason,
}: {
  websiteId: string;
  websiteName: string;
  disabled?: boolean;
  /**
   * Why the toggle is off, in the user's language — rendered as VISIBLE
   * text beside the button, not as a title attribute.
   *
   * A greyed-out button is not an explanation. This control is disabled
   * for three different reasons (still generating, generation failed, held
   * by the safety review) and until now all three looked identical: a
   * button at 40% opacity that does nothing when pressed. The safety-review
   * case is the one that matters most, because the user has already been
   * charged for that generation and there is something they can still do
   * about it — and the only place that was said was further down the page,
   * in the preview area, which is not where someone who has just pressed
   * Publish is looking.
   */
  disabledReason?: string;
}) {
  const t = useTranslations("dashboard.publishing");
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState<PublishedSiteState | null>(null);
  const [open, setOpen] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Which exact address the server has already rejected as taken. Stored
  // with the value it applies to, so editing the field clears it.
  const [takenMessage, setTakenMessage] = useState<{ subdomain: string } | null>(null);
  const [urlTemplate, setUrlTemplate] = useState<string | null>(null);
  // document.body does not exist while this renders on the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/websites/${websiteId}/publish`);
      const data = await response.json();
      if (data.ok) {
        setSite(data.site ?? null);
        setUrlTemplate(typeof data.urlTemplate === "string" ? data.urlTemplate : null);
      }
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

  // Prefilled ONCE, when the dialog opens.
  //
  // This used to depend on `subdomain` and refill whenever the field was
  // empty, which meant the user could not clear it: select-all + delete
  // put the suggestion straight back, and the "type an address" state was
  // unreachable. A suggestion is a starting point, not a floor.
  useEffect(() => {
    if (!open) return;
    setSubdomain((current) => current || site?.subdomain || suggestSubdomain(websiteName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const check = validateSubdomain(subdomain);
  const isLive = site?.status === "live";

  // The server is the only thing that knows an address is taken, and it
  // only says so on a failed POST. Remembering WHICH value it rejected is
  // what lets the button disable itself again instead of inviting the same
  // failure a second time.
  const takenForCurrent = takenMessage !== null && takenMessage.subdomain === subdomain;
  const valid = check.ok && !takenForCurrent;

  // validateSubdomain's own `message` is a hardcoded English string, which
  // is fine for a server response and wrong for the only place a user
  // reads it. The `reason` is a stable enum, so the text comes from the
  // locale files and the rule stays in one place.
  const REASON_KEY: Record<string, string> = {
    empty: "reasonEmpty",
    too_short: "reasonTooShort",
    too_long: "reasonTooLong",
    invalid_characters: "reasonInvalidCharacters",
    bad_edges: "reasonBadEdges",
    reserved: "reasonReserved",
  };
  const feedback = takenForCurrent
    ? t("reasonTaken")
    : check.ok
      ? t("addressAvailable")
      : t(REASON_KEY[check.reason] ?? "reasonEmpty");

  // Shown character by character as they type, split from a template the
  // SERVER built with the same function that builds the real address — so
  // the preview cannot drift from what actually gets created, and it is
  // correct whether the deployment serves /s/acme or acme.example.com.
  const [previewBefore, previewAfter] = (urlTemplate ?? `/s/${SUBDOMAIN_TOKEN}`).split(SUBDOMAIN_TOKEN);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
        // "Taken" is the one failure the user can fix right here, so it
        // belongs on the field rather than in a toast that slides away
        // while they are still looking at the input. Recording the value
        // it applies to re-disables the button, so the same address cannot
        // simply be submitted again.
        if (data.reason === "taken") {
          setTakenMessage({ subdomain: check.subdomain });
          return;
        }
        addToast(data.error ?? t("publishError"), "error");
        return;
      }
      setTakenMessage(null);
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
      <span className="inline-flex min-h-[40px] items-center gap-1.5 px-3 py-2 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      </span>
    );
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* ONE BUTTON, TWO STATES.

            Previously: "Publish" alone when offline, and when live a row
            of four — View live, Copy link, Publish changes, Unpublish —
            in which Unpublish was last in the wrap order and read as
            chrome. The report was "I only see Publish", and moving
            Unpublish around inside that row had already failed once,
            because the problem was never where it sat. It was that
            putting a site online and taking it offline are one decision
            and were being shown as two unrelated controls.

            So this is a real toggle: the same element, in the same first
            position, whose label and action flip with the site's state.
            aria-pressed says so to a screen reader too, which is what
            makes it a toggle rather than two buttons that happen to
            share a slot.

            The other three controls only exist when there is a live site
            to view, copy or update — they are consequences of the state,
            not alternatives to the toggle. */}
        <button
          type="button"
          aria-pressed={isLive}
          onClick={isLive ? () => void unpublish() : () => setOpen((v) => !v)}
          disabled={busy || disabled}
          title={isLive ? t("unpublishHint") : undefined}
          className={
            "inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 " +
            (isLive
              ? "border-amber-500/40 text-amber-300 hover:border-amber-500 hover:bg-amber-500/10"
              : "border-border text-foreground hover:border-orange-500 hover:text-orange-400")
          }
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : isLive ? (
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {isLive ? t("unpublish") : site ? t("republish") : t("publish")}
        </button>

        {/* The reason sits next to the button it explains, and is announced
            rather than left for the eye to find — someone who pressed a
            dead button is already looking here. `basis-full` on small
            screens so it wraps onto its own line instead of squeezing the
            controls beside it. */}
        {disabled && disabledReason && (
          <p
            role="status"
            className="flex basis-full items-start gap-1.5 text-xs leading-relaxed text-amber-300/90 sm:basis-auto sm:max-w-xs"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{disabledReason}</span>
          </p>
        )}

        {isLive && (
          <>
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors duration-150 hover:bg-emerald-500/20"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              {t("viewLive")}
            </a>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copied ? t("copied") : t("copyLink")}
            </button>
            {/* Publishing an EDIT is a different action from publishing or
                unpublishing the site, so it is not folded into the toggle
                — it pushes the current draft onto an address that already
                exists. */}
            <button
              type="button"
              onClick={() => void publish()}
              disabled={busy || disabled}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {t("publishChanges")}
            </button>
          </>
        )}
      </div>

      {/* A MODAL, NOT A DROPDOWN.
​
          What was here: an absolutely-positioned 22rem panel hanging off
          the button, right-aligned, with 11px helper text. The report was
          that pressing Publish makes "a bit of text appear below, barely
          visible, squashed to the left, and it is not clear you have to
          type something". Every word of that is a description of this
          layout rather than of a bug in it — an anchored popover next to a
          small toolbar button is exactly a bit of text at the edge of the
          screen, and at 375px it was pinned to whichever edge the button
          sat near.

          Choosing an address is not an adjustment to be made in passing;
          it is a required step with no default, and the site cannot go
          live until it is done. So it gets the treatment a required step
          gets: a centred dialog over a dimmed page, a heading that states
          the task, an input nobody can miss, the resulting URL shown as it
          is typed, and a button that says why it is disabled instead of
          just being grey. */}
      {open && mounted && createPortal(
        // PORTALLED TO <body>, and this is not tidiness.
        //
        // Rendered in place, the dialog measured 120px off centre and the
        // backdrop dimmed everything EXCEPT the sidebar. `position: fixed`
        // is relative to the viewport only while no ancestor establishes a
        // containing block, and the dashboard shell does — so the "modal"
        // was centred on the content column and the page behind it was
        // only half covered. Both were visible in the 1280px screenshot.
        <div className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0">
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-dialog-title"
            // max-h + an internal scroll region: at 375x812 the dialog was
            // taller than the screen and its bottom edge sat below the fold,
            // which put the Publish button somewhere the user could not reach.
            className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400"
                  aria-hidden="true"
                >
                  <Globe className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 id="publish-dialog-title" className="text-base font-semibold text-foreground">
                    {t("chooseAddress")}
                  </h2>
                  {/* The sentence that was missing entirely: what this is
                      for, and that it is required. */}
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{t("publishIntro")}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <label htmlFor="publish-subdomain" className="mb-1.5 block text-xs font-medium text-foreground">
                {t("addressLabel")}
              </label>
              <input
                id="publish-subdomain"
                className="input w-full text-base"
                value={subdomain}
                onChange={(e) => {
                  setSubdomain(e.target.value.toLowerCase().trim());
                  setTakenMessage(null);
                }}
                placeholder="my-business"
                maxLength={SUBDOMAIN_MAX_LENGTH}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-invalid={!valid}
                aria-describedby="publish-address-feedback"
                autoFocus
              />

              {/* LIVE URL PREVIEW. Shown for anything typed, not only for
                  a valid value — watching the address build itself is what
                  makes the field's purpose obvious without reading a word
                  of help text. */}
              <div className="mt-3 rounded-xl border border-border bg-input px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-muted">{t("previewLabel")}</p>
                <p className="mt-1 break-all font-mono text-sm text-foreground">
                  {previewBefore}
                  <span className={subdomain ? "font-semibold text-orange-400" : "text-muted"}>
                    {subdomain || t("addressPlaceholder")}
                  </span>
                  {previewAfter}
                </p>
              </div>

              <p
                id="publish-address-feedback"
                aria-live="polite"
                className={`mt-2.5 flex items-start gap-1.5 text-xs leading-relaxed ${
                  valid ? "text-emerald-400" : subdomain ? "text-red-400" : "text-muted"
                }`}
              >
                {valid ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : subdomain ? (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : null}
                <span>{feedback}</span>
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                {t("addressRules", { min: SUBDOMAIN_MIN_LENGTH, max: SUBDOMAIN_MAX_LENGTH })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => void publish()}
                disabled={busy || !valid}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {busy ? t("publishing") : t("publishNow")}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition-colors duration-150 hover:text-foreground"
              >
                {t("cancel")}
              </button>
              {/* A disabled button with no explanation is the single most
                  common way a form dead-ends. */}
              {!valid && !busy && (
                <p className="w-full text-[11px] text-muted sm:w-auto sm:flex-1">{t("disabledHint")}</p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
