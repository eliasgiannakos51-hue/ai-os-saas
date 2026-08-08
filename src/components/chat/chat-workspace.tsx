"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Compass, Gift, MessageCircle, PanelLeftClose, PanelLeftOpen, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { readNdjsonStream } from "@/lib/ndjson-stream";
import { Tooltip } from "@/components/ui/tooltip";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { MessageContent } from "@/components/chat/message-content";
import { useCredits } from "@/components/credits/credits-context";
import type { ChatConversation, ChatMessage } from "@/types/chat";

// Remembered across visits, per the focus-mode toggle below.
const CHAT_SIDEBAR_STORAGE_KEY = "chat-sidebar";
// Tailwind's `md`. Only used for the FIRST-visit default, never for
// layout — the layout itself is done with real md: classes.
const SIDEBAR_BREAKPOINT_PX = 768;

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
  const tCommon = useTranslations("common");
  const tProduct = useTranslations("dashboard.productWorkflow");
  const tFree = useTranslations("credits.freeChat");
  const t = useTranslations("dashboard.chat");
  const { refresh: refreshCredits, reportUsage } = useCredits();
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
  // Set from the stream's meta line when the last message fell outside the
  // free envelope (too long, or over the FREE_CHAT_MAX_COST_EUR estimate):
  // "this message is large — it will be charged ~N credits". Cleared on
  // the next send so it only ever describes the message just sent.
  const [largeMessageCredits, setLargeMessageCredits] = useState<number | null>(null);
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

  // Focus mode: hides the conversation list so the thread gets the full
  // width, the way ChatGPT and Claude do it.
  //
  // Starts CLOSED on the very first render and is opened by the effect
  // below rather than defaulting to open. That order matters: the server
  // has no idea how wide the viewport is, and a 256px sidebar rendered
  // into a 375px phone before hydration is a visible, ugly flash of a
  // layout that immediately disappears. Closed-then-open is invisible on
  // desktop and correct on mobile.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarResolved, setSidebarResolved] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(CHAT_SIDEBAR_STORAGE_KEY);
    } catch {
      // Private browsing / storage disabled — fall through to the
      // width-based default rather than failing to render a sidebar.
    }
    if (stored === "open" || stored === "closed") {
      setSidebarOpen(stored === "open");
    } else {
      // No stored preference: open on a desktop-width viewport, closed on
      // a phone, where it would otherwise cover most of the thread.
      setSidebarOpen(window.innerWidth >= SIDEBAR_BREAKPOINT_PX);
    }
    setSidebarResolved(true);
  }, []);

  function toggleSidebar() {
    setSidebarOpen((open) => {
      const next = !open;
      try {
        window.localStorage.setItem(CHAT_SIDEBAR_STORAGE_KEY, next ? "open" : "closed");
      } catch {
        // Preference just won't persist; the toggle still works.
      }
      return next;
    });
  }
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

      let resolvedConversationId: string | null = sentFromId;
      let accumulatedText = "";
      let streamError: string | null = null;

      // readNdjsonStream never throws — see lib/ndjson-stream.ts. That is
      // what keeps a reply the user already watched arrive from being
      // discarded when the connection drops partway through it.
      let usageEvent: unknown = null;
      const { interrupted } = await readNdjsonStream(res.body, (event) => {
        if (event.type === "done") usageEvent = event;
        if (event.type === "meta") {
          resolvedConversationId = (event.conversationId as string | null) ?? null;
          if (typeof event.freeRemaining === "number") {
            setFreeRemaining(event.freeRemaining);
          }
          const large = event.largeMessage as { estimatedCredits?: number } | undefined;
          setLargeMessageCredits(
            large && typeof large.estimatedCredits === "number" ? large.estimatedCredits : null
          );
          if (event.conversationId && event.conversationId !== sentFromId) {
            setActiveId(event.conversationId as string);
          }
          if (event.isNewConversation) {
            const nowIso = new Date().toISOString();
            setConversations((prev) => [
              {
                id: event.conversationId as string,
                title: (event.title as string | undefined) ?? text.slice(0, 40),
                is_pinned: false,
                created_at: nowIso,
                updated_at: nowIso,
              },
              ...prev,
            ]);
          }
        } else if (event.type === "delta") {
          // Guard the concatenation: an event without a string `text`
          // used to append the literal "undefined" into the reply.
          if (typeof event.text === "string") {
            accumulatedText += event.text;
            setStreamingText(accumulatedText);
          }
        } else if (event.type === "error") {
          streamError = typeof event.error === "string" ? event.error : "Something went wrong.";
        }
      });

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
      } else if (interrupted) {
        // The partial reply above has already been kept. Say what
        // happened rather than pretending the whole request failed.
        setError(
          accumulatedText
            ? t("streamInterruptedPartial")
            : t("streamInterrupted")
        );
      }

      // The receipt rides on the stream's `done` event, so the counter and
      // the "used N credits" message come from the same source of truth as
      // the settlement itself. Falls back to a plain refresh if the event
      // carried no receipt.
      if (usageEvent) {
        void reportUsage(usageEvent);
      } else {
        void refreshCredits();
      }
    } catch {
      setError(tCommon("networkError"));
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
    <div className="relative flex h-full overflow-hidden">
      {/* On md+ the sidebar is a real in-flow column. Below md it is an
          overlay drawer: at 375px a 256px in-flow sidebar left the thread
          119px wide, which is not a layout, it is a squeeze. */}
      <div
        className={`absolute inset-y-0 left-0 z-30 md:relative md:z-auto ${
          sidebarOpen ? "flex" : "hidden"
        }`}
      >
        <ConversationSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={(id) => {
            selectConversation(id);
            if (window.innerWidth < SIDEBAR_BREAKPOINT_PX) toggleSidebar();
          }}
          onNewChat={() => {
            startNewChat();
            if (window.innerWidth < SIDEBAR_BREAKPOINT_PX) toggleSidebar();
          }}
          onTogglePin={togglePin}
          onRename={renameConversation}
          onDelete={deleteConversation}
        />
      </div>

      {/* Tap-anywhere-else to close, phones only — the desktop column has
          nothing to dismiss. */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label={t("hideConversations")}
          onClick={toggleSidebar}
          className="absolute inset-0 z-20 bg-black/50 md:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
          {/* DEFECT this fixes: this was a bare 36x36 icon whose only
              affordance was a native `title` tooltip — the exact thing the
              user reported never seeing. The feature worked and shipped;
              nobody could find it. It now carries a VISIBLE text label
              (the icon alone never said what it did) and the real Tooltip
              component for the longer explanation. */}
          <Tooltip
            content={sidebarOpen ? t("hideConversationsHint") : t("showConversationsHint")}
            side="top"
          >
            <button
              type="button"
              onClick={toggleSidebar}
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? t("hideConversations") : t("showConversations")}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" />
              ) : (
                <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" />
              )}
              {/* Hidden below sm only — at 375px the composer needs the
                  width more than the label does. */}
              <span className="hidden truncate text-xs sm:inline">
                {sidebarOpen ? t("hideConversations") : t("focusMode")}
              </span>
            </button>
          </Tooltip>
        </div>

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
                  // max-h-40 (160px) was the whole complaint: a long message scrolled
                  // inside a box a quarter the height of the thread above it. A
                  // viewport-relative cap grows with the screen instead of
                  // pinning the composer to one small absolute size.
                  className="focus-glow max-h-[45vh] min-h-[60px] w-full resize-none overflow-y-auto rounded-2xl border border-border bg-panel px-4 py-3.5 pr-14 text-sm text-foreground outline-none placeholder:text-muted focus:border-orange-500/60"
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
              {largeMessageCredits !== null && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-orange-300/90">
                  <Zap className="h-3 w-3 text-orange-400/80" aria-hidden="true" />
                  {tFree("largeMessage", { count: largeMessageCredits })}
                </p>
              )}
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
