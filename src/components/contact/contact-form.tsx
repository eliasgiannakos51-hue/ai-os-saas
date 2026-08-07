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
 */
export function ContactForm() {
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
        setError(data?.error || t("errorGeneric"));
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
      <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300">
        {t("sent")}
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
          offered a field that would silently discard their message. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="contact-hp">Leave this empty</label>
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
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn-primary" disabled={busy || message.trim().length < 10}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {busy ? t("sending") : t("send")}
      </button>
    </form>
  );
}
