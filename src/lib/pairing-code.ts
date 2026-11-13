import "server-only";
import { randomBytes } from "node:crypto";

/**
 * THE SHORT CODE A PERSON READS OFF ONE SCREEN AND TYPES INTO ANOTHER.
 *
 * Shared, and shared for one reason: it is a security primitive with two
 * callers, and two copies of it would be two statements that can disagree.
 * The alphabet below is the whole of why eight characters is enough; a
 * second copy that lost the "no I, L, O, U" rule would still produce codes
 * that look right, still pass every test written against it, and start
 * failing for real people who read 1 as I.
 *
 * ITS TWO CALLERS, AND WHY THEY STILL DIFFER:
 *
 *   src/lib/iowork/pairing.ts     a computer shows the code, the person
 *                                 types it at ionexa.ai. Ten minutes.
 *   src/lib/telegram/pairing.ts   ionexa.ai shows the code, the person
 *                                 sends it to the bot. Ten minutes.
 *
 * Same code, OPPOSITE DIRECTION, and the direction changes the threat —
 * which is why the expiry, the limiter and the confirm step live in those
 * two files and not here. This module is the arithmetic only: no database,
 * no request, no policy. Every rule in it can be tested by calling it
 * (scripts/tests/iowork-pairing.test.mjs §1-2 and
 * scripts/tests/telegram-link.test.mjs §1 both do).
 */

/**
 * Crockford's base32: the digits, and the letters without I, L, O and U.
 * I/L/1 and O/0 are the pairs people mistype off a screen, and U is left
 * out so a random code cannot read as a word. 32 symbols means a byte maps
 * to one of them with no modulo bias (256 divides by 32), which is why
 * newPairingCode can stay this short.
 */
export const PAIRING_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PAIRING_CODE_LENGTH = 8;

/** Eight characters, uniform over PAIRING_ALPHABET. */
export function newPairingCode(): string {
  const bytes = randomBytes(PAIRING_CODE_LENGTH);
  let code = "";
  for (const byte of bytes) code += PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length];
  return code;
}

/**
 * What the person typed, turned into what was generated — or null.
 *
 * Spaces and dashes go (the code is shown as ABCD-EF23, and people retype
 * the dash), case goes, and the three lookalikes the alphabet left out are
 * folded onto the symbol they were mistaken for. Anything still outside the
 * alphabet after that is a typo, not a code, and null says so rather than
 * sending a lookup that cannot match.
 */
export function normalisePairingCode(input: string): string | null {
  const folded = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  if (folded.length !== PAIRING_CODE_LENGTH) return null;
  for (const ch of folded) if (!PAIRING_ALPHABET.includes(ch)) return null;
  return folded;
}

/** ABCD-EF23 — read aloud and retyped more reliably than eight in a row. */
export function formatPairingCode(code: string): string {
  return code.length === PAIRING_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
