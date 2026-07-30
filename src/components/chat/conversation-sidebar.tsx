"use client";

import { Plus, MessageCircle } from "lucide-react";
import type { ChatConversation } from "@/types/chat";
import { groupConversationsByDate } from "@/lib/chat/group-conversations";

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
}: {
  conversations: ChatConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}) {
  const groups = groupConversationsByDate(conversations);

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
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => onSelect(conversation.id)}
                      title={conversation.title}
                      className={`block w-full truncate rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 ${
                        active
                          ? "bg-orange-500/10 font-medium text-orange-400"
                          : "text-muted hover:bg-panel-hover hover:text-foreground"
                      }`}
                    >
                      {conversation.title}
                    </button>
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
