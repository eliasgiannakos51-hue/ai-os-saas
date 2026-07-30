"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import type { ChatConversation, ChatMessage } from "@/types/chat";

let localIdCounter = 0;
function nextLocalId(prefix: string) {
  localIdCounter += 1;
  return `${prefix}-${localIdCounter}`;
}

export function ChatWorkspace({
  initialConversations,
  userInitial,
}: {
  initialConversations: ChatConversation[];
  userInitial: string;
}) {
  const [conversations, setConversations] = useState<ChatConversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimitNotice, setIsRateLimitNotice] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Guards against a slow/stale loadMessages() response landing after the
  // user has already switched to a different conversation (or "New Chat")
  // — only the request whose token still matches gets to apply its result.
  const requestTokenRef = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadMessages(conversationId: string) {
    const token = ++requestTokenRef.current;
    setLoadingMessages(true);
    try {
      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (token !== requestTokenRef.current) return;

      if (loadError) {
        setError(getErrorMessage(loadError, "Could not load that conversation."));
        setMessages([]);
        return;
      }
      setMessages((data as ChatMessage[] | null) ?? []);
    } catch (err) {
      if (token !== requestTokenRef.current) return;
      setError(getErrorMessage(err, "Could not load that conversation."));
      setMessages([]);
    } finally {
      if (token === requestTokenRef.current) setLoadingMessages(false);
    }
  }

  function selectConversation(id: string) {
    if (id === activeId) return;
    setActiveId(id);
    setError(null);
    loadMessages(id);
  }

  function startNewChat() {
    requestTokenRef.current += 1;
    setActiveId(null);
    setMessages([]);
    setError(null);
    setLoadingMessages(false);
    textareaRef.current?.focus();
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setIsRateLimitNotice(false);
    setInput("");
    setMessages((m) => [
      ...m,
      {
        id: nextLocalId("optimistic-user"),
        conversation_id: activeId ?? "",
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      },
    ]);
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, message: text }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(getErrorMessage(data.error, "Something went wrong."));
        return;
      }

      if (data.rateLimited) {
        setIsRateLimitNotice(true);
        setError(data.message);
        return;
      }

      const conversationId: string = data.conversationId;
      const nowIso = new Date().toISOString();

      setMessages((m) => [
        ...m,
        {
          id: nextLocalId("assistant"),
          conversation_id: conversationId,
          role: "assistant",
          content: data.message,
          created_at: nowIso,
        },
      ]);

      setConversations((prev) => {
        const existingIndex = prev.findIndex((c) => c.id === conversationId);
        if (existingIndex === -1) {
          const newConversation: ChatConversation = {
            id: conversationId,
            title: data.title ?? text.slice(0, 40),
            created_at: nowIso,
            updated_at: nowIso,
          };
          return [newConversation, ...prev];
        }
        const updated = [...prev];
        const [conversation] = updated.splice(existingIndex, 1);
        updated.unshift({
          ...conversation,
          updated_at: nowIso,
          title: data.title ?? conversation.title,
        });
        return updated;
      });

      if (activeId !== conversationId) {
        setActiveId(conversationId);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleTextareaKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as FormEvent);
    }
  }

  return (
    <div className="flex h-full">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNewChat={startNewChat}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {loadingMessages ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Loading...
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
                <MessageCircle className="h-6 w-6" aria-hidden="true" />
              </span>
              <h1 className="mt-4 text-xl font-bold text-foreground">Veron Chat</h1>
              <p className="mt-2 text-sm text-muted">
                Ask anything — general knowledge, brainstorming, writing help,
                or just a conversation. Not tied to any Veron AI module.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-4">
              {messages.map((msg) =>
                msg.role === "user" ? (
                  <div key={msg.id} className="flex items-start justify-end gap-2">
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-orange-500 px-4 py-2.5 text-sm text-black">
                      {msg.content}
                    </div>
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-panel text-xs font-semibold text-muted"
                      aria-hidden="true"
                    >
                      {userInitial}
                    </span>
                  </div>
                ) : (
                  <div key={msg.id} className="flex items-start gap-2">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-400"
                      aria-hidden="true"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </span>
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-border bg-panel px-4 py-2.5 text-sm text-foreground/90">
                      {msg.content}
                    </div>
                  </div>
                )
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-border p-4 sm:p-6">
          <div className="mx-auto max-w-2xl">
            {error && (
              <p
                className={`mb-3 rounded-xl border px-3 py-2 text-xs ${
                  isRateLimitNotice
                    ? "border-orange-900/50 bg-orange-500/5 text-orange-400"
                    : "border-red-900 bg-red-950/40 text-red-400"
                }`}
              >
                {error}
              </p>
            )}
            <form onSubmit={handleSend}>
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Message Veron..."
                  rows={1}
                  className="max-h-40 min-h-[52px] w-full resize-none rounded-2xl border border-border bg-panel px-4 py-3.5 pr-14 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted focus:border-orange-500/60"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  aria-label="Send"
                  className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.4)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  {sending ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
