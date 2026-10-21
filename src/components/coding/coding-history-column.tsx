"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, Trash2 } from "lucide-react";
import { matchesSearch } from "@/lib/text/search-match";
import { CodeBlock } from "@/components/coding/code-block";
import type { CodeSession } from "@/components/coding/coding-workspace";

export type CodeConversationRow = { id: string; title: string };

/**
 * [◧]'S OWN LIST, FOR CODING — deliberately simpler than Chat's
 * (components/chat/conversation-column.tsx). The owner's own words for
 * this one: «[◧] για τη λίστα με τις προηγούμενες δουλειές του Coding,
 * όπως στο Chat, και "Νέο"» — open it, see the list, open one, delete
 * one. Chat's own column carries four actions (rename, pin, move to a
 * Project, delete with an Undo window) because the owner spelled out
 * all four for that screen; he did not for this one, and copying them
 * in anyway is exactly how the favourite star once ended up with two
 * states that disagreed because two components both tracked it.
 *
 * search is TITLES ONLY, through the same matchesSearch every other
 * search box in the product uses — a Greek title has to be found by
 * its unaccented, un-finalled-sigma spelling, and that is the one
 * implementation of that rule.
 */
export function CodingHistoryColumn({
  conversations,
  activeId,
  onOpen,
  onDeleted,
  onNavigate,
  legacySessions = [],
}: {
  conversations: readonly CodeConversationRow[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onDeleted: (id: string) => void;
  /** Closes the mobile overlay after a row is chosen; nothing on a
   *  computer, where the column stays open beside the thread. */
  onNavigate?: () => void;
  /** THE OLD FIVE-BUTTON FORM'S OWN RUNS, read-only, under the live
   *  conversations rather than mixed into them — a one-shot run has no
   *  thread to reopen, so «άνοιξέ το» would mean something different
   *  for a row here than for one above it. "Τίποτα δεν χάνεται":
   *  api/dashboard/coding/page.tsx still reads code_sessions, this is
   *  just where the result of that read is now shown. Collapsed by
   *  default — a closed <details>, not hidden — so the list above
   *  stays the first thing anybody sees. */
  legacySessions?: readonly CodeSession[];
}) {
  const t = useTranslations("coding");
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim();
    if (!q) return conversations;
    return conversations.filter((c) => matchesSearch(c.title, q));
  }, [conversations, query]);

  async function remove(id: string, title: string) {
    if (!window.confirm(t("history.deleteConfirm", { title }))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/coding/conversations/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) onDeleted(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col" data-testid="coding-history-column">
      <div className="flex items-center gap-2 px-2 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("history.search")}
          aria-label={t("history.search")}
          data-testid="coding-history-search"
          className="min-h-[44px] w-full bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
        {shown.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted">{t("history.empty")}</p>
        ) : (
          <ul className="space-y-0.5">
            {shown.map((c) => (
              <li key={c.id} className="group flex items-center gap-1" data-row>
                <button
                  type="button"
                  onClick={() => {
                    onOpen(c.id);
                    onNavigate?.();
                  }}
                  aria-current={c.id === activeId ? "true" : undefined}
                  data-testid="coding-history-row"
                  className={`min-h-[44px] flex-1 truncate rounded-item px-3 text-start text-sm ${
                    c.id === activeId
                      ? "bg-panel text-foreground"
                      : "text-muted hover:bg-panel-hover hover:text-foreground"
                  }`}
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(c.id, c.title)}
                  disabled={deletingId === c.id}
                  aria-label={`${t("history.delete")}: ${c.title}`}
                  data-testid="coding-history-delete"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-item text-muted opacity-0 hover:bg-panel-hover hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {legacySessions.length > 0 && (
        <details className="px-2 py-2" data-testid="coding-legacy-sessions">
          <summary className="min-h-[44px] cursor-pointer text-xs text-muted">
            {t("legacy.title", { count: legacySessions.length })}
          </summary>
          <ul className="mt-2 space-y-2 pb-1">
            {legacySessions.map((s) => (
              <li key={s.id}>
                <details>
                  <summary className="cursor-pointer text-xs text-foreground">
                    {s.title || t("legacy.untitled")}
                    {s.status === "failed" && <span className="ms-2 text-[11px] text-muted">· {t("history.failed")}</span>}
                  </summary>
                  <div className="mt-2 space-y-2">
                    <CodeBlock code={s.input} language={s.language} label={t("history.input")} />
                    {s.output ? <CodeBlock code={s.output} language={s.targetLanguage ?? s.language} label={t("history.output")} /> : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
