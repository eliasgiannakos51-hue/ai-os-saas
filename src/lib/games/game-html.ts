/**
 * A WRITTEN GAME, CHECKED AND SEALED BEFORE IT IS PLAYED (package 26), pure.
 *
 * The spec's security line for games: «απομονωμένο, σε ξεχωριστή
 * διεύθυνση, χωρίς πρόσβαση σε δεδομένα του Ionexa». Three layers, each
 * of which would hold alone:
 *
 *   1. THE CHECK (checkGameHtml): a game that reaches for the network, for
 *      storage, for another page or for anything outside its own file is
 *      refused before it is stored. The model is told the same rules; the
 *      check is what holds when it does not listen.
 *   2. THE SEAL (sealGame): a Content-Security-Policy written into the
 *      document's own head — no network, no outside script, style, image
 *      or font — so a game that slipped past the check still cannot reach
 *      anything.
 *   3. THE FRAME (components/games/games-shell.tsx): it is played in an
 *      iframe with sandbox="allow-scripts" and nothing else, which gives it
 *      an opaque origin: no Ionexa cookie, storage or page is reachable
 *      from inside it, and it cannot navigate the page that holds it.
 */
export const MAX_GAME_HTML_CHARS = 120_000;

/** What a game may not contain, each with the reason a person would be told. */
const FORBIDDEN: { pattern: RegExp; what: string }[] = [
  { pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/, what: "network" },
  { pattern: /\bnew\s+(?:WebSocket|EventSource|Worker|SharedWorker)\b/, what: "network" },
  { pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b|document\.cookie/, what: "storage" },
  { pattern: /\bwindow\.open\s*\(|\b(?:top|parent|opener)\s*\.\s*(?:location|document|postMessage)/, what: "other pages" },
  { pattern: /<\s*(?:iframe|frame|object|embed|form|base)\b/i, what: "other pages" },
  { pattern: /<\s*(?:script|link|img|audio|video|source)\b[^>]*\b(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i, what: "outside files" },
  { pattern: /url\(\s*["']?\s*(?:https?:)?\/\//i, what: "outside files" },
  { pattern: /@import\b/i, what: "outside files" },
  { pattern: /\bimport\s*\(/, what: "outside files" },
];

export type GameCheck = { ok: true; html: string } | { ok: false; reason: "empty" | "too_long" | "not_a_document" | "forbidden"; what?: string };

export function checkGameHtml(raw: unknown): GameCheck {
  const html = typeof raw === "string" ? raw.replace(/^\s*```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim() : "";
  if (!html) return { ok: false, reason: "empty" };
  if (html.length > MAX_GAME_HTML_CHARS) return { ok: false, reason: "too_long" };
  if (!/<html[\s>]/i.test(html) || !/<\/html>\s*$/i.test(html) || !/<script[\s>]/i.test(html)) return { ok: false, reason: "not_a_document" };
  for (const rule of FORBIDDEN) if (rule.pattern.test(html)) return { ok: false, reason: "forbidden", what: rule.what };
  return { ok: true, html };
}

/** The policy written into every game's head. */
export const GAME_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

/**
 * The game as played and as downloaded: the seal is the FIRST element of
 * the document, straight after its doctype, so the policy covers every
 * part of it. A <meta> before <html> is parsed into the head the browser
 * opens for it (the document's own <html> and <head> tags then merge into
 * those). scripts/tests/games.test.mjs holds the position;
 * games.prodtest.mjs holds the effect, in a browser.
 */
export function sealGame(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${GAME_CSP}">`;
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  return doctype ? `${doctype[0]}${meta}${html.slice(doctype[0].length)}` : `${meta}${html}`;
}

/** The sandbox the game is played in: scripts, and nothing else. */
export const GAME_SANDBOX = "allow-scripts";

/** Versions kept per game: enough to step back, bounded so a row does not grow forever. */
export const MAX_GAME_VERSIONS = 10;

export type GameVersion = { html: string; at: string; note: string };

/** The newest version first, at most MAX_GAME_VERSIONS. */
export function pushVersion(versions: unknown, version: GameVersion): GameVersion[] {
  const list = Array.isArray(versions) ? (versions as GameVersion[]).filter((v) => v && typeof v.html === "string") : [];
  return [version, ...list].slice(0, MAX_GAME_VERSIONS);
}
