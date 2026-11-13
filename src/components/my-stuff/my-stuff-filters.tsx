"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { TOP_BUCKETS, MORE_BUCKETS, type MyStuffBucket } from "@/lib/my-stuff/buckets";
import { SortToggle } from "@/components/sort-toggle";
import type { SortOrder } from "@/lib/use-sort-and-paginate";

/**
 * «1. MY STUFF: ΝΕΑ ΟΘΟΝΗ», Κομμάτι 3 — the filter row: All, Documents,
 * Images, Data, More (Video, Audio, Sites and Apps, Meetings), Project,
 * Sort. Buttons, not `<Link>`s like library-view.tsx's own chip row
 * (library/sources.ts, 109-124) — My Stuff is already client-fetch
 * driven (Κομμάτι 1's search box), not URL-driven, so a bucket change is
 * state, the same as the search box already is.
 *
 * "MORE" IS A SECOND ROW, NOT A FLOATING MENU. No reference image reached
 * this session for Κομμάτι 3 either (docs/NEEDS-FROM-ELIAS.md) and no
 * existing component in this codebase collapses a row of filter chips
 * into a popup (card-menu.tsx is per-row card ACTIONS, not filter
 * overflow — confirmed by its own call sites). Reusing `.chip-link` in a
 * second wrapped row needs no new focus-trap/escape-key code and is the
 * lower-risk reading of an ambiguous "More (...)" instruction.
 */
export function MyStuffFilters({
  bucket,
  onBucketChange,
  projects,
  projectId,
  onProjectChange,
  sortOrder,
  onSortChange,
}: {
  bucket: MyStuffBucket | null;
  onBucketChange: (bucket: MyStuffBucket | null) => void;
  projects: readonly { id: string; name: string }[];
  projectId: string | null;
  onProjectChange: (projectId: string | null) => void;
  sortOrder: SortOrder;
  onSortChange: (order: SortOrder) => void;
}) {
  const t = useTranslations("dashboard.myStuff.filters");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = bucket !== null && (MORE_BUCKETS as readonly string[]).includes(bucket);

  function chip(value: MyStuffBucket | null, label: string, extraClass = "") {
    const active = bucket === value;
    return (
      <button
        type="button"
        onClick={() => onBucketChange(active ? null : value)}
        aria-current={active ? "true" : undefined}
        data-testid="my-stuff-filter"
        data-bucket={value ?? "all"}
        className={`chip-link ${extraClass} ${active ? "bg-foreground/15 font-semibold text-foreground" : ""}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2" data-testid="my-stuff-filters">
      <nav aria-label={t("label")} className="flex flex-wrap gap-1.5">
        {chip(null, t("all"), "px-4 text-sm")}
        {TOP_BUCKETS.map((b) => chip(b, t(b), "px-4 text-sm"))}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          data-testid="my-stuff-filter-more"
          className={`chip-link gap-1 px-4 text-sm ${moreActive ? "bg-foreground/15 font-semibold text-foreground" : ""}`}
        >
          {t("more")}
          <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${moreOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </nav>

      {moreOpen && (
        <nav aria-label={t("moreLabel")} className="flex w-full flex-wrap gap-1.5 ps-1" data-testid="my-stuff-filters-more">
          {MORE_BUCKETS.map((b) => chip(b, t(b), "px-3.5 text-xs"))}
        </nav>
      )}

      {projects.length > 0 && (
        <select
          value={projectId ?? ""}
          onChange={(e) => onProjectChange(e.target.value || null)}
          aria-label={t("project")}
          data-testid="my-stuff-filter-project"
          className="min-h-[44px] rounded-full border border-border bg-input px-3 py-1.5 text-xs text-foreground outline-none transition-colors duration-150 focus:border-foreground/60"
        >
          <option value="">{t("allProjects")}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      )}

      {/* data-testid ON THIS WRAPPER, NOT inside the shared SortToggle —
          its own buttons carry no testid (many other lists already reuse
          it), so a prodtest locates them positionally within THIS div:
          always [newest, oldest, az, za] in that order, `alphabetical`
          being always true here. */}
      <div data-testid="my-stuff-sort">
        <SortToggle sortOrder={sortOrder} onChange={onSortChange} alphabetical />
      </div>
    </div>
  );
}
