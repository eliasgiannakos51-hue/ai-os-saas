"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { PanelRightOpen, Users } from "lucide-react";
import { formatDateTime } from "@/lib/format-number";
import type { MyStuffItem } from "@/lib/my-stuff/load";
import { sourceForKind } from "@/lib/my-stuff/sources";
import { KIND_ICON } from "@/components/my-stuff/kind-icon";
import { AddToProjectButton } from "@/components/entity-links/add-to-project-button";
import { LinkToButton } from "@/components/entity-links/link-to-button";
import { LinkedEntities } from "@/components/entity-links/linked-entities";
import type { LinkedEntity } from "@/lib/entity-links";

/**
 * THE RIGHT COLUMN («1. MY STUFF: ΝΕΑ ΟΘΟΝΗ», Κομμάτι 1 — list left,
 * details right. Κομμάτι 4 (same owner message) adds "Made from"/"Used
 * in"/who sees it/Add to Project/Send to…, on top of Κομμάτι 1's own
 * job — something real selected shows something real, nothing invented
 * ahead of the data that backs it. See docs/PROGRESS.md's Κομμάτι 4
 * entry for exactly what each of these five honestly is and is not:
 * no table in this product records a general "made from" pointer (one
 * narrow, real exception: a document saved from a research report), no
 * row has a "who else can see this" concept at all, and "Send to…" —
 * the owner's standing per-tool rule, TOOL-RULES.md — has not been built
 * for ANY tool yet; what ships here is the real, generic "Link to…"
 * picker (entity-links), not a renamed stand-in for the real thing.
 */
export function MyStuffDetails({ item }: { item: MyStuffItem | null }) {
  const t = useTranslations("dashboard.myStuff");
  const locale = useLocale();

  const [usedIn, setUsedIn] = useState<LinkedEntity[]>([]);
  const [madeFrom, setMadeFrom] = useState<{ title: string; href: string } | null>(null);

  useEffect(() => {
    setUsedIn([]);
    setMadeFrom(null);
    if (!item) return;
    const controller = new AbortController();
    fetch(`/api/my-stuff/details?kind=${encodeURIComponent(item.kind)}&id=${encodeURIComponent(item.id)}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: { ok?: boolean; usedIn?: LinkedEntity[]; madeFrom?: { title: string; href: string } | null }) => {
        if (!data.ok) return;
        setUsedIn(Array.isArray(data.usedIn) ? data.usedIn : []);
        setMadeFrom(data.madeFrom ?? null);
      })
      .catch(() => {
        // Left empty — a failed read shows nothing extra, not a lie.
      });
    return () => controller.abort();
  }, [item?.kind, item?.id]);

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
  const table = sourceForKind(item.kind)?.table ?? "";
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

      {/* MADE FROM — only ever shown when a real pointer exists (today:
          a document saved from a research report). No fallback text for
          every other kind; the section simply does not render. */}
      {madeFrom && (
        <p className="text-sm text-body" data-testid="my-stuff-made-from">
          <span className="text-muted">{t("details.madeFrom")}: </span>
          <Link href={madeFrom.href} className="text-foreground underline hover:no-underline">
            {madeFrom.title || t("browse.untitled")}
          </Link>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Link href={item.href} data-testid="my-stuff-open" className="btn-outline">
          {t("details.open")}
        </Link>
        {table && (
          <>
            <AddToProjectButton variant="action" sourceTable={table} sourceId={item.id} sourceHeadline={item.title || t("browse.untitled")} />
            <LinkToButton variant="action" sourceTable={table} sourceId={item.id} sourceHeadline={item.title || t("browse.untitled")} />
          </>
        )}
      </div>

      {/* USED IN — lib/entity-links.ts's own bidirectional read, the
          same "Linked to: X" chips the classic module pages already
          draw; My Stuff does not invent a one-directional "used in" on
          top of a link that is genuinely two-way. Renders nothing when
          there are no real links (LinkedEntities' own rule). */}
      <div data-testid="my-stuff-used-in">
        <LinkedEntities entities={usedIn} />
      </div>

      {/* WHO SEES THIS — static and honest, not a stub for a feature
          that does not exist. No row in this product has a "shared
          with" concept yet (checked: team seats share nothing, a
          project is single-owner RLS) — the true answer today, for
          every one of the fifteen kinds, is "only you". */}
      <div className="mt-auto flex items-start gap-2 border-t border-divider pt-4 text-xs text-muted" data-testid="my-stuff-viewers">
        <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="text-foreground">{t("details.viewers")}: </span>
          {t("details.viewersAnswer")}
        </span>
      </div>
    </div>
  );
}
