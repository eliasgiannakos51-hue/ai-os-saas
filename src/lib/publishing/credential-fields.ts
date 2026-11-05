/**
 * A PUBLISHED PAGE DOES NOT ASK FOR A PASSWORD.
 *
 * Sites and Rebuild apps are served at an address on the app's own domain
 * (until lib/publishing/content-origin.ts has a domain of their own), so a
 * page that asks for a password looks like the app asking. No site this
 * product generates has a reason to: a contact form, a booking, a
 * newsletter — none of them is a sign-in. So one is refused before it is
 * published, by both scanners that stand in front of publishing:
 * lib/website-html-security-scan.ts (sites) and lib/rebuild/rebuild-html.ts's
 * checkAppHtml (apps). And api/websites/[id]/submit-form drops any field
 * whose NAME says password, for the copy of a page that was downloaded and
 * hosted elsewhere, where no scan runs.
 *
 * WHAT IS LOOKED FOR, in the markup AND in its scripts (a field can be
 * made by code as easily as written):
 *   - an input whose type is password — quoted either way or not at all,
 *     any case, and with character references decoded first, because a
 *     browser reads `type="pass&#119;ord"` as password;
 *   - an autocomplete hint of current-password or new-password, which is
 *     how a page asks the browser's password manager to fill one in;
 *   - text-security in CSS, which draws an ordinary text box as dots;
 *   - script that sets a type of "password".
 * It is a scan, and a determined script can assemble the word from pieces;
 * that is why it is one layer of several and not the boundary.
 *
 * Pure: scripts/tests/published-isolation.test.mjs runs it.
 */

/** Decodes the numeric and the few named character references an
 *  attribute value could hide a word behind. */
export function decodeCharacterReferences(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);?/g, (_, dec: string) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/&(?:tab|newline);/gi, "")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/** One attribute's value from one opening tag — quoted either way, or bare. */
function attribute(tag: string, name: string): string | null {
  const m = new RegExp(`[\\s/]${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, "i").exec(tag);
  return m ? decodeCharacterReferences(m[1] ?? m[2] ?? m[3] ?? "") : null;
}

const TAG_RE = /<[a-z][a-z0-9-]*\b[^>]*>/gi;
const SCRIPT_TYPE_RE = /\btype\b["'`]?\s*[:=]\s*["'`]\s*password\s*["'`]/i;
const SET_ATTRIBUTE_RE = /setAttribute\s*\(\s*["'`]type["'`]\s*,\s*["'`]\s*password\s*["'`]\s*\)/i;
const AUTOCOMPLETE_RE = /\b(?:current|new)-password\b/i;
const TEXT_SECURITY_RE = /\btext-security\s*:\s*(?:disc|circle|square)/i;

/**
 * The first thing in `html` that asks for a password, as a short excerpt
 * to show, or null when nothing does.
 */
export function findCredentialField(html: unknown): string | null {
  if (typeof html !== "string" || html.length === 0) return null;
  const excerpt = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 80);

  // Each input's type, as the browser will read it: a bare value is not
  // seen by the text patterns below, which need quotes.
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(html))) {
    const tag = match[0];
    if (!/^<input\b/i.test(tag)) continue;
    const type = attribute(tag, "type");
    if (type !== null && type.trim().toLowerCase() === "password") return excerpt(tag);
  }
  // Everything else — autocomplete hints and CSS wherever they are, and
  // script — read as text after references are decoded, because a
  // browser decodes them inside an attribute (an inline handler's
  // `&quot;password&quot;` is "password" to the script it runs).
  const text = decodeCharacterReferences(html);
  for (const re of [SET_ATTRIBUTE_RE, SCRIPT_TYPE_RE, AUTOCOMPLETE_RE, TEXT_SECURITY_RE]) {
    const m = re.exec(text);
    if (m) return excerpt(text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20));
  }
  return null;
}

/**
 * Does a submitted field's NAME say it holds a password or a one-time
 * code? Read by api/websites/[id]/submit-form, which drops such a field
 * rather than store it for the site's owner. Matched on whole words of the
 * name, so `shipping` is not `pin` and `footprint` is not `otp`.
 */
export function isCredentialFieldName(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ς/g, "σ")
    .split(/[^a-z0-9Ͱ-Ͽ]+/)
    .filter(Boolean);
  const joined = words.join("");
  const WORDS = new Set(["password", "passwd", "passcode", "passphrase", "pass", "pwd", "pw", "pin", "otp", "totp", "2fa", "mfa", "cvv", "cvc", "cvv2"]);
  if (words.some((w) => WORDS.has(w))) return true;
  // Greek: «κωδικός πρόσβασης» and «συνθηματικό». «κωδικός» alone is
  // also a postal code (ταχυδρομικός κώδικας) and stays.
  return /password|passwd|passcode|passphrase|κωδικοσπροσβασ|κωδικοιπροσβασ|συνθηματικ/.test(joined);
}
