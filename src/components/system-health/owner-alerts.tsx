"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/** What the server knows about the alerts' delivery, reduced to counts and
 *  states: no address and no key value crosses into the browser. */
export type OwnerAlertsReadiness = {
  recipients: number;
  mailer: "ok" | "no_key" | "test_sender";
};

type Result =
  | { kind: "sent"; recipients: number }
  | { kind: "refused"; detail: string }
  | { kind: "not_configured" | "no_recipients" | "rate_limited" | "failed" };

/**
 * ALERTS TO THE OWNER (docs/SECURITY-AUDIT.md ΑΣ-8.5): who receives them,
 * whether mail can leave at all, and one press that sends a real test
 * through the same path the alerts take
 * (src/app/api/system-health/test-alert/route.ts). What Resend answers is
 * shown as it answered.
 */
export function OwnerAlerts({ readiness }: { readiness: OwnerAlertsReadiness }) {
  const t = useTranslations("dashboard.systemHealth.alerts");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function send() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/system-health/test-alert", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; recipients?: number; code?: string; detail?: string } | null;
      if (body?.ok) setResult({ kind: "sent", recipients: Number(body.recipients ?? 0) });
      else if (body?.code === "refused") setResult({ kind: "refused", detail: String(body.detail ?? "") });
      else if (body?.code === "not_configured" || body?.code === "no_recipients" || body?.code === "rate_limited") setResult({ kind: body.code });
      else setResult({ kind: "failed" });
    } catch {
      setResult({ kind: "failed" });
    } finally {
      setSending(false);
    }
  }

  // Literal keys, so the message slicer can bound what this panel needs.
  const mailerLine = {
    ok: t("mailerOk"),
    no_key: t("mailerMissing"),
    test_sender: t("mailerTestSender"),
  }[readiness.mailer];

  return (
    <section className="mt-8" data-testid="owner-alerts" aria-labelledby="owner-alerts-title">
      <h2 id="owner-alerts-title" className="text-sm font-medium text-foreground">
        {t("title")}
      </h2>
      <p className="mt-1 text-xs text-muted">{t("hint")}</p>
      <ul className="mt-3 space-y-2">
        <li className="surface-tight text-sm" data-testid="owner-alerts-recipients">
          <span className={readiness.recipients > 0 ? "text-foreground" : "text-danger"}>
            {readiness.recipients > 0 ? t("recipients", { count: readiness.recipients }) : t("recipientsNone")}
          </span>
        </li>
        <li className="surface-tight text-sm" data-testid="owner-alerts-mailer">
          <span className={readiness.mailer === "ok" ? "text-foreground" : readiness.mailer === "no_key" ? "text-danger" : "text-warning"}>
            {mailerLine}
          </span>
        </li>
      </ul>
      <button
        type="button"
        onClick={() => void send()}
        disabled={sending}
        data-testid="owner-alerts-send"
        className="mt-3 inline-flex min-h-[44px] items-center rounded-item bg-foreground/5 px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-foreground/10 disabled:opacity-50"
      >
        {sending ? t("sending") : t("send")}
      </button>
      <div role="status" aria-live="polite" className="mt-2 text-xs" data-testid="owner-alerts-result">
        {result?.kind === "sent" ? <p className="text-success">{t("sent", { count: result.recipients })}</p> : null}
        {result?.kind === "refused" ? (
          <p className="text-danger">
            {t("refused")} <code className="break-words">{result.detail}</code>
          </p>
        ) : null}
        {result?.kind === "not_configured" ? <p className="text-danger">{t("notConfigured")}</p> : null}
        {result?.kind === "no_recipients" ? <p className="text-danger">{t("noRecipients")}</p> : null}
        {result?.kind === "rate_limited" ? <p className="text-warning">{t("rateLimited")}</p> : null}
        {result?.kind === "failed" ? <p className="text-danger">{t("failed")}</p> : null}
      </div>
    </section>
  );
}
