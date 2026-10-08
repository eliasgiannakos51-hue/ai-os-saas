"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, AudioLines, Compass, Gift, PanelLeftClose, PanelLeftOpen, X, Zap } from "lucide-react";
import { Earth } from "@/components/brand/earth";
import { useLocale, useTranslations } from "next-intl";
import { useErrorText, useErrorTextForStatus } from "@/lib/errors/use-error-text";
import { AiActivity } from "@/components/ui/ai-activity";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { readNdjsonStream } from "@/lib/ndjson-stream";
import { Tooltip } from "@/components/ui/tooltip";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { InlineTitle } from "@/components/chat/inline-title";
import { HelpTip } from "@/components/ui/help-tip";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { MessageContent } from "@/components/chat/message-content";
import { SourceCards } from "@/components/chat/source-cards";
import { ClarificationQuestions } from "@/components/clarification/clarification-questions";
import { alignSuggestions, appendClarificationAnswers } from "@/lib/clarification-client";
import { ChatComposer, type ChatComposerHandle } from "@/components/chat/chat-composer";
import { timeOfDayGreeting } from "@/lib/greeting";
import { AiGeneratedNotice } from "@/components/ai/ai-generated-notice";
import { useCredits } from "@/components/credits/credits-context";
import { VoicePlayer } from "@/components/voice/voice-player";
import { VoiceConversation } from "@/components/voice/voice-conversation";
import { useVoiceAvailability } from "@/components/voice/voice-availability";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import type { ChatConversation, ChatMessage } from "@/types/chat";
import { ProvenanceLine } from "@/components/chat/provenance-line";
import { TransitionButton } from "@/components/transitions/transition-button";
import { AnswerActions } from "@/components/chat/answer-actions";
import { ResultCard, WorkArea } from "@/components/chat/work-area";
import { SitePane, type SitePaneHandle, type SiteWall } from "@/components/chat/site-pane";
import { openSiteFor } from "@/lib/chat/open-tool";
import { workItemFrom, type WorkItem } from "@/lib/chat/work-area";
import type { Provenance } from "@/lib/chat/provenance";
import { AttachmentTray, MemoriesUsed, SentAttachments, useChatAttachments } from "@/components/chat/chat-attachments";
import { CHAT_ACCEPT, discardChatImages } from "@/lib/chat/attach-client";
import { parseStoredAttachments, type ChatAttachment } from "@/lib/chat/attachment-types";
import { readAnswerBasis, readMemoriesUsed, type MemoryUsed } from "@/lib/chat/memory-citations";
import { useToast } from "@/components/toast/toast-context";
import { forgetExampleParam } from "@/lib/overview/first-screen-examples";
import { AiJobTimeline } from "@/components/ui/ai-job-timeline";
import type { ClientStep } from "@/lib/jobs/job-timeline";
import type { WorkMode } from "@/lib/chat/work-modes";
import { chatTimelineWorthShowing, isChatStep, readChatStepFrame, type ChatStep } from "@/lib/chat/chat-timeline";

// What each phase of an answer is called on screen (lib/chat/chat-timeline.ts).
// Named rather than built from the step, so every message is a literal.
const CHAT_STEP_MESSAGE = {
  thinking: "chatTimeline.thinking",
  searching_web: "chatTimeline.searching_web",
  searching_data: "chatTimeline.searching_data",
  writing: "chatTimeline.writing",
} as const satisfies Record<ChatStep, string>;

// Remembered across visits, per the focus-mode toggle below.
const CHAT_SIDEBAR_STORAGE_KEY = "chat-sidebar";
// Tailwind's `md`. Only used for the FIRST-visit default, never for
// layout — the layout itself is done with real md: classes.
// THE FIRST FIX COUNTED ONE SIDEBAR AND THERE ARE TWO — V4.6 #12.
//
// This was 768 (`md`), moved there because "at 375px a 256px in-flow
// sidebar left the thread 119px wide, which is not a layout, it is a
// squeeze". That was true and the fix was partial: at 768 the DASHBOARD
// nav is in flow as well, so the arithmetic is 768 - 240 (nav) - 256
// (this sidebar) - 48 (padding) and the reading column is what is left.
//
// Measured on a real build at 768 before this changed
// (scripts/tests/chat-measure.prodtest.mjs):
//   column 182px of a 224px measure at 15px — TWENTY-FOUR characters
//   per line, against a brief asking for 60-75. The 390px phone, with
//   no sidebars at all, held 41.
// A tablet reading a narrower column than a phone is the signal that
// something is being counted once and paid for twice.
//
// 1280 (`xl`) is the width at which both columns and a 60-75 character
// measure fit at the same time: 1280 - 240 - 256 - 48 = 736px of thread,
// which the 68ch cap then limits to about 71 characters at 16px. At 1024
// the same sum leaves 480px, about 58 characters — under the band, so
// `lg` is not enough and is not used.
const SIDEBAR_BREAKPOINT_PX = 1280;

let localIdCounter = 0;
function nextLocalId(prefix: string) {
  localIdCounter += 1;
  return `${prefix}-${localIdCounter}`;
}

/** A row the server has written has a uuid; one only this page knows
 *  (nextLocalId) does not, and cannot be rated yet. */
const PERSISTED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ChatWorkspace({
  initialConversations,
  initialMentorPreset,
  initialFreeChatRemaining,
  initialConversationId,
  initialAsk,
  initialProjectId,
  initialWorkMode,
  workArea = false,
  opensTools = false,
  siteWall = null,
  attachments = false,
  greeting = null,
}: {
  initialConversations: ChatConversation[];
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
  /**
   * A question to send the moment this page opens, from the Home
   * screen's "understand" example (lib/overview/first-screen-examples).
   *
   * Two of seven testers never found the chat at all. This is a door
   * into it that does not require knowing it is there — and the press
   * that opened it is the consent for the message it sends, the same
   * consent pressing Send would be.
   */
  initialAsk?: string;
  /**
   * The way of working a Home quick action chose (lib/chat/work-modes.ts).
   * Sent with every message until the person clears it.
   */
  initialWorkMode?: WorkMode;
  /** The switch "chat-work-area" (src/lib/flags/flags.ts), read by the
   *  page: whether a produced answer opens beside the conversation. */
  workArea?: boolean;
  /** The switch "chat-opens-tools" (package 7): a request for a site opens
   *  the Site beside the conversation instead of being answered in words. */
  opensTools?: boolean;
  /** This account's plan has no Site: the Site opened from Chat shows the
   *  plan's wall instead of offering what /api/websites/generate refuses.
   *  Decided by the page from the same gate the route asks. */
  siteWall?: SiteWall | null;
  /** The switch "chat-attachments" (package 9): PDFs and images given to a
   *  message, and under each answer the remembered facts it used. */
  attachments?: boolean;
  /** The name the empty Chat greets with (lib/greeting.ts, greetingName),
   *  or null when it is not known — then the greeting has no name. */
  greeting?: string | null;
  /**
   * The project a conversation STARTED here belongs to, for the whole of
   * its life. Chosen on arrival (/dashboard/projects/[id] links here with
   * it) and never switched: lib/projects/project.ts's budget is only
   * worth anything while the context prefix is stable enough to be
   * cached, and a mid-conversation toggle would rewrite that prefix on
   * the message that flipped it. There is deliberately no setter.
   */
  initialProjectId?: string;
}) {
  const tTrading = useTranslations("dashboard.tradingWorkflow");
  const describe = useErrorText();
  const describeStatus = useErrorTextForStatus();
  const tCommon = useTranslations("common");
  const tProduct = useTranslations("dashboard.productWorkflow");
  const tFree = useTranslations("credits.freeChat");
  const tOutOfCredits = useTranslations("credits.outOfCredits");
  const tErrors = useTranslations("errors");
  // OUT OF CREDITS, IN THE SCREEN'S LANGUAGE. The route's sentence is
  // English (insufficientCreditsMessage in lib/billing/credits.ts) and was
  // shown as it came, on a Greek screen too — found 2026-10-08 by
  // scripts/tests/brand-memory.prodtest.mjs. The route sends a code and
  // the two numbers for this.
  const outOfCreditsText = (available: unknown, needed: unknown) =>
    `${tErrors("codes.insufficientCredits.what")} ${
      typeof available === "number" && typeof needed === "number"
        ? tOutOfCredits("detailWithNumbers", { available, needed })
        : tOutOfCredits("detail")
    }`;
  const t = useTranslations("dashboard.chat");
  const tSteps = useTranslations("aiSteps");
  const chatStepLabel = (label: string | null) => (isChatStep(label) ? tSteps(CHAT_STEP_MESSAGE[label]) : null);
  const tVoice = useTranslations("voice");
  const tPromise = useTranslations("promise");
  // The hour's greeting, as on Home (components/overview/greeting-header.tsx):
  // the device's clock on first render, then the browser's own time zone.
  const [dayPart, setDayPart] = useState(() => timeOfDayGreeting().part);
  useEffect(() => {
    setDayPart(timeOfDayGreeting(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone).part);
  }, []);
  const { refresh: refreshCredits, reportUsage } = useCredits();
  const [conversations, setConversations] = useState<ChatConversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  // THE WORK AREA (ΣΥΣΤΗΜΑ DESIGN §5, Δ.2): which answer is open beside
  // the conversation, if any. Closed when the conversation changes.
  const [openWorkId, setOpenWorkId] = useState<string | null>(null);
  useEffect(() => setOpenWorkId(null), [activeId]);
  // THE TOOL OPENED FROM CHAT (package 7): the brief a site was asked for
  // in, while its pane is open beside the conversation.
  const [siteBrief, setSiteBrief] = useState<string | null>(null);
  const sitePaneRef = useRef<SitePaneHandle>(null);
  useEffect(() => setSiteBrief(null), [activeId]);
  const [siteHidden, setSiteHidden] = useState(false);
  const locale = useLocale();
  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const [headerRenaming, setHeaderRenaming] = useState(false);
  // The provenance rides on the message it belongs to rather than in a
  // parallel map: a reply and the list of entries it was built from are
  // one thing, and two structures keyed by id drift the moment a message
  // is removed from one of them.
  const [messages, setMessages] = useState<
    (ChatMessage & {
      provenance?: Provenance;
      timeline?: ClientStep[];
      attachments?: ChatAttachment[];
      /** On-page pictures of images just sent, by stored path. */
      previews?: Record<string, string>;
      memoriesUsed?: MemoryUsed[];
    })[]
  >([]);
  const { addToast } = useToast();
  const attach = useChatAttachments((lines) => addToast(lines.join(" "), "error"));
  // The one answer whose earth keeps turning, calmly, once it is done.
  const lastAnswerId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  // What each finished answer produced, if anything (lib/chat/work-area.ts).
  // Empty while the switch is off, so nothing below draws a card.
  const workItems = useMemo(() => {
    const map = new Map<string, WorkItem>();
    if (!workArea) return map;
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      const item = workItemFrom(m.content);
      if (item) map.set(m.id, item);
    }
    return map;
  }, [messages, workArea]);
  const openWorkItem = openWorkId ? workItems.get(openWorkId) ?? null : null;
  // What "again" asks: the person's message right before the latest answer.
  const retryText = (() => {
    const at = messages.findIndex((m) => m.id === lastAnswerId);
    for (let i = at - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].content;
    return null;
  })();
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
  const [workMode, setWorkMode] = useState<WorkMode | null>(initialWorkMode ?? null);
  const tModes = useTranslations("dashboard.home.actions");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  // The answer's steps while it streams, replaced whole by every
  // `timeline` frame (app/api/chat/route.ts).
  const [liveTimeline, setLiveTimeline] = useState<ClientStep[]>([]);
  // THE STOP BUTTON — V4.6. One controller per send; pressing ✕ aborts
  // the fetch, which is what the server reads as "stop" (api/chat). The
  // text already on screen is kept, the box is handed back at once, and
  // the balance is refreshed a moment later, once the server has settled
  // for the part that was produced.
  const abortRef = useRef<AbortController | null>(null);
  const [stoppedNote, setStoppedNote] = useState(false);
  function stopGeneration() {
    abortRef.current?.abort();
  }
  const [loadingMessages, setLoadingMessages] = useState(false);
  // NO MESSAGE YET: the screen of MASTER 14.2 — the earth, the greeting
  // and the field, nothing else.
  const isEmpty = !loadingMessages && messages.length === 0 && !sending;
  const [error, setError] = useState<string | null>(null);
  const [isRateLimitNotice, setIsRateLimitNotice] = useState(false);
  const composerRef = useRef<ChatComposerHandle>(null);
  // The hands-free loop (#2). Opened by a press, never by anything else,
  // and every turn it completes is written back into the thread below so
  // that closing it leaves a normal, readable conversation behind.
  const [talking, setTalking] = useState(false);
  const voiceAvailability = useVoiceAvailability();
  /**
   * WHETHER THE HANDS-FREE LOOP CAN START HERE: both provider keys
   * (OPENAI_API_KEY transcribes, ELEVENLABS_API_KEY speaks), the plan,
   * and minutes left. False draws no Talk button at all — see the button
   * below for why it is not drawn inert any more.
   */
  const talkAvailable =
    voiceAvailability.loaded && voiceAvailability.transcribeAvailable && voiceAvailability.speakAvailable && voiceAvailability.hasMinutes;

  // THE CONVERSATION LIST IS A DRAWER, CLOSED UNTIL ASKED FOR (Δ.2,
  // 2026-10-05). ΣΥΣΤΗΜΑ DESIGN §3: one sidebar, the same everywhere —
  // and the app's sidebar already lists the latest conversations. This
  // list stays one press away because it is the only place that holds
  // EVERY conversation, with rename, pin, star and delete; removing it
  // would lose those («Καμία λειτουργία δεν χάνεται», §9). Opened once,
  // the choice is remembered on this device.
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
    // No stored preference is closed, at every width.
    setSidebarOpen(stored === "open");
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
  // ASKED ON ARRIVAL. Runs once per mount and only for a brand-new
  // thread: `sentAskRef` is what stops React's development double-invoke
  // — and any later re-render — from sending the same question twice and
  // charging for it twice. Deliberately not guarded on `sending`, which
  // is false at mount; the ref is the guard.
  const sentAskRef = useRef(false);
  useEffect(() => {
    if (!initialAsk || sentAskRef.current) return;
    sentAskRef.current = true;
    void handleSend(initialAsk);
    forgetExampleParam("ask");
    // handleSend is redeclared every render and reads its own state via
    // setState callbacks; depending on it would re-run this effect
    // constantly, which the ref would then swallow silently. The ref is
    // the real guard, so the dependency list names only the input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAsk]);

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
      // A row's attachments and what its answer stood on (package 9) are
      // read back, so a reload shows what the stream showed; the
      // `provenance` column's shape is not the client's Provenance, so it
      // is unpacked rather than spread.
      setMessages(
        ((data as (ChatMessage & { attachments?: unknown; provenance?: unknown })[] | null) ?? []).map(({ attachments: storedAttachments, provenance: stored, ...row }) => {
          const basis = readAnswerBasis(stored);
          return {
            ...row,
            attachments: parseStoredAttachments(storedAttachments),
            provenance: basis.modules ?? undefined,
            memoriesUsed: basis.memories,
          };
        })
      );
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
    // Closed here, not only by the [activeId] effects above: a Site opened
    // in a conversation that never reached /api/chat has no id, so
    // setActiveId(null) changes nothing, and the next sentence went to the
    // site as a charged change (chat-opens-tools.prodtest.mjs).
    setSiteBrief(null);
    setOpenWorkId(null);
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
    // THE IMAGES GO WITH THE CONVERSATION (package 9): read before the
    // rows are deleted, removed after. A PDF is a file in Files and stays
    // there. Without the column (migration 20261018000000 not yet run)
    // there is nothing to read and nothing is removed.
    const { data: attachedRows } = attachments
      ? await supabase.from("chat_messages").select("attachments").eq("conversation_id", id).not("attachments", "is", null)
      : { data: null };
    const { error: deleteError } = await supabase
      .from("chat_conversations")
      .delete()
      .eq("id", id);
    if (deleteError) {
      setConversations(previous);
      setError(getErrorMessage(deleteError, "Could not delete conversation."));
      return;
    }
    const imagePaths = ((attachedRows ?? []) as { attachments?: unknown }[]).flatMap((row) =>
      parseStoredAttachments(row.attachments).flatMap((a) => (a.kind === "image" ? [a.path] : []))
    );
    void discardChatImages(imagePaths);
  }

  // THE QUESTION THE SERVER ASKED INSTEAD OF ANSWERING — V5 #6.
  //
  // A first message the free reader in lib/ai/ambiguity.ts could not read
  // as a request arrives here as a `clarify` frame rather than a reply:
  // nothing was reserved, nothing was charged for an answer, and the
  // person is asked one question with tappable answers instead of being
  // told something at length about the wrong thing. `text` is kept so
  // "answer" can resend the original with the answers appended, and
  // "skip" can resend it untouched with the check turned off.
  const [clarify, setClarify] = useState<{
    text: string;
    questions: string[];
    suggestions: string[][];
  } | null>(null);

  async function handleSend(text: string, options: { skipClarification?: boolean } = {}) {
    if (!text || sending) return;
    setClarify(null);

    // «ΦΤΙΑΞΕ ΜΟΥ SITE ΓΙΑ ΤΟ CAMPING» OPENS THE SITE BESIDE THE
    // CONVERSATION (MASTER 16, package 7). The same free matcher Home uses
    // (lib/create-studio/producer-routes.ts) recognises a request for a
    // site; the pane then says what it will make and what it costs, and
    // nothing is spent until it is pressed. No model is called to decide.
    // While a site is open beside the conversation, what is said next is
    // the Site's: an answer to its questions, or a change to it.
    const showMine = () =>
      setMessages((m) => [
        ...m,
        { id: nextLocalId("optimistic-user"), conversation_id: activeId ?? "", role: "user", content: text, created_at: new Date().toISOString() },
      ]);
    if (opensTools && openSiteFor(text, locale)) {
      showMine();
      setOpenWorkId(null);
      setSiteHidden(false);
      setSiteBrief(text);
      return;
    }
    if (siteBrief !== null && sitePaneRef.current?.take(text)) {
      showMine();
      setSiteHidden(false);
      return;
    }

    setError(null);
    setIsRateLimitNotice(false);

    // WHAT THE MESSAGE CARRIES (package 9): the PDFs Files has read, and
    // the images, which go up now. A failure here sends nothing.
    let carried: { attachments: ChatAttachment[]; imagePaths: string[]; previews: Record<string, string> } | null = null;
    if (attachments && attach.items.length > 0) {
      if (attach.hold) {
        composerRef.current?.setText(text);
        return;
      }
      setSending(true);
      const prepared = await attach.prepare();
      if (!prepared.ok) {
        setSending(false);
        setError(prepared.error);
        composerRef.current?.setText(text);
        return;
      }
      carried = prepared;
    }

    const sentFromId = activeId;
    setMessages((m) => [
      ...m,
      {
        id: nextLocalId("optimistic-user"),
        conversation_id: sentFromId ?? "",
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
        ...(carried ? { attachments: carried.attachments, previews: carried.previews } : {}),
      },
    ]);
    setSending(true);
    setStreamingText(null);
    setLiveTimeline([]);
    setStoppedNote(false);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          conversationId: sentFromId,
          message: text,
          mentorMode,
          // ONLY WHEN THE CONVERSATION IS NEW. A conversation that
          // already exists carries whatever project it was started in,
          // and re-sending one here on a later message is exactly the
          // mid-conversation switch that would rewrite the cached prefix.
          ...(initialProjectId && !sentFromId ? { projectId: initialProjectId } : {}),
          ...(mentorPreset ? { mentorPreset } : {}),
          ...(workMode ? { workMode } : {}),
          ...(options.skipClarification ? { skipClarification: true } : {}),
          ...(carried ? { attachments: carried.attachments } : {}),
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/x-ndjson") || !res.body) {
        const data = await res.json().catch(() => null);
        // Refused before anything was saved: the images just uploaded
        // belong to nothing, and the tray stays as it was to send again.
        if (carried) void discardChatImages(carried.imagePaths);
        if (data?.reason === "attachment_not_ready") {
          setError(t("attach.notReady", { names: Array.isArray(data.names) ? data.names.join(", ") : "" }));
        } else if (data?.reason === "bad_attachments") {
          setError(t("attach.refused"));
        } else if (data?.rateLimited) {
          setIsRateLimitNotice(true);
          setError(data.code === "insufficient_credits" ? outOfCreditsText(data.available, data.needed) : data.message);
        } else {
          setError(describeStatus(res.status).text);
        }
        return;
      }

      // The message is saved with what it carried; the tray empties.
      if (carried) attach.clear();
      let resolvedConversationId: string | null = sentFromId;
      let accumulatedText = "";
      let streamError: string | null = null;

      // readNdjsonStream never throws — see lib/ndjson-stream.ts. That is
      // what keeps a reply the user already watched arrive from being
      // discarded when the connection drops partway through it.
      let usageEvent: unknown = null;
      let provenance: Provenance | null = null;
      let finalContent: string | null = null;
      let finishedTimeline: ClientStep[] | undefined;
      let savedId: string | null = null;
      let memoriesUsed: MemoryUsed[] = [];
      const { interrupted } = await readNdjsonStream(res.body, (event) => {
        if (event.type === "done") {
          usageEvent = event;
          // With web sources the server sends the answer back numbered
          // (lib/chat/web-sources.ts); without them, what streamed stands.
          if (typeof event.content === "string" && event.content.trim()) finalContent = event.content;
          finishedTimeline = keepChatSteps(event.timeline);
          if (typeof event.messageId === "string" && PERSISTED_ID.test(event.messageId)) savedId = event.messageId;
          memoriesUsed = readMemoriesUsed(event.memoriesUsed);
        }
        if (event.type === "timeline") {
          setLiveTimeline(keepChatSteps(event.steps) ?? []);
        }
        if (event.type === "meta") {
          resolvedConversationId = (event.conversationId as string | null) ?? null;
          provenance = (event.provenance as Provenance | undefined) ?? null;
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
        } else if (event.type === "clarify") {
          // The optimistic user bubble stays: they DID send it, and the
          // question is about that message. What does not happen is an
          // assistant reply — there is none, and inventing an empty one
          // would put a blank turn in the thread they can never remove.
          const questions = Array.isArray(event.questions)
            ? (event.questions as unknown[]).filter((q): q is string => typeof q === "string")
            : [];
          if (questions.length > 0) {
            setClarify({
              text,
              questions,
              suggestions: alignSuggestions(questions, event.questionSuggestions),
            });
          }
        } else if (event.type === "error") {
          streamError = event.outOfCredits === true ? outOfCreditsText(event.available, event.needed) : describeStatus(500).text;
        }
      });

      if (accumulatedText) {
        const answerId = savedId ?? nextLocalId("assistant");
        // An answer that produced something opens beside the conversation
        // at once — «η οθόνη χωρίζεται στα δύο».
        if (workArea && workItemFrom(finalContent ?? accumulatedText)) setOpenWorkId(answerId);
        setMessages((m) => [
          ...m,
          {
            // The server's id when it sent one, so the answer can be rated
            // at once; a local one otherwise (a stopped or cut-off reply).
            id: answerId,
            conversation_id: resolvedConversationId ?? "",
            role: "assistant",
            content: finalContent ?? accumulatedText,
            created_at: new Date().toISOString(),
            provenance: provenance ?? undefined,
            timeline: finishedTimeline,
            memoriesUsed,
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

      if (controller.signal.aborted) {
        // Stopped by the reader, not by the network: not an error. The
        // partial reply above is kept; the server settles for it and
        // the balance is read back once it has.
        setStoppedNote(true);
        setTimeout(() => void refreshCredits(), 2500);
      } else if (streamError) {
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
      } else if (!controller.signal.aborted) {
        void refreshCredits();
      }
    } catch {
      // A fetch aborted before the headers arrived rejects here; that is
      // the stop button, not a network fault.
      if (controller.signal.aborted) {
        setStoppedNote(true);
        setTimeout(() => void refreshCredits(), 2500);
      } else {
        setError(tCommon("networkError"));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreamingText(null);
      setLiveTimeline([]);
      setSending(false);
    }
  }

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* On xl+ the sidebar is a real in-flow column; below that it is an
          overlay drawer. See SIDEBAR_BREAKPOINT_PX for the arithmetic —
          and for why `md` was the wrong answer to the same question. */}
      <div
        className={`absolute inset-y-0 start-0 z-30 xl:relative xl:z-auto ${
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

      {/* Tap-anywhere-else to close, wherever the sidebar is an overlay —
          the in-flow column at xl+ has nothing to dismiss. This said
          `md:hidden` while the drawer itself became an overlay below xl,
          so between 768 and 1279 the drawer covered the thread with no
          way to dismiss it except the toggle. */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label={t("hideConversations")}
          onClick={toggleSidebar}
          className="absolute inset-0 z-20 bg-background/50 xl:hidden"
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
              className="flex h-11 min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-item px-2 text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" />
              ) : (
                <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" />
              )}
              {/* Hidden below sm only — at 375px the composer needs the
                  width more than the label does. */}
              <span className="hidden break-words text-xs sm:inline">
                {sidebarOpen ? t("hideConversations") : t("focusMode")}
              </span>
            </button>
          </Tooltip>

          {/* THE "?" FOR THE WHOLE PAGE, in the one row that is always
              here. Chat is <main className="h-[calc(100vh-4rem)]"> — full
              viewport by design, with no PageHeader to hang a tip from —
              and this bar already holds a 44px control, so the tip's own
              44px hit area adds no height at all.
              NOT beside the conversation title: that row only renders
              once a conversation exists, and a brand new chat is exactly
              where somebody asks what this page can do. */}
          <HelpTip helpKey="help.chat" scopeKey="dashboard.chat.dataScope" />

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
            <div className="ms-3 flex min-w-0 flex-1 items-center">
              <InlineTitle
                testId="chat-header-title"
                title={activeConversation.title}
                editing={headerRenaming}
                onEditingChange={setHeaderRenaming}
                onRename={(next) => void renameConversation(activeConversation.id, next)}
                className="min-w-0 break-words text-sm font-medium text-foreground"
              />
            </div>
          )}

          {activeConversation && (
            <div className="ms-auto shrink-0">
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
          ) : isEmpty ? (
            /* CHAT WITH NO MESSAGE (MASTER Μέρος 14.2, 2026-10-07): «στο
               κέντρο η γη του Ionexa με τον χαιρετισμό, και από κάτω το
               πεδίο. Όχι άλλο εικονίδιο, όχι κάρτες, όχι λίστες.» The
               earth and the greeting sit at the foot of this area, the
               field follows, and a spacer of the same height under the
               field puts the three together in the middle of the screen.
               What used to be here moved, nothing was removed: what the
               AI can see is the «?» in the bar above (HelpTip, scopeKey
               dashboard.chat.dataScope), and the examples are on Home. */
            <div data-testid="chat-empty" className="mx-auto flex min-h-full max-w-md flex-col items-center justify-end pb-2 text-center">
              <Earth variant="small" px={96} />
              <h1
                className="mt-4 break-words text-2xl font-semibold tracking-tight text-foreground"
                suppressHydrationWarning
              >
                {tPromise(`greeting.${dayPart}`)}
                {greeting ? `, ${greeting}` : ""}
              </h1>
            </div>
          ) : (
            /* NO BUBBLE ON THE ANSWER — V4.6 #12.
               The reply used to sit in `rounded-card border border-border
               bg-panel`, an opaque card that covered the backdrop the
               product is built around. The answer is the page; a card
               around it says the page is a container for messages.
               So the assistant's text now paints straight onto the
               backdrop and the globe is behind it, which is what makes
               the contrast measurement in
               scripts/tests/chat-measure.prodtest.mjs necessary rather
               than decorative: nine points, and if any of them falls
               below 4.5:1 the fix is to dim the GLOBE, never the text.
               That is also why `text-foreground/90` is gone — a 90%
               foreground is dimmed text, which is exactly the move the
               brief forbids.

               THE PERSON KEEPS A GROUND, because without one there is
               nothing to tell a question from an answer once both are
               bare text on the same surface. It is a quiet one: the
               panel colour with an accent EDGE, not the filled
               `bg-button text-button-ink` slab it was. Opaque on purpose
               — a translucent tint over a moving wireframe is a
               contrast figure that changes with the pixel underneath.

               THE SPACING DOES WHAT THE BORDER DID. The AI Act notice,
               the sources line and the "listen" control sat inside the
               card so they could not be read as belonging to the next
               message. With no card, the gap between turns (space-y-8)
               is larger than the gap inside one (mt-2), which is the
               same signal without the box. */
            <div className="chat-measure space-y-8">
              {messages.map((msg) =>
                msg.role === "user" ? (
                  <div key={msg.id} className="flex justify-end">
                    {/* ON A SURFACE AGAIN, by the owner's design of
                        2026-10-04 (docs/CONTEXT.md, «ΣΥΝΟΜΙΛΙΑ»: «Το
                        μήνυμα του χρήστη δεξιά, σε επιφάνεια #0D1220»).
                        What was asked to go in September was the FRAME —
                        a border around half the conversation; this is a
                        fill with no border, and the answer stays bare.
                        The 85% cap comes back with the surface, so a
                        long question does not paint the whole pane. */}
                    <div className="flex w-full min-w-0 flex-col items-end">
                      <SentAttachments attachments={msg.attachments} previews={msg.previews} />
                      <div className="min-w-0 max-w-[85%] whitespace-pre-wrap rounded-card bg-panel px-4 py-2.5 text-foreground">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={msg.id}>
                    {/* THE GROUND UNDER THE ANSWER — V4.6, decided
                        2026-09-04 from the screenshots: `dim`. A 62%
                        page-colour pane over the answer's own rectangle,
                        no blur (no GPU cost on a phone), the globe
                        crisp around the text and quiet under it. Same
                        measured contrast as `shadow` (worst 6.57:1 dark,
                        7.73:1 light), cheaper. The other two classes
                        stay in globals.css for the prodtest to keep
                        measuring; nothing else ships them. */}
                    <div className="chat-ground-dim min-w-0 flex-1 text-foreground">
                      <MessageContent content={msg.content} className="leading-relaxed" />
                      {/* NUMBERED WEB SOURCES — only when the answer searched
                          the web; the numbers in the prose above link here. */}
                      <SourceCards content={msg.content} />
                      {/* THE ROW UNDER THE ANSWER (ΣΥΣΤΗΜΑ DESIGN §5): the
                          26px earth, copy, the thumbs, again
                          (components/chat/answer-actions.tsx). Again only
                          under the latest answer, and not while one is
                          being written. */}
                      <AnswerActions
                        key={`${msg.id}:${msg.rating ?? 0}`}
                        messageId={msg.id}
                        text={msg.content}
                        rating={msg.rating === 1 || msg.rating === -1 ? msg.rating : null}
                        persisted={PERSISTED_ID.test(msg.id)}
                        still={sending || msg.id !== lastAnswerId}
                        onRetry={!sending && msg.id === lastAnswerId && retryText ? () => void handleSend(retryText) : undefined}
                        onRated={(rating) => setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, rating } : x)))}
                      />
                      {/* THE CARD THAT REOPENS THE WORK AREA (§5), on an
                          answer that produced something. */}
                      {workItems.get(msg.id) && (
                        <ResultCard
                          item={workItems.get(msg.id)!}
                          open={openWorkId === msg.id}
                          onOpen={() => setOpenWorkId((id) => (id === msg.id ? null : msg.id))}
                        />
                      )}
                      {/* "LISTEN" — on the finished answer only. Never on
                          the one still streaming: half a sentence read
                          aloud is a clip charged for text that changed a
                          second later. */}
                      <div className="mt-1">
                        <VoicePlayer text={msg.content} compact />
                      </div>
                      {/* WHERE IT CAME FROM — V4.6 #9. Only on messages
                          that carried one: a reply reloaded from the
                          database has it only when the row kept it (the
                          switch "chat-attachments", package 9), and
                          inventing an empty one would render a source line
                          under an answer whose sources nobody recorded. */}
                      {/* WHERE THE ANSWER POINTS — a button, not an
                          instruction. Free: lib/transitions/
                          destinations.ts is a fold and a regex, so this
                          costs nothing and adds no latency. On the
                          finished answer only, for the same reason
                          "Listen" is: half a sentence points nowhere. */}
                      <TransitionButton text={msg.content} />
                      <ProvenanceLine provenance={msg.provenance} />
                      {/* WHICH REMEMBERED THINGS IT USED (package 9): the
                          ones the answer named, not all that were in front
                          of it (lib/chat/memory-citations.ts). */}
                      <MemoriesUsed memories={msg.memoriesUsed} />
                      {/* What the answer did, step by step — only on an
                          answer that searched, and only in this page:
                          a reloaded conversation has none (not stored). */}
                      <AiJobTimeline job={{ kind: "chat", timeline: msg.timeline }} labelFor={chatStepLabel} />
                      {/* EU AI Act art. 50 — on the reply itself, not in
                          metadata. */}
                      <AiGeneratedNotice />
                    </div>
                  </div>
                )
              )}

              {sending && (
                <div>
                  {streamingText !== null ? (
                    <div className="chat-ground-dim min-w-0 flex-1 text-foreground">
                      {chatTimelineWorthShowing(liveTimeline) && (
                        <AiJobTimeline job={{ kind: "chat", timeline: liveTimeline }} labelFor={chatStepLabel} defaultOpen className="mb-2" />
                      )}
                      <MessageContent content={streamingText} className="leading-relaxed" />
                      <AnswerActions messageId="streaming" text={streamingText} persisted={false} working />
                      <AiGeneratedNotice />
                    </div>
                  ) : chatTimelineWorthShowing(liveTimeline) ? (
                    <AiJobTimeline job={{ kind: "chat", timeline: liveTimeline }} labelFor={chatStepLabel} defaultOpen className="py-1" />
                  ) : (
                    <AiActivity kind="chat" className="py-1" />
                  )}
                </div>
              )}

              {/* THE QUESTION, WHERE THE ANSWER WOULD HAVE BEEN. Same
                  component the website builder, agents and automations
                  use, so a person meets one shape of question across the
                  product rather than four. */}
              {clarify && !sending && (
                <div data-testid="chat-clarify">
                  <div className="min-w-0">
                    <ClarificationQuestions
                      questions={clarify.questions}
                      suggestions={clarify.suggestions}
                      submitting={sending}
                      title={t("clarificationTitle")}
                      skipLabel={t("clarificationSkip")}
                      continueLabel={t("clarificationContinue")}
                      answerPlaceholder={t("clarificationAnswerPlaceholder")}
                      onAnswer={(answers) =>
                        void handleSend(
                          appendClarificationAnswers(clarify.text, clarify.questions, answers)
                        )
                      }
                      // SKIP RESENDS THE SAME TEXT WITH THE CHECK OFF. It
                      // has to carry the flag: the conversation still has
                      // no history, so without it the identical message
                      // meets the identical question for ever.
                      onSkip={() => void handleSend(clarify.text, { skipClarification: true })}
                    />
                  </div>
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
            className="absolute bottom-3 left-1/2 z-10 inline-flex min-h-[44px] -translate-x-1/2 items-center gap-1.5 rounded-full border border-foreground/40 bg-panel px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:border-foreground/40 hover:bg-foreground/10"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            {tCommon("newMessagesBelow")}
          </button>
        )}
        </div>

        <div className={`p-4 sm:p-6 ${isEmpty ? "" : "border-t border-border"}`}>
          {/* THE COMPOSER SHARES THE THREAD'S MEASURE. It was
              `max-w-2xl` while the thread was too, so they lined up by
              coincidence rather than by construction; the moment the
              thread's cap became a character count they would have
              drifted apart at every breakpoint. One class, one rule. */}
          <div className="chat-measure">
            {/* THE ROW OVER THE FIELD, only once there is a conversation
                or a mode is already on: the empty Chat is the earth, the
                greeting and the field (MASTER 14.2). A mode chosen on the
                way in (?mode=, ?preset=) stays visible, because it is
                sent with the first message and must be clearable. */}
            {(!isEmpty || workMode || mentorMode) && (
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              {workMode && (
                <button
                  type="button"
                  onClick={() => setWorkMode(null)}
                  aria-label={t("workMode.clear")}
                  data-testid="work-mode-chip"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-foreground/60 bg-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-foreground/15"
                >
                  {t("workMode.active", { mode: tModes(workMode) })}
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setMentorMode((v) => !v)}
                aria-pressed={mentorMode}
                title={t("mentorModeHint")}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  mentorMode
                    ? "border-foreground/60 bg-foreground/10 text-foreground"
                    : "border-border text-muted hover:border-foreground/40 hover:text-foreground"
                }`}
              >
                <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                {t("mentorMode")}
              </button>
            </div>
            )}
            {error && (
              <p
                className={`mb-3 rounded-card border px-3 py-2 text-xs ${
                  isRateLimitNotice
                    ? "border-border bg-foreground/5 text-foreground"
                    : "border-danger/40 bg-danger/10 text-danger"
                }`}
              >
                {error}
              </p>
            )}
            {stoppedNote && (
              <p className="mb-3 text-[11px] text-muted" data-testid="chat-stopped-note">
                {t("stopped")}
              </p>
            )}
            {/* THE SITE, PUT ASIDE ON A PHONE: back to the conversation keeps
                it open, so the next sentence still changes it, and one press
                shows it again (package 7). */}
            {siteBrief !== null && siteHidden && (
              <button type="button" onClick={() => setSiteHidden(false)} data-testid="chat-site-reopen" className="chip-link mb-3">
                {t("sitePane.reopen")}
              </button>
            )}
            <ChatComposer
              ref={composerRef}
              sending={sending}
              onSend={(text) => void handleSend(text)}
              onStop={stopGeneration}
              initialText={composerInitialText}
              attach={attachments ? { accept: CHAT_ACCEPT, label: t("attach.label"), onFiles: attach.add } : undefined}
              tray={attachments ? <AttachmentTray items={attach.items} onRemove={attach.remove} holdReason={attach.holdReason} /> : undefined}
              holdSend={attachments && attach.hold}
              beside={
                /* PRESS ONCE, THEN TALK (#2), INSIDE THE FIELD beside the
                   microphone since 2026-10-07 (MASTER 13.2: «Δεύτερο
                   κουμπί δίπλα στο μικρόφωνο»). DRAWN ONLY WHEN IT CAN
                   START: the hands-free loop needs BOTH keys,
                   transcription (OPENAI_API_KEY) and speech
                   (ELEVENLABS_API_KEY), the plan and minutes left. Until
                   2026-10-05 it was drawn inert with the reason under it;
                   the owner's rule since (the voice brief «ΦΩΝΗ ΣΤΟ
                   CHAT», Μέρος Α) is «Κουμπί που δεν κάνει τίποτα δεν
                   μένει στην οθόνη», and scenario 11 names this button.
                   The reason lives on the Voice settings screen. Held by
                   scripts/tests/chat-dictation.prodtest.mjs. */
                talkAvailable && (
                  <button
                    type="button"
                    onClick={() => setTalking(true)}
                    disabled={sending}
                    aria-label={tVoice("conversation.start")}
                    title={tVoice("conversation.start")}
                    data-testid="voice-conversation-start"
                    className="flex h-11 w-11 items-center justify-center rounded-item text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <AudioLines className="h-4 w-4" aria-hidden="true" />
                  </button>
                )
              }
            >
              {largeMessageCredits !== null && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                  <Zap className="h-3 w-3 text-foreground/80" aria-hidden="true" />
                  {tFree("largeMessage", { count: largeMessageCredits })}
                </p>
              )}
              {freeRemaining !== null && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                  <Gift className="h-3 w-3 text-success/80" aria-hidden="true" />
                  {freeRemaining > 0
                    ? tFree("remaining", { count: freeRemaining })
                    : tFree("exhausted")}
                </p>
              )}
            </ChatComposer>
          </div>
        </div>
        {/* The same height as the thread area above while Chat is empty,
            so the earth, the greeting and the field sit together in the
            middle of the screen (MASTER 14.2). */}
        {isEmpty && <div className="min-h-0 flex-1" aria-hidden="true" />}
      </div>

      {openWorkItem && <WorkArea item={openWorkItem} onClose={() => setOpenWorkId(null)} />}
      {siteBrief !== null && (
        <SitePane
          ref={sitePaneRef}
          key={siteBrief}
          brief={siteBrief}
          wall={siteWall}
          hidden={siteHidden}
          onBack={() => setSiteHidden(true)}
          onClose={() => setSiteBrief(null)}
        />
      )}

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

// A `timeline` or `done` frame's steps, kept only when every one is a
// well-formed chat step — a frame from an older server, or anything
// else, is dropped rather than drawn.
function keepChatSteps(raw: unknown): ClientStep[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const steps = raw.filter(
    (s): s is ClientStep =>
      !!s &&
      typeof s === "object" &&
      typeof (s as ClientStep).step === "number" &&
      readChatStepFrame({ label: (s as ClientStep).label, at: (s as ClientStep).startedAt }) !== null
  );
  return steps.length === raw.length ? steps : undefined;
}
