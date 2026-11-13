import { findPageBoxes, numberBoxes } from "@/lib/website-boxes";

/**
 * A SITE'S PREVIEW WHOSE PARTS ARE PRESSED IN THE PAGE ITSELF (the approved
 * Site screen, docs/design/approved/08-Site.png; ED2, 2026-11-05), for the
 * editor layout only — the switch "editor-shell". With the switch off the
 * preview is the one it always was: sandbox="" and no script at all, the
 * parts pressed by number beside it (lib/website-boxes.ts, outlineBoxes).
 *
 * WHY A SCRIPT, AND WHY ONLY THIS ONE. Pressing a part of the page means
 * knowing which part was pressed, and a frame with no script and an
 * opaque origin tells its parent nothing — that is the point of it. The
 * two ways to hear it are to give the frame the app's origin (sandbox
 * "allow-same-origin", so the parent reads its DOM) or to let one script
 * run inside it that says which part was pressed. The first would make a
 * page the model wrote same-origin with the app; the second keeps the
 * opaque origin and admits exactly one script, the one below:
 *
 *   - the frame is sandbox="allow-scripts" and nothing else (PICKER_SANDBOX):
 *     an opaque origin, no Ionexa cookie, storage or page reachable, no
 *     form, no pop-up, no navigation of the page that holds it — the same
 *     frame Games and Rebuild already play in (lib/games/game-html.ts);
 *   - the FIRST thing in the document, right after its doctype, is a
 *     Content-Security-Policy whose script-src is this script's own
 *     SHA-256 and nothing else, so every script the model wrote — a
 *     <script>, an onclick, a javascript: link — stays as dead as it was
 *     under sandbox="";
 *   - the script says two things to the app — "ready" and "part N was
 *     pressed" — and is told one: "show part N as chosen, labelled so".
 *     The app checks the message came from this frame's own window.
 *
 * The app's own CSP is inherited by a srcdoc frame (next.config.mjs), so
 * the page's images are held to the same list as every other screen's.
 *
 * Held by scripts/tests/site-pick-frame.test.mjs (the hash is recomputed
 * there from PICKER_SCRIPT, so the two cannot drift) and, in a real
 * browser, by scripts/tests/editor-shell.prodtest.mjs.
 */

/** The `source` every message between the app and the frame carries. */
export const PICK_MESSAGE = "ionexa-site-pick";

/** The sandbox the pickable preview runs in: scripts, and nothing else. */
export const PICKER_SANDBOX = "allow-scripts";

/**
 * The product's white (globals.css --foreground, #F5F7FB) and its ink
 * (--button-ink, #070A12). The frame cannot read the app's variables, so
 * the two are written out here; site-pick-frame.test.mjs holds them equal
 * to the tokens.
 */
export const PRODUCT_WHITE = "#F5F7FB";
export const PRODUCT_INK = "#070A12";

/**
 * Hover shows a part can be pressed (a white hairline at 40%); the chosen
 * part has the 2px white outline, and a white label over its top edge
 * (`.shero`, `.selb` in docs/design/approved/src/08-Site.html). Outlines,
 * never borders, so the page's own layout does not move by a pixel.
 */
export const PICKER_STYLE =
  "[data-ionexa-n]{cursor:pointer}" +
  "[data-ionexa-n]:hover{outline:1px solid rgba(245,247,251,.4)!important;outline-offset:-1px!important}" +
  `[data-ionexa-n]:focus-visible,[data-ionexa-on],[data-ionexa-on]:hover{outline:2px solid ${PRODUCT_WHITE}!important;outline-offset:-2px!important}` +
  `#ionexa-pick-label{position:absolute;z-index:2147483647;display:none;pointer-events:none;margin:0;padding:0 8px;border-radius:6px;background:${PRODUCT_WHITE};color:${PRODUCT_INK};font:600 11px/18px system-ui,-apple-system,"Segoe UI",sans-serif;white-space:nowrap}`;

/**
 * The one script the frame may run. Plain ES5 in one string, because its
 * exact bytes are what the policy's hash admits.
 */
export const PICKER_SCRIPT =
  '(function(){var K="ionexa-site-pick",on=null,label=null;' +
  'function say(m){m.source=K;parent.postMessage(m,"*");}' +
  'function boxOf(t){while(t&&t.nodeType!==1)t=t.parentNode;return t&&t.closest?t.closest("[data-ionexa-n]"):null;}' +
  'function index(b){return Number(b.getAttribute("data-ionexa-n"))-1;}' +
  'function place(){if(!label)return;if(!on){label.style.display="none";return;}var r=on.getBoundingClientRect(),y=r.top+window.scrollY;label.style.display="block";label.style.top=(y>=9?y-9:y+4)+"px";label.style.left=(r.left+window.scrollX+14)+"px";}' +
  'function choose(n,text){if(on)on.removeAttribute("data-ionexa-on");on=null;if(typeof n==="number"&&n>=0){on=document.querySelector("[data-ionexa-n=\\""+(n+1)+"\\"]");if(on)on.setAttribute("data-ionexa-on","");}' +
  'if(!label){label=document.createElement("div");label.id="ionexa-pick-label";label.setAttribute("aria-hidden","true");document.documentElement.appendChild(label);}label.textContent=on?String(text||""):"";place();}' +
  'document.addEventListener("click",function(e){var b=boxOf(e.target);if(!b)return;e.preventDefault();e.stopPropagation();say({type:"pick",index:index(b)});},true);' +
  'document.addEventListener("keydown",function(e){if(e.key!=="Enter"&&e.key!==" ")return;var b=e.target;if(!b||!b.hasAttribute||!b.hasAttribute("data-ionexa-n"))return;e.preventDefault();say({type:"pick",index:index(b)});},true);' +
  'window.addEventListener("message",function(e){var d=e.data;if(e.source!==parent||!d||d.source!==K||d.type!=="select")return;choose(d.index,d.label);});' +
  'window.addEventListener("resize",place);window.addEventListener("load",place);' +
  'function ready(){var b=document.querySelectorAll("[data-ionexa-n]");for(var i=0;i<b.length;i++)b[i].setAttribute("tabindex","0");if(window.ResizeObserver)new ResizeObserver(place).observe(document.documentElement);say({type:"ready"});}' +
  'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ready);else ready();})();';

/** base64(SHA-256(PICKER_SCRIPT)) — recomputed by site-pick-frame.test.mjs. */
export const PICKER_SCRIPT_SHA256 = "R/ltMuBkLq+1ep4c4LQbqKyES1mNuENrmvb5ZnnsgfQ=";

/** The policy written first into the preview: this script, and no other. */
export const PICKER_CSP = `script-src 'sha256-${PICKER_SCRIPT_SHA256}'`;

/**
 * The page as the editor's preview draws it: every part numbered as
 * findPageBoxes numbers it (so "part 3" is the same element here, in the
 * shell and in the edit route), and the policy, the style and the script
 * as the first thing after the doctype. A <meta> before <html> is parsed
 * into the head the browser opens for it, and the document's own <html>
 * and <head> then merge into those — the same placement lib/games/game-html.ts
 * relies on (sealGame).
 */
export function pickablePreview(html: string): string {
  const out = numberBoxes(html, findPageBoxes(html));
  const head =
    `<meta http-equiv="Content-Security-Policy" content="${PICKER_CSP}">` +
    `<style>${PICKER_STYLE}</style>` +
    `<script>${PICKER_SCRIPT}</script>`;
  const doctype = /^\s*<!doctype[^>]*>/i.exec(out);
  return doctype ? `${doctype[0]}${head}${out.slice(doctype[0].length)}` : `${head}${out}`;
}

/** What the frame may say: ready, or a part pressed (a whole, non-negative index). */
export function readPickMessage(data: unknown): { type: "ready" } | { type: "pick"; index: number } | null {
  if (!data || typeof data !== "object") return null;
  const message = data as { source?: unknown; type?: unknown; index?: unknown };
  if (message.source !== PICK_MESSAGE) return null;
  if (message.type === "ready") return { type: "ready" };
  if (message.type === "pick" && Number.isInteger(message.index) && (message.index as number) >= 0) return { type: "pick", index: message.index as number };
  return null;
}
