"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  BarChart3,
  FileText,
  Globe,
  Library,
  Megaphone,
  Paperclip,
  Presentation,
  Search,
  Telescope,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { formatDateTime } from "@/lib/format-number";
import { LIBRARY_KINDS, type LibraryKind } from "@/lib/library/sources";
import type { LibraryItem } from "@/lib/library/load";

const ICONS: Record<LibraryKind, LucideIcon> = {
  site: Globe,
  slides: Presentation,
  posts: Megaphone,
  document: FileText,
  research: Telescope,
  analysis: BarChart3,
  file: Paperclip,
};

/**
 * THE LIBRARY (MASTER 4.1, package 5), behind the switch "library": what
 * this account made in every tool, newest first, in one grid. A search
 * reads what each thing SAYS, not only its name, and a result found that
 * way shows the words it was found by. Pressing one opens it in the tool
 * that made it, on that one item.
 *
 * Plain links and a GET form: the address is the state, so a search can
 * be sent to someone or reloaded, and nothing here needs a script to work.
 */
export function LibraryView({
  items,
  kind,
  query,
  failed,
}: {
  items: LibraryItem[];
  kind: LibraryKind | null;
  query: string;
  failed: LibraryKind[];
}) {
  const t = useTranslations("dashboard.library");
  const locale = useLocale();
  const formatRelativeTime = useFormatRelativeTime();
  // Literal keys, so the message slicer can bound what this page needs.
  const kindNames: Record<LibraryKind, string> = {
    site: t("kinds.site"),
    slides: t("kinds.slides"),
    posts: t("kinds.posts"),
    document: t("kinds.document"),
    research: t("kinds.research"),
    analysis: t("kinds.analysis"),
    file: t("kinds.file"),
  };
  const hrefFor = (next: LibraryKind | null) => {
    const params = new URLSearchParams();
    if (next) params.set("kind", next);
    if (query) params.set("q", query);
    const s = params.toString();
    return s ? `/dashboard/timeline?${s}` : "/dashboard/timeline";
  };

  return (
    <div>
      <form action="/dashboard/timeline" method="get" role="search" className="flex gap-2">
        {kind && <input type="hidden" name="kind" value={kind} />}
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t("searchLabel")}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={t("searchPlaceholder")}
            data-testid="library-search"
            className="min-h-[44px] w-full rounded-full border border-border bg-transparent py-2 pe-4 ps-9 text-sm text-foreground placeholder:text-muted focus:border-foreground/50 focus:outline-none"
          />
        </label>
        <button type="submit" className="chip-link shrink-0 px-4 text-sm text-foreground">
          {t("searchButton")}
        </button>
      </form>
      <p className="mt-2 text-xs text-muted">{t("searchScope")}</p>

      <nav aria-label={t("kindsLabel")} className="mt-4 flex flex-wrap gap-1.5">
        {[null, ...LIBRARY_KINDS].map((k) => {
          const active = kind === k;
          return (
            <Link
              key={k ?? "all"}
              href={hrefFor(k)}
              aria-current={active ? "page" : undefined}
              data-testid="library-kind"
              className={`chip-link px-4 text-sm ${active ? "bg-foreground/15 font-semibold text-foreground" : ""}`}
            >
              {k ? kindNames[k] : t("all")}
            </Link>
          );
        })}
      </nav>

      {failed.length > 0 && (
        <p role="status" className="mt-4 text-sm text-foreground">
          {t("failed", { tools: failed.map((k) => kindNames[k]).join(", ") })}
        </p>
      )}

      {/* NOTHING SHOWN IS NOT "NOTHING MADE". With a tool that did not
          load, the line above says which; «Δεν έχεις φτιάξει τίποτα ακόμη»
          under it would be a claim about rows nobody read
          (scripts/tests/library-edges.prodtest.mjs, 2026-10-08). */}
      {items.length === 0 && failed.length > 0 ? null : items.length === 0 ? (
        <div className="mt-6">
          {query ? (
            <EmptyState icon={Search} title={t("noMatch.title", { query })}>
              {t("noMatch.why")}
            </EmptyState>
          ) : (
            <EmptyState icon={Library} title={t("empty.title")}>
              {t("empty.why")}
            </EmptyState>
          )}
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="library-items">
          {items.map((item) => {
            const Icon = ICONS[item.kind];
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  data-testid="library-item"
                  data-kind={item.kind}
                  className="flex h-full min-h-[44px] flex-col gap-2 surface-tight transition-colors duration-150 hover:border-foreground/40"
                >
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {kindNames[item.kind]}
                    <span className="ms-auto" title={formatDateTime(item.createdAt, locale)} suppressHydrationWarning>
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </span>
                  <span className="break-words text-sm font-semibold text-foreground">{item.title || t("untitled")}</span>
                  {item.snippet && <span className="break-words text-xs text-muted">{item.snippet}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
