"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileCheck2, Undo2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { formatDateTime } from "@/lib/format-number";
import { getErrorMessage } from "@/lib/get-error-message";
import { getProvider, type ProviderId } from "@/lib/integrations/providers";

export type ConsentEntry = {
  id: string;
  provider: ProviderId;
  scopes: string[];
  consent_version: string;
  purpose: string;
  granted_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

/**
 * "What have I agreed to, and can I take it back?" — answered in Settings,
 * where a person looks when they are asking it, rather than on the
 * integrations page, where they only go when they want to add one.
 *
 * Withdrawn agreements stay on the list, greyed out, with the date they
 * ended. That is deliberate: a history that deletes the entries it no
 * longer needs cannot answer "was this ever on?", which is the question
 * somebody asks precisely when they no longer trust the answer "no".
 *
 * Withdrawing does two things at once (see api/integrations/[provider]/
 * consent's DELETE): the token is deleted and revoked at the provider, and
 * the consent is marked withdrawn. Telling someone their consent is
 * withdrawn while the AI can still read their mail would be worse than not
 * offering the button.
 */
export function IntegrationConsents({ consents }: { consents: ConsentEntry[] }) {
  const t = useTranslations("settings.integrationConsents");
  const locale = useLocale();
  const { addToast } = useToast();
  const [rows, setRows] = useState(consents);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function withdraw(entry: ConsentEntry) {
    const providerName = getProvider(entry.provider)?.name ?? entry.provider;
    if (!window.confirm(t("confirmWithdraw", { name: providerName }))) return;
    setBusyId(entry.id);
    try {
      const response = await fetch(`/api/integrations/${entry.provider}/consent`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("withdrawError"), "error");
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === entry.id
            ? { ...r, revoked_at: new Date().toISOString(), revoke_reason: "user_revoked" }
            : r
        )
      );
      // Said differently depending on what actually happened at the
      // provider — claiming a clean revoke we did not get is the one thing
      // this screen must not do.
      addToast(data.revokedAtProvider ? t("withdrawn") : t("withdrawnLocalOnly"));
    } catch (err) {
      addToast(getErrorMessage(err, t("withdrawError")), "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mb-6 space-y-3 rounded-2xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <FileCheck2 className="h-4 w-4 text-orange-400" aria-hidden="true" /> {t("title")}
      </h2>
      <p className="text-xs leading-relaxed text-muted">{t("description")}</p>

      {rows.length === 0 ? (
        <p className="text-xs text-muted">{t("none")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((entry) => {
            const providerName = getProvider(entry.provider)?.name ?? entry.provider;
            const active = entry.revoked_at === null;
            return (
              <li
                key={entry.id}
                className={`rounded-xl border border-border p-3 ${active ? "bg-input" : "bg-input/40"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground">
                      {providerName}
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          active
                            ? "border-emerald-800 bg-emerald-950/30 text-emerald-400"
                            : "border-border bg-panel-hover text-muted"
                        }`}
                      >
                        {active ? t("statusActive") : t("statusWithdrawn")}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      {t("grantedAt", { when: formatDateTime(entry.granted_at, locale) })}
                    </p>
                    {entry.revoked_at && (
                      <p className="text-[11px] text-muted">
                        {entry.revoke_reason === "superseded"
                          ? t("supersededAt", {
                              when: formatDateTime(entry.revoked_at, locale),
                            })
                          : t("withdrawnAt", { when: formatDateTime(entry.revoked_at, locale) })}
                      </p>
                    )}
                  </div>

                  {active && (
                    <button
                      type="button"
                      onClick={() => void withdraw(entry)}
                      disabled={busyId === entry.id}
                      className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-red-900 px-3 py-1.5 text-[11px] font-medium text-red-400 transition-colors duration-150 hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0"
                    >
                      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {busyId === entry.id ? t("withdrawing") : t("withdraw")}
                    </button>
                  )}
                </div>

                {/* The purpose exactly as it was displayed at the time, in
                    the language it was displayed in — not re-rendered from
                    today's copy, which would let the record drift from what
                    was actually agreed to. */}
                <p className="mt-2 text-[11px] leading-relaxed text-muted">{entry.purpose}</p>

                {entry.scopes.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {entry.scopes.map((scope) => (
                      <li key={scope} className="break-all font-mono text-[10px] text-muted">
                        {scope}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
