"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Globe, ExternalLink, Copy, Check, History, SearchX, Undo2 } from "lucide-react";
import { EntityCard, CardGrid, type EntityCardStatus } from "@/components/ui/entity-card";
import { ListLayout } from "@/components/ui/list-layout";
import { EmptyState } from "@/components/empty-state";
import { SortToggle } from "@/components/sort-toggle";
import { PaginationControls } from "@/components/pagination-controls";
import { useToast } from "@/components/toast/toast-context";
import { useSortAndPaginate } from "@/lib/use-sort-and-paginate";
import { formatDateTime, formatNumber } from "@/lib/format-number";
import { getErrorMessage } from "@/lib/get-error-message";
import { matchesSearch } from "@/lib/text/search-match";

export type PublishedSiteRow = {
  id: string;
  website_id: string;
  subdomain: string;
  status: "live" | "unpublished";
  view_count: number;
  published_at: string;
  updated_at: string;
  created_at: string;
  url: string;
  website_name: string;
  /** Views in the trailing 7 days, summed from site_analytics. */
  views_this_week: number;
};

export type SiteVersionRow = {
  id: string;
  published_site_id: string;
  version_number: number;
  published_at: string;
  change_description: string | null;
};

export function PublishedSitesList({
  sites,
  versions,
  cap,
}: {
  sites: PublishedSiteRow[];
  versions: SiteVersionRow[];
  /** Infinity renders as "unlimited" rather than as a number. */
  cap: number;
}) {
  const t = useTranslations("dashboard.publishing");
  const tModule = useTranslations("module");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return sites;
    return sites.filter((s) => matchesSearch(`${s.website_name} ${s.subdomain}`, q));
  }, [sites, query]);

  const { sortOrder, setSortOrder, page, setPage, totalPages, paginated, alphabetical } =
    useSortAndPaginate(filtered, query, (s) => s.website_name);

  const selected = useMemo(() => sites.find((s) => s.id === selectedId) ?? null, [sites, selectedId]);
  const selectedVersions = useMemo(
    () => (selected ? versions.filter((v) => v.published_site_id === selected.id) : []),
    [versions, selected]
  );

  const liveCount = sites.filter((s) => s.status === "live").length;

  async function copyLink(site: PublishedSiteRow) {
    try {
      await navigator.clipboard.writeText(site.url);
      setCopiedId(site.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      addToast(t("copyFailed"), "error");
    }
  }

  async function unpublish(site: PublishedSiteRow) {
    if (!window.confirm(t("confirmUnpublish"))) return;
    setBusyId(site.id);
    try {
      const response = await fetch(`/api/websites/${site.website_id}/publish`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("unpublishError"), "error");
        return;
      }
      addToast(t("unpublishSuccess"));
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("unpublishError")), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function republish(site: PublishedSiteRow) {
    setBusyId(site.id);
    try {
      const response = await fetch(`/api/websites/${site.website_id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: site.subdomain }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("publishError"), "error");
        return;
      }
      addToast(t("publishSuccess"));
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("publishError")), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function rollback(site: PublishedSiteRow, version: SiteVersionRow) {
    if (!window.confirm(t("confirmRollback", { number: version.version_number }))) return;
    setBusyId(site.id);
    try {
      const response = await fetch(`/api/published/${site.id}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version.id }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("rollbackError"), "error");
        return;
      }
      addToast(t("rollbackSuccess", { number: version.version_number }));
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("rollbackError")), "error");
    } finally {
      setBusyId(null);
    }
  }

  function statusFor(site: PublishedSiteRow): EntityCardStatus {
    return site.status === "live"
      ? { label: t("statusLive"), tone: "success" }
      : { label: t("statusUnpublished"), tone: "neutral" };
  }

  return (
    <div className="space-y-5">
      <ListLayout
        newAction={
          <Link
            href="/dashboard/website-builder"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90"
          >
            <Globe className="h-4 w-4" aria-hidden="true" />
            {t("goToBuilder")}
          </Link>
        }
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder={tModule("searchPlaceholder")}
        filters={<SortToggle sortOrder={sortOrder} onChange={setSortOrder} alphabetical={alphabetical} />}
        meta={
          <span className="text-xs text-muted">
            {Number.isFinite(cap)
              ? t("sitesUsed", { used: liveCount, cap })
              : t("sitesUsedUnlimited", { used: liveCount })}
          </span>
        }
      >
        {sites.length === 0 ? (
          <EmptyState icon={Globe}>
            <p className="text-base font-semibold text-foreground">{t("emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted">{t("emptyHint")}</p>
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState icon={SearchX}>{tModule("noMatches", { query })}</EmptyState>
        ) : (
          <>
            <CardGrid>
              {paginated.map((site, index) => (
                <EntityCard
                  key={site.id}
                  index={index}
                  icon={Globe}
                  accentSlug="websiteBuilder"
                  title={site.website_name}
                  description={`/s/${site.subdomain}`}
                  selected={selectedId === site.id}
                  onSelect={() => setSelectedId(selectedId === site.id ? null : site.id)}
                  status={statusFor(site)}
                  tags={[
                    {
                      key: "week",
                      label: t("viewsThisWeek", { count: formatNumber(site.views_this_week, locale) }),
                      tone: "accent",
                    },
                    {
                      key: "total",
                      label: t("viewsTotal", { count: formatNumber(site.view_count, locale) }),
                    },
                  ]}
                  menuLabel={tModule("actionsFor", { name: site.website_name })}
                  menu={[
                    {
                      key: "copy",
                      label: copiedId === site.id ? t("copied") : t("copyLink"),
                      icon: copiedId === site.id ? Check : Copy,
                      onSelect: () => void copyLink(site),
                    },
                    ...(site.status === "live"
                      ? [
                          {
                            key: "unpublish",
                            label: t("unpublish"),
                            icon: Undo2,
                            destructive: true,
                            disabled: busyId === site.id,
                            onSelect: () => void unpublish(site),
                          },
                        ]
                      : [
                          {
                            key: "republish",
                            label: t("republish"),
                            icon: Globe,
                            disabled: busyId === site.id,
                            onSelect: () => void republish(site),
                          },
                        ]),
                  ]}
                  menuExtra={() =>
                    site.status === "live" ? (
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-foreground transition-colors duration-150 hover:bg-panel-hover"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("viewLive")}
                      </a>
                    ) : null
                  }
                />
              ))}
            </CardGrid>
            <PaginationControls page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </ListLayout>

      {selected && (
        <section className="space-y-3 rounded-2xl border border-border bg-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-foreground">
                {selected.website_name}
              </h2>
              <p className="mt-0.5 break-all text-xs text-muted">{selected.url}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="shrink-0 text-xs text-muted transition-colors hover:text-foreground"
            >
              {t("close")}
            </button>
          </div>

          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            {t("versionHistory")}
          </h3>
          {selectedVersions.length === 0 ? (
            <p className="text-xs text-muted">{t("noVersions")}</p>
          ) : (
            <ul className="space-y-2">
              {selectedVersions.map((version, index) => (
                <li
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {t("versionNumber", { number: version.version_number })}
                      {index === 0 ? ` · ${t("currentlyLive")}` : ""}
                    </p>
                    <p className="text-[11px] text-muted" suppressHydrationWarning>
                      {formatDateTime(version.published_at, locale)}
                      {version.change_description ? ` · ${version.change_description}` : ""}
                    </p>
                  </div>
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => void rollback(selected, version)}
                      disabled={busyId === selected.id}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-[11px] font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:opacity-40"
                    >
                      <Undo2 className="h-3 w-3" aria-hidden="true" />
                      {t("rollback")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
