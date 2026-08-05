"use client";

import { type ReactNode } from "react";
import { Search } from "lucide-react";

/**
 * The toolbar every list section in the app is built on:
 *
 *     [ + New ]                        ← primary create action, first
 *     [ search…                     ]  ← full-width search
 *     [ sort ]  [ filters… ]  [ n items ]
 *     ── grid of EntityCards ──
 *
 * That order isn't arbitrary — it's the Website Builder's, which is the
 * one list users already navigate without hesitating. Everything else
 * (modules, documents, missions, favorites) picked its own arrangement,
 * so "where do I add one" was a different answer per page.
 *
 * The component owns layout only. Search state, sorting and filtering stay
 * with the caller, because every list filters over a different shape and
 * the alternative — a generic predicate prop — hides that behind an
 * indirection nobody reading the caller could follow.
 */
export function ListLayout({
  newAction,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchId,
  filters,
  meta,
  children,
}: {
  /** The "+ New" control. Rendered first, above search. */
  newAction?: ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchId?: string;
  /** Sort toggle and any per-surface filter controls. */
  filters?: ReactNode;
  /** Right-aligned toolbar slot — result counts, export, etc. */
  meta?: ReactNode;
  children: ReactNode;
}) {
  const hasSearch = onSearchChange !== undefined;

  return (
    <div className="space-y-4">
      {newAction ? <div>{newAction}</div> : null}

      {hasSearch && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id={searchId}
            type="search"
            value={searchValue ?? ""}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="input pl-10"
          />
        </div>
      )}

      {(filters || meta) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">{filters}</div>
          {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
      )}

      <div>{children}</div>
    </div>
  );
}
