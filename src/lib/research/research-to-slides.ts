import { MAX_BULLETS, MAX_BULLET_CHARS, MAX_NOTES_CHARS, MAX_SLIDES, MAX_TITLE_CHARS, type Deck, type Slide } from "@/lib/presentations/deck";

/**
 * A RESEARCH REPORT, SENT TO SLIDES WITH ONE PRESS (MASTER 16, package 11),
 * behind the switch "research-slides".
 *
 * THE REPORT TRAVELS AS ITS ID, not as text: the Slides field takes 4,000
 * characters (lib/presentations/deck.ts) and a report is routinely five
 * times that. api/presentations/generate reads the report by id and owner,
 * and this file turns it into the brief the deck is written from — the
 * report's own words, its numbers kept — and, after the model, into the
 * sources slides.
 *
 * THE SOURCES SLIDES ARE WRITTEN BY THIS CODE, never by the model: the
 * titles and addresses are copied from research_reports.sources, numbered
 * as the report numbers them, so the [3] on a slide and the [3] on the
 * sources slide are the same page. A model asked to list sources writes
 * plausible ones.
 *
 * Pure, so the gate runs it. Held by scripts/tests/research-slides.test.mjs.
 */

/** The longest brief a report becomes: about a 25-minute read, and what a 20-slide deck can carry. */
export const RESEARCH_BRIEF_CHARS = 24_000;

export type ReportForSlides = { topic: string; sections: unknown; sources: unknown };
type Source = { title: string; url: string };

/** The stored sources, read defensively: only http(s), as the worker kept them. */
export function readReportSources(raw: unknown): Source[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s) => {
    if (!s || typeof s !== "object") return [];
    const { title, url } = s as { title?: unknown; url?: unknown };
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return [];
    return [{ title: typeof title === "string" && title.trim() ? title.trim().slice(0, 200) : url, url: url.slice(0, 500) }];
  });
}

function readSections(raw: unknown): { heading: string; body: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s) => {
    if (!s || typeof s !== "object") return [];
    const { heading, body } = s as { heading?: unknown; body?: unknown };
    const text = typeof body === "string" ? body.trim() : "";
    return text ? [{ heading: typeof heading === "string" ? heading.trim() : "", body: text }] : [];
  });
}

/**
 * The brief a deck is written from: what to do with the report, then the
 * report itself. Null when the report has nothing to present.
 */
export function researchBrief(report: ReportForSlides): { brief: string; sources: Source[]; cut: boolean } | null {
  const sections = readSections(report.sections);
  if (sections.length === 0) return null;
  const sources = readReportSources(report.sources);
  const head =
    `Make a presentation of this research report on «${report.topic.trim().slice(0, 300)}». ` +
    "Use only what the report says: no figure, name or claim it does not contain. " +
    (sources.length > 0
      ? "Keep the source number [n] after every claim that has one in the report, exactly as written there — the numbered sources slides are added after yours, so do not write a sources slide yourself. "
      : "") +
    "Write the slides in the language the report is written in.\n\nTHE REPORT:\n";
  let body = sections.map((s) => (s.heading ? `## ${s.heading}\n${s.body}` : s.body)).join("\n\n");
  let cut = false;
  const room = RESEARCH_BRIEF_CHARS - head.length - 120;
  if (body.length > room) {
    body = `${body.slice(0, room)}\n\n[The report continues; the part above is what fits a presentation.]`;
    cut = true;
  }
  return { brief: head + body, sources, cut };
}

/** "Sources" in the language the deck is written in. */
const SOURCES_TITLE: Record<string, string> = {
  el: "Πηγές", en: "Sources", de: "Quellen", es: "Fuentes", fr: "Sources", it: "Fonti", pt: "Fontes", zh: "来源", ja: "出典", ar: "المصادر",
};

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * The deck with the report's sources after the model's slides: six to a
 * slide, "[n] Title — site" on the slide and the full addresses in the
 * notes, within the deck's own bounds. Slides past MAX_SLIDES are not
 * added; the last one says how many sources it could not hold.
 */
export function withSourcesSlides(deck: Deck, sources: readonly Source[]): Deck {
  if (sources.length === 0) return deck;
  const title = SOURCES_TITLE[deck.locale.slice(0, 2)] ?? SOURCES_TITLE.en;
  const room = MAX_SLIDES - deck.slides.length;
  if (room <= 0) return deck;
  const pages = Math.ceil(sources.length / MAX_BULLETS);
  const used = Math.min(pages, room);
  const slides: Slide[] = [];
  for (let p = 0; p < used; p++) {
    const chunk = sources.slice(p * MAX_BULLETS, (p + 1) * MAX_BULLETS);
    const first = p * MAX_BULLETS;
    const more = p === used - 1 && used < pages ? sources.length - (p + 1) * MAX_BULLETS : 0;
    slides.push({
      layout: "bullets",
      title: (used > 1 ? `${title} (${p + 1}/${used})` : title).slice(0, MAX_TITLE_CHARS),
      bullets: chunk.map((s, i) => `[${first + i + 1}] ${s.title} — ${host(s.url)}`.slice(0, MAX_BULLET_CHARS)),
      notes: [...chunk.map((s, i) => `[${first + i + 1}] ${s.url}`), ...(more > 0 ? [`+${more}`] : [])].join("\n").slice(0, MAX_NOTES_CHARS),
      imageQuery: null,
      image: null,
    });
  }
  return { ...deck, slides: [...deck.slides, ...slides] };
}
