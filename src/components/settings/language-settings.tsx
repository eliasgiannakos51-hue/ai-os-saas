"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check, Languages } from "lucide-react";
import { LANGUAGES } from "@/lib/languages";
import { persistLocalePreference } from "@/lib/locale-preference";
import { useToast } from "@/components/toast/toast-context";

// THE LANGUAGE SETTING, WHERE A SETTING BELONGS.
//
// There was a switcher before this — a globe icon in the top-right corner
// of the nav, and the same one floating over the landing page. It worked.
// Nobody found it: an unlabelled icon among other unlabelled icons is
// discoverable if you already know it is there, and the one place a person
// looks for "what language is this in" is Settings, where there was
// nothing. Rendering is not the same as being findable.
//
// So this is the same list, spelled out, on the page people actually open,
// with every language written in its own script — a reader who has landed
// in the wrong language cannot read "Greek" but can read "Ελληνικά".
//
// It also SAVES TO THE ACCOUNT (see lib/locale-preference.ts), which the
// globe never did. That is the half that was actually broken rather than
// merely hidden.
export function LanguageSettings() {
  const t = useTranslations("settings.language");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();
  // Held locally so the button lights up the moment it is pressed, rather
  // than after the server render comes back with the new locale.
  const [selected, setSelected] = useState(locale);

  async function selectLanguage(code: string) {
    if (code === selected || pending) return;
    const previous = selected;
    setSelected(code);

    const result = await persistLocalePreference(code);
    if (result === "account-failed") {
      // Nothing was written, including the cookie — so put the highlight
      // back rather than leaving the UI claiming a language that is not
      // saved anywhere.
      setSelected(previous);
      addToast(`✗ ${t("saveFailed")}`, "error");
      return;
    }

    // Re-runs the server layout, which reads the cookie in i18n/request.ts.
    startTransition(() => router.refresh());
  }

  return (
    <div
      id="language"
      className="mb-6 scroll-mt-20 space-y-3 rounded-2xl border border-border bg-panel p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Languages className="h-4 w-4 text-orange-400" /> {t("title")}
      </h2>
      <p className="text-xs text-muted">{t("description")}</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {LANGUAGES.map((lang) => {
          const isSelected = lang.code === selected;
          return (
            <button
              key={lang.code}
              type="button"
              lang={lang.code}
              onClick={() => selectLanguage(lang.code)}
              disabled={pending}
              aria-pressed={isSelected}
              className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
                isSelected
                  ? "border-orange-500 bg-orange-500/[0.06]"
                  : "border-border hover:border-orange-500/40"
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                {lang.label}
              </span>
              {isSelected && (
                <Check className="h-3.5 w-3.5 shrink-0 text-orange-400" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      {/* Said out loud because the whole point of the change is that it is
          no longer a per-browser cookie. */}
      <p className="text-[11px] text-muted">{t("savedToAccount")}</p>
    </div>
  );
}
