"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Clock, X } from "lucide-react";
import { HelpTip } from "@/components/ui/help-tip";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useCredits } from "@/components/credits/credits-context";
import { getErrorMessage } from "@/lib/get-error-message";
import { ShellHistoryColumn } from "@/components/shell/shell-history-column";
import { MyStuffList } from "@/components/my-stuff/my-stuff-list";
import { MyStuffDetails } from "@/components/my-stuff/my-stuff-details";
import type { MyStuffItem } from "@/lib/my-stuff/load";
import type { MyStuffKind } from "@/lib/my-stuff/sources";
import type { MyStuffCitation, MyStuffSession, MyStuffSessionTurn } from "@/lib/my-stuff/types";
import { KIND_ICON } from "@/components/my-stuff/kind-icon";

/**
 * «1. MY STUFF: ΝΕΑ ΟΘΟΝΗ» (the owner's message, 2026-10-28) — Κομμάτι 1:
 * THE SCREEN ITSELF, list on the left, details on the right, full width.
 * REPLACES my-stuff-shell.tsx (gone): that file put this same account's
 * data behind a chat-first shell with Browse as a side panel; the owner's
 * new screen wants the browser to be the primary thing, not a drawer over
 * a conversation. See docs/NEEDS-FROM-ELIAS.md for the full account of
 * what this does and does not carry over unchanged from the old screen.
 *
 * Κομμάτι 2 wires the field's second half: submitting it (not typing —
 * typing still only filters the list, unchanged) asks /api/my-stuff/ask
 * and shows the answer in a card above the list, with the same citation
 * chips the old shell drew. The session it belongs to is appended to
 * `sessions` as it happens, so the history drawer and a freshly asked
 * question are never out of step with each other.
 */
function CitationChips({ citations }: { citations: MyStuffCitation[] }) {
  const t = useTranslations("dashboard.myStuff");
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5" data-testid="my-stuff-citations">
      {citations.map((c, ci) => {
        const Icon = KIND_ICON[c.kind];
        return (
          <li key={`${c.kind}-${c.id}-${ci}`}>
            <Link
              href={c.href}
              data-testid="my-stuff-citation"
              data-kind={c.kind}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-panel px-3 text-xs text-muted hover:bg-panel-hover hover:text-foreground"
            >
              <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="max-w-[12rem] truncate">{c.title || t(`kinds.${c.kind}`)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
export function MyStuffWorkspace({
  initialItems,
  initialFailed,
  initialSessions,
  initialQuery,
}: {
  initialItems: MyStuffItem[];
  initialFailed: MyStuffKind[];
  initialSessions: MyStuffSession[];
  /** A quick-job tile's example text (lib/nav/quick-jobs.ts), already
   *  applied to `initialItems` server-side — kept here only so the search
   *  box shows what it is filtering on, not a blank field over a filtered
   *  list. */
  initialQuery?: string;
}) {
  const t = useTranslations("dashboard.myStuff");
  const { refresh: refreshCredits } = useCredits();

  const [items, setItems] = useState<MyStuffItem[]>(initialItems);
  const [failed, setFailed] = useState<MyStuffKind[]>(initialFailed);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [selected, setSelected] = useState<MyStuffItem | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<MyStuffSession[]>(initialSessions);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  // THE ASKING HALF (Κομμάτι 2). `currentSessionId` is which session a
  // fresh answer binds to — null starts a new one, the same rule
  // api/my-stuff/ask itself already applies server-side. Asking again
  // while `answer` is still showing CONTINUES that session, exactly the
  // way the old chat shell's thread did.
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ question: string; text: string; citations: MyStuffCitation[] } | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const askAbort = useRef<AbortController | null>(null);

  function askRefusal(code: unknown): string {
    switch (code) {
      case "empty":
        return t("errors.empty");
      case "too_long":
        return t("errors.tooLong");
      case "insufficient_credits":
      case "reserve_failed":
        return t("errors.insufficient");
      case "rate_limited":
      case "bypass_ceiling":
        return t("errors.rateLimited");
      case "ai_unavailable":
        return t("errors.unavailable");
      case "stopped":
        return t("errors.stopped");
      default:
        return t("errors.failed");
    }
  }

  async function ask(question: string) {
    if (asking) return;
    setAsking(true);
    setAskError(null);
    const controller = new AbortController();
    askAbort.current = controller;
    try {
      const res = await fetch("/api/my-stuff/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ question, sessionId: currentSessionId }),
      });
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      void refreshCredits();
      if (!res.ok || !data?.ok) {
        setAskError(askRefusal(data?.error));
        return;
      }
      const sessionId = String(data.sessionId ?? "") || null;
      const citations = Array.isArray(data.citations) ? (data.citations as MyStuffCitation[]) : [];
      const answerText = String(data.answer ?? "");
      setAnswer({ question, text: answerText, citations });
      setCurrentSessionId(sessionId);
      if (sessionId) {
        const userTurn: MyStuffSessionTurn = { role: "user", text: question };
        const toolTurn: MyStuffSessionTurn = { role: "tool", text: answerText, citations };
        setSessions((prev) => {
          const existing = prev.find((s) => s.id === sessionId);
          if (existing) return prev.map((s) => (s.id === sessionId ? { ...s, turns: [...s.turns, userTurn, toolTurn] } : s));
          return [{ id: sessionId, title: question.slice(0, 120), turns: [userTurn, toolTurn] }, ...prev];
        });
      }
    } catch (err) {
      if (!controller.signal.aborted) setAskError(getErrorMessage(err, t("errors.offline")));
    } finally {
      if (askAbort.current === controller) askAbort.current = null;
      setAsking(false);
    }
  }

  // THE SAME DEBOUNCED READ my-stuff-browse.tsx already had — unchanged
  // contract (/api/my-stuff/browse), just a new place to call it from.
  // THE FIRST RUN IS SKIPPED: the server already sent `initialItems` for
  // an empty query, so refetching it here would be a second round trip
  // for the exact same answer, on every single visit.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    fetch(`/api/my-stuff/browse?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { ok?: boolean; items?: MyStuffItem[]; failed?: MyStuffKind[] }) => {
        if (data.ok && Array.isArray(data.items)) setItems(data.items);
        if (data.ok && Array.isArray(data.failed)) setFailed(data.failed);
      })
      .catch(() => {
        // Left as the previous list — a failed read is not "nothing here".
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  // A SELECTION THAT NO LONGER MATCHES THE LIST (a new search ran) is
  // cleared rather than left pointing at a row the screen no longer
  // shows — the right column must never describe something the left
  // column does not.
  useEffect(() => {
    if (selected && !items.some((i) => i.key === selected.key)) setSelected(null);
  }, [items, selected]);

  const openSession = sessions.find((s) => s.id === openSessionId) ?? null;

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="my-stuff-workspace">
      <div className="flex items-center gap-2 px-4 py-2">
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          aria-label={t("history.show")}
          data-testid="my-stuff-history-open"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"
        >
          <Clock className="h-4 w-4" aria-hidden="true" />
        </button>
        <h1 className="min-w-0 break-words text-sm font-semibold text-foreground">{t("name")}</h1>
        <HelpTip helpKey="help.myStuff" />
      </div>

      {failed.length > 0 && (
        <p role="status" className="mx-4 mb-2 text-xs text-foreground" data-testid="my-stuff-failed">
          {t("browse.failed", { kinds: failed.map((k) => t(`kinds.${k}`)).join(", ") })}
        </p>
      )}

      {/* THE ANSWER, ABOVE THE LIST — never inside it, and never replacing
          it: the list keeps showing whatever the typed text filters to,
          the same as before this card existed. */}
      {(asking || answer || askError) && (
        <div className="surface-tight mx-4 mb-2 space-y-2" data-testid="my-stuff-answer">
          {asking ? (
            <span className="inline-flex items-center gap-2 text-xs text-muted">
              <ThinkingIndicator size="sm" />
              {t("working")}
            </span>
          ) : askError ? (
            <p role="alert" className="text-sm text-warning">
              {askError}
            </p>
          ) : (
            answer && (
              <>
                <p className="break-words text-xs text-muted">{answer.question}</p>
                <p className="whitespace-pre-wrap break-words text-sm text-foreground">{answer.text}</p>
                {answer.citations.length > 0 && <CitationChips citations={answer.citations} />}
              </>
            )
          )}
          {!asking && (answer || askError) && (
            <button
              type="button"
              onClick={() => {
                setAnswer(null);
                setAskError(null);
              }}
              data-testid="my-stuff-answer-dismiss"
              className="text-xs text-muted underline hover:text-foreground"
            >
              {t("ask.dismiss")}
            </button>
          )}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden border-t border-divider">
        {/* LIST: full width on a phone, 360px on a computer. Hidden on a
            phone once something is selected — the details pane covers it
            full-screen instead, with a back arrow, not a second column
            squeezed beside it (there is no room for both on 390px). */}
        <div className={`h-full min-h-0 w-full shrink-0 border-e border-divider lg:w-[360px] ${selected ? "hidden lg:block" : ""}`}>
          <MyStuffList
            items={items}
            loading={loading}
            query={query}
            onQueryChange={setQuery}
            onAsk={ask}
            asking={asking}
            selectedKey={selected?.key ?? null}
            onSelect={setSelected}
          />
        </div>

        {/* DETAILS: the rest of the width on a computer; on a phone, only
            drawn (full-screen, with the back arrow below) once something
            is selected — an empty details pane on a 390px screen with
            nothing chosen yet is wasted space, not a feature. */}
        <div className={`h-full min-h-0 flex-1 ${selected ? "" : "hidden lg:block"}`}>
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label={t("details.back")}
              data-testid="my-stuff-details-back"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <MyStuffDetails item={selected} />
        </div>

        {historyOpen && (
          <>
            <div
              data-testid="my-stuff-history"
              className="absolute inset-y-0 end-0 z-30 flex w-[85%] max-w-[360px] flex-col bg-background"
            >
              <div className="flex shrink-0 items-center justify-between px-3 py-2">
                <h2 className="text-sm font-medium text-foreground">{t("history.title")}</h2>
                <button
                  type="button"
                  onClick={() => {
                    setHistoryOpen(false);
                    setOpenSessionId(null);
                  }}
                  aria-label={t("history.hide")}
                  data-testid="my-stuff-history-close"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {openSession ? (
                  <div className="flex h-full flex-col">
                    <button
                      type="button"
                      onClick={() => setOpenSessionId(null)}
                      data-testid="my-stuff-history-back"
                      className="flex min-h-[44px] shrink-0 items-center gap-1.5 px-3 text-sm text-muted hover:text-foreground"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("history.back")}
                    </button>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-3" data-testid="my-stuff-history-turns">
                      {openSession.turns.map((turn, i) => (
                        <div key={i} className={turn.role === "user" ? "text-foreground" : "text-body"}>
                          <p className="whitespace-pre-wrap break-words text-sm">{turn.text}</p>
                          {turn.citations && turn.citations.length > 0 && <CitationChips citations={turn.citations} />}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ShellHistoryColumn
                    rows={sessions.map((s) => ({ id: s.id, title: s.title }))}
                    activeId={openSessionId}
                    onOpen={setOpenSessionId}
                  />
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label={t("history.hide")}
              onClick={() => {
                setHistoryOpen(false);
                setOpenSessionId(null);
              }}
              className="absolute inset-0 z-20 bg-background/50"
            />
          </>
        )}
      </div>
    </div>
  );
}
