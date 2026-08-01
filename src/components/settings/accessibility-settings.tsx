"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import {
  FONT_SIZES,
  FONT_SIZE_STORAGE_KEY,
  HIGH_CONTRAST_STORAGE_KEY,
  REDUCE_MOTION_STORAGE_KEY,
  isFontSize,
  type FontSize,
} from "@/lib/accessibility-prefs";

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
        checked ? "bg-orange-500" : "bg-panel-hover"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// No context/provider — same approach as theme-toggle.tsx: each preference
// lives on <html data-*> and in localStorage, both written directly to the
// DOM. The blocking inline script in layout.tsx sets the initial
// attributes before paint (avoiding a flash); this component only reads
// them back on mount and updates both the DOM and localStorage from then
// on, no server round-trip and no re-render required for the rest of the
// app to pick the change up.
export function AccessibilitySettings() {
  const t = useTranslations("settings.accessibility");
  const [fontSize, setFontSizeState] = useState<FontSize>("medium");
  const [highContrast, setHighContrast] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const currentFontSize = document.documentElement.getAttribute("data-font-size");
    setFontSizeState(isFontSize(currentFontSize) ? currentFontSize : "medium");
    setHighContrast(document.documentElement.getAttribute("data-contrast") === "high");
    setReduceMotion(document.documentElement.getAttribute("data-motion") === "reduce");
  }, []);

  function persist(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private browsing / storage disabled — preference still applies for
      // this page load via the DOM attribute, just doesn't persist.
    }
  }

  function selectFontSize(next: FontSize) {
    setFontSizeState(next);
    document.documentElement.setAttribute("data-font-size", next);
    persist(FONT_SIZE_STORAGE_KEY, next);
  }

  function toggleHighContrast() {
    const next = !highContrast;
    setHighContrast(next);
    if (next) {
      document.documentElement.setAttribute("data-contrast", "high");
    } else {
      document.documentElement.removeAttribute("data-contrast");
    }
    persist(HIGH_CONTRAST_STORAGE_KEY, next ? "1" : "0");
  }

  function toggleReduceMotion() {
    const next = !reduceMotion;
    setReduceMotion(next);
    if (next) {
      document.documentElement.setAttribute("data-motion", "reduce");
    } else {
      document.documentElement.removeAttribute("data-motion");
    }
    persist(REDUCE_MOTION_STORAGE_KEY, next ? "1" : "0");
  }

  return (
    <div className="mb-6 space-y-4 rounded-2xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Eye className="h-4 w-4 text-orange-400" /> {t("title")}
      </h2>

      <div>
        <p className="text-sm text-foreground">{t("fontSize.label")}</p>
        <p className="mt-0.5 text-xs text-muted">{t("fontSize.description")}</p>
        <div className="mt-2.5 inline-flex flex-wrap items-center gap-0.5 rounded-full border border-border p-0.5">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => selectFontSize(size)}
              aria-pressed={fontSize === size}
              className={`min-h-[36px] rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-150 sm:min-h-0 ${
                fontSize === size
                  ? "bg-orange-500 text-black"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t(`fontSize.options.${size}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <div>
          <p className="text-sm text-foreground">{t("highContrast.label")}</p>
          <p className="mt-0.5 text-xs text-muted">{t("highContrast.description")}</p>
        </div>
        <ToggleSwitch
          checked={highContrast}
          onChange={toggleHighContrast}
          label={t("highContrast.label")}
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <div>
          <p className="text-sm text-foreground">{t("reduceMotion.label")}</p>
          <p className="mt-0.5 text-xs text-muted">{t("reduceMotion.description")}</p>
        </div>
        <ToggleSwitch
          checked={reduceMotion}
          onChange={toggleReduceMotion}
          label={t("reduceMotion.label")}
        />
      </div>
    </div>
  );
}
