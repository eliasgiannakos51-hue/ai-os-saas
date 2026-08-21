"use client";

import { useTranslations } from "next-intl";
import { Palette } from "lucide-react";
import {
  BACKGROUND_STYLES,
  isValidHexColor,
  type LogoChoice,
  type ReferenceImageUse,
  type WebsiteBackgroundStyle,
  type WebsiteDesignChoices,
} from "@/lib/website-design-brief";

/**
 * The design controls in the Website Builder's generation form.
 *
 * Requested directly: choose the background (template / animated / my own
 * photo), choose primary and secondary colours, and make the image upload
 * obvious.
 *
 * SHOWN, NOT HIDDEN BEHIND A TOGGLE. The report was that these things
 * either did not exist or could not be found — a collapsed "Advanced"
 * section would have satisfied the first half of that and not the second.
 *
 * Every control is optional and every default is the pre-existing
 * behaviour: leave them alone and buildDesignBrief returns an empty
 * string, so the description sent to the model is byte for byte what it
 * was before this existed.
 *
 * The colour input is <input type="color"> PLUS a text field. The picker
 * alone cannot express "I have a brand hex and I want exactly it", and it
 * has no empty state — it always reports a colour, so without the text
 * field there would be no way to say "you choose".
 */
export function DesignControls({
  value,
  onChange,
  imageCount,
}: {
  value: WebsiteDesignChoices;
  onChange: (next: WebsiteDesignChoices) => void;
  imageCount: number;
}) {
  const t = useTranslations("dashboard.websiteBuilder.design");

  function set<K extends keyof WebsiteDesignChoices>(key: K, next: WebsiteDesignChoices[K]) {
    onChange({ ...value, [key]: next, imageCount });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-input p-3">
      <div className="flex items-center gap-1.5">
        <Palette className="h-3.5 w-3.5 text-orange-400" aria-hidden="true" />
        <h3 className="text-xs font-semibold text-foreground">{t("title")}</h3>
        <span className="text-[11px] text-muted">{t("optional")}</span>
      </div>

      {/* Colours */}
      <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <legend className="sr-only">{t("colours")}</legend>
        {(["primaryColor", "secondaryColor"] as const).map((key) => {
          const current = value[key];
          const label = key === "primaryColor" ? t("primary") : t("secondary");
          return (
            <div key={key}>
              <label htmlFor={`design-${key}`} className="mb-1 block text-[11px] text-muted">
                {label}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id={`design-${key}`}
                  type="color"
                  // An empty value means "you choose", but the picker has
                  // no empty state — so it shows a neutral placeholder
                  // while `current` is empty and only commits a value once
                  // the user actually touches it.
                  value={isValidHexColor(current) ? current : "#f97316"}
                  onChange={(e) => set(key, e.target.value)}
                  aria-label={label}
                  className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-border bg-input p-1"
                />
                <input
                  type="text"
                  inputMode="text"
                  value={current}
                  onChange={(e) => set(key, e.target.value.trim().slice(0, 7))}
                  placeholder={t("hexPlaceholder")}
                  aria-label={`${label} (hex)`}
                  className="input h-9 min-w-0 flex-1 font-mono text-xs"
                />
                {current && (
                  <button
                    type="button"
                    onClick={() => set(key, "")}
                    className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-muted transition-colors duration-150 hover:text-foreground"
                  >
                    {t("clear")}
                  </button>
                )}
              </div>
              {current && !isValidHexColor(current) && (
                <p className="mt-1 text-[11px] text-amber-400/90">{t("hexInvalid")}</p>
              )}
            </div>
          );
        })}
      </fieldset>

      {/* Background */}
      <div>
        <span className="mb-1 block text-[11px] text-muted">{t("background")}</span>
        <div className="flex flex-wrap gap-1.5">
          {BACKGROUND_STYLES.map((style) => {
            // "My own photo" is only real once a photo has been attached.
            // Offering it with nothing uploaded is an option that cannot
            // do what it says.
            const unavailable = style === "own-photo" && imageCount === 0;
            const selected = value.background === style;
            return (
              <button
                key={style}
                type="button"
                aria-pressed={selected}
                disabled={unavailable}
                title={unavailable ? t("ownPhotoNeedsUpload") : undefined}
                onClick={() => set("background", style as WebsiteBackgroundStyle)}
                className={`min-h-[44px] rounded-full border px-3 py-1 text-[11px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                  selected
                    ? "border-orange-500/60 bg-orange-500/10 text-orange-300"
                    : "border-border text-muted hover:border-orange-500/40 hover:text-foreground"
                }`}
              >
                {t(`backgrounds.${style}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* The LOGO question, asked BEFORE generation. The reported bug:
          with no logo supplied, the model invented a brand mark that
          looked like OUR product's logo. The user must be ASKED — and a
          skipped answer means "text wordmark", never "invent one". */}
      <div data-testid="design-logo-choice">
        <span className="mb-1 block text-[11px] text-muted">{t("logoTitle")}</span>
        <div className="flex flex-wrap gap-1.5">
          {(["uploaded", "wordmark", "auto"] as const).map((choice) => {
            // "It's in my images" is only real once an image is attached.
            const unavailable = choice === "uploaded" && imageCount === 0;
            const selected = value.logo === choice;
            return (
              <button
                key={choice}
                type="button"
                aria-pressed={selected}
                disabled={unavailable}
                title={unavailable ? t("logoNeedsUpload") : undefined}
                onClick={() => set("logo", choice as LogoChoice)}
                className={`min-h-[44px] rounded-full border px-3 py-1 text-[11px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                  selected
                    ? "border-orange-500/60 bg-orange-500/10 text-orange-300"
                    : "border-border text-muted hover:border-orange-500/40 hover:text-foreground"
                }`}
              >
                {t(`logoChoices.${choice}`)}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-muted">{t("logoHint")}</p>
      </div>

      {/* What to do with the uploaded photos — only once there are some. */}
      {imageCount > 0 && (
        <div>
          <span className="mb-1 block text-[11px] text-muted">
            {t("imageUse", { count: imageCount })}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(["in-site", "style-only"] as const).map((use) => (
              <button
                key={use}
                type="button"
                aria-pressed={value.referenceImageUse === use}
                onClick={() => set("referenceImageUse", use as ReferenceImageUse)}
                className={`min-h-[44px] rounded-full border px-3 py-1 text-[11px] font-medium transition-colors duration-150 ${
                  value.referenceImageUse === use
                    ? "border-orange-500/60 bg-orange-500/10 text-orange-300"
                    : "border-border text-muted hover:border-orange-500/40 hover:text-foreground"
                }`}
              >
                {t(`imageUses.${use}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
