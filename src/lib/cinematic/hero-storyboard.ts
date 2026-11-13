import { escapeHtml } from "@/lib/html-escape";

/**
 * CINEMATIC STYLE ΣΤ — THE FIRST STYLE ACTUALLY WIRED (docs/v6-cinematic-
 * sites-2026-10-03.md §1: "Simple premium", parallax only, cheapest of
 * the seven). Phase 1a (2026-11-08, agent/mistral) shipped the player
 * script (public/ionexa-players.js) and the scanner/CSP allowlist but
 * wired NO style into generation — Task #22's description said otherwise
 * and was wrong; corrected 2026-11-09 (docs/PROGRESS.md). This file is
 * the first piece that actually writes `data-ix-depth` onto a generated
 * page.
 *
 * DETERMINISTIC, NOT A PROMPT LINE. route.ts's own comment states this
 * repository's rule 23: "an instruction the model can ignore will be
 * ignored" — the reason the spelling check and the structure-similarity
 * check are checks and not system-prompt sentences. The same applies
 * here: asking the model to remember to add a data attribute would work
 * until it didn't, silently, on whichever generation happened to drop it.
 * This runs as a post-processing step instead, same shape as
 * enforceSeoHead/enforceImageAltText (src/lib/seo/*).
 *
 * NO FAKE MEDIA, NO REPLACED PHOTO. The real photo the Unsplash pipeline
 * already resolved (resolveWebsiteImagePlaceholders) stays exactly where
 * it is — this only (a) adds the one attribute the player script reads
 * for a parallax layer (ionexa-players.js's `parallax()`, which needs
 * nothing but `data-ix-depth` on any element — no `data-ix="loop"`, no
 * video, no frame sequence) and (b) adds one small, honest caption that
 * the full AI-generated hero (Nano Banana Pro / Veo 3.1, behind
 * GEMINI_API_KEY, which is not set in this environment) is not live yet.
 * Reuses the "Storyboard ·" wording the owner's own research samples
 * already used (docs/samples/cinematic/cava.html's `.sb-note`) rather
 * than inventing new phrasing.
 *
 * ONE HERO, ONE HEURISTIC, STATED PLAINLY RATHER THAN HIDDEN: the FIRST
 * `<img>` tag in the document. Every sample this product's own research
 * produced, and every generated page this codebase's own prompt asks
 * for, opens with a hero photo before any other content image — but it
 * IS a heuristic, not a parse of what "hero" structurally means. An
 * unusual page whose first image is a small logo gets a parallaxed logo:
 * cosmetically odd, never unsafe, never a corrupted fact or a missing
 * image. Documented here rather than guarded against, because guarding
 * against it would mean inventing a "what is a hero" classifier with no
 * more evidence behind it than this one.
 *
 * IDEMPOTENT: a second pass is a no-op. One check does it — the first
 * `<img>` this function would act on is the same tag a first pass already
 * wrote `data-ix-depth` onto, so "does this tag already carry a depth of
 * its own" (needed anyway, for an image that arrives with one for some
 * other reason) already answers "has this already run" too. A separate,
 * earlier `html.includes("data-ix-hero")` check was tried and dropped: it
 * never changed the outcome, because the only `<img>` either check can
 * see is the same one, so it was dead weight a mutation sweep caught
 * (2026-11-09) rather than a real second safeguard.
 */

const HTML_LANG = /<html\b[^>]*\blang="([a-zA-Z-]{2,10})"/i;
const FIRST_IMG = /<img\b[^>]*>/i;
const HERO_MARKER = "data-ix-hero";

/** Gentle on purpose — the range this product's own samples already used
 *  for a background/decorative parallax layer (docs/samples/cinematic/
 *  cafe.html: 0.04 to 0.16) rather than a number invented here. A full
 *  hero photo moving more than this reads as a bug, not a style. */
const HERO_DEPTH = "0.06";

/**
 * The hero caption, in the same 10 languages everything else in this
 * product is translated into (src/lib/languages.ts's LANGUAGES — the
 * only list this app keeps a real translation for, per that file's own
 * comment on why a language without one is never offered). First-pass
 * translations beyond en/el, same as this product's other short,
 * non-legal UI strings — not a professionally reviewed set.
 */
const HERO_NOTE_TEXT: Record<string, string> = {
  en: "Storyboard · full AI video arriving soon",
  el: "Storyboard · το πλήρες βίντεο AI έρχεται σύντομα",
  de: "Storyboard · das vollständige KI-Video kommt bald",
  es: "Storyboard · el video completo con IA llega pronto",
  fr: "Storyboard · la vidéo IA complète arrive bientôt",
  it: "Storyboard · il video AI completo arriva presto",
  pt: "Storyboard · o vídeo completo com IA chega em breve",
  zh: "分镜 · 完整的AI视频即将上线",
  ja: "ストーリーボード · AIによる本編動画は近日公開",
  ar: "ستوري بورد · فيديو الذكاء الاصطناعي الكامل قريبًا",
};

/**
 * Same dark chip as the Unsplash credit (website-image-placeholders.ts's
 * CREDIT_STYLE) — reused rather than invented, because that style is
 * already proven to stay legible over a photograph of unknown brightness
 * (that file's own comment on why plain dark text on a dark hero photo is
 * indistinguishable from no attribution at all — the same problem a
 * caption over a hero photo has).
 */
const HERO_NOTE_STYLE =
  "display:block;position:relative;margin:4px 0 0;font-size:11px;line-height:1.4;" +
  "font-family:system-ui,-apple-system,sans-serif;color:#fff;" +
  "background:rgba(0,0,0,.55);padding:2px 6px;border-radius:3px;" +
  "width:fit-content;max-width:100%;";

export type CinematicHeroApplication = { html: string; applied: boolean };

/**
 * Applies style ΣΤ's parallax to the document's first `<img>`, with its
 * honest "not live yet" caption — or leaves the document untouched when
 * there is no image, the image already carries a `data-ix-depth` of its
 * own for some other reason, or this already ran once.
 */
export function applyCinematicHeroParallax(html: string): CinematicHeroApplication {
  const match = FIRST_IMG.exec(html);
  if (!match) return { html, applied: false };

  const tag = match[0];
  if (/\bdata-ix-depth=/.test(tag)) return { html, applied: false };

  const lang = (HTML_LANG.exec(html)?.[1] ?? "en").toLowerCase().slice(0, 2);
  const caption = HERO_NOTE_TEXT[lang] ?? HERO_NOTE_TEXT.en;

  const withDepth = tag.replace(/^<img\b/i, `<img ${HERO_MARKER}="" data-ix-depth="${HERO_DEPTH}"`);
  const note = `<span class="ix-hero-note" aria-hidden="true" style="${HERO_NOTE_STYLE}">${escapeHtml(caption)}</span>`;

  const start = match.index;
  const end = start + tag.length;
  return {
    html: html.slice(0, start) + withDepth + note + html.slice(end),
    applied: true,
  };
}
