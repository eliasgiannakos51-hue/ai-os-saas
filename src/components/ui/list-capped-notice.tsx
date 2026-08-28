"use client";

import { useTranslations } from "next-intl";
import { Info } from "lucide-react";

/**
 * "There is more than this, and here is how to reach it."
 *
 * ONE COMPONENT, EVERY CAPPED LIST. A cap that is announced on one page
 * and silent on the next teaches people that the silent ones are
 * complete, which is the belief this exists to prevent.
 *
 * `{count, number}` and NOT a pre-formatted string: an ICU number
 * placeholder formats per locale on its own, and handing it text that has
 * already been through formatNumber() is how "1,000" became NaN across
 * five pricing plans earlier in this branch.
 */
export function ListCappedNotice({ cap }: { cap: number }) {
  const t = useTranslations("common");
  return (
    <p
      role="status"
      data-testid="list-capped-notice"
      className="mb-3 flex items-start gap-2 rounded-xl border border-border bg-white/[0.02] px-3 py-2 text-xs text-muted"
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{t("listCapped", { count: cap })}</span>
    </p>
  );
}
