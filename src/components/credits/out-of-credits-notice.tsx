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

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/dashboard/settings#credits"
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-orange-500 px-3.5 py-2 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90"
            >
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              {t("buyCredits")}
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-foreground transition-all duration-200 hover:border-orange-500 hover:text-orange-400"
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
