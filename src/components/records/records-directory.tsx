"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { ALL_SIDEBAR_GROUPS } from "@/lib/sidebar-nav";
import { normalizeForSearch } from "@/lib/text/search-match";

/** One entry, already translated on the server. */
export type DirectoryItem = {
  href: string;
  label: string;
  hint: string | null;
};

export type DirectoryGroup = {
  /** The English heading, used only as a stable filter value and key. */
  id: string;
  heading: string;
  items: DirectoryItem[];
};

// EVERY LABEL ARRIVES TRANSLATED, and that is a constraint, not a style.
//
// scripts/tests/message-slices.test.mjs counts client components that
// force the whole message catalogue into the bundle, and `t(`items.${k}`)`
// — a template-literal key — is one of the shapes it counts, because a
// key the compiler cannot see is a namespace the slicer cannot trim.
// Sixty-one such components are on record and the number is a ratchet.
// Adding a sixty-second and raising the number would have been the easy
// read of that failure and the wrong one: the page needs its labels
// translated, not the browser given the whole dictionary to do it. So the
// server resolves them (it has getTranslations and no bundle) and this
// file receives strings.
//
// Icons are the one thing still read from the config here: they are
// component references, which do not cross the server/client boundary as
// props.
const ICON_BY_HREF = new Map(
  ALL_SIDEBAR_GROUPS.flatMap((g) => g.items.map((i) => [i.href, i.icon] as const))
);

/**
 * Everything the app can open, on one page, filtered by type.
 *
 * V4.6 #3. The sidebar listed nineteen log modules — twelve served by the
 * [module] catch-all, six by their own pages, plus Ideas — and every one
 * of them renders the same GenericList. Nineteen rows for one idea. They
 * are one row now ("My records") plus this page, and the other entries
 * the sidebar stopped drawing are here too, so nothing became harder to
 * find than it was.
 *
 * The groups arrive from the server already role-filtered through the
 * SAME `visibleGroups` the sidebar and the command palette use, so a page
 * cannot exist on one surface and not another — and an owner-only entry
 * cannot reach a non-owner's browser at all, since it is filtered before
 * the props are built rather than after.
 */
export function RecordsDirectory({ groups }: { groups: DirectoryGroup[] }) {
  const t = useTranslations("dashboard.records");
  const [groupId, setGroupId] = useState<string>("all");
  const [query, setQuery] = useState("");

  // normalizeForSearch, not toLowerCase(): a Greek user typing
  // "καταχωρησεις" without the tonos must still reach "Καταχωρήσεις", and
  // the labels being searched are the TRANSLATED ones, so the fold has to
  // be the locale-safe one every other list search uses.
  const needle = normalizeForSearch(query).trim();

  const shown = useMemo(
    () =>
      groups
        .filter((g) => groupId === "all" || g.id === groupId)
        .map((g) => ({
          ...g,
          items: needle
            ? g.items.filter((i) => normalizeForSearch(i.label).includes(needle))
            : g.items,
        }))
        .filter((g) => g.items.length > 0),
    [groups, groupId, needle]
  );

  const total = shown.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="mt-6">
      <label className="relative flex min-w-0 items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted" aria-hidden="true" />
        <span className="sr-only">{t("searchLabel")}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchLabel")}
          // text-base, not text-sm: iOS Safari zooms the whole page in on
          // focus for any input under 16px.
          className="min-h-[44px] w-full rounded-xl border border-border bg-panel py-2 pl-9 pr-3 text-base text-foreground placeholder:text-muted focus:border-orange-500/50 focus:outline-none"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {[{ id: "all", heading: t("allTypes") }, ...groups.map((g) => ({ id: g.id, heading: g.heading }))].map(
          (chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setGroupId(chip.id)}
              aria-pressed={groupId === chip.id}
              className={`min-h-[44px] rounded-full border px-3.5 py-2 text-sm transition-colors duration-150 ${
                groupId === chip.id
                  ? "border-orange-500/50 bg-orange-500/15 font-semibold text-orange-200"
                  : "border-border text-muted hover:border-orange-500/40 hover:text-foreground"
              }`}
            >
              {chip.heading}
            </button>
          )
        )}
      </div>

      <p className="mt-3 text-sm text-muted">{t("count", { count: total })}</p>

      {total === 0 ? (
        <p className="mt-6 rounded-xl border border-border bg-panel p-6 text-sm text-muted">
          {t("noMatch")}
        </p>
      ) : (
        shown.map((g) => (
          <section key={g.id} className="mt-6">
            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted">
              {g.heading}
            </h2>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {g.items.map((item) => {
                const Icon = ICON_BY_HREF.get(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex min-h-[44px] items-start gap-3 rounded-xl border border-border bg-panel p-3 transition-colors duration-150 hover:border-orange-500/40 hover:bg-panel-hover"
                    >
                      {Icon && (
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/50" aria-hidden="true" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {item.label}
                        </span>
                        {item.hint && <span className="mt-0.5 block text-xs text-muted">{item.hint}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
