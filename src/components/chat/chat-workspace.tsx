"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Compass, Gift, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { MessageContent } from "@/components/chat/message-content";
import { useCredits } from "@/components/credits/credits-context";
import type { ChatConversation, ChatMessage } from "@/types/chat";

let localIdCounter = 0;
function nextLocalId(prefix: string) {
  localIdCounter += 1;
  return `${prefix}-${localIdCounter}`;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-border bg-panel px-4 py-3.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
    </div>
  );
}

function AssistantAvatar() {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-400"
      aria-hidden="true"
    >
      <MessageCircle className="h-4 w-4" />
    </span>
  );
}

export function ChatWorkspace({
  initialConversations,
  userInitial,
  initialMentorPreset,
  initialFreeChatRemaining,
}: {
  initialConversations: ChatConversation[];
  userInitial: string;
  // Trading Workflow's "Trading Mentor" and Product Workflow's "Product
  // Mentor" buttons link here with ?preset=trading / ?preset=product (see
  // dashboard/chat/page.tsx) — when set, Mentor Mode starts pre-enabled
  // with the input pre-filled, and every message this session tells the
  // API to load workflow-specific context (see api/chat/route.ts's
  // mentorPreset). Omitted entirely by every other entry point into this
  // page, so default chat behavior is untouched.
  initialMentorPreset?: "trading" | "product";
  /** Free chat messages left this month; undefined when the feature is off. */
  initialFreeChatRemaining?: number;
}) {
  const tTrading = useTranslations("dashboard.tradingWorkflow");
  const tProduct = useTranslations("dashboard.productWorkflow");
  const tFree = useTranslations("credits.freeChat");
  const { refresh: refreshCredits } = useCredits();
  const [conversations, setConversations] = useState<ChatConversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(() =>
    initialMentorPreset === "trading"
      ? tTrading("mentorChatPrefill")
      : initialMentorPreset === "product"
        ? tProduct("mentorChatPrefill")
        : ""
  );
  const [mentorPreset] = useState<"trading" | "product" | null>(initialMentorPreset ?? null);
  // How many free messages are left this month. Seeded by the server on
  // page load and then updated straight from the stream's meta line, so
  // the count drops as the message is sent rather than on the next
  // navigation. null means the feature is off for this account.
  const [freeRemaining, setFreeRemaining] = useState<number | null>(
    initialFreeChatRemaining ?? null
  );
  // Not persisted per conversation on purpose — a runtime toggle for the
  // NEXT message sent, same as the API route treating it as a per-request
  // flag (see api/chat/route.ts) rather than conversation state.
  const [mentorMode, setMentorMode] = useState(initialMentorPreset != null);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
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
  }, [messages, streamingText]);

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

  async function togglePin(id: string) {
    const target = conversations.find((c) => c.id === id);
    if (!target) return;
    const nextPinned = !target.is_pinned;
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_pinned: nextPinned } : c))
    );
    const supabase = createClient();
    const { error: pinError } = await supabase
      .from("chat_conversations")
      .update({ is_pinned: nextPinned })
      .eq("id", id);
    if (pinError) {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_pinned: !nextPinned } : c))
      );
      setError(getErrorMessage(pinError, "Could not update pin."));
    }
  }

  async function renameConversation(id: string, title: string) {
    const previousTitle = conversations.find((c) => c.id === id)?.title;
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    const supabase = createClient();
    const { error: renameError } = await supabase
      .from("chat_conversations")
      .update({ title })
      .eq("id", id);
    if (renameError && previousTitle !== undefined) {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: previousTitle } : c))
      );
      setError(getErrorMessage(renameError, "Could not rename conversation."));
    }
  }

  async function deleteConversation(id: string) {
    const previous = conversations;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      requestTokenRef.current += 1;
      setActiveId(null);
      setMessages([]);
      setLoadingMessages(false);
    }
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("chat_conversations")
      .delete()
      .eq("id", id);
    if (deleteError) {
      setConversations(previous);
      setError(getErrorMessage(deleteError, "Could not delete conversation."));
    }
  }

  function handleTextareaInput(e: ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setIsRateLimitNotice(false);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const sentFromId = activeId;
    setMessages((m) => [
      ...m,
      {
        id: nextLocalId("optimistic-user"),
        conversation_id: sentFromId ?? "",
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      },
    ]);
    setSending(true);
    setStreamingText(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: sentFromId,
          message: text,
          mentorMode,
          ...(mentorPreset ? { mentorPreset } : {}),
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/x-ndjson") || !res.body) {
        const data = await res.json().catch(() => null);
        if (data?.rateLimited) {
          setIsRateLimitNotice(true);
          setError(data.message);
        } else {
          setError(getErrorMessage(data?.error, "Something went wrong."));
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let resolvedConversationId: string | null = sentFromId;
      let accumulatedText = "";
      let streamError: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf("\n");
          if (!line.trim()) continue;

          const event = JSON.parse(line);
          if (event.type === "meta") {
            resolvedConversationId = event.conversationId;
            if (typeof event.freeRemaining === "number") {
              setFreeRemaining(event.freeRemaining);
            }
            if (event.conversationId && event.conversationId !== sentFromId) {
              setActiveId(event.conversationId);
            }
            if (event.isNewConversation) {
              const nowIso = new Date().toISOString();
              setConversations((prev) => [
                {
                  id: event.conversationId,
                  title: event.title ?? text.slice(0, 40),
                  is_pinned: false,
                  created_at: nowIso,
                  updated_at: nowIso,
                },
                ...prev,
              ]);
            }
          } else if (event.type === "delta") {
            accumulatedText += event.text;
            setStreamingText(accumulatedText);
          } else if (event.type === "error") {
            streamError = event.error;
          }
        }
      }

      if (accumulatedText) {
        setMessages((m) => [
          ...m,
          {
            id: nextLocalId("assistant"),
            conversation_id: resolvedConversationId ?? "",
            role: "assistant",
            content: accumulatedText,
            created_at: new Date().toISOString(),
          },
        ]);
        if (resolvedConversationId) {
          const nowIso = new Date().toISOString();
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === resolvedConversationId);
            if (idx === -1) return prev;
            const updated = [...prev];
            const [conversation] = updated.splice(idx, 1);
            updated.unshift({ ...conversation, updated_at: nowIso });
            return updated;
          });
        }
      }

      if (streamError) {
        setError(streamError);
      }

      void refreshCredits();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setStreamingText(null);
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
        onTogglePin={togglePin}
        onRename={renameConversation}
        onDelete={deleteConversation}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {loadingMessages ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Loading...
            </div>
          ) : messages.length === 0 && !sending ? (
            <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
                <MessageCircle className="h-6 w-6" aria-hidden="true" />
              </span>
              <h1 className="mt-4 text-xl font-bold tracking-wide text-foreground">Ionexa Chat</h1>
              <p className="mt-2 text-sm text-muted">
                Ask anything — general knowledge, brainstorming, writing help,
                or just a conversation. Not tied to any Ionexa AI module.
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
                    <AssistantAvatar />
                    <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-border bg-panel px-4 py-2.5 text-foreground/90">
                      <MessageContent content={msg.content} />
                    </div>
                  </div>
                )
              )}

              {sending && (
                <div className="flex items-start gap-2">
                  <AssistantAvatar />
                  {streamingText !== null ? (
                    <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-border bg-panel px-4 py-2.5 text-foreground/90">
                      <MessageContent content={streamingText} />
                    </div>
                  ) : (
                    <TypingDots />
                  )}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-border p-4 sm:p-6">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setMentorMode((v) => !v)}
                aria-pressed={mentorMode}
                title="Mentor Mode: strategic guidance instead of just answers — flags risks, asks clarifying questions, suggests alternatives, and uses your logged data as context."
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  mentorMode
                    ? "border-orange-500/60 bg-orange-500/10 text-orange-400"
                    : "border-border text-muted hover:border-orange-500/40 hover:text-foreground"
                }`}
              >
                <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                Mentor Mode
              </button>
            </div>
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
                  onChange={handleTextareaInput}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Message Ionexa..."
                  rows={1}
                  className="focus-glow max-h-40 min-h-[52px] w-full resize-none overflow-y-auto rounded-2xl border border-border bg-panel px-4 py-3.5 pr-14 text-sm text-foreground outline-none placeholder:text-muted focus:border-orange-500/60"
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
              {freeRemaining !== null && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                  <Gift className="h-3 w-3 text-emerald-400/80" aria-hidden="true" />
                  {freeRemaining > 0
                    ? tFree("remaining", { count: freeRemaining })
                    : tFree("exhausted")}
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
