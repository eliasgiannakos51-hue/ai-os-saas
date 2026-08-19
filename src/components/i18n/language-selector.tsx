"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Globe, Check } from "lucide-react";
import { LANGUAGES } from "@/lib/languages";
import { persistLocalePreference } from "@/lib/locale-preference";

// The quick switcher: a globe in the nav and, on public pages, floating
// over the top-right corner. It is the one an anonymous visitor on the
// landing page has, which is why it stays.
//
// IT WRITES THE ACCOUNT TOO, via the shared helper, and that is not
// tidiness. middleware.ts now pushes the account's preferred_locale onto
// the NEXT_LOCALE cookie on every request, so a selector that wrote only
// the cookie would have its choice reverted on the very next navigation —
// the language would change and then change back. Both entry points write
// the same two places or neither works.
export function LanguageSelector({ className }: { className?: string }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("language");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  const [failed, setFailed] = useState(false);

  async function selectLanguage(code: string) {
    setFailed(false);
    const result = await persistLocalePreference(code);
    if (result === "account-failed") {
      // No toast here: this renders on the landing page, which is outside
      // ToastProvider (mounted in dashboard/layout.tsx), so useToast would
      // throw. The dropdown stays open and says so instead.
      setFailed(true);
      return;
    }
    setOpen(false);
    // Re-runs the server layout with the new cookie value — next-intl's
    // request config (i18n/request.ts) picks it up from there.
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("label")}
        aria-expanded={open}
        className={
          className ??
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel hover:text-foreground"
        }
      >
        <Globe className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label={tCommon("close")}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-11 z-50 max-h-80 w-48 overflow-y-auto rounded-xl border border-border bg-panel p-1.5 shadow-lg">
            {failed && (
              <p role="alert" className="px-3 py-2 text-xs text-red-400">
                {t("saveFailed")}
              </p>
            )}
            {LANGUAGES.map((lang) => {
              const selected = lang.code === locale;
              return (
                <button
                  key={lang.code}
                  type="button"
                  lang={lang.code}
                  onClick={() => selectLanguage(lang.code)}
                  aria-pressed={selected}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 ${
                    selected
                      ? "bg-orange-500/10 text-orange-400"
                      : "text-foreground hover:bg-panel-hover"
                  }`}
                >
                  <span>{lang.label}</span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
