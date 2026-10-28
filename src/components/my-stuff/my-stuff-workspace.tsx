"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Clock, X } from "lucide-react";
import { HelpTip } from "@/components/ui/help-tip";
import { ShellHistoryColumn } from "@/components/shell/shell-history-column";
import { MyStuffList } from "@/components/my-stuff/my-stuff-list";
import { MyStuffDetails } from "@/components/my-stuff/my-stuff-details";
import type { MyStuffItem } from "@/lib/my-stuff/load";
import type { MyStuffKind } from "@/lib/my-stuff/sources";
import type { MyStuffSession } from "@/lib/my-stuff/types";
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
 * THE Q&A FIELD IS NOT WIRED TO ANSWER YET — that is Κομμάτι 2's own
 * piece ("Ένα πεδίο για αναζήτηση ΚΑΙ ερωτήσεις"), the same field as the
 * search box below, not a second one. What IS kept here, so asking a
 * question is never further away than before this round started: every
 * past Q&A session (my_stuff_sessions, unchanged) is still readable, in
 * the history drawer the [◧] button opens.
 */
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

  const [items, setItems] = useState<MyStuffItem[]>(initialItems);
  const [failed, setFailed] = useState<MyStuffKind[]>(initialFailed);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [selected, setSelected] = useState<MyStuffItem | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions] = useState<MyStuffSession[]>(initialSessions);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

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
                          {turn.citations && turn.citations.length > 0 && (
                            <ul className="mt-1.5 flex flex-wrap gap-1.5">
                              {turn.citations.map((c, ci) => {
                                const Icon = KIND_ICON[c.kind];
                                return (
                                  <li key={`${c.kind}-${c.id}-${ci}`}>
                                    <a
                                      href={c.href}
                                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-panel px-3 text-xs text-muted hover:bg-panel-hover hover:text-foreground"
                                    >
                                      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                                      <span className="max-w-[12rem] truncate">{c.title || t(`kinds.${c.kind}`)}</span>
                                    </a>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
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
