"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CreditCard, Sparkles, Zap } from "lucide-react";

// Inline "you're out of credits" state, rendered WHERE the action failed
// rather than as a page-level banner or a toast.
//
// The routes have returned `outOfCredits: true` since the reserve/settle
// migration, but nothing consumed it: a user who ran out saw the same
// generic red error text as a network failure, with no indication that
// the fix was one click away. Putting both recovery paths directly under
// the input they just used is the whole point — a toast disappears, and a
// banner at the top of the page is not where they are looking.
export function OutOfCreditsNotice({
  /** How many credits the balance actually has, when known. */
  available,
  /** What the attempted action needed, when known. */
  needed,
  className = "",
}: {
  available?: number;
  needed?: number;
  className?: string;
}) {
  const t = useTranslations("credits.outOfCredits");

  return (
    <div
      role="alert"
      className={[
        "rounded-xl border border-orange-500/40 bg-orange-500/[0.07] p-4",
        className,
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-400">
          <Zap className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{t("title")}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {typeof available === "number" && typeof needed === "number"
              ? t("detailWithNumbers", { available, needed })
              : t("detail")}
          </p>

          {/* WHY NEITHER OF THESE IS A FILLED ORANGE BUTTON.
              "Buy credits" was `bg-orange-500 text-black` — the same
              treatment as the one control a screen is allowed to be
              louder than the rest. This notice renders INSIDE five other
              components (create-chat, create-studio, mission-form,
              problem-notice, deep-research), so wherever it appeared it
              appeared NEXT TO that screen's real primary action and both
              shouted. On the dashboard Home that became literal:
              scripts/tests/one-primary-action.test.mjs measured two
              filled controls against a baseline of one.
              Hierarchy here is carried by the accent BORDER and the
              accent INK instead. The alert already has an orange rule, an
              orange wash and an orange icon badge; it does not need a
              fill to be found.

              AND WHY THE INK IS text-orange-500 AND NOT text-orange-400.
              Measured, not assumed — the first draft of this change wrote
              "4.95:1" into this comment and the number was invented.
              These classes route through the theme tokens
              (tailwind.config.ts textColor.orange), so what they resolve
              to in the light theme is what matters, and the panel this
              text sits on is orange-500 at 7% over one of three light
              surfaces:

                                        --background  --panel  --panel-hover
                text-orange-400 (700)      4.52:1      4.82:1      4.33:1
                text-orange-500 (800)      6.38:1      6.81:1      6.11:1

              text-orange-400 FAILS on --panel-hover, and it fails again
              under the hover fill on every surface. The strong token
              clears 4.5:1 on all three with the hover fill applied
              (worst 5.59:1 light, 5.22:1 dark) and is what is used. */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/dashboard/settings#credits"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-orange-500 px-3.5 py-2 text-xs font-semibold text-orange-500 transition-all duration-200 hover:bg-orange-500/10"
            >
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              {t("buyCredits")}
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-foreground transition-all duration-200 hover:border-orange-500 hover:text-orange-400"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t("upgradePlan")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
