// BOUNDARY-FORMAT: html
/**
 * WHAT A PAGE IS MADE OF, AND NOTHING ELSE (Rebuild), pure.
 *
 * A person who wants «my own version» of an app may point at one public
 * page of it. This reads that page's HTML for its STRUCTURE — the title,
 * the headings, the labels of the menu and of the buttons, the fields of
 * the forms, and a short sample of the visible words — and throws the rest
 * away: no script, no style, no image address, no link target, no comment,
 * no markup. What comes out is a few hundred characters of labels, bounded
 * hard (MAX_REFERENCE_CHARS), which the planning call receives between the
 * untrusted markers as DATA about what such an app has on its screens. It
 * is never an instruction and never material to copy: the build rules and
 * the system prompt say the app is original.
 *
 * Regex, not a DOM: this runs on a page a stranger wrote, so it never
 * evaluates anything and cannot be made to fetch anything; a malformed page
 * costs a few empty lists, not an exception.
 */
export const MAX_REFERENCE_CHARS = 4_000;
const ITEM = 80;
const LIST = 25;

export type PageStructure = {
  title: string;
  headings: string[];
  menu: string[];
  buttons: string[];
  fields: string[];
  sample: string;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s
    .replace(/&#(\d{1,6});/g, (_m, n: string) => (Number(n) > 0 && Number(n) < 0x110000 ? String.fromCodePoint(Number(n)) : " "))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
const text = (html: string) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => s.slice(0, n);

function uniqueClipped(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = clip(raw.replace(/\s+/g, " ").trim(), ITEM);
    if (item.length < 2 || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    out.push(item);
    if (out.length >= LIST) break;
  }
  return out;
}

function attr(tag: string, name: string): string {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return decode(m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
}

export function extractStructure(rawHtml: string): PageStructure {
  // Everything that is not visible words or a label goes first.
  const html = String(rawHtml ?? "")
    .slice(0, 600_000)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, (m, tag: string) => (tag.toLowerCase() === "head" ? m : " "));

  const title = clip(text(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1] ?? ""), 120);
  const headings = uniqueClipped([...html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]\s*>/gi)].map((m) => text(m[1])));
  const menu = uniqueClipped(
    [...html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav\s*>/gi)].flatMap((nav) => [...nav[1].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi)].map((a) => text(a[1])))
  );
  const buttons = uniqueClipped([
    ...[...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button\s*>/gi)].map((m) => text(m[1])),
    ...[...html.matchAll(/<input\b[^>]*>/gi)].filter((m) => /\btype\s*=\s*["']?(?:submit|button)/i.test(m[0])).map((m) => attr(m[0], "value")),
  ]);
  const labels = [...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label\s*>/gi)].map((m) => text(m[1]));
  const inputs = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi)]
    .map((m) => {
      const kind = /^<(\w+)/.exec(m[0])?.[1] ?? "input";
      const type = /^input$/i.test(kind) ? attr(m[0], "type") || "text" : kind;
      if (/^(?:hidden|submit|button|image|reset)$/i.test(type)) return "";
      const name = attr(m[0], "aria-label") || attr(m[0], "placeholder") || attr(m[0], "name");
      return name ? `${type}: ${name}` : type;
    })
    .filter(Boolean);
  const fields = uniqueClipped([...labels, ...inputs]);

  const body = /<body\b[^>]*>([\s\S]*)<\/body\s*>/i.exec(html)?.[1] ?? html;
  const sample = clip(text(body.replace(/<(?:nav|header|footer|form)\b[\s\S]*?<\/(?:nav|header|footer|form)\s*>/gi, " ")), 1_200);
  return { title, headings, menu, buttons, fields, sample };
}

/** The structure as the plain, bounded text the planning call is handed. */
export function renderReference(host: string, s: PageStructure): string {
  const lines = [
    `Page of: ${host}`,
    s.title && `Title: ${s.title}`,
    s.headings.length > 0 && `Headings: ${s.headings.join(" | ")}`,
    s.menu.length > 0 && `Menu: ${s.menu.join(" | ")}`,
    s.buttons.length > 0 && `Buttons: ${s.buttons.join(" | ")}`,
    s.fields.length > 0 && `Fields: ${s.fields.join(" | ")}`,
    s.sample && `Words on the page (a sample): ${s.sample}`,
  ].filter(Boolean) as string[];
  return lines.join("\n").slice(0, MAX_REFERENCE_CHARS);
}

/** The first web address a person wrote in their description, or null. */
export function firstUrl(description: string): string | null {
  const m = /\bhttps?:\/\/[^\s<>"'`)\]]+/i.exec(String(description ?? ""));
  return m ? m[0].replace(/[.,;:!?]+$/, "") : null;
}
