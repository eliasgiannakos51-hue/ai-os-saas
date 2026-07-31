"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Globe, Check } from "lucide-react";
import { LANGUAGES } from "@/lib/languages";
import { LOCALE_COOKIE } from "@/i18n/constants";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function LanguageSelector({ className }: { className?: string }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("language");
  const [open, setOpen] = useState(false);

  function selectLanguage(code: string) {
    document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    setOpen(false);
    // Re-runs the server layout with the new cookie value — next-intl's
    // request config (i18n/request.ts) picks it up from there. Locales
    // without a real messages/<locale>.json (everything but en/el) fall
    // back to English content there — this dropdown still shows the
    // chosen language as checked either way, since the preference itself
    // is real even before translations exist for it.
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
          "flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel hover:text-foreground"
        }
      >
        <Globe className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-11 z-50 max-h-80 w-48 overflow-y-auto rounded-xl border border-border bg-panel p-1.5 shadow-lg">
            {LANGUAGES.map((lang) => {
              const selected = lang.code === locale;
              return (
                <button
                  key={lang.code}
                  type="button"
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
