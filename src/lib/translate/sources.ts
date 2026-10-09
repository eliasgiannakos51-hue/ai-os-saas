import { LANGUAGES } from "@/lib/languages";
import { normalisePages, type WebsitePage } from "@/lib/publishing/website-pages";
import { resolveLanguage } from "@/lib/text/resolve-language";
import { planHtml, rebuildHtml, type Piece, type Plan } from "@/lib/translate/segments";

/**
 * A SITE OR A DOCUMENT, AS ONE LIST OF PIECES AND BACK (package 28), pure.
 *
 * A site is its home page (`html_content`) and up to four more
 * (`pages`, lib/publishing/website-pages.ts), each with the label its
 * navigation shows. Every page and every label goes into one list, so the
 * whole site is priced, held and translated as one thing. The slugs stay:
 * /s/<subdomain>/contact is still /contact, and every link inside the
 * pages still leads where it led.
 *
 * A document is its title and its HTML (user_documents.content.html).
 */
export type Translatable = {
  pieces: Piece[];
  /** The language the words are in now: two letters, as resolveLanguage gives them. */
  from: string;
};

export type SiteRow = { name: string; html_content: string; pages: unknown };
export type TranslatedSite = { name: string; html_content: string; pages: WebsitePage[] | null; kept: number };
export type DocRow = { title: string; html: string };
export type TranslatedDoc = { title: string; html: string; kept: number };

/** "Camping Ήλιος · English": the copy says which language it is in. */
export function copyName(name: string, target: string, max = 100): string {
  const label = LANGUAGES.find((l) => l.code === target)?.label ?? target;
  const suffix = ` · ${label}`;
  return name.trim().slice(0, Math.max(1, max - suffix.length)) + suffix;
}

function detect(pieces: readonly Piece[]): string {
  return resolveLanguage(pieces.map((p) => p.text.replace(/<\/?\d+\/?>/g, " ")).join(" ").slice(0, 6000), "en");
}

export function planSite(site: SiteRow): Translatable & { rebuild: (translations: readonly (string | null)[], target: string) => TranslatedSite } {
  const pages = normalisePages(site.pages).pages;
  const pieces: Piece[] = [];
  const home = planHtml(site.html_content, 0);
  pieces.push(...home.pieces);
  const planned: { page: WebsitePage; labelSeg: number; plan: Plan; offset: number; count: number }[] = [];
  for (const page of pages) {
    const labelSeg = pieces.length;
    pieces.push({ text: page.label, kind: "plain" });
    const offset = pieces.length;
    const one = planHtml(page.html, offset);
    pieces.push(...one.pieces);
    planned.push({ page, labelSeg, plan: one.plan, offset, count: one.pieces.length });
  }
  return {
    pieces,
    from: detect(pieces),
    rebuild(translations, target) {
      const homeOut = rebuildHtml(home.plan, translations.slice(0, home.pieces.length), home.pieces, 0, target);
      let kept = homeOut.kept;
      const outPages = planned.map(({ page, labelSeg, plan, offset, count }) => {
        const out = rebuildHtml(plan, translations.slice(offset, offset + count), pieces.slice(offset, offset + count), offset, target);
        kept += out.kept;
        const label = translations[labelSeg];
        if (typeof label !== "string" || !label.trim()) kept++;
        return { ...page, label: typeof label === "string" && label.trim() ? label.trim().slice(0, 60) : page.label, html: out.html };
      });
      return { name: copyName(site.name, target), html_content: homeOut.html, pages: pages.length > 0 ? outPages : null, kept };
    },
  };
}

export function planDocument(doc: DocRow): Translatable & { rebuild: (translations: readonly (string | null)[], target: string) => TranslatedDoc } {
  const pieces: Piece[] = [{ text: doc.title.trim() || "Untitled", kind: "plain" }];
  const body = planHtml(doc.html, 1);
  pieces.push(...body.pieces);
  return {
    pieces,
    from: detect(pieces),
    rebuild(translations) {
      const out = rebuildHtml(body.plan, translations.slice(1), body.pieces, 1);
      const title = translations[0];
      const ok = typeof title === "string" && title.trim();
      return { title: ok ? title.trim().slice(0, 200) : doc.title, html: out.html, kept: out.kept + (ok ? 0 : 1) };
    },
  };
}
