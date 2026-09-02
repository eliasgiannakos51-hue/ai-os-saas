"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { groupResults, type SearchResult } from "@/lib/search/unified-search";

/**
 * Searching your own records, on a page, with a box you can see.
 *
 * The search existed — it is the same /api/search the command palette
 * calls — but the only way in was Ctrl+K, which is a thing a person has
 * to already know, cannot discover, and cannot press on a phone at all.
 * Two of seven testers never found the chat; nobody was going to find a
 * keyboard shortcut.
 */
export function LibrarySearch() {
  const t = useTranslations("dashboard.library");
  // The kind labels already exist under dashboard.search, because the
  // command palette groups by the same kinds. A second copy of "Files",
  // "Conversations", "Agents" in ten languages is a second copy to keep
  // in step, and it would drift.
  const tKinds = useTranslations("dashboard.search.kinds");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Last-one-wins: responses do not arrive in the order they were sent,
  // and a stale answer overwriting a fresher one shows results for a
  // word the user has already replaced.
  const tokenRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setBusy(false);
      return;
    }
    const token = ++tokenRef.current;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (token !== tokenRef.current) return;
        setResults(Array.isArray(data?.results) ? (data.results as SearchResult[]) : []);
      } catch {
        if (token === tokenRef.current) setResults([]);
      } finally {
        if (token === tokenRef.current) setBusy(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const groups = results ? groupResults(results) : [];

  return (
    <div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          autoFocus
          // 16px base: anything smaller makes iOS Safari zoom the page on
          // focus, which is the bug mobile-input-zoom.prodtest.mjs holds.
          className="min-h-[44px] w-full rounded-xl border border-border bg-input py-2 pl-9 pr-3 text-base text-foreground outline-none transition-colors duration-150 placeholder:text-muted focus:border-orange-500"
        />
      </div>

      {results !== null && results.length === 0 && !busy && (
        <p className="mt-4 rounded-xl border border-border bg-panel/60 p-6 text-center text-sm text-muted">
          {t("searchNoResults", { query: query.trim() })}
        </p>
      )}

      {groups.map((group) => (
        <div key={group.kind} className="mt-4">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
            {tKinds(group.kind)}
          </p>
          <ul className="space-y-1.5">
            {group.results.map((r) => (
              <li key={`${r.sourceTable}:${r.sourceId}`}>
                <Link
                  href={r.href}
                  className="block min-h-[44px] rounded-xl border border-border bg-panel/60 px-3 py-2.5 transition-colors duration-150 hover:border-orange-500/60 hover:bg-panel"
                >
                  <span className="block truncate text-sm text-foreground">{r.title}</span>
                  {r.snippet && (
                    // The << >> markers Postgres puts around the matched
                    // words are stripped rather than rendered: they are a
                    // transport detail, and showing them reads as a bug.
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {r.snippet.replace(/<<|>>/g, "")}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
