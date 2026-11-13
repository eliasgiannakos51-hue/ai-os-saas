import "server-only";
import { PAIRING_CODE_LENGTH, newPairingCode, normalisePairingCode, formatPairingCode } from "@/lib/pairing-code";

export { PAIRING_CODE_LENGTH, newPairingCode, normalisePairingCode, formatPairingCode };

/**
 * CONNECTING ONE TELEGRAM CHAT TO ONE ACCOUNT — the arithmetic half, with
 * no database and no request in it, so every rule below can be tested by
 * calling it (scripts/tests/telegram-link.test.mjs §1).
 *
 * THE CODE IS iowork's, THE DIRECTION IS THE OPPOSITE, AND THE DIRECTION
 * IS THE WHOLE SECURITY ARGUMENT.
 *
 *   iowork    a computer with no account shows eight characters; a
 *             signed-in person types them at ionexa.ai. A stranger can
 *             mint a code, so a stranger can phish a real account holder
 *             into adopting the stranger's computer.
 *
 *   Telegram  a SIGNED-IN person asks ionexa.ai for eight characters and
 *             sends them to the bot. Nobody can mint a code pointing at
 *             somebody else's account — minting needs that account's own
 *             session.
 *
 * So the danger here is not a forged code, it is a LEAKED one: the code
 * leaves the browser, passes through a human, and lands in a chat, where
 * it can be forwarded, screenshotted, or simply asked for ("support needs
 * your link code"). A chat that can command Ionexa can spend credits,
 * read what has been made and publish as the account — so a leaked code
 * must not be enough on its own.
 *
 * IT IS NOT, AND THAT IS THE TWO-STEP FLOW. Presenting a valid code to the
 * bot does not connect anything: it records WHO is asking on the pairing
 * row and stops (κομμάτι 2's webhook). The connection is made only when
 * the signed-in person sees the asker's Telegram name on
 * /dashboard/integrations and presses a second, separate button. The
 * attacker holding a leaked code cannot reach that screen, which is the
 * same structure as iowork's preview/confirm and for the same reason: show
 * the human what they are approving, in a deliberate second step, with
 * enough context to notice "that is not me."
 */

/** Ten minutes — the owner's own «λήγει σε 10 λεπτά». Long enough to
 *  switch apps and press Start, short enough that a guessed code has
 *  almost no window. Its own constant and not iowork's: these are two
 *  features with two threat models, and one changing its mind about how
 *  long a code lives must not silently change the other. */
export const TELEGRAM_PAIRING_TTL_MINUTES = 10;

/** How often the Connect page asks whether a chat has presented the code
 *  yet. Said by the server so the rate can change without a deploy of the
 *  client bundle. */
export const TELEGRAM_POLL_SECONDS = 3;

/**
 * True once the ten minutes are up. `now` is passed in so the rule can be
 * tested without waiting for a clock.
 *
 * FAILS CLOSED: a date that will not parse is treated as EXPIRED. The
 * alternative reads better and is worse — a row whose created_at somehow
 * arrived unreadable would become a code that never dies.
 */
export function isTelegramPairingExpired(createdAt: string, now: number = Date.now()): boolean {
  const started = Date.parse(createdAt);
  if (!Number.isFinite(started)) return true; // unreadable date: refuse, never allow
  return now - started > TELEGRAM_PAIRING_TTL_MINUTES * 60 * 1000;
}

/** Seconds left on a pairing, floored at zero, for the countdown the
 *  screen shows. Derived from the same two values as the expiry above so
 *  the number on screen and the server's refusal cannot disagree. */
export function telegramPairingSecondsLeft(createdAt: string, now: number = Date.now()): number {
  const started = Date.parse(createdAt);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.ceil((started + TELEGRAM_PAIRING_TTL_MINUTES * 60 * 1000 - now) / 1000));
}

/**
 * C0/C1 control characters, EXCLUDING tab/newline/carriage-return, which
 * the whitespace collapse below turns into a single readable space.
 *
 * WHY THIS EXISTS AT ALL: a Telegram display name is set by whoever owns
 * that Telegram account, it arrives through κομμάτι 2's webhook, and it
 * is then shown VERBATIM on the one screen where a person decides whether
 * to hand that account control of theirs. A name carrying a line of NULs
 * and an ESC sequence is not a name, and the place not to find that out is
 * the confirm dialog.
 */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Telegram's own bound is 64 for first+last name; 120 is the column's and
 *  is generous for both halves joined. */
export const MAX_TELEGRAM_NAME_CHARS = 120;

/** Telegram usernames: 5-32 of [A-Za-z0-9_]. Anything else is not a
 *  username and becomes null rather than being shown as one — the same
 *  rule src/lib/notify/channels/telegram.ts already applies to the bot's
 *  own username before it builds a link out of it. */
const USERNAME_SHAPE = /^[A-Za-z0-9_]{5,32}$/;

export function parseTelegramName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TELEGRAM_NAME_CHARS);
  return trimmed.length > 0 ? trimmed : null;
}

export function parseTelegramUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bare = value.trim().replace(/^@/, "");
  return USERNAME_SHAPE.test(bare) ? bare : null;
}

/**
 * THE «ΆΝΟΙΞΕ ΣΤΟ TELEGRAM» LINK.
 *
 * t.me/<bot>?start=<payload> opens the chat with the bot and sends
 * `/start <payload>` on the first press, so on the happy path the person
 * never retypes the code at all. The code is still SHOWN, because this
 * link does nothing on a desktop with no Telegram installed and nothing on
 * a phone whose browser refuses the handoff — and in both of those cases
 * typing «/start ABCD-EF23» into the chat by hand is the way through.
 *
 * The RAW code goes in the payload and the DASHED one on the screen: both
 * are accepted by normalisePairingCode, and the dash is only there to be
 * read aloud.
 *
 * Returns null rather than a broken link when the bot's username is not
 * known — src/lib/notify/channels/telegram.ts's telegramBotUsername()
 * answers null whenever Telegram will not say, and a button pointing at
 * `t.me/null` is worse than no button.
 */
export function telegramDeepLink(botUsername: string | null, code: string): string | null {
  if (!botUsername || !USERNAME_SHAPE.test(botUsername)) return null;
  if (normalisePairingCode(code) === null) return null;
  return `https://t.me/${botUsername}?start=${encodeURIComponent(code)}`;
}
