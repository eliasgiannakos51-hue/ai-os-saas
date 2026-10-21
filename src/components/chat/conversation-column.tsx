"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { ConversationRows } from "@/components/dashboard/conversation-rows";
import { CHATS_HREF } from "@/lib/nav/rail";
import { displayConversationTitle } from "@/lib/chat/conversation-title";
import { matchesSearch } from "@/lib/text/search-match";
import type { SidebarConversation, SidebarProject } from "@/lib/nav/recent-tools";

/**
 * THE CONVERSATIONS, BESIDE THE ONE YOU ARE READING (owner, 2026-10-17).
 *
 * «Στο Chat πατάω [◧] και ανοίγουν οι συνομιλίες μου στο πλάι.» The
 * rail used to carry them: first as fifteen rows of its own, then as a
 * «Chats» row to a whole page. Both are gone; the list belongs with the
 * thread it switches between, and the rail names the place instead.
 *
 * IT DRAWS components/dashboard/conversation-rows.tsx AND NOTHING OF
 * ITS OWN. That component already has the four actions the owner asked
 * for — rename, pin, move to a Project, delete with an Undo — the
 * pinned group above the rest, the selected row, the long press that
 * opens «⋯» on a touch screen, and the delete that goes through
 * api/conversations/[id] rather than at the table. A second list with
 * the same four actions written again is exactly how the favourite
 * star once ended up with two states that disagreed; there is one
 * list, and this is the column it sits in.
 *
 * THE SEARCH IS TITLES ONLY, ON PURPOSE. The Chats page searches what
 * was SAID inside conversations too, which costs a round trip per
 * keystroke-ish and a scan the page tells you the size of. In a 280px
 * column beside a live thread that is the wrong trade: this filters
 * the names it already has, instantly, and «Όλες οι συνομιλίες» at the
 * foot opens the page that does the deeper search. Said out loud
 * because a search box that quietly looks at less than the one next
 * door is the kind of thing nobody notices until it misses something.
 */
export function ConversationColumn({
  conversations,
  projects,
  activeId,
  onNavigate,
  onOpen,
  onDeleted,
}: {
  conversations: readonly SidebarConversation[];
  /** For «Μεταφορά σε Έργο»: read on the server, since there is no
   *  GET /api/projects (app/api/projects/route.ts has POST and DELETE). */
  projects: readonly SidebarProject[];
  activeId: string | null;
  /** Called when a row navigates, so the phone's overlay can close
   *  behind it. Nothing on a computer, where the column stays put. */
  onNavigate?: () => void;
  /** Opens a conversation in the thread this column sits beside,
   *  rather than by navigating to the screen we are already on. */
  onOpen?: (id: string) => void;
  /** Forwarded straight to ConversationRows — see its own note. */
  onDeleted?: (id: string) => void;
}) {
  const t = useTranslations("dashboard.chat");
  const [query, setQuery] = useState("");

  // FOLDED, NOT lowercased. «Αύρα» has to be found by «αυρα»: Greek
  // accents and final sigma make toLowerCase() the wrong tool, and
  // lib/text/search-match.ts is the one both lists share.
  const shown = useMemo(() => {
    const q = query.trim();
    if (!q) return conversations;
    return conversations.filter((c) => matchesSearch(displayConversationTitle(c.title) ?? "", q));
  }, [conversations, query]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col" data-testid="chat-conversation-column">
      <div className="flex items-center gap-2 border-b border-divider px-2 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchConversations")}
          aria-label={t("searchConversations")}
          data-testid="chat-conversation-search"
          className="min-h-[44px] w-full bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
        {/* `dense`: 280px is not the Chats page. The date and the star
            come off here and stay there — see the prop's own note in
            components/dashboard/conversation-rows.tsx. Every ACTION is
            the same code on both surfaces, which is the half that
            matters. */}
        <ConversationRows
          conversations={shown}
          projects={projects}
          activeId={activeId}
          onNavigate={onNavigate}
          onOpen={onOpen}
          onDeleted={onDeleted}
          dense
        />
      </div>

      {/* THE WAY OUT OF A COLUMN THAT IS NOT THE WHOLE LIST. The chat
          page loads the newest ones, not every one ever; the page this
          opens is the one that holds them all and searches inside them. */}
      <Link
        href={CHATS_HREF}
        onClick={onNavigate}
        data-testid="chat-all-conversations"
        className="flex min-h-[44px] items-center border-t border-divider px-3 text-sm text-muted underline hover:text-foreground"
      >
        {t("allConversations")}
      </Link>
    </div>
  );
}
