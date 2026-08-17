"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MAX_CONVERSATION_TITLE_LENGTH } from "@/lib/chat/conversation-title";

/**
 * A conversation's name, editable where it is shown.
 *
 * ONE COMPONENT FOR BOTH PLACES. The name appears twice — in the sidebar
 * list and above the open conversation — and renaming has to work in
 * both, which is exactly the situation that produces two implementations
 * that disagree. The favourite star in this same view already learned
 * that lesson the hard way: two independent copies of the state
 * disagreed the moment one was clicked.
 *
 * FOUR WAYS IN, and the fourth is the one that is usually missing:
 *
 *   · double-click, which is what every other list of named things does
 *   · the "..." menu, which is the discoverable one
 *   · LONG-PRESS, because a touch screen has no double-click. Without it
 *     the gesture people try first does nothing at all on a phone, and
 *     the menu is the only route — on the device where menus are hardest
 *     to hit.
 *   · and for a keyboard: the field takes focus on open and Escape gets
 *     out, so no gesture is required at all.
 *
 * Editing state is OWNED BY THE PARENT (`editing` / `onEditingChange`).
 * The "..." menu has to be able to start a rename from outside this
 * component, and the sidebar has to know a row is being edited so its
 * click handler does not navigate away mid-edit.
 */
export function InlineTitle({
  title,
  editing,
  onEditingChange,
  onRename,
  className,
  inputClassName,
  testId,
}: {
  title: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** Called with the new name. An EMPTY string is a real value here: the
   *  server reads it as "put the automatic name back". */
  onRename: (title: string) => void;
  className?: string;
  inputClassName?: string;
  testId?: string;
}) {
  const t = useTranslations("dashboard.chat");
  const [value, setValue] = useState(title);
  // Escape has to beat the blur. Leaving the field saves what is in it,
  // which is what makes this an edit rather than a form — but Escape
  // means "forget this", and cancelling by unmounting the input is
  // itself a blur. Without this flag the cancelled text would be saved
  // by the very act of cancelling it.
  const cancelledRef = useRef(false);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-seed when a rename starts, and when the title changes underneath
  // (the server trims and can hand back a different string).
  useEffect(() => {
    if (editing) setValue(title);
  }, [editing, title]);

  useEffect(() => {
    return () => {
      if (longPressRef.current) clearTimeout(longPressRef.current);
    };
  }, []);

  function start() {
    cancelledRef.current = false;
    onEditingChange(true);
  }

  function commit() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      onEditingChange(false);
      return;
    }
    const trimmed = value.trim();
    // Unchanged is not a rename — no request, no optimistic flicker.
    // Empty IS sent, because empty means "restore the automatic name"
    // and only the server can work out what that was.
    if (trimmed !== title) onRename(trimmed);
    onEditingChange(false);
  }

  function cancel() {
    cancelledRef.current = true;
    onEditingChange(false);
  }

  // 500ms is the platform convention for a long press. Cancelled by
  // moving or lifting, so a scroll that starts on the title does not
  // open an editor half way down the list.
  function startLongPress() {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(start, 500);
  }
  function cancelLongPress() {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = null;
  }

  if (!editing) {
    return (
      <span
        data-testid={testId}
        className={className}
        title={title}
        onDoubleClick={start}
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onTouchCancel={cancelLongPress}
      >
        {title}
      </span>
    );
  }

  const remaining = MAX_CONVERSATION_TITLE_LENGTH - value.length;

  return (
    <span className="relative flex min-w-0 flex-1 items-center gap-1.5">
      <input
        autoFocus
        value={value}
        // The same hundred the server enforces, from the same constant.
        maxLength={MAX_CONVERSATION_TITLE_LENGTH}
        aria-label={t("renameLabel", { title })}
        data-testid="conversation-rename-input"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className={
          inputClassName ??
          "min-w-0 flex-1 rounded-lg border border-orange-500/60 bg-input px-2.5 py-[7px] text-sm text-foreground outline-none"
        }
      />
      {/* The counter appears only in the last stretch. Shown from the
          start it is decoration on a field nobody will fill; shown at
          the wall it arrives too late to change what you were typing. */}
      {remaining <= 20 && (
        <span
          data-testid="conversation-rename-count"
          className={`shrink-0 text-[11px] tabular-nums ${remaining === 0 ? "text-amber-400" : "text-muted"}`}
        >
          {remaining}
        </span>
      )}
    </span>
  );
}
