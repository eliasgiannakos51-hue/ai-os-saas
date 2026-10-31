"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Send, ExternalLink, ShieldCheck, Link2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatDateTime } from "@/lib/format-number";
import { ConnectionDetails } from "@/components/integrations/connection-details";

/**
 * CONNECTING A TELEGRAM CHAT TO THIS ACCOUNT (the owner's directive 24,
 * κομμάτι 1).
 *
 * WHERE IT LIVES AND WHY NOT IN `PROVIDERS`. src/lib/integrations/
 * providers.ts is an OAuth registry: every one of its seven fields is an
 * OAuth field (`scopes`, `oauthFamily`, `requiredEnv` naming a client id
 * and secret), `ProviderId` is a literal union, and
 * scripts/tests/integrations.test.mjs pins `PROVIDERS.length === 4`.
 * Telegram has no OAuth app, no scopes and no callback. Forcing it in
 * would mean inventing a fake oauthFamily and a fake scope list, and then
 * every gate that reasons about "a provider" would be reasoning about
 * something that is not one. So this is its own section on the same page,
 * beside the MCP one — which is the existing precedent for a second kind
 * of connection here (src/components/integrations/mcp-apps.tsx).
 *
 * THE OWNER'S OWN EARLIER RULE SAYS «Σύνδεση ΜΟΝΟ με επίσημο OAuth ή MCP»
 * (docs/QUEUE.md CN2, task #180), and a bot pairing code is neither. That
 * tension is real and is NOT resolved here: it is written down for him in
 * docs/NEEDS-FROM-ELIAS.md, because it is his rule to amend or to apply.
 *
 * NO FILLED ACCENT BUTTON (bg-button) ANYWHERE IN THIS FILE. The page
 * spends its one on the OAuth consent panel's «Έγκριση»
 * (scripts/tests/one-primary-action.test.mjs holds dashboard/integrations
 * at 1), and this section's primary presses are drawn the way its
 * neighbour's are — bg-foreground, like mcp-apps.tsx's «Πρόσθεσε».
 */

export type TelegramState = {
  status: "none" | "waiting" | "presented" | "connected";
  /** Present while a code is live. The RAW eight characters; `display` is
   *  the same thing with the dash people read aloud. */
  code?: string | null;
  display?: string | null;
  deepLink?: string | null;
  username?: string | null;
  name?: string | null;
  secondsLeft?: number | null;
  connectedAt?: string | null;
  lastUsedAt?: string | null;
  botUsername?: string | null;
  /** False when this deployment has no bot token or no encryption key — in
   *  which case the section says so instead of offering a code. */
  ready: boolean;
};

export function TelegramConnect({ initialState }: { initialState: TelegramState }) {
  const t = useTranslations("dashboard.integrations.telegram");
  const locale = useLocale();
  const { addToast } = useToast();
  const [state, setState] = useState<TelegramState>(initialState);
  // The consent panel is local: pressing «Σύνδεση» on the card must not
  // mint a code, because a code that exists is a code that can leak. It is
  // created by the press on the panel, after the person has read what a
  // connected chat may and may not do.
  const [showConsent, setShowConsent] = useState(false);
  const [busy, setBusy] = useState<"start" | "confirm" | "cancel" | "disconnect" | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(initialState.secondsLeft ?? 0);

  const onScreen = useRef(true);
  useEffect(() => {
    onScreen.current = true;
    return () => {
      onScreen.current = false;
    };
  }, []);

  // Literal keys, one per code the route can answer with: the i18n slicer
  // cannot follow a key built at run time, so a template literal here
  // would make every one of these read as unused and get dropped.
  const errors: Record<string, string> = {
    not_signed_in: t("errors.not_signed_in"),
    not_enabled: t("errors.not_enabled"),
    bad_action: t("errors.bad_action"),
    bot_unavailable: t("errors.bot_unavailable"),
    encryption_unavailable: t("errors.encryption_unavailable"),
    already_linked: t("errors.already_linked"),
    chat_in_use: t("errors.chat_in_use"),
    nothing_to_confirm: t("errors.nothing_to_confirm"),
    expired: t("errors.expired"),
    rateLimited: t("errors.rateLimited"),
    not_started: t("errors.not_started"),
    failed: t("errors.failed"),
  };
  const say = (code: unknown) => (typeof code === "string" && errors[code]) || t("errors.failed");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/link");
      const data = await res.json();
      if (!data.ok) return;
      if (onScreen.current) {
        setState(data as TelegramState);
        setSecondsLeft(typeof data.secondsLeft === "number" ? data.secondsLeft : 0);
      }
    } catch {
      // A failed poll is not a state change. Saying nothing is right here:
      // the code on screen is still the code, and a toast per lost packet
      // would be noise over a flaky connection.
    }
  }, []);

  // THE WAIT. While a code is live the screen asks the server whether a
  // chat has presented it, and counts the ten minutes down locally so the
  // number moves every second without a request every second. Both stop
  // the moment the code is no longer live.
  const waiting = state.status === "waiting";
  useEffect(() => {
    if (!waiting) return;
    const poll = setInterval(() => void load(), 3000);
    const tick = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [waiting, load]);

  async function act(action: "start" | "confirm" | "cancel") {
    setBusy(action);
    try {
      const res = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.ok) {
        addToast(say(data.code), "error");
        if (data.code === "expired" || data.code === "nothing_to_confirm") await load();
        return;
      }
      if (action === "start") {
        setShowConsent(false);
        setState((s) => ({ ...s, ...(data as TelegramState), status: "waiting" }));
        setSecondsLeft(typeof data.secondsLeft === "number" ? data.secondsLeft : 0);
      } else if (action === "cancel") {
        setState((s) => ({ status: "none", ready: s.ready, botUsername: s.botUsername }));
        setSecondsLeft(0);
      } else {
        addToast(t("connected"), "success");
        await load();
      }
    } catch (err) {
      addToast(getErrorMessage(err, t("errors.failed")), "error");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!window.confirm(t("confirmDisconnect"))) return;
    setBusy("disconnect");
    try {
      const res = await fetch("/api/telegram/link", { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        addToast(say(data.code), "error");
        return;
      }
      setState((s) => ({ status: "none", ready: s.ready, botUsername: s.botUsername }));
      addToast(t("disconnected"), "success");
    } catch (err) {
      addToast(getErrorMessage(err, t("errors.failed")), "error");
    } finally {
      setBusy(null);
    }
  }

  // The two lists are here, in the screen, and not in the route: they are
  // a promise made to a person in their own language, and the server has
  // no business holding ten translations of it. Each line is its own key
  // so a locale can phrase them differently without reflowing a paragraph.
  const can = [t("can.chat"), t("can.make"), t("can.status"), t("can.files")] as const;
  const cannot = [t("cannot.approve"), t("cannot.publish"), t("cannot.secrets"), t("cannot.groups")] as const;

  const whoAsked = state.username ? `@${state.username}` : state.name || t("unknownAsker");

  return (
    <section className="mt-10 space-y-4" data-testid="telegram-connect" aria-labelledby="telegram-title">
      <div>
        <h2 id="telegram-title" className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Send className="h-4 w-4" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">{t("intro")}</p>
      </div>

      {!state.ready ? (
        /* NO CODE IS OFFERED WHEN NO CODE COULD WORK. With no bot token
           the «Άνοιξε στο Telegram» link has no bot to open; with no
           encryption key the chat id could only be stored in a shape this
           product did not promise. Either way the honest screen is this
           sentence, not a button that fails on press. */
        <p className="notice-warning px-4 py-3 text-sm" data-testid="telegram-not-ready">
          {t("notReady")}
        </p>
      ) : state.status === "connected" ? (
        <div className="surface-tight space-y-4" data-testid="telegram-connected">
          <div>
            <p className="text-sm font-medium text-foreground">{t("connectedTo", { who: whoAsked })}</p>
            <p className="mt-0.5 text-[11px] text-muted" suppressHydrationWarning>
              {state.connectedAt ? t("connectedSince", { time: formatDateTime(state.connectedAt, locale) }) : ""}
            </p>
          </div>
          <ConnectionDetails
            testId="telegram-details"
            canTitle={t("canTitle")}
            can={can}
            cannotTitle={t("cannotTitle")}
            cannot={cannot}
            activityTitle={t("activityTitle")}
            /* EMPTY FOR A REASON THE SCREEN STATES. There is no webhook
               yet (κομμάτι 2), so nothing has ever arrived from a chat and
               there is nothing to list. An activity pane that invented a
               line here would be the exact failure docs/CONTEXT.md keeps
               a list of. */
            activityLines={
              state.lastUsedAt ? [t("activityLast", { time: formatDateTime(state.lastUsedAt, locale) })] : []
            }
            activityEmpty={t("activityEmpty")}
            disconnectLabel={t("disconnect")}
            disconnectBusyLabel={t("disconnecting")}
            onDisconnect={disconnect}
            disconnecting={busy === "disconnect"}
          />
        </div>
      ) : state.status === "presented" ? (
        /* SOMEBODY PRESENTED THE CODE. This is the step that makes a leaked
           code survivable: the chat is named, and nothing is connected
           until the person on this screen says it is theirs. */
        <div className="surface-tight space-y-3" data-testid="telegram-presented">
          <div>
            <h3 className="text-sm font-medium text-foreground">{t("presentedHeading")}</h3>
            <p className="mt-1 text-sm text-body">{t("presentedBody", { who: whoAsked })}</p>
            <p className="mt-2 text-xs text-warning">{t("presentedWarning")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => act("confirm")}
              disabled={busy !== null}
              data-testid="telegram-confirm"
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-item bg-foreground px-4 text-xs font-medium text-background transition-opacity duration-150 hover:opacity-80 disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              {busy === "confirm" ? t("connecting") : t("presentedConfirm")}
            </button>
            <button
              type="button"
              onClick={() => act("cancel")}
              disabled={busy !== null}
              data-testid="telegram-reject"
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-item border border-border px-4 text-xs font-medium text-muted transition-colors duration-150 hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
            >
              {t("presentedReject")}
            </button>
          </div>
        </div>
      ) : state.status === "waiting" ? (
        <div className="surface-tight space-y-3" data-testid="telegram-waiting">
          <div>
            <h3 className="text-sm font-medium text-foreground">{t("waitingHeading")}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">{t("waitingHint")}</p>
          </div>

          {/* THE CODE, BIG ENOUGH TO READ OFF ONE DEVICE AND TYPE ON
              ANOTHER. Shown as well as linked, because the deep link does
              nothing on a desktop with no Telegram installed. */}
          <p
            className="field-box px-3 py-3 text-center font-mono text-2xl tracking-[0.3em] text-foreground"
            data-testid="telegram-code"
          >
            {state.display}
          </p>

          <p className="text-center text-[11px] text-muted" data-testid="telegram-countdown">
            {/* mm:ss, not "{minutes} λεπτά και {seconds} δευτερόλεπτα".
                Found by reading the screenshot: at one minute the Greek
                read «Λήγει σε 1 λεπτά», and every language with plural
                agreement has the same bug at 1. A timer has no plural. */}
            {secondsLeft > 0
              ? t("expiresIn", { time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` })
              : t("expiredNow")}
          </p>

          <div className="flex flex-wrap gap-2">
            {state.deepLink && (
              <a
                href={state.deepLink}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="telegram-open"
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-item bg-foreground px-4 text-xs font-medium text-background transition-opacity duration-150 hover:opacity-80"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {t("openInTelegram")}
              </a>
            )}
            <button
              type="button"
              onClick={() => act("cancel")}
              disabled={busy !== null}
              data-testid="telegram-cancel"
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-item border border-border px-4 text-xs font-medium text-muted transition-colors duration-150 hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
            >
              {t("cancel")}
            </button>
          </div>

          {/* THE HALF THAT IS NOT BUILT, LABELLED. κομμάτι 1 is this
              screen; the bot cannot answer a code until κομμάτι 2's
              webhook exists, so a person pressing Start today will see
              nothing happen in Telegram. Saying that is the difference
              between an unfinished feature and a broken one. */}
          <p className="text-[11px] leading-relaxed text-warning" data-testid="telegram-no-webhook-yet">
            {t("noWebhookYet")}
          </p>
        </div>
      ) : showConsent ? (
        /* THE CONSENT STEP, AND IT IS WHERE «Ionexa can / can't» FIRST
           APPEARS. The same two lists are shown again once connected; a
           person should be able to read them BEFORE agreeing, not only
           afterwards, which is what the OAuth cards beside this already
           do with their own consent panel. */
        <div
          className="space-y-3 rounded-card border border-foreground/30 bg-foreground/[0.04] p-4"
          data-testid="telegram-consent"
          aria-labelledby="telegram-consent-title"
        >
          <h3 id="telegram-consent-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {t("consentTitle")}
          </h3>
          <p className="text-sm leading-relaxed text-foreground">{t("consentBody")}</p>

          <ConnectionDetails
            testId="telegram-consent-details"
            canTitle={t("canTitle")}
            can={can}
            cannotTitle={t("cannotTitle")}
            cannot={cannot}
            activityTitle={t("activityTitle")}
            activityLines={[]}
            activityEmpty={t("activityNotYet")}
            /* NO disconnect here: nothing is connected yet. The way out of
               a consent step is the plain refusal below, beside the
               agreement, not a red undo of something that has not
               happened. */
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => act("start")}
              disabled={busy !== null}
              data-testid="telegram-consent-approve"
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-item bg-foreground px-4 text-xs font-medium text-background transition-opacity duration-150 hover:opacity-80 disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              {busy === "start" ? t("connecting") : t("consentApprove")}
            </button>
            <button
              type="button"
              onClick={() => setShowConsent(false)}
              disabled={busy !== null}
              data-testid="telegram-consent-cancel"
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-item border border-border px-4 text-xs font-medium text-muted transition-colors duration-150 hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
            >
              {t("consentCancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="surface-tight space-y-3" data-testid="telegram-offer">
          <p className="text-xs leading-relaxed text-body">{t("offerBody")}</p>
          <button
            type="button"
            onClick={() => setShowConsent(true)}
            data-testid="telegram-connect-start"
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-item bg-panel px-3 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-panel-hover"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("connect")}
          </button>
        </div>
      )}

      {/* SAID ONCE, WHATEVER THE STATE: this is a different grant from the
          notification channel of the same name, and a person who ticked
          «ειδοποίησέ με στο Telegram» months ago has not agreed to this. */}
      <p className="text-[11px] leading-relaxed text-muted" data-testid="telegram-two-grants">
        {t("notTheSameAsNotifications")}
      </p>
    </section>
  );
}
