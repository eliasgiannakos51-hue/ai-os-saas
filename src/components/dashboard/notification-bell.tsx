"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatRelativeTime } from "@/lib/format-time";

/**
 * The bell, with something behind it.
 *
 * IT WAS A PROP. The header rendered a bell that opened a panel containing
 * one hard-coded sentence — "No notifications" — with no table, no query
 * and nothing in the product able to ever put anything in it. A control
 * that can only ever give one answer, shaped exactly like one that gives
 * several, is not an empty state: it is a promise the product does not
 * keep, and the kind of thing a user discovers is fake right after
 * deciding to trust the rest.
 *
 * It is now the delivery destination for an agent whose owner does not
 * want their results leaving the product at all (delivery method
 * "in_app"), which is also the only destination that cannot be
 * misaddressed.
 */

type Notification = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
};

/** Fetched once on mount and after opening. NOT polled on a timer: an
 *  agent runs on a schedule measured in hours, and a request every ten
 *  seconds to learn that would be the most frequent request the app makes
 *  for the least frequently changing thing in it. */
export function NotificationBell({ locale }: { locale: string }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications");
      const data = await response.json();
      if (data.ok) {
        setItems(data.notifications as Notification[]);
        setUnread(Number(data.unread ?? 0));
      }
    } catch {
      // An unreachable list is not evidence of an empty one — leave what
      // is already shown rather than blanking it.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openPanel() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    await load();
    if (unread === 0) return;
    // Opening the panel IS reading them. Marked after the list is loaded,
    // so the badge clears against what the user was actually shown.
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setUnread(0);
    } catch {
      // The badge stays until the next load. Better than clearing it for
      // a write that did not land.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void openPanel()}
        aria-label={t("notifications")}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel hover:text-foreground"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-black"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 max-h-96 w-72 overflow-y-auto rounded-xl border border-border bg-panel p-2 text-xs shadow-lg sm:w-80">
          {items.length === 0 ? (
            <p className="p-2 text-muted">{t("noNotifications")}</p>
          ) : (
            <ul className="space-y-1">
              {items.map((item) => {
                const inner = (
                  <>
                    <p className="font-semibold text-foreground">{item.title}</p>
                    {item.body && (
                      <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap leading-relaxed text-muted">
                        {item.body}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted">
                      {formatRelativeTime(item.createdAt, locale)}
                    </p>
                  </>
                );
                return (
                  <li key={item.id} className={`rounded-lg p-2 ${item.readAt ? "" : "bg-orange-500/[0.06]"}`}>
                    {item.url ? (
                      <Link href={item.url} onClick={() => setOpen(false)} className="block">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
