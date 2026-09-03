"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

/**
 * The public contact form.
 *
 * No toast, and that is deliberate: this page is reachable by somebody
 * who is not signed in, so it renders outside the dashboard shell and
 * the ToastProvider is not above it. The result is shown inline, which
 * is better here anyway — a person who has just typed a support message
 * wants to see that it went, not watch a notification disappear.
 *
 * `degraded` IS NOT DECORATION. When the deployment is on Resend's
 * shared test sender the page already carries a banner above this form,
 * but the SUCCESS state is where a hedge actually matters: "Thanks, your
 * message is on its way" is a promise, and on the shared sender it is a
 * promise nobody here is in a position to make. So the confirmation
 * changes wording rather than the form changing behaviour. Nothing is
 * disabled — the send genuinely may work, and refusing to try would be
 * its own kind of lie.
 */
/** The refusal codes /api/contact answers with. */
const ERROR_CODES = [
  "rate_limited",
  "invalid_request",
  "too_short",
  "bad_email",
  "not_configured",
  "not_delivered_test_sender",
  "send_failed",
  "unknown",
] as const;

type ErrorCode = (typeof ERROR_CODES)[number];

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

/**
 * THE SENTENCE THE READER SEES, IN THEIR LANGUAGE.
 *
 * /api/contact is a public POST with no session, so it has no locale
 * cookie and no i18n provider — every sentence it composes is English.
 * Rendering `data.error` directly, which the August draft did, put an
 * English refusal in front of a Greek or Arabic reader on the one page
 * they reached because something had already gone wrong.
 *
 * So the CODE is what is read, and the server's English is kept only as
 * the last fallback — for a code this build has no word for, which is a
 * real case the moment the route adds one and the client is a version
 * behind. A missing translation must degrade to a specific English
 * sentence, never to the generic one: "that email address does not look
 * right" is actionable and "something went wrong" is not.
 */
function messageFor(t: (key: string) => string, data: unknown): string {
  const body = (data ?? {}) as { code?: unknown; error?: unknown };
  if (isErrorCode(body.code)) return translateCode(t, body.code);
  if (typeof body.error === "string" && body.error.trim()) return body.error;
  return t("errorGeneric");
}

/**
 * EVERY KEY IS A LITERAL, and the switch is why.
 *
 * `t(\`errors.${code}\`)` is one line and reads better, and
 * scripts/tests/message-slices.test.mjs rejects it — correctly. A key the
 * scanner cannot read is a namespace it cannot prove bounded, and this
 * component sits on a PUBLIC route: one template-literal key here flips
 * the marketing group from trimmable to not, and every visitor to the
 * landing page downloads the whole catalogue instead of five namespaces.
 *
 * A switch over a closed union also fails the BUILD when a code is added
 * to ERROR_CODES and forgotten here, which a dynamic key would answer
 * with a missing-message warning nobody sees.
 */
function translateCode(t: (key: string) => string, code: ErrorCode): string {
  switch (code) {
    case "rate_limited":
      return t("errors.rate_limited");
    case "invalid_request":
      return t("errors.invalid_request");
    case "too_short":
      return t("errors.too_short");
    case "bad_email":
      return t("errors.bad_email");
    case "not_configured":
      return t("errors.not_configured");
    case "not_delivered_test_sender":
      return t("errors.not_delivered_test_sender");
    case "send_failed":
      return t("errors.send_failed");
    case "unknown":
      return t("errors.unknown");
  }
}

export function ContactForm({ degraded = false }: { degraded?: boolean }) {
  const t = useTranslations("contact");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, _hp: hp }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(messageFor(t, data));
        return;
      }
      setSent(true);
      setMessage("");
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p
        role="status"
        className={
          degraded
            ? "rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200"
            : "rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300"
        }
      >
        {degraded ? t("sentDegraded") : t("sent")}
      </p>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <label htmlFor="contact-name" className="mb-1 block text-xs font-medium text-muted">
          {t("nameLabel")}
        </label>
        <input
          id="contact-name"
          className="input"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </div>

      <div>
        <label htmlFor="contact-email" className="mb-1 block text-xs font-medium text-muted">
          {t("emailLabel")}
        </label>
        <input
          id="contact-email"
          type="email"
          className="input"
          value={email}
          maxLength={200}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </div>

      <div>
        <label htmlFor="contact-message" className="mb-1 block text-xs font-medium text-muted">
          {t("messageLabel")}
        </label>
        <textarea
          id="contact-message"
          className="input min-h-[140px]"
          value={message}
          maxLength={4000}
          onChange={(e) => setMessage(e.target.value)}
          required
        />
      </div>

      {/* The honeypot. Hidden from sight AND from assistive technology —
          aria-hidden plus tabIndex -1, so a screen-reader user is never
          offered a field that would silently discard their message.

          NO <label>. The August draft had one reading "Leave this empty",
          which was dead markup by construction: the wrapper is
          aria-hidden, so no screen reader ever announces it, and the div
          is `hidden`, so no sighted reader sees it. What it DID do was
          put an untranslated English string in a ten-language app, which
          scripts/tests/i18n-coverage.test.mjs counted — correctly. A
          label nobody can read is not an accessibility affordance. */}
      <div className="hidden" aria-hidden="true">
        <input
          id="contact-hp"
          name="_hp"
          tabIndex={-1}
          autoComplete="off"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
        />
      </div>

      {error ? (
        <p
          className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="cta-amber inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        disabled={busy || message.trim().length < 10}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {busy ? t("sending") : t("send")}
      </button>
    </form>
  );
}
