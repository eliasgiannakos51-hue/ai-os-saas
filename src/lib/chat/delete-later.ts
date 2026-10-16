/**
 * «ΔΙΑΓΡΑΦΗ … ΚΑΙ ΔΕΙΧΝΕΙ "ΑΝΑΙΡΕΣΗ" ΓΙΑ ΛΙΓΑ ΔΕΥΤΕΡΟΛΕΠΤΑ»
 * (owner, 2026-10-15), done by NOT DELETING YET.
 *
 * The obvious reading is a bin: delete the row, mark it, let Undo bring
 * it back. That needs a `deleted_at` column, every read of
 * chat_conversations taught to exclude it, and a migration pasted by
 * hand before any of it works — and this app has twice shipped a
 * feature that waited weeks for a migration nobody ran (CLAUDE.md).
 *
 * So the row is not deleted during the window at all. The screen hides
 * it, this holds the request, and Undo is simply the timer being
 * cleared. The failure modes fall out of that and they fall the right
 * way:
 *
 *   · Nothing is ever in a half-deleted state. The row is whole until
 *     the request goes, and gone after it.
 *   · Undo cannot fail. There is nothing to restore.
 *   · Another device keeps showing the conversation for those few
 *     seconds, which is the correct description of reality.
 *
 * AND THE ONE THAT WOULD HAVE BEEN A BUG: closing the tab inside the
 * window. Without `pagehide` the delete would simply never happen and
 * the person would come back to a conversation they had been told was
 * deleted. The flush below uses `fetch(..., { keepalive: true })`, NOT
 * `navigator.sendBeacon`, and the reason is not a preference:
 * **sendBeacon can only send a POST**, and the route that deletes a
 * conversation answers DELETE. A beacon here would have been a 405 that
 * nothing on a closing page is around to read — the delete would be
 * silently dropped in exactly the case this code exists to cover.
 * `keepalive` keeps a real DELETE in flight after the document goes.
 */
const PENDING = new Map<string, ReturnType<typeof setTimeout>>();

/** How long «Αναίρεση» stays on screen. Long enough to read the toast
 *  and reach it, short enough that nobody wonders if it worked. */
export const UNDO_WINDOW_MS = 6000;

export function conversationDeleteUrl(id: string): string {
  return `/api/conversations/${encodeURIComponent(id)}`;
}

/** True while this id is hidden but not yet deleted. */
export function isPendingDelete(id: string): boolean {
  return PENDING.has(id);
}

/**
 * Hide now, delete in UNDO_WINDOW_MS. `commit` runs the real request;
 * it is passed in rather than called here so the caller owns the error
 * handling and the list it has to put back.
 */
export function scheduleDelete(id: string, commit: () => void, windowMs: number = UNDO_WINDOW_MS): void {
  cancelDelete(id);
  PENDING.set(
    id,
    setTimeout(() => {
      PENDING.delete(id);
      commit();
    }, windowMs)
  );
}

/** «Αναίρεση»: the request was never sent. */
export function cancelDelete(id: string): boolean {
  const timer = PENDING.get(id);
  if (!timer) return false;
  clearTimeout(timer);
  PENDING.delete(id);
  return true;
}

/**
 * The tab is going. Everything still waiting is sent now, as a beacon,
 * because a normal fetch started here is cancelled with the page.
 * Registered once by whichever component mounts first; calling it twice
 * is harmless.
 */
let listening = false;
export function flushPendingDeletesOnUnload(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("pagehide", () => {
    for (const [id, timer] of PENDING) {
      clearTimeout(timer);
      try {
        void fetch(conversationDeleteUrl(id), { method: "DELETE", keepalive: true });
      } catch {
        /* the conversation stays; nothing is lost, which is the safe way to fail */
      }
    }
    PENDING.clear();
  });
}
