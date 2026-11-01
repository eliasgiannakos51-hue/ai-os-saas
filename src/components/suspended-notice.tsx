"use client";

import { useTranslations } from "next-intl";

export function SuspendedNotice({ reason }: { reason: string }) {
  const t = useTranslations("suspended");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("message")}</p>
        {reason && (
          <div className="mt-4 rounded-item border border-border bg-background px-3 py-2 text-left text-xs text-muted">
            <span className="font-medium text-foreground">{t("reason")}:</span> {reason}
          </div>
        )}
        <p className="mt-4 text-xs text-muted">{t("contact")}</p>
        <a
          href="/login"
          className="mt-4 inline-block rounded-item border border-border px-4 py-2 text-xs text-muted hover:bg-surface-hover"
        >
          {t("signOut")}
        </a>
      </div>
    </div>
  );
}
