"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, Trash2 } from "lucide-react";
import { ConversationRows } from "@/components/dashboard/conversation-rows";
import { useToast } from "@/components/toast/toast-context";
import { discardChatImages } from "@/lib/chat/attach-client";
import { conversationDeleteUrl } from "@/lib/chat/delete-later";
import { CHATS_LIST_CAP, CONTENT_ROWS_SCANNED, MIN_CONTENT_QUERY } from "@/lib/chat/conversation-search";
import { displayConversationTitle } from "@/lib/chat/conversation-title";
import { matchesSearch } from "@/lib/text/search-match";
import type { SidebarConversation, SidebarProject } from "@/lib/nav/recent-tools";

/**
 * THE CHATS PAGE: every conversation, searched two ways.
 *
 * TITLES ARE FILTERED HERE AND CONTENT IS ASKED FOR, and the split is
 * not an optimisation — it is the only honest arrangement. The titles
 * are already on this page, so filtering them is instant and exact.
 * What was SAID is not here: it is tens of thousands of rows in
 * chat_messages, so that half is a request (api/conversations/search),
 * debounced, bounded, and clearly labelled as the bounded thing it is.
 *
 * FOLDED, NOT LOWERCASED. matchesSearch (lib/text/search-match.ts)
 * folds case, accents and Greek final sigma, and matches Greeklish
 * against Greek — so «ΑΥΡΑ», «αύρα» and "avra" all find Αύρα Camping.
 * scripts/tests/accent-search.test.mjs fails any component that
 * reaches for toLowerCase().includes() instead, and it is right to:
 * that comparison is wrong in every language this product ships.
 *
 * DELETING SEVERAL AT ONCE SHARES THE SINGLE DELETE'S UNDO. Each one
 * is scheduled exactly as a single delete is, so «Αναίρεση» appears on
 * every row and any of them can be rescued individually — which is
 * what a person who ticked one box too many actually wants.
 */
export function ChatsWorkspace({
  conversations,
  projects,
  atCap,
}: {
  conversations: readonly SidebarConversation[];
  projects: readonly SidebarProject[];
  atCap: boolean;
}) {
  const t = useTranslations("dashboard.chats");
  const router = useRouter();
  const { addToast } = useToast();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [contentIds, setContentIds] = useState<ReadonlySet<string> | null>(null);
  const [contentTruncated, setContentTruncated] = useState(false);
  const [searching, setSearching] = useState(false);

  // THE CONTENT HALF, DEBOUNCED. 250ms is what the one other
  // as-you-type search in this app uses (entity-links/link-to-modal),
  // and a second number for the same gesture would just be a second
  // thing to tune.
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CONTENT_QUERY) {
      setContentIds(null);
      setContentTruncated(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(q)}`, {
            signal: controller.signal,
          });
          const json = (await res.json().catch(() => ({}))) as {
            matches?: { id: string }[];
            truncated?: boolean;
          };
          setContentIds(new Set((json.matches ?? []).map((m) => m.id)));
          setContentTruncated(Boolean(json.truncated));
        } catch {
          // An unreachable server means the titles still filter. The
          // page says how many it found, so a content search that
          // failed reads as "nothing in the messages", which is the
          // one thing it must not silently claim — hence the flag.
          setContentIds(new Set());
          setContentTruncated(false);
        } finally {
          setSearching(false);
        }
      })();
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const shown = useMemo(() => {
    const q = query.trim();
    if (!q) return conversations;
    return conversations.filter(
      (c) => matchesSearch(displayConversationTitle(c.title) ?? "", q) || contentIds?.has(c.id)
    );
  }, [conversations, query, contentIds]);

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(t("deleteSelectedConfirm", { count: ids.length }))) return;
    setSelected(new Set());
    // One request each, not a batch endpoint: the single delete is
    // already written, already proved against two accounts, and already
    // returns the images to discard. A second code path that deletes
    // conversations is a second place for ownership to be got wrong.
    for (const id of ids) {
      try {
        const res = await fetch(conversationDeleteUrl(id), { method: "DELETE" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; imagePaths?: string[] };
        if (!res.ok || !json.ok) {
          addToast(t("deleteSelectedFailed"), "error");
          continue;
        }
        void discardChatImages(json.imagePaths ?? []);
      } catch {
        addToast(t("deleteSelectedFailed"), "error");
      }
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 panel-frame px-3">
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          data-testid="chats-search"
          className="min-h-[44px] w-full bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted"
        />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 panel-frame px-3 py-2">
          <span className="text-sm text-muted">{t("selectedCount", { count: selected.size })}</span>
          <button
            type="button"
            onClick={() => void deleteSelected()}
            data-testid="delete-selected"
            className="flex min-h-[44px] items-center gap-1.5 rounded-item px-3 text-sm text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t("deleteSelected")}
          </button>
        </div>
      )}

      {/* WHAT THE SEARCH ACTUALLY LOOKED AT. A bound nobody is told
          about reads as "there is nothing else", which is the one lie a
          search is able to tell. */}
      {query.trim().length >= MIN_CONTENT_QUERY && (
        <p className="px-1 text-xs text-muted" data-testid="chats-search-scope">
          {searching ? t("searching") : t("searchedContent", { scanned: CONTENT_ROWS_SCANNED })}
          {contentTruncated ? ` ${t("searchTruncated", { scanned: CONTENT_ROWS_SCANNED })}` : ""}
        </p>
      )}

      {shown.length === 0 && query.trim() ? (
        <p className="px-3 py-6 text-sm text-muted">{t("noMatches", { query: query.trim() })}</p>
      ) : (
        <ConversationRows
          conversations={shown}
          projects={projects}
          activeId={null}
          variant="page"
          selectable
          selected={selected}
          onSelectedChange={setSelected}
        />
      )}

      {atCap && (
        <p className="px-1 pt-2 text-xs text-muted" data-testid="chats-at-cap">
          {t("atCap", { cap: CHATS_LIST_CAP })}
        </p>
      )}
    </div>
  );
}
