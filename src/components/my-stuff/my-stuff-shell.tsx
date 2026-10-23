"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Code2,
  DollarSign,
  FileText,
  Globe,
  MessageCircle,
  Megaphone,
  Paperclip,
  Presentation,
  Search,
  Telescope,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { HelpTip } from "@/components/ui/help-tip";
import { useCredits } from "@/components/credits/credits-context";
import { ToolShell, type ShellTurn } from "@/components/shell/tool-shell";
import { ShellHistoryColumn } from "@/components/shell/shell-history-column";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import type { MyStuffKind } from "@/lib/my-stuff/sources";
import { MyStuffBrowse } from "@/components/my-stuff/my-stuff-browse";

/** Shared with my-stuff-browse.tsx, which is its own file so that its
 *  search field is not read as a second thing to type into alongside
 *  the shell's own field (scripts/tests/tool-shell.test.mjs). */
export const KIND_ICON: Record<MyStuffKind, LucideIcon> = {
  site: Globe,
  slides: Presentation,
  posts: Megaphone,
  document: FileText,
  research: Telescope,
  analysis: BarChart3,
  file: Paperclip,
  chat: MessageCircle,
  coding: Code2,
  finance: DollarSign,
  sales: Users,
  trading: TrendingUp,
};

export type MyStuffCitation = { kind: MyStuffKind; id: string; title: string; href: string };
export type MyStuffSessionTurn = { role: "user" | "tool"; text: string; citations?: MyStuffCitation[] };
export type MyStuffSession = { id: string; title: string; turns: MyStuffSessionTurn[] };

/**
 * «ΤΑ ΔΙΚΑ ΜΟΥ» (the owner's message, 2026-10-22) — ONE TOOL, the same
 * ToolShell shape as every other tool built this week: empty landing with
 * the small globe, conversation on the left, work on the right, [◧]
 * history, "Νέο". READ-ONLY — every answer is read from the account's own
 * rows (src/lib/my-stuff/ask-store.ts), nothing here writes to Finances,
 * Sales, Trading or any of the other nine kinds.
 *
 * THE SEARCH + FILTER BROWSE MODE lives in the `work` panel, opened by the
 * one option chip under the field — a simpler, non-AI surface over the
 * exact same lib/my-stuff/load.ts the Library's own search already proves
 * out, for whoever wants to look rather than ask.
 */
export function MyStuffShell({ initialSessions }: { initialSessions: MyStuffSession[] }) {
  const t = useTranslations("dashboard.myStuff");
  const { refresh: refreshCredits } = useCredits();
  const composerRef = useRef<ChatComposerHandle>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [sessions, setSessions] = useState<MyStuffSession[]>(initialSessions);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    try {
      setHistoryOpen(window.localStorage.getItem("ionexa.myStuffHistoryColumn") === "open");
    } catch {
      // private window or storage off: closed, which is the default
    }
  }, []);
  function toggleHistory() {
    setHistoryOpen((isOpen) => {
      const next = !isOpen;
      try {
        window.localStorage.setItem("ionexa.myStuffHistoryColumn", next ? "open" : "closed");
      } catch {
        // nothing to persist to; the toggle still works for this visit
      }
      return next;
    });
  }

  const openSession = sessions.find((s) => s.id === openId) ?? null;
  const turns: MyStuffSessionTurn[] = openSession?.turns ?? [];

  async function send(text: string) {
    if (sending || !text.trim()) return;
    setSending(true);
    setErrorText(null);
    const controller = new AbortController();
    abortRef.current = controller;
    // Shown at once, before the answer — the same optimistic turn every
    // ToolShell tool draws (AutomationShell's `say("user", text)`).
    const provisional: MyStuffSessionTurn = { role: "user", text };
    setSessions((prev) => {
      if (openId) return prev.map((s) => (s.id === openId ? { ...s, turns: [...s.turns, provisional] } : s));
      const draft: MyStuffSession = { id: "__draft__", title: text.slice(0, 120), turns: [provisional] };
      return [draft, ...prev];
    });

    try {
      const response = await fetch("/api/my-stuff/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ question: text, sessionId: openId }),
      });
      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      void refreshCredits();
      if (!response.ok || !data?.ok) {
        setErrorText(t(refusalKey(String(data?.error ?? ""))));
        // The optimistic turn stays — the person's own question is not
        // lost because the answer failed — but the draft session that
        // never got a real id is dropped rather than kept as a ghost.
        setSessions((prev) => prev.filter((s) => s.id !== "__draft__"));
        return;
      }
      const sessionId = String(data.sessionId ?? "");
      const toolTurn: MyStuffSessionTurn = {
        role: "tool",
        text: String(data.answer ?? ""),
        citations: Array.isArray(data.citations) ? (data.citations as MyStuffCitation[]) : [],
      };
      setSessions((prev) => {
        const withoutDraft = prev.filter((s) => s.id !== "__draft__" || s.id === sessionId);
        const existing = withoutDraft.find((s) => s.id === sessionId);
        if (existing) {
          return withoutDraft.map((s) => (s.id === sessionId ? { ...s, turns: [...s.turns, toolTurn] } : s));
        }
        return [{ id: sessionId, title: text.slice(0, 120), turns: [provisional, toolTurn] }, ...withoutDraft];
      });
      setOpenId(sessionId || null);
    } catch {
      if (!controller.signal.aborted) setErrorText(t("errors.offline"));
      setSessions((prev) => prev.filter((s) => s.id !== "__draft__"));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
  }

  function refusalKey(code: string): string {
    switch (code) {
      case "empty":
        return "errors.empty";
      case "too_long":
        return "errors.tooLong";
      case "insufficient_credits":
      case "reserve_failed":
        return "errors.insufficient";
      case "rate_limited":
      case "bypass_ceiling":
        return "errors.rateLimited";
      case "ai_unavailable":
        return "errors.unavailable";
      case "stopped":
        return "errors.stopped";
      default:
        return "errors.failed";
    }
  }

  async function removeSession(id: string) {
    const response = await fetch(`/api/my-stuff/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) return;
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (openId === id) setOpenId(null);
  }

  const shellTurns: ShellTurn[] = turns.map((turn, i) => ({
    id: `${openId ?? "draft"}-${i}`,
    role: turn.role,
    text: turn.text,
    extra: turn.citations && turn.citations.length > 0 ? <CitationList citations={turn.citations} /> : undefined,
  }));

  return (
    <ToolShell
      ref={composerRef}
      name={t("name")}
      help={<HelpTip helpKey="help.myStuff" />}
      turns={shellTurns}
      working={
        sending ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <ThinkingIndicator size="sm" />
            {t("working")}
          </span>
        ) : null
      }
      placeholder={t("placeholder")}
      sending={sending}
      onSend={send}
      onStop={() => abortRef.current?.abort()}
      footer={errorText ? <p role="alert" className="mt-1.5 text-[11px] text-warning">{errorText}</p> : undefined}
      options={[
        <button
          key="browse"
          type="button"
          onClick={() => setBrowseOpen(true)}
          data-testid="my-stuff-browse-open"
          className="chip-link gap-1.5"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          {t("browse.open")}
        </button>,
      ]}
      empty={{
        heading: t("empty.heading"),
        examples: [
          { key: "finance", label: t("empty.examples.finance") },
          { key: "site", label: t("empty.examples.site") },
          { key: "trading", label: t("empty.examples.trading") },
        ],
      }}
      history={{
        open: historyOpen,
        onToggle: toggleHistory,
        onNew: () => setOpenId(null),
        newLabel: t("new"),
        column: (
          <ShellHistoryColumn
            rows={sessions.filter((s) => s.id !== "__draft__").map((s) => ({ id: s.id, title: s.title }))}
            activeId={openId}
            onOpen={(id) => setOpenId(id)}
            onDelete={removeSession}
            onNavigate={() => {
              if (typeof window !== "undefined" && window.innerWidth < 768) toggleHistory();
            }}
          />
        ),
      }}
      work={
        browseOpen
          ? { title: t("browse.title"), body: <MyStuffBrowse /> }
          : null
      }
      onCloseWork={() => setBrowseOpen(false)}
    />
  );
}

function CitationList({ citations }: { citations: MyStuffCitation[] }) {
  const t = useTranslations("dashboard.myStuff");
  return (
    <ul data-testid="my-stuff-citations" className="mt-2 flex flex-wrap gap-1.5">
      {citations.map((c, i) => {
        const Icon = KIND_ICON[c.kind];
        return (
          <li key={`${c.kind}-${c.id}-${i}`}>
            <Link
              href={c.href}
              data-testid="my-stuff-citation"
              data-kind={c.kind}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-panel px-3 text-xs text-muted hover:bg-panel-hover hover:text-foreground"
            >
              <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="max-w-[16rem] truncate">{c.title || t(`kinds.${c.kind}`)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

