"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, AudioLines, Compass, Gift, MessageCircle, PanelLeftClose, PanelLeftOpen, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useErrorText, useErrorTextForStatus } from "@/lib/errors/use-error-text";
import { AiActivity } from "@/components/ui/ai-activity";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { readNdjsonStream } from "@/lib/ndjson-stream";
import { Tooltip } from "@/components/ui/tooltip";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { InlineTitle } from "@/components/chat/inline-title";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { MessageContent } from "@/components/chat/message-content";
import { ChatComposer, type ChatComposerHandle } from "@/components/chat/chat-composer";
import { ExamplePrompts } from "@/components/ai/example-prompts";
import { AiGeneratedNotice } from "@/components/ai/ai-generated-notice";
import { useCredits } from "@/components/credits/credits-context";
import { VoicePlayer } from "@/components/voice/voice-player";
import { VoiceConversation } from "@/components/voice/voice-conversation";
import { useVoiceAvailability } from "@/components/voice/voice-availability";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
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
  initialConversationId,
}: {
  initialConversations: ChatConversation[];
  userInitial: string;
  /** Conversation to open on load — the `?c=` deep link a starred
   *  conversation on /dashboard/favorites points at. Already checked
   *  against the user's own list server-side. */
  initialConversationId?: string;
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
  const describe = useErrorText();
  const describeStatus = useErrorTextForStatus();
  const tCommon = useTranslations("common");
  const tProduct = useTranslations("dashboard.productWorkflow");
  const tFree = useTranslations("credits.freeChat");
  const t = useTranslations("dashboard.chat");
  const tVoice = useTranslations("voice");
  const { refresh: refreshCredits, reportUsage } = useCredits();
  const [conversations, setConversations] = useState<ChatConversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const [headerRenaming, setHeaderRenaming] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // The text being typed lives INSIDE ChatComposer, not here: as state on
  // this component, every keystroke re-rendered the whole workspace —
  // thread, sidebar, header — measured at 128ms median per key with a
  // 40-message thread (input-latency.prodtest.mjs). The mentor prefill is
  // the composer's initial value; later writes go through composerRef.
  const composerInitialText =
    initialMentorPreset === "trading"
      ? tTrading("mentorChatPrefill")
      : initialMentorPreset === "product"
        ? tProduct("mentorChatPrefill")
        : "";
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
  const composerRef = useRef<ChatComposerHandle>(null);
  // The hands-free loop (#2). Opened by a press, never by anything else,
  // and every turn it completes is written back into the thread below so
  // that closing it leaves a normal, readable conversation behind.
  const [talking, setTalking] = useState(false);
  const voiceAvailability = useVoiceAvailability();

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

  // Follows new content ONLY while the reader is at the bottom. The old
  // effect scrolled unconditionally on every change of streamingText —
  // every chunk, several times a second — which made scrolling up during
  // a reply physically impossible (the reported bug).
  const {
    containerRef: threadRef,
    onScroll: onThreadScroll,
    follow,
    jumpToBottom,
    resetToBottom,
    newBelow,
  } = useStickToBottom();
  useEffect(() => {
    follow();
  }, [messages, streamingText, follow]);

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
    // A different conversation opens at its latest message, wherever the
    // reader had scrolled in the previous one.
    resetToBottom();
    loadMessages(id);
  }

  function startNewChat() {
    requestTokenRef.current += 1;
    setActiveId(null);
    setMessages([]);
    setError(null);
    setLoadingMessages(false);
    resetToBottom();
    composerRef.current?.focus();
  }

  // Through the route rather than straight at the table: the per-plan cap
  // on pinned conversations has to be decided by the server, or it is not
  // a cap. RLS still owns the ownership half.
  async function togglePin(id: string) {
    const target = conversations.find((c) => c.id === id);
    if (!target) return;
    const nextPinned = !target.is_pinned;
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_pinned: nextPinned } : c))
    );
    const revert = () =>
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_pinned: !nextPinned } : c))
      );
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: nextPinned }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        revert();
        // Hitting the pin cap is a tidiness problem, not a billing one,
        // so it gets its own sentence with the numbers in it — never an
        // upgrade prompt. Every other code falls to one translated line:
        // the route returns identifiers rather than English prose, so
        // there is nothing here that could leak an English sentence into
        // a Greek sidebar.
        setError(
          data?.code === "pin_limit"
            ? t("pinLimitReached", { limit: data.limit })
            : t("pinError")
        );
      }
    } catch {
      revert();
      setError(t("pinError"));
    }
  }

  // Favourite state lives here rather than inside each star, because the
  // same conversation is drawn twice (list + header) and two independent
  // copies of the state disagree the moment one is clicked.
  // Opening a starred conversation from /dashboard/favorites. Runs once:
  // it has to go through selectConversation rather than just seeding
  // activeId, because that is what loads the thread's messages.
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current || !initialConversationId) return;
    deepLinkedRef.current = true;
    selectConversation(initialConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationId]);

  function toggleFavorite(id: string, favorited: boolean) {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_favorited: favorited } : c))
    );
  }

  // Also through the route: the title length is capped there, so a
  // 40,000-character name cannot be written by anything that skips this
  // component. The optimistic update stays — a rename that waits for a
  // round trip feels broken.
  async function renameConversation(id: string, title: string) {
    const previousTitle = conversations.find((c) => c.id === id)?.title;
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        if (previousTitle !== undefined) {
          setConversations((prev) =>
            prev.map((c) => (c.id === id ? { ...c, title: previousTitle } : c))
          );
        }
        setError(t("renameError"));
        return;
      }
      // The server trims and truncates, so the row it returns is the
      // truth — echoing it back stops the sidebar showing 120 characters
      // of a title the database stored as 100.
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: data.conversation.title } : c))
      );
    } catch {
      if (previousTitle !== undefined) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: previousTitle } : c))
        );
      }
      setError(t("renameError"));
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

  async function handleSend(text: string) {
    if (!text || sending) return;

    setError(null);
    setIsRateLimitNotice(false);

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
          setError(describeStatus(res.status).text);
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
                // A conversation that was created one second ago has no
                // row in user_favorites yet, by construction.
                is_favorited: false,
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
          streamError = describeStatus(500).text;
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
          onToggleFavorite={toggleFavorite}
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
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground sm:h-9"
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

          {/* The open conversation's own star, top-right — the same
              control as in the list, so starring is reachable whichever
              way you got here. Only once a conversation exists: a brand
              new, unsaved chat has no row to star yet.
              The key includes the favourited flag so a toggle made in the
              sidebar re-mounts this copy instead of leaving the two
              stars disagreeing. */}
          {/* THE NAME, WHERE YOU ARE READING THE CONVERSATION.
              It was only ever in the sidebar — which is hidden in focus
              mode and hidden by default at 375px, so on a phone the open
              conversation had no name on screen at all and no way to
              change it. Same component as the list, so the two cannot
              drift apart. */}
          {activeConversation && (
            <div className="ml-3 flex min-w-0 flex-1 items-center">
              <InlineTitle
                testId="chat-header-title"
                title={activeConversation.title}
                editing={headerRenaming}
                onEditingChange={setHeaderRenaming}
                onRename={(next) => void renameConversation(activeConversation.id, next)}
                className="min-w-0 truncate text-sm font-medium text-foreground"
              />
            </div>
          )}

          {activeConversation && (
            <div className="ml-auto shrink-0">
              <FavoriteButton
                key={`${activeConversation.id}:${activeConversation.is_favorited}`}
                table="chat_conversations"
                recordId={activeConversation.id}
                headline={activeConversation.title}
                initialFavorited={activeConversation.is_favorited}
                variant="inline"
                onToggled={(fav) => toggleFavorite(activeConversation.id, fav)}
              />
            </div>
          )}
        </div>

        <div className="relative min-h-0 flex-1">
        <div
          ref={threadRef}
          onScroll={onThreadScroll}
          data-testid="chat-thread"
          className="h-full overflow-y-auto px-4 py-6 sm:px-6"
        >
          {loadingMessages ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              {tCommon("loading")}
            </div>
          ) : messages.length === 0 && !sending ? (
            <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
                <MessageCircle className="h-6 w-6" aria-hidden="true" />
              </span>
              <h1 className="mt-4 text-xl font-bold tracking-wide text-foreground">{t("title")}</h1>
              {/* Was three hardcoded English sentences. A Greek user opening
                  Chat met an English explanation of what it is for — which
                  is the one moment the explanation has to land. */}
              <p className="mt-2 text-sm text-muted">{t("emptyHint")}</p>
              {/* AND WHAT TO ACTUALLY SAY. "Ask anything" is true and
                  useless: the reported confusion was somebody deciding this
                  product was "several LLMs in one, cheaper", which is
                  exactly the conclusion you reach from a blank box that
                  accepts anything. */}
              <ExamplePrompts
                surface="chat"
                onPick={(text) => composerRef.current?.setText(text)}
                className="mt-5 w-full text-left"
              />
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
                    {/* EU AI Act art. 50 — on the reply itself, not in
                        metadata. Inside the bubble so it cannot be read as
                        belonging to the next message. */}
                    <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-border bg-panel px-4 py-2.5 text-foreground/90">
                      <MessageContent content={msg.content} />
                      {/* "LISTEN" — on the finished answer only. Never on
                          the one still streaming: half a sentence read
                          aloud is a clip charged for text that changed a
                          second later. */}
                      <div className="mt-2">
                        <VoicePlayer text={msg.content} compact />
                      </div>
                      <AiGeneratedNotice />
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
                      <AiGeneratedNotice />
                    </div>
                  ) : (
                    <AiActivity kind="chat" className="rounded-2xl rounded-tl-sm border border-border bg-panel px-4 py-3.5" />
                  )}
                </div>
              )}

            </div>
          )}
        </div>
        {/* Content arrived while the reader was up in the history. An
            offer to return, never a forced trip. */}
        {newBelow && (
          <button
            type="button"
            onClick={jumpToBottom}
            data-testid="chat-jump-to-latest"
            className="absolute bottom-3 left-1/2 z-10 inline-flex min-h-[36px] -translate-x-1/2 items-center gap-1.5 rounded-full border border-orange-500/40 bg-panel px-3.5 py-1.5 text-xs font-medium text-orange-300 shadow-lg transition-colors duration-150 hover:border-orange-500 hover:bg-orange-500/10"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            {tCommon("newMessagesBelow")}
          </button>
        )}
        </div>

        <div className="border-t border-border p-4 sm:p-6">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              {/* PRESS ONCE, THEN TALK (#2). Hidden entirely unless both
                  halves of voice are usable here — a hands-free loop that
                  can listen but not answer aloud is not the thing this
                  button promises. */}
              {voiceAvailability.transcribeAvailable && voiceAvailability.speakAvailable && (
                <button
                  type="button"
                  onClick={() => setTalking(true)}
                  disabled={sending || !voiceAvailability.hasMinutes}
                  title={voiceAvailability.hasMinutes ? undefined : tVoice("outOfMinutes")}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:border-orange-500/40 hover:text-foreground disabled:opacity-40"
                >
                  <AudioLines className="h-3.5 w-3.5" aria-hidden="true" />
                  {tVoice("conversation.start")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setMentorMode((v) => !v)}
                aria-pressed={mentorMode}
                title={t("mentorModeHint")}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  mentorMode
                    ? "border-orange-500/60 bg-orange-500/10 text-orange-400"
                    : "border-border text-muted hover:border-orange-500/40 hover:text-foreground"
                }`}
              >
                <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                {t("mentorMode")}
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
            <ChatComposer
              ref={composerRef}
              sending={sending}
              onSend={(text) => void handleSend(text)}
              initialText={composerInitialText}
            >
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
            </ChatComposer>
          </div>
        </div>
      </div>

      {/* THE HANDS-FREE LOOP. Seeded with the conversation that is open,
          so what is said out loud lands in the same thread rather than in
          a second one nobody asked for, and every completed turn is
          pushed into the messages above — close it and the exchange is
          still there to read. */}
      {talking && (
        <VoiceConversation
          conversationId={activeId}
          onConversationId={(id) => setActiveId(id)}
          onClose={() => setTalking(false)}
          onExchange={({ question, answer }) => {
            setMessages((m) => [
              ...m,
              { id: nextLocalId("user"), role: "user", content: question } as ChatMessage,
              { id: nextLocalId("assistant"), role: "assistant", content: answer } as ChatMessage,
            ]);
            refreshCredits();
          }}
        />
      )}
    </div>
  );
}
