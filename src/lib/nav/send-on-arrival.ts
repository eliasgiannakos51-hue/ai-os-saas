import { MAX_EXAMPLE_CHARS } from "@/lib/overview/first-screen-examples";

/**
 * A LINK MAY FILL A FIELD; ONLY THE APP MAY PRESS SEND (2026-11-05 review, A8).
 *
 * `/dashboard/chat?ask=…` used to send its text on arrival. That spends
 * credits and can write chat memory, and an address can be written by any
 * page on the web — so a link alone now only PRE-FILLS the field.
 *
 * The app's own buttons that should land with the work already started
 * (a quick-job tile, the first task after signup) say so here, in this
 * tab's sessionStorage, immediately before they navigate. Another site
 * cannot write this origin's storage. The destination takes the intent
 * once — read and removed in the same call — and acts on it only when it
 * names the same parameter and the same text, and is a few seconds old.
 *
 * Producers: components/tools/tools-grid.tsx, components/onboarding/first-task.tsx.
 * Consumers: components/chat/chat-workspace.tsx (`ask`),
 * components/website-builder/website-builder-workspace.tsx (`brief`).
 * scripts/tests/first-screen.test.mjs holds both halves.
 */
export type ArrivalParam = "ask" | "brief";

/**
 * The routes whose workspace may act on arrival, and the parameter each
 * one reads. The Site page in use today (components/website-builder/
 * website-shell.tsx) only pre-fills its field from `brief`; the older
 * workspace named above is the one that would submit, and it honours the
 * intent the same way the chat does.
 */
export const SENDS_ON_ARRIVAL: Readonly<Record<string, ArrivalParam>> = {
  "/dashboard/chat": "ask",
  "/dashboard/website-builder": "brief",
};

const STORAGE_KEY = "ionexa.sendOnArrival";
/** Long enough for a slow navigation, short enough that a forgotten intent cannot be found later. */
export const SEND_ON_ARRIVAL_FRESH_MS = 60_000;

/** The text as the destination will see it: trimmed and clamped the way readExampleParam does. */
function normalise(text: string): string {
  return text.trim().slice(0, MAX_EXAMPLE_CHARS);
}

/**
 * Called by the app's own button just before it follows `href`. Does
 * nothing for an address that does not act on arrival, or carries no text.
 */
export function armSendOnArrival(href: string): void {
  if (typeof window === "undefined") return;
  let url: URL;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) return;
  const param = SENDS_ON_ARRIVAL[url.pathname];
  const text = param ? url.searchParams.get(param) : null;
  if (!param || !text || !normalise(text)) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ param, text: normalise(text), at: Date.now() }));
  } catch {
    // Storage refused (private mode, quota): the destination pre-fills
    // instead of sending, which is the safe way to fail.
  }
}

/**
 * Called once by the destination. True only when this tab's own app asked
 * for exactly this text to be sent. Always removes the intent.
 */
export function takeSendOnArrival(param: ArrivalParam, text: string, now = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    const armed = JSON.parse(raw) as { param?: unknown; text?: unknown; at?: unknown };
    const age = typeof armed.at === "number" ? now - armed.at : Number.POSITIVE_INFINITY;
    return armed.param === param && armed.text === normalise(text) && age >= 0 && age < SEND_ON_ARRIVAL_FRESH_MS;
  } catch {
    return false;
  }
}
