"use client";

import { useRef, useState } from "react";
import { Plus, MessageCircle, Pin, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ChatConversation } from "@/types/chat";
import { groupConversationsByDate } from "@/lib/chat/group-conversations";
import { MAX_CONVERSATION_TITLE_LENGTH } from "@/lib/chat/conversation-title";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { useTranslations } from "next-intl";

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onTogglePin,
  onRename,
  onDelete,
  onToggleFavorite,
}: {
  conversations: ChatConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onTogglePin: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string, favorited: boolean) => void;
}) {
  const t = useTranslations("dashboard.chat");
  const tModule = useTranslations("module");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Escape has to beat the blur. Leaving the field saves what is in it,
  // which is what makes the edit feel like an edit rather than a form —
  // but Escape means "forget this", and cancelling by unmounting the
  // input is itself a blur. Without this flag the cancelled text would be
  // saved by the very act of cancelling it.
  const cancelledRef = useRef(false);

  const pinned = conversations.filter((c) => c.is_pinned);
  const unpinned = conversations.filter((c) => !c.is_pinned);
  const groups = [
    ...(pinned.length > 0 ? [{ label: "groupPinned" as const, conversations: pinned }] : []),
    ...groupConversationsByDate(unpinned),
  ];

  function handleSelect(id: string) {
    setMenuOpenId(null);
    onSelect(id);
  }

  function startRename(conversation: ChatConversation) {
    cancelledRef.current = false;
    setRenamingId(conversation.id);
    setRenameValue(conversation.title);
    setMenuOpenId(null);
  }

  function commitRename() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setRenamingId(null);
      return;
    }
    if (renamingId) {
      const trimmed = renameValue.trim();
      // An empty box is a cancel, not a rename. Sending it would ask the
      // server to erase the only label the conversation has, and the
      // server refuses it anyway — so the row simply keeps its name.
      if (trimmed && trimmed !== conversations.find((c) => c.id === renamingId)?.title) {
        onRename(renamingId, trimmed);
      }
    }
    setRenamingId(null);
  }

  function cancelRename() {
    cancelledRef.current = true;
    setRenamingId(null);
  }

  function handleDelete(conversation: ChatConversation) {
    setMenuOpenId(null);
    if (window.confirm(t("deleteConfirm", { title: conversation.title }))) {
      onDelete(conversation.id);
    }
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-panel">
      <div className="p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
        >
          <Plus className="h-4 w-4" /> {t("newChat")}
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-3">
        {groups.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 px-2 text-center">
            <MessageCircle className="h-5 w-5 text-muted/80" aria-hidden="true" />
            <p className="text-xs text-muted">{t("noConversations")}</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                {t(group.label)}
              </p>
              <div className="space-y-0.5">
                {group.conversations.map((conversation) => {
                  const active = conversation.id === activeId;
                  const isRenaming = renamingId === conversation.id;

                  if (isRenaming) {
                    return (
                      <input
                        key={conversation.id}
                        autoFocus
                        value={renameValue}
                        // The same 100 the server enforces, so the text
                        // that vanishes on save is text the box never
                        // accepted in the first place.
                        maxLength={MAX_CONVERSATION_TITLE_LENGTH}
                        aria-label={t("renameLabel", { title: conversation.title })}
                        data-testid="conversation-rename-input"
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        className="w-full rounded-lg border border-orange-500/60 bg-input px-2.5 py-[7px] text-sm text-foreground outline-none"
                      />
                    );
                  }

                  return (
                    <div key={conversation.id} className="group/row relative flex items-center">
                      <button
                        type="button"
                        onClick={() => handleSelect(conversation.id)}
                        // Double-click renames, as well as the menu. The
                        // menu is the discoverable route; this is the one
                        // people try first because every other list of
                        // named things works this way.
                        onDoubleClick={() => startRename(conversation)}
                        title={conversation.title}
                        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-2 pl-2.5 pr-1 text-left text-sm transition-colors duration-150 ${
                          active
                            ? "bg-orange-500/10 font-medium text-orange-400"
                            : "text-muted hover:bg-panel-hover hover:text-foreground"
                        }`}
                      >
                        {conversation.is_pinned && (
                          <Pin
                            className="h-3 w-3 shrink-0 fill-current text-orange-400"
                            aria-hidden="true"
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                      </button>
                      {/* Starred conversations stay visible at rest; an
                          unstarred one only appears on hover, so the list
                          does not turn into a wall of grey stars. */}
                      <div
                        className={`shrink-0 transition-opacity duration-150 ${
                          conversation.is_favorited
                            ? "opacity-100"
                            : "opacity-0 focus-within:opacity-100 group-hover/row:opacity-100"
                        }`}
                      >
                        <FavoriteButton
                          table="chat_conversations"
                          recordId={conversation.id}
                          headline={conversation.title}
                          initialFavorited={conversation.is_favorited}
                          variant="inline"
                          onToggled={(fav) => onToggleFavorite(conversation.id, fav)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setMenuOpenId((current) =>
                            current === conversation.id ? null : conversation.id
                          )
                        }
                        aria-label={tModule("actionsFor", { name: conversation.title })}
                        // 36px to match the star beside it — two adjacent
                        // controls at different sizes read as a mistake.
                        className={`mr-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted opacity-0 transition-opacity duration-150 hover:bg-panel-hover hover:text-foreground group-hover/row:opacity-100 ${
                          menuOpenId === conversation.id ? "opacity-100" : ""
                        }`}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>

                      {menuOpenId === conversation.id && (
                        <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-xl border border-border bg-panel p-1 shadow-lg">
                          <button
                            type="button"
                            onClick={() => {
                              onTogglePin(conversation.id);
                              setMenuOpenId(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
                          >
                            <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                            {conversation.is_pinned ? t("unpin") : t("pin")}
                          </button>
                          <button
                            type="button"
                            onClick={() => startRename(conversation)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("rename")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(conversation)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-red-400 transition-colors duration-150 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            {tModule("delete")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
