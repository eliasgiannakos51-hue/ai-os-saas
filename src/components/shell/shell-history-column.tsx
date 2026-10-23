"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { matchesSearch } from "@/lib/text/search-match";
import { AddToProjectButton } from "@/components/entity-links/add-to-project-button";
import { CardMenu } from "@/components/ui/card-menu";

export type ShellHistoryRow = {
  id: string;
  title: string;
  /** A short line under the title: status, a count, a date. */
  status?: string;
  /** False hides the trash button on THIS row even though the column has
   *  an `onDelete` — Analyze's merge (2026-10-22) mixes rows from two
   *  tables, one of which (data_analyses) has no delete route yet.
   *  Omitted or true behaves exactly as before `onDelete` existed. */
  deletable?: boolean;
};

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
 *
 * `linkTable`, ADDED 2026-10-22 for the owner's message, point 6: every
 * tool's result needs a «⋯ → Προσθήκη σε Project», and this column is
 * already the one shared place every shell's result list is drawn. OPT
 * IN, not automatic: a caller passes its own linkable table name
 * (`"user_websites"`, `"automation_flows"`, `"code_sessions"`, …) and
 * every row gets the button; a caller that omits it — `analysis-shell.tsx`
 * today, a separate and independent effort — draws exactly the two
 * buttons it always has, unchanged.
 *
 * RENAME, ADDED HERE RATHER THAN PER-TOOL (Coding's own request, the
 * owner's message right after #332, 2026-10-22). No prior ToolShell tool
 * had a rename affordance on its history rows, so this is the one place
 * it is built — every future tool on this column inherits it for free.
 * A row with `onRename` draws the shared `CardMenu` ("⋯": rename,
 * delete) instead of the bare trash icon; a row with only `onDelete`
 * keeps the old single-button shape unchanged, so nothing already
 * shipped on this column regresses.
 *
 * `deleteUndoWindowMs`, ADDED for Coding's own request (the owner's
 * message of 2026-10-22: «Διαγραφή με Αναίρεση») — OPT IN, same shape as
 * `linkTable`. Omitted, delete behaves exactly as before: confirm, then
 * `onDelete` runs immediately. Given, the row that confirmed delete does
 * NOT call `onDelete` yet — it is hidden in place (greyed, struck
 * through, the same row the chat sidebar already shows for this, see
 * components/dashboard/conversation-rows.tsx) with an «Αναίρεση» button
 * that clears the pending timer. `onDelete` only runs once the window
 * elapses with no Undo. A tab closed inside the window loses the
 * pending delete entirely — nothing is sent — which is the safe
 * direction to fail in: the session is still there next visit, never
 * half-deleted.
 */
export function ShellHistoryColumn({
  rows,
  activeId,
  onOpen,
  onDelete,
  onRename,
  onNavigate,
  linkTable,
  deleteUndoWindowMs,
}: {
  rows: readonly ShellHistoryRow[];
  activeId: string | null;
  onOpen: (id: string) => void;
  /** Deletes through the tool's own route; resolves once it is gone.
   *  Omit for a tool whose list has no delete (Site, Document today). */
  onDelete?: (id: string) => Promise<void>;
  /** Renames through the tool's own route; resolves with nothing once
   *  saved (the caller owns reflecting the new title in `rows`). Only
   *  meaningful alongside `onDelete` — a tool with neither keeps the
   *  plain, actionless row. */
  onRename?: (id: string, title: string) => Promise<void>;
  /** Closes the mobile overlay after a row is chosen; nothing on a
   *  computer, where the column stays open beside the thread. */
  onNavigate?: () => void;
  /** The linkable table each row belongs to — see the doc comment above. */
  linkTable?: string;
  /** See the doc comment above. Omitted: delete is immediate, as before. */
  deleteUndoWindowMs?: number;
}) {
  const t = useTranslations("dashboard.toolShell.history");
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ReadonlyMap<string, string>>(new Map());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Timers belong to this visit only — a navigation away clears them,
  // which cancels the pending deletes rather than orphaning them.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return rows.filter((r) => matchesSearch(r.title, q));
  }, [rows, query]);

  function undoDelete(id: string) {
    const timer = timersRef.current.get(id);
    if (!timer) return;
    clearTimeout(timer);
    timersRef.current.delete(id);
    setPendingDelete((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  async function remove(id: string, title: string) {
    if (!onDelete || !window.confirm(t("deleteConfirm", { title }))) return;
    if (deleteUndoWindowMs) {
      setPendingDelete((prev) => new Map(prev).set(id, title));
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setPendingDelete((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        void onDelete(id);
      }, deleteUndoWindowMs);
      timersRef.current.set(id, timer);
      return;
    }
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }

  function startRename(id: string, title: string) {
    setRenamingId(id);
    setDraftTitle(title);
    // The menu's own close happens first (CardMenu closes before calling
    // onSelect), so the input exists by the time this runs.
    requestAnimationFrame(() => renameInputRef.current?.focus());
  }

  async function commitRename(id: string) {
    const title = draftTitle.trim();
    const row = rows.find((r) => r.id === id);
    if (!onRename || !title || !row || title === row.title) {
      setRenamingId(null);
      return;
    }
    setSavingRename(true);
    try {
      await onRename(id, title);
    } finally {
      setSavingRename(false);
      setRenamingId(null);
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
                {pendingDelete.has(r.id) ? (
                  <div
                    data-testid="shell-history-undo"
                    className="flex min-h-[44px] flex-1 items-center gap-2 rounded-item px-3 py-1.5 text-sm text-muted"
                  >
                    <span className="min-w-0 flex-1 truncate line-through">{pendingDelete.get(r.id)}</span>
                    <button
                      type="button"
                      onClick={() => undoDelete(r.id)}
                      data-testid="shell-history-undo-button"
                      className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-item px-2 text-sm text-foreground underline hover:bg-panel-hover"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("undo")}
                    </button>
                  </div>
                ) : renamingId === r.id ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={draftTitle}
                    disabled={savingRename}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onBlur={() => void commitRename(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRename(r.id);
                      else if (e.key === "Escape") setRenamingId(null);
                    }}
                    data-testid="shell-history-rename-input"
                    aria-label={t("rename")}
                    className="min-h-[44px] flex-1 rounded-item border border-foreground/40 bg-panel px-3 py-1.5 text-sm text-foreground outline-none"
                  />
                ) : (
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
                )}
                {linkTable && !pendingDelete.has(r.id) && (
                  <span className="opacity-0 focus-within:opacity-100 group-hover:opacity-100">
                    <AddToProjectButton variant="icon" sourceTable={linkTable} sourceId={r.id} sourceHeadline={r.title} />
                  </span>
                )}
                {!pendingDelete.has(r.id) &&
                  (onDelete && onRename ? (
                    <CardMenu
                      label={`${t("delete")}: ${r.title}`}
                      actions={[
                        { key: "rename", label: t("rename"), onSelect: () => startRename(r.id, r.title) },
                        { key: "delete", label: t("delete"), destructive: true, onSelect: () => void remove(r.id, r.title) },
                      ]}
                    />
                  ) : (
                    onDelete && (
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
                    )
                  ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
