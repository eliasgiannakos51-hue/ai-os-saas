/**
 * What we know about the connection, and what we do not.
 *
 * `navigator.onLine` is weaker than it sounds. `false` is trustworthy —
 * the browser has no network interface it can use, and nothing will
 * reach the server. `true` means only that an interface exists: a hotel
 * portal, an office VPN that dropped, a phone with one bar and no
 * throughput all report `true` while every request times out.
 *
 * So the banner is driven by BOTH: the browser's own signal, which is
 * instant but optimistic, and the requests the app actually made, which
 * are slow but true. `false` from either is offline. Believing only the
 * first would leave a user staring at a page that silently stopped
 * updating; believing only the second means saying nothing until
 * something fails.
 */
export type ConnectionState = "online" | "offline";

/**
 * Whether a caught error is a NETWORK failure rather than a rejection
 * the server chose to send.
 *
 * A fetch rejects only when the request never completed — DNS, refused
 * connection, aborted transport. A 500 resolves, so it is not this, and
 * treating it as offline would tell the user to check a connection that
 * is fine while a real bug goes unreported.
 *
 * The message strings differ per engine and there is nothing better to
 * match on; `err instanceof TypeError` is the specified behaviour but is
 * also what a genuine type error throws, so both are required.
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("failed to fetch") || // Chrome, Edge
    message.includes("networkerror") || // Firefox
    message.includes("load failed") || // Safari
    message.includes("network request failed") || // older WebKit
    message.includes("connection") ||
    message.includes("offline")
  );
}

/**
 * How old the data on screen is, in words the reader can act on.
 *
 * Returns null under a minute: "showing data from 4 seconds ago" on a
 * page that just loaded is noise, and noise next to a warning is how a
 * warning gets ignored.
 *
 * The caller supplies `now`, so this is a pure function a test can pin
 * rather than a clock reading.
 */
export function stalenessMinutes(loadedAt: number, now: number): number | null {
  const minutes = Math.floor((now - loadedAt) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return null;
  return minutes;
}
