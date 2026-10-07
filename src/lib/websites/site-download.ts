import { normalisePages } from "@/lib/publishing/website-pages";
import { pageLinkTarget } from "@/lib/website-link-safety";
import { zipStore } from "@/lib/websites/zip-store";

/**
 * THE WHOLE SITE, DOWNLOADED (package 10). A one-page site is one .html, as
 * it always was. A site with pages is a .zip: index.html and one file per
 * page, with the links between them rewritten to those files — the model
 * writes href="about" and href=".", which on a disk opened from a folder
 * lead nowhere — so the site works opened straight from the folder.
 * Downloading only the home page of a five-page site was a nav of dead
 * links. Held by scripts/tests/site-pages.test.mjs.
 */

const fileOf = (slug: string) => (slug ? `${slug}.html` : "index.html");

/** Each page's links to the site's other pages, pointed at their files. */
export function linkPagesForDisk(html: string, slugs: readonly string[]): string {
  const known = new Set(slugs.map((s) => s.toLowerCase()));
  return html.replace(/(<a\b[^>]*?\shref\s*=\s*)(["'])([^"']*)\2/gi, (whole, before: string, quote: string, href: string) => {
    const page = pageLinkTarget(href, known);
    if (page === null) return whole;
    const hash = href.includes("#") ? href.slice(href.indexOf("#")) : "";
    return `${before}${quote}${fileOf(page)}${hash}${quote}`;
  });
}

export function siteDownload(site: { name: string; html_content: string; pages?: unknown }): { filename: string; type: string; data: Uint8Array } {
  const { pages } = normalisePages(site.pages);
  const base = (site.name || "site").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "site";
  const enc = new TextEncoder();
  if (pages.length === 0) {
    return { filename: `${base}.html`, type: "text/html;charset=utf-8", data: enc.encode(site.html_content) };
  }
  const slugs = pages.map((p) => p.slug);
  const files = [
    { name: "index.html", data: enc.encode(linkPagesForDisk(site.html_content, slugs)) },
    ...pages.map((p) => ({ name: fileOf(p.slug), data: enc.encode(linkPagesForDisk(p.html, slugs)) })),
  ];
  return { filename: `${base}.zip`, type: "application/zip", data: zipStore(files) };
}
