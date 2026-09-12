"use client";

// EVERY LINE THE CHAT KEPT, WITH A ✕ BESIDE IT.
//
// Three things were missing and they are one screen: seeing a remembered
// fact, removing ONE of them, and correcting one. The third has no UPDATE
// behind it and should not: chat_memory has a select, an insert and a
// delete policy and no update policy at all, so nothing a browser session
// does can rewrite a stored fact into something else. Correcting is
// therefore delete-then-insert — which is the honest shape anyway, since
// the corrected line is a new claim with a new date — and it is offered as
// ONE button so the person does not have to know that.
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Check, MessageSquare, Pencil, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";
import { formatDate } from "@/lib/format-number";
import { memoryFold } from "@/lib/chat/memory-fold";

export type RememberedRow = {
  id: string;
  text: string;
  timesSeen: number;
  createdAt: string;
  lastSeenAt: string;
  confirmed: boolean;
  conversationId: string | null;
};

export function AiMemoryList({
  rows: initialRows,
  prunableIds,
  windowSize,
}: {
  rows: RememberedRow[];
  prunableIds: string[];
  windowSize: number;
}) {
  const t = useTranslations("aiMemory");
  const locale = useLocale();
  const supabase = createClient();
  const { addToast } = useToast();
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [clearing, setClearing] = useState(false);

  const prunable = useMemo(() => new Set(prunableIds), [prunableIds]);
  const stillPrunable = rows.filter((r) => prunable.has(r.id)).length;

  async function deleteOne(id: string) {
    setBusyId(id);
    // ONE ROW, BY ID. The `.eq("user_id", …)` another account's id could
    // carry is not what protects this — the delete policy is
    // `auth.uid() = user_id`, so a row belonging to somebody else is not
    // deleted, it is simply not found.
    const { error } = await supabase.from("chat_memory").delete().eq("id", id);
    setBusyId(null);
    if (error) {
      addToast(t("couldNotDelete"), "error");
      return;
    }
    setRows((current) => current.filter((r) => r.id !== id));
    addToast(t("deleted"));
  }

  async function saveCorrection(row: RememberedRow) {
    const text = draft.trim();
    if (!text || text === row.text) {
      setEditingId(null);
      return;
    }
    setBusyId(row.id);
    // DELETE FIRST, and if the insert then fails the person has lost a
    // line — so the order is chosen the other way: write the new one, and
    // only remove the old one once the new one is really there.
    const { error: insertError } = await supabase.rpc("chat_memory_record", {
      p_memory_text: text,
      p_memory_fold: memoryFold(text),
      p_conversation_id: row.conversationId,
    });
    if (insertError) {
      setBusyId(null);
      addToast(t("couldNotSave"), "error");
      return;
    }
    const { error: deleteError } = await supabase.from("chat_memory").delete().eq("id", row.id);
    setBusyId(null);
    setEditingId(null);
    if (deleteError) {
      addToast(t("couldNotDelete"), "error");
      return;
    }
    setRows((current) =>
      current.map((r) =>
        r.id === row.id ? { ...r, text, timesSeen: 1, confirmed: true, lastSeenAt: new Date().toISOString() } : r
      )
    );
    addToast(t("saved"));
  }

  async function pruneOld() {
    if (!window.confirm(t("pruneConfirm", { count: stillPrunable }))) return;
    setClearing(true);
    const { data, error } = await supabase.rpc("prune_chat_memory");
    setClearing(false);
    if (error) {
      addToast(t("couldNotDelete"), "error");
      return;
    }
    setRows((current) => current.filter((r) => !prunable.has(r.id)));
    addToast(t("pruned", { count: Number(data ?? 0) }));
  }

  async function clearAll() {
    if (!window.confirm(t("clearAllConfirm"))) return;
    setClearing(true);
    const ids = rows.map((r) => r.id);
    const { error } = await supabase.from("chat_memory").delete().in("id", ids);
    setClearing(false);
    if (error) {
      addToast(t("couldNotDelete"), "error");
      return;
    }
    setRows([]);
    addToast(t("clearedAll"));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <p>
          {t("summary", { total: rows.length, window: Math.min(windowSize, rows.length) })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {stillPrunable > 0 ? (
            <button
              type="button"
              onClick={pruneOld}
              disabled={clearing}
              className="btn-secondary h-11 px-4 text-xs"
            >
              {t("pruneButton", { count: stillPrunable })}
            </button>
          ) : null}
          <button
            type="button"
            onClick={clearAll}
            disabled={clearing || rows.length === 0}
            className="btn-secondary h-11 px-4 text-xs"
          >
            <Trash2 className="me-1.5 h-4 w-4" aria-hidden="true" />
            {t("clearAll")}
          </button>
        </div>
      </div>

      {/* ONE FRAME, DIVIDED — not a border per row. design-density's
          border ceiling is a ratchet at the measured count with no slack,
          and a list of forty rows each carrying its own outline is exactly
          the creep it exists to stop. `divide-y` is the repo's own pattern
          for this and reads lighter at length. */}
      <ul className="surface divide-y divide-border p-0">
        {rows.map((row, index) => {
          const inWindow = index < windowSize;
          return (
            <li
              key={row.id}
              className="group/row p-4 transition-colors hover:bg-panel-hover"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  {editingId === row.id ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        className="input flex-1"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        aria-label={t("editLabel")}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-primary h-11 px-4 text-xs"
                          disabled={busyId === row.id}
                          onClick={() => saveCorrection(row)}
                        >
                          <Check className="me-1.5 h-4 w-4" aria-hidden="true" />
                          {t("save")}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary h-11 px-4 text-xs"
                          onClick={() => setEditingId(null)}
                        >
                          {t("cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground">{row.text}</p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    {/* "PREFERS X" AND "DID X ONCE" ARE DIFFERENT CLAIMS,
                        and this is the same distinction the prompt now
                        makes — shown here so the person can see why one
                        line carries more weight than another. */}
                    <span className={row.timesSeen > 1 ? "text-orange-300" : undefined}>
                      {row.timesSeen > 1 ? t("repeated", { count: row.timesSeen }) : t("once")}
                    </span>
                    <span>{t("learned", { date: formatDate(row.createdAt, locale) })}</span>
                    {row.lastSeenAt !== row.createdAt ? (
                      <span>{t("lastSeen", { date: formatDate(row.lastSeenAt, locale) })}</span>
                    ) : null}
                    {!inWindow ? <span title={t("outsideWindowHelp")}>{t("outsideWindow")}</span> : null}
                    {row.conversationId ? (
                      <Link
                        href={`/dashboard/chat?c=${row.conversationId}`}
                        className="inline-flex items-center gap-1 text-orange-300 hover:underline"
                      >
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("openConversation")}
                      </Link>
                    ) : (
                      <span>{t("conversationGone")}</span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={t("editLabel")}
                    title={t("editLabel")}
                    disabled={busyId === row.id}
                    onClick={() => {
                      setEditingId(row.id);
                      setDraft(row.text);
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-panel-hover hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("deleteLabel")}
                    title={t("deleteLabel")}
                    disabled={busyId === row.id}
                    onClick={() => deleteOne(row.id)}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-panel-hover hover:text-foreground"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
