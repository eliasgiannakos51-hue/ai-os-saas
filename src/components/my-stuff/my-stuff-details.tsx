"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { PanelRightOpen } from "lucide-react";
import { formatDateTime } from "@/lib/format-number";
import type { MyStuffItem } from "@/lib/my-stuff/load";
import { KIND_ICON } from "@/components/my-stuff/kind-icon";

/**
 * THE RIGHT COLUMN («1. MY STUFF: ΝΕΑ ΟΘΟΝΗ», Κομμάτι 1 — list left,
 * details right; Κομμάτι 4 is where this gains "Made from" / "Used in" /
 * who sees it / Add to Project / Send to…. Κομμάτι 1's own job is just
 * the split: something real selected on the left shows something real
 * here, nothing invented ahead of the data that backs it.
 */
export function MyStuffDetails({ item }: { item: MyStuffItem | null }) {
  const t = useTranslations("dashboard.myStuff");
  const locale = useLocale();

  if (!item) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted"
        data-testid="my-stuff-details-empty"
      >
        <PanelRightOpen className="h-6 w-6 text-muted" aria-hidden="true" />
        {t("details.empty")}
      </div>
    );
  }

  const Icon = KIND_ICON[item.kind];
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-6 py-6" data-testid="my-stuff-details">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t(`kinds.${item.kind}`)}
        <span className="ms-auto" title={formatDateTime(item.createdAt, locale)} suppressHydrationWarning>
          {formatDateTime(item.createdAt, locale)}
        </span>
      </div>
      {/* FULL NAME, TWO LINES IF NEEDED — never truncated. */}
      <h2 className="break-words text-lg font-semibold text-foreground">{item.title || t("browse.untitled")}</h2>
      {item.snippet && <p className="break-words text-sm text-body">{item.snippet}</p>}
      <div>
        <Link href={item.href} data-testid="my-stuff-open" className="btn-outline">
          {t("details.open")}
        </Link>
      </div>
    </div>
  );
}
