"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FolderInput, MessageSquare, MoreHorizontal, Pencil, Pin, RotateCcw, Trash2 } from "lucide-react";
import { InlineTitle } from "@/components/chat/inline-title";
import { displayConversationTitle } from "@/lib/chat/conversation-title";
import { formatDate } from "@/lib/format-number";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { useToast } from "@/components/toast/toast-context";
import { discardChatImages } from "@/lib/chat/attach-client";
import {
  UNDO_WINDOW_MS,
  cancelDelete,
  conversationDeleteUrl,
  flushPendingDeletesOnUnload,
  scheduleDelete,
} from "@/lib/chat/delete-later";
import type { SidebarConversation, SidebarProject } from "@/lib/nav/recent-tools";

/**
 * THE CONVERSATIONS IN THE SIDEBAR, WHICH USED TO BE JUST NAMES.
 *
 * Before 2026-10-15 these rows were links and nothing else: to rename,
 * pin or delete a conversation you had to open Chat and then open a
 * SECOND list inside it — a second sidebar, which ΣΥΣΤΗΜΑ DESIGN §3
 * says there is not. The owner's instruction moved all of it here and
 * onto the Chats page, and the second list went. Every action it had is
 * in one of those two places; nothing it could do is gone.
 *
 * WHY EVERY ACTION GOES TO A ROUTE AND NOT TO THE DATABASE. Renaming
 * and pinning already did (api/conversations/[id] — it caps pins per
 * plan and bounds the title, which RLS has no opinion about). Deleting
 * did NOT: it was a `.delete()` from the browser, which RLS made safe
 * but which only worked on a screen that had the whole list loaded.
 * There are three such screens now, so the delete moved to the same
 * route, and «μόνο στις δικές μου συνομιλίες» is proved there against
 * two real accounts rather than assumed here.
 *
 * THE MENU IS THE SAME ON BOTH, AND SO IS THE CODE. This component is
 * the sidebar's list and the Chats page's list, because two lists with
 * the same four actions written twice is how the favourite star ended
 * up with two states that disagreed (inline-title.tsx's header records
 * that). `variant` changes the chrome, never the behaviour.
 */
export type ConversationRowsVariant = "sidebar" | "page";

export function ConversationRows({
  conversations,
  projects,
  activeId,
  variant,
  selectable = false,
  selected,
  onSelectedChange,
  onNavigate,
}: {
  conversations: readonly SidebarConversation[];
  /** The account's active projects, for «Μεταφορά σε Έργο». Read on the
   *  server (there is no GET /api/projects) and handed down. */
  projects: readonly SidebarProject[];
  activeId: string | null;
  variant: ConversationRowsVariant;
  /** The Chats page only: tick boxes for deleting several at once. */
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onSelectedChange?: (next: Set<string>) => void;
  onNavigate?: () => void;
}) {
  // THE WORDING COMES FROM WHERE IT ALREADY WAS. These actions lived in
  // components/chat/conversation-sidebar.tsx and their strings are
  // already written in ten languages under dashboard.chat.* and
  // module.*. Coining a parallel sidebar.chats.rename would have left
  // nine translations behind on a feature whose whole point is that
  // nothing it could do is lost.
  const t = useTranslations("dashboard.chat");
  const tModule = useTranslations("module");
  const tRail = useTranslations("sidebar.rail");
  // THE READER'S LANGUAGE, NOT THE MACHINE'S. A bare
  // toLocaleDateString() formats with whatever locale the browser (or,
  // worse, the server) happens to have, so a Greek reader on an English
  // laptop gets English dates in a Greek list — and the server and the
  // client can disagree, which is a hydration mismatch as well as a
  // wrong date. scripts/tests/locale-formatting.test.mjs caught exactly
  // this line.
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  // THE UNDO IS A ROW, NOT A TOAST, and that is a decision about reach
  // rather than taste. This app's toast (components/toast/toast-context)
  // carries a message and nothing else — no button — and it disappears
  // after 3.5s, which is SHORTER than the undo window: an «Αναίρεση» in
  // it would have vanished while the thing it undid was still undoable.
  // Extending the toast for one caller would change every toast in the
  // product. So the row stays where it was, greyed, and says so; on a
  // phone that also keeps the control under the thumb that just deleted
  // it, instead of at the other end of the screen.
  const [undoable, setUndoable] = useState<ReadonlySet<string>>(new Set());
  const [rows, setRows] = useState<readonly SidebarConversation[]>(conversations);
  useEffect(() => setRows(conversations), [conversations]);
  useEffect(() => flushPendingDeletesOnUnload(), []);

  const pinned = rows.filter((c) => c.is_pinned);
  const rest = rows.filter((c) => !c.is_pinned);

  const hide = (id: string) => setUndoable((prev) => new Set([...prev, id]));
  const unhide = (id: string) =>
    setUndoable((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  const forget = (id: string) => {
    unhide(id);
    setRows((prev) => prev.filter((c) => c.id !== id));
  };

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>, failure: string) => {
      try {
        const res = await fetch(conversationDeleteUrl(id), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; limit?: number };
        if (!res.ok || !json.ok) {
          // The route answers CODES, never sentences, so a Greek screen
          // never shows an English error because a route was touched.
          addToast(json.code === "pin_limit" ? t("pinLimitReached", { limit: json.limit ?? 0 }) : failure, "error");
          return false;
        }
        router.refresh();
        return true;
      } catch {
        addToast(failure, "error");
        return false;
      }
    },
    [addToast, router, t]
  );

  function rename(id: string, title: string) {
    setRenamingId(null);
    setRows((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    void patch(id, { title }, t("renameError"));
  }

  function togglePin(row: SidebarConversation) {
    setMenuFor(null);
    const next = !row.is_pinned;
    setRows((prev) => prev.map((c) => (c.id === row.id ? { ...c, is_pinned: next } : c)));
    void patch(row.id, { is_pinned: next }, t("pinError")).then((ok) => {
      if (!ok) setRows((prev) => prev.map((c) => (c.id === row.id ? { ...c, is_pinned: !next } : c)));
    });
  }

  async function moveToProject(row: SidebarConversation, projectId: string) {
    setMovingId(null);
    setMenuFor(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "chat_conversations", id: row.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; limit?: number };
      if (!res.ok || !json.ok) {
        addToast(json.error === "project_full" ? t("projectFull", { limit: json.limit ?? 0 }) : t("moveFailed"), "error");
        return;
      }
      addToast(t("moved", { project: projects.find((p) => p.id === projectId)?.name ?? "" }));
      router.refresh();
    } catch {
      addToast(t("moveFailed"), "error");
    }
  }

  function remove(row: SidebarConversation) {
    setMenuFor(null);
    if (!window.confirm(t("deleteConfirm", { title: displayConversationTitle(row.title) ?? tRail("untitledChat") }))) return;
    hide(row.id);
    scheduleDelete(row.id, () => {
      void (async () => {
        try {
          const res = await fetch(conversationDeleteUrl(row.id), { method: "DELETE" });
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; imagePaths?: string[] };
          if (!res.ok || !json.ok) {
            unhide(row.id);
            addToast(t("deleteFailed"), "error");
            return;
          }
          // The pictures that were sent in it go with it, exactly as the
          // old in-Chat delete did. A PDF is a file in Files and stays.
          void discardChatImages(json.imagePaths ?? []);
          forget(row.id);
          router.refresh();
        } catch {
          unhide(row.id);
          addToast(t("deleteFailed"), "error");
        }
      })();
    }, UNDO_WINDOW_MS);
  }

  function undo(id: string) {
    if (cancelDelete(id)) unhide(id);
  }

  // A LONG PRESS IS THE PHONE'S RIGHT-CLICK. Without it the only way
  // into the menu on a touch screen is a 44px target, and the gesture
  // people try first does nothing — the same argument inline-title.tsx
  // makes for renaming.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const startPress = (id: string) => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setMenuFor(id);
    }, 500);
  };
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const sidebar = variant === "sidebar";

  function renderRow(row: SidebarConversation) {
    const title0 = displayConversationTitle(row.title) ?? tRail("untitledChat");
    if (undoable.has(row.id)) {
      return (
        <div
          key={row.id}
          data-testid="conversation-undo"
          className="flex min-h-[44px] items-center gap-2 rounded-item px-3 py-2 text-sm text-muted"
        >
          <span className="min-w-0 flex-1 break-words line-through">{title0}</span>
          <button
            type="button"
            onClick={() => undo(row.id)}
            className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-item px-2 text-sm text-foreground underline hover:bg-panel-hover"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t("undo")}
          </button>
        </div>
      );
    }
    const isRenaming = renamingId === row.id;
    const isActive = row.id === activeId;
    const title = title0;
    return (
      // WHICH CONVERSATION THIS ROW OPENS, in the DOM. The row stopped
      // being an <a href> when the «⋯» menu arrived: a link navigates on
      // the click the browser fires at the end of a long press, which is
      // the press that opens the menu. So the href that used to say which
      // conversation a row was for is gone, and scripts/tests/
      // sidebar-density.prodtest.mjs — which checks that the newest
      // conversations are listed and that each opens ITSELF — had nothing
      // left to read and reported zero rows at every width.
      <div
        key={row.id}
        className="group/row relative flex items-center"
        data-testid="conversation-row"
        data-conversation-id={row.id}
      >
        {selectable && (
          <input
            type="checkbox"
            checked={selected?.has(row.id) ?? false}
            onChange={(e) => {
              const next = new Set(selected ?? []);
              if (e.target.checked) next.add(row.id);
              else next.delete(row.id);
              onSelectedChange?.(next);
            }}
            aria-label={t("selectOne", { title })}
            className="ms-2 h-4 w-4 shrink-0 accent-foreground"
          />
        )}
        <button
          type="button"
          onClick={() => {
            // The click the browser fires at the end of a long press
            // would navigate away from the menu that press just opened.
            if (isRenaming || longPressed.current) return;
            onNavigate?.();
            router.push(`/dashboard/chat?c=${encodeURIComponent(row.id)}`);
          }}
          onTouchStart={() => startPress(row.id)}
          onTouchEnd={endPress}
          onTouchMove={endPress}
          aria-current={isActive ? "page" : undefined}
          data-active={isActive}
          className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-item px-3 py-2 text-start text-sm ${
            isActive ? "bg-panel-hover font-medium text-foreground" : "text-muted hover:bg-panel-hover hover:text-foreground"
          }`}
        >
          {row.is_pinned ? (
            <Pin className="h-3.5 w-3.5 shrink-0 fill-current" aria-hidden="true" />
          ) : (
            <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <InlineTitle
            testId="conversation-title"
            title={title}
            editing={isRenaming}
            onEditingChange={(on) => setRenamingId(on ? row.id : null)}
            onRename={(next) => rename(row.id, next)}
            className="min-w-0 flex-1 break-words"
          />
          {!sidebar && (
            <span className="shrink-0 text-xs text-muted" suppressHydrationWarning>
              {formatDate(row.updated_at, locale)}
            </span>
          )}
        </button>

        {/* THE STAR, WHICH CAME FROM THE LIST THAT WENT. It was on every
            row of the drawer inside Chat, and the owner's «⋯» menu has
            four items and this is not one of them — so it lives on the
            Chats page, where there is room, rather than being quietly
            dropped. Pin and favourite are different things on purpose:
            pin orders THIS list, favourite surfaces the conversation on
            /dashboard/favorites beside everything else starred. */}
        {!sidebar && (
          <div
            className={`shrink-0 transition-opacity duration-150 ${
              row.is_favorited ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover/row:opacity-100"
            }`}
          >
            <FavoriteButton
              table="chat_conversations"
              recordId={row.id}
              headline={title}
              initialFavorited={Boolean(row.is_favorited)}
              variant="inline"
            />
          </div>
        )}

        {/* ALWAYS THERE ON A PHONE, ON HOVER ON A DESKTOP. `md:` guards
            the hiding, not the showing, so a touch device — which never
            hovers — cannot end up with a menu it can only reveal with a
            gesture it does not have. */}
        <button
          type="button"
          onClick={() => setMenuFor((cur) => (cur === row.id ? null : row.id))}
          aria-label={tModule("actionsFor", { name: title })}
          aria-expanded={menuFor === row.id}
          data-testid="conversation-actions"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground md:opacity-0 md:transition-opacity md:duration-150 md:focus-visible:opacity-100 md:group-hover/row:opacity-100 ${
            menuFor === row.id ? "md:opacity-100" : ""
          }`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>

        {menuFor === row.id && (
          <div
            className="absolute end-1 top-full z-20 mt-1 w-52 panel-frame p-1"
            data-testid="conversation-menu"
          >
            <MenuItem icon={Pencil} label={t("rename")} onClick={() => { setMenuFor(null); setRenamingId(row.id); }} />
            <MenuItem icon={Pin} label={row.is_pinned ? t("unpin") : t("pin")} onClick={() => togglePin(row)} />
            <MenuItem
              icon={FolderInput}
              label={t("moveToProject")}
              onClick={() => setMovingId((cur) => (cur === row.id ? null : row.id))}
              expanded={movingId === row.id}
            />
            {movingId === row.id && (
              <div className="max-h-48 overflow-y-auto pt-1">
                {projects.length === 0 ? (
                  <p className="px-2.5 py-1.5 text-xs text-muted">{t("noProjects")}</p>
                ) : (
                  projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => void moveToProject(row, p.id)}
                      className="flex min-h-[44px] w-full items-center rounded-item px-2.5 py-1.5 text-start text-xs text-muted hover:bg-panel-hover hover:text-foreground"
                    >
                      <span className="min-w-0 break-words">{p.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
            <MenuItem icon={Trash2} label={tModule("delete")} onClick={() => remove(row)} danger />
          </div>
        )}
      </div>
    );
  }

  if (rows.length === 0) {
    return sidebar ? null : <p className="px-3 py-6 text-sm text-muted">{t("noConversations")}</p>;
  }

  return (
    <div className="space-y-1" data-testid="conversation-rows">
      {pinned.length > 0 && (
        <div>
          <p className="px-3 pb-1 text-xs text-muted">{t("groupPinned")}</p>
          <div className="space-y-0.5">{pinned.map(renderRow)}</div>
        </div>
      )}
      <div className="space-y-0.5">{rest.map(renderRow)}</div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger = false,
  expanded,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={`flex min-h-[44px] w-full items-center gap-2 rounded-item px-2.5 py-1.5 text-start text-sm ${
        danger ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-panel-hover hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}
