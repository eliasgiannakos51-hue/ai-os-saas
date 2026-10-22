"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, Trash2 } from "lucide-react";
import { matchesSearch } from "@/lib/text/search-match";

export type ShellHistoryRow = { id: string; title: string; /** A short line under the title: status, a count, a date. */ status?: string };

/**
 * [◧]'S OWN LIST, SHARED (MASTER Μέρος 20 Δ, 2026-10-21) — the same shape
 * as the "Coding, as a conversation" redesign's own history column
 * (its own PR, not yet on main as this is written), generalised for
 * every tool that moves into `ToolShell`'s `history` prop rather than
 * copied per tool: search, open, delete. A tool with nothing to delete
 * from this list (Site, Document, as today) omits `onDelete` and the
 * row draws no trash button at all.
 *
 * search is TITLES ONLY, through the same matchesSearch every other
 * search box in the product uses — a Greek title has to be found by its
 * unaccented, un-finalled-sigma spelling, and that is the one
 * implementation of that rule.
 */
export function ShellHistoryColumn({
  rows,
  activeId,
  onOpen,
  onDelete,
  onNavigate,
}: {
  rows: readonly ShellHistoryRow[];
  activeId: string | null;
  onOpen: (id: string) => void;
  /** Deletes through the tool's own route; resolves once it is gone.
   *  Omit for a tool whose list has no delete (Site, Document today). */
  onDelete?: (id: string) => Promise<void>;
  /** Closes the mobile overlay after a row is chosen; nothing on a
   *  computer, where the column stays open beside the thread. */
  onNavigate?: () => void;
}) {
  const t = useTranslations("dashboard.toolShell.history");
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return rows.filter((r) => matchesSearch(r.title, q));
  }, [rows, query]);

  async function remove(id: string, title: string) {
    if (!onDelete || !window.confirm(t("deleteConfirm", { title }))) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col" data-testid="shell-history-column">
      <div className="flex items-center gap-2 px-2 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          data-testid="shell-history-search"
          className="min-h-[44px] w-full bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
        {shown.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted">{t("empty")}</p>
        ) : (
          <ul className="space-y-0.5">
            {shown.map((r) => (
              <li key={r.id} className="group flex items-center gap-1" data-row>
                <button
                  type="button"
                  onClick={() => {
                    onOpen(r.id);
                    onNavigate?.();
                  }}
                  aria-current={r.id === activeId ? "true" : undefined}
                  data-testid="shell-history-row"
                  className={`min-h-[44px] flex-1 rounded-item px-3 py-1.5 text-start text-sm ${
                    r.id === activeId ? "bg-panel text-foreground" : "text-muted hover:bg-panel-hover hover:text-foreground"
                  }`}
                >
                  <span className="block truncate">{r.title}</span>
                  {r.status && <span className="block truncate text-[11px] text-muted">{r.status}</span>}
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => void remove(r.id, r.title)}
                    disabled={deletingId === r.id}
                    aria-label={`${t("delete")}: ${r.title}`}
                    data-testid="shell-history-delete"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-item text-muted opacity-0 hover:bg-panel-hover hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
