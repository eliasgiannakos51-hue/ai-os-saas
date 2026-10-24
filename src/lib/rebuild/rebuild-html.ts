/**
 * A WRITTEN APP, CHECKED AND SEALED BEFORE IT IS SHOWN (Rebuild), pure.
 *
 * The same three layers Games has (lib/games/game-html.ts), each of which
 * would hold alone, with one difference: an app keeps what its person
 * enters, so browser storage is NOT forbidden here — it is asked for
 * through a try/catch in the prompt, because the sealed preview has an
 * opaque origin where the browser refuses it (the downloaded file, opened
 * on the person's own machine, has it).
 *
 *   1. THE CHECK (checkAppHtml): an app that reaches for the network, for
 *      another page or for anything outside its own file is refused before
 *      it is stored. The model is told the same rules; the check is what
 *      holds when it does not listen.
 *   2. THE SEAL (sealApp): a Content-Security-Policy written first in the
 *      document — no network, no outside script, style, image or font.
 *   3. THE FRAME (components/rebuild/rebuild-shell.tsx): an iframe with
 *      sandbox="allow-scripts" and nothing else.
 */
export const MAX_APP_HTML_CHARS = 120_000;

/** What an app may not contain, each with the reason a person would be told. */
const APP_FORBIDDEN: { pattern: RegExp; what: string }[] = [
  { pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/, what: "network" },
  { pattern: /\bnew\s+(?:WebSocket|EventSource|Worker|SharedWorker|XMLHttpRequest)\b/, what: "network" },
  { pattern: /\bimportScripts\s*\(|\bnavigator\s*\.\s*serviceWorker\b/, what: "network" },
  { pattern: /\bwindow\.open\s*\(|\b(?:top|parent|opener)\s*\.\s*(?:location|document|postMessage)/, what: "other pages" },
  { pattern: /(?<![\w$.])(?:(?:window|document|top|self)\s*\.\s*)?location\s*(?:\.\s*(?:href|assign|replace|pathname|search|hash)\s*)?(?:=(?!=)|\()/, what: "other pages" },
  { pattern: /<\s*(?:iframe|frame|object|embed|form|base|applet)\b/i, what: "other pages" },
  { pattern: /<\s*meta\b[^>]*http-equiv\s*=\s*["']?\s*(?:refresh|set-cookie)/i, what: "other pages" },
  { pattern: /\bjavascript\s*:/i, what: "other pages" },
  // Any address at all, except the two XML namespaces inline SVG needs.
  { pattern: /(?:https?:)?\/\/(?!www\.w3\.org\/(?:2000\/svg|1999\/xhtml|1999\/xlink)\b)[a-z0-9.-]+\.[a-z]{2,}/i, what: "outside files" },
  { pattern: /\bhttps?:\/\/(?!www\.w3\.org\/(?:2000\/svg|1999\/xhtml|1999\/xlink)\b)/i, what: "outside files" },
  { pattern: /<\s*(?:script|link|img|audio|video|source|track|input)\b[^>]*\b(?:src|href|data|poster)\s*=\s*["']?\s*(?:https?:)?\/\//i, what: "outside files" },
  { pattern: /url\(\s*["']?\s*(?:https?:)?\/\//i, what: "outside files" },
  { pattern: /@import\b/i, what: "outside files" },
  { pattern: /\bimport\s*\(/, what: "outside files" },
  { pattern: /<\s*script\b[^>]*\bsrc\s*=/i, what: "outside files" },
  { pattern: /\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(\s*["'`]/, what: "dynamic code" },
  { pattern: /document\.cookie/, what: "cookies" },
];

export type AppCheck =
  | { ok: true; html: string }
  | { ok: false; reason: "empty" | "too_long" | "not_a_document" | "forbidden"; what?: string };

export function checkAppHtml(raw: unknown): AppCheck {
  const html = typeof raw === "string" ? raw.replace(/^\s*```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim() : "";
  if (!html) return { ok: false, reason: "empty" };
  if (html.length > MAX_APP_HTML_CHARS) return { ok: false, reason: "too_long" };
  if (!/<html[\s>]/i.test(html) || !/<\/html>\s*$/i.test(html) || !/<script[\s>]/i.test(html)) return { ok: false, reason: "not_a_document" };
  for (const rule of APP_FORBIDDEN) if (rule.pattern.test(html)) return { ok: false, reason: "forbidden", what: rule.what };
  return { ok: true, html };
}

/** The policy written into every app's head. */
export const APP_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

/**
 * The app as shown and as downloaded: the seal is the FIRST element of the
 * document, straight after its doctype, so the policy covers every part of
 * it. scripts/tests/rebuild.test.mjs holds the position;
 * rebuild.prodtest.mjs holds the effect, in a browser.
 */
export function sealApp(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${APP_CSP}">`;
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  return doctype ? `${doctype[0]}${meta}${html.slice(doctype[0].length)}` : `${meta}${html}`;
}

/** The sandbox the app is shown in: scripts, and nothing else. */
export const APP_SANDBOX = "allow-scripts";

/** Versions kept per app: enough to step back, bounded so a row does not grow forever. */
export const MAX_APP_VERSIONS = 10;

export type AppVersion = { html: string; at: string; note: string };

/** The newest version first, at most MAX_APP_VERSIONS. */
export function pushAppVersion(versions: unknown, version: AppVersion): AppVersion[] {
  const list = Array.isArray(versions) ? (versions as AppVersion[]).filter((v) => v && typeof v.html === "string") : [];
  return [version, ...list].slice(0, MAX_APP_VERSIONS);
}

/** The file name a download carries: the app's own title, safe on every system. */
export function downloadName(title: unknown): string {
  return String(title ?? "app").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 60) || "app";
}
