"use client";

import { useState } from "react";
import { Plus, MessageCircle, Pin, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ChatConversation } from "@/types/chat";
import { groupConversationsByDate } from "@/lib/chat/group-conversations";

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onTogglePin,
  onRename,
  onDelete,
}: {
  conversations: ChatConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onTogglePin: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const pinned = conversations.filter((c) => c.is_pinned);
  const unpinned = conversations.filter((c) => !c.is_pinned);
  const groups = [
    ...(pinned.length > 0 ? [{ label: "Pinned" as const, conversations: pinned }] : []),
    ...groupConversationsByDate(unpinned),
  ];

  function handleSelect(id: string) {
    setMenuOpenId(null);
    onSelect(id);
  }

  function startRename(conversation: ChatConversation) {
    setRenamingId(conversation.id);
    setRenameValue(conversation.title);
    setMenuOpenId(null);
  }

  function commitRename() {
    if (renamingId) {
      const trimmed = renameValue.trim();
      if (trimmed) onRename(renamingId, trimmed);
    }
    setRenamingId(null);
  }

  function handleDelete(conversation: ChatConversation) {
    setMenuOpenId(null);
    if (window.confirm(`Delete "${conversation.title}"? This can't be undone.`)) {
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
          <Plus className="h-4 w-4" /> New Chat
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-3">
        {groups.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 px-2 text-center">
            <MessageCircle className="h-5 w-5 text-muted/80" aria-hidden="true" />
            <p className="text-xs text-muted">No conversations yet.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                {group.label}
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
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename();
                          }
                          if (e.key === "Escape") setRenamingId(null);
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
                      <button
                        type="button"
                        onClick={() =>
                          setMenuOpenId((current) =>
                            current === conversation.id ? null : conversation.id
                          )
                        }
                        aria-label={`Options for ${conversation.title}`}
                        className={`mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted opacity-0 transition-opacity duration-150 hover:bg-panel-hover hover:text-foreground group-hover/row:opacity-100 ${
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
                            {conversation.is_pinned ? "Unpin" : "Pin"}
                          </button>
                          <button
                            type="button"
                            onClick={() => startRename(conversation)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(conversation)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-red-400 transition-colors duration-150 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Delete
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
