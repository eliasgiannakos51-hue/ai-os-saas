/**
 * "DO NOT PUT X" — DETECTED IN THE BRIEF, ENFORCED ON THE OUTPUT.
 *
 * V4.6. "I said explicitly 'no online booking'. It put one in." The same
 * shape as photoSource:"none", which was fixed the right way — in code,
 * after generation — while this one was only ever ASKED of the model, and
 * a model can ignore what it is asked. If it can, it will.
 *
 * Two halves, both pure so scripts/tests/website-negatives.test.mjs can run
 * them on real briefs and real markup:
 *
 *   parseNegativeInstructions(description) reads the brief for the
 *   negative forms this product actually receives — "no X", "without X",
 *   "don't add X", "μη βάλεις Χ", "χωρίς Χ", "sin X", "sans X", "ohne X",
 *   "senza X", "sem X" — and maps X onto a FEATURE this file knows how to
 *   find in HTML. An X it does not know is reported as `unknown`, so the
 *   owner can see that it was read and not acted on, rather than silently
 *   passed to a model that may or may not honour it.
 *
 *   enforceNegativeInstructions(html, negatives) removes every element
 *   that IS the feature — a booking form, a "Book now" button, a map
 *   iframe, a newsletter signup — and says what it removed, so the
 *   workspace can tell the owner "Removed the online booking, as you
 *   asked". Balanced-tag scanning, no DOM: this runs inside the worker on
 *   a string.
 *
 * THE SAME PATTERN, ONE LEVEL UP. MAX_PAGES_PER_SITE was also only asked;
 * pageCapReached() below is what lets the stream be aborted the moment a
 * sixth page begins, so the cap is enforced where the tokens are spent.
 */

import { DESIGN_BRIEF_HEADER } from "@/lib/website-design-brief";

export type NegativeFeature =
  | "booking"
  | "contactForm"
  | "newsletter"
  | "map"
  | "prices"
  | "gallery"
  | "testimonials"
  | "blog"
  | "social"
  | "chatWidget";

export type NegativeInstruction = {
  /** The words in the brief that were read as the instruction. */
  phrase: string;
  /** EVERY feature the clause names — "sin reservas y sin mapa" is two —
   *  or an empty list when X was not recognised. */
  features: NegativeFeature[];
};

export type Enforcement = {
  html: string;
  /** Features that were found and removed, with how many elements each. */
  removed: { feature: NegativeFeature; count: number }[];
};

// ---------------------------------------------------------------------
// The features, and how each is recognised — in the brief, and in HTML.
// ---------------------------------------------------------------------
type FeatureSpec = {
  /** Words that name the feature in a brief, in the languages the product ships. */
  briefWords: RegExp;
  /** Words that identify an element AS the feature: its text, its id/class, its href. */
  markup: RegExp;
  /** Which elements are candidates for removal when they match `markup`. */
  tags: readonly string[];
};

const W = (parts: string[]) => new RegExp(`(?:${parts.join("|")})`, "iu");

export const FEATURE_SPECS: Record<NegativeFeature, FeatureSpec> = {
  booking: {
    briefWords: W([
      "online booking", "bookings?", "reservations?", "book(?:ing)? (?:a )?(?:table|room|appointment|online)",
      "appointments?", "κράτησ\\p{L}*", "κρατήσ\\p{L}*", "ραντεβού", "réservations?", "reservas?", "prenotazion[ei]", "buchung\\p{L}*", "reservierung\\p{L}*",
      "预订", "预约", "予約", "حجز", "الحجز",
    ]),
    markup: W([
      "book(?:ing|ings| now| a table| online| an appointment)?\\b", "reserv(?:e|ation|ations)\\b", "appointment",
      "κράτησ", "κρατήσ", "ραντεβού", "réserv", "reserva", "prenota", "buchen", "buchung", "reservier", "预订", "预约", "予約", "حجز",
    ]),
    tags: ["form", "section", "a", "button", "div", "article"],
  },
  contactForm: {
    briefWords: W(["contact forms?", "φόρμ\\p{L}* επικοινωνίας", "formulaire de contact", "formulario de contacto", "kontaktformular", "modulo di contatto", "formulário de contacto", "联系表单", "お問い合わせフォーム", "نموذج (?:ال)?اتصال"]),
    markup: W(["contact", "επικοινων", "kontakt", "contatt", "contacto", "联系", "問い合わせ", "اتصال"]),
    tags: ["form"],
  },
  newsletter: {
    briefWords: W(["newsletters?", "subscri(?:be|ption)", "mailing list", "ενημερωτικ\\p{L}* δελτί\\p{L}*", "εγγραφή στο newsletter", "boletín", "infolettre", "通讯订阅", "ニュースレター", "نشرة"]),
    markup: W(["newsletter", "subscribe", "mailing list", "ενημερωτικ", "εγγραφείτε", "boletín", "infolettre", "abonn", "订阅", "ニュースレター", "نشرة"]),
    tags: ["form", "section", "div"],
  },
  map: {
    briefWords: W(["maps?", "google maps", "χάρτ\\p{L}*", "carte", "mapa", "karte", "mappa", "地图", "地図", "خريطة"]),
    markup: W(["google\\.com/maps", "maps\\.google", "openstreetmap", "maps/embed"]),
    tags: ["iframe", "section", "div"],
  },
  prices: {
    briefWords: W(["prices?", "price list", "pricing", "τιμ(?:ές|ή|οκατάλογο\\p{L}*)", "prix", "tarifs?", "precios?", "preise?", "prezzi", "preços?", "价格", "料金", "価格", "أسعار", "الأسعار"]),
    markup: W(["price", "pricing", "τιμ(?:ές|οκατάλογος)", "prix", "tarif", "precio", "preis", "prezz", "preço", "价格", "料金", "أسعار"]),
    tags: ["section", "table", "div"],
  },
  gallery: {
    briefWords: W(["galler(?:y|ies)", "γκαλερί", "galerie", "galería", "galleria", "galeria", "画廊", "ギャラリー", "معرض"]),
    markup: W(["galler", "γκαλερί", "galerie", "galería", "galleria", "galeria", "画廊", "ギャラリー", "معرض"]),
    tags: ["section", "div"],
  },
  testimonials: {
    briefWords: W(["testimonials?", "reviews?", "κριτικ\\p{L}*", "μαρτυρί\\p{L}*", "témoignages?", "avis", "testimonios?", "reseñas?", "bewertungen", "recensioni", "depoimentos", "评价", "口コミ", "آراء", "تقييمات"]),
    markup: W(["testimonial", "review", "κριτικ", "μαρτυρ", "témoignage", "avis", "testimoni", "reseña", "bewertung", "recension", "depoimento", "评价", "口コミ", "آراء", "تقييم"]),
    tags: ["section", "div", "blockquote"],
  },
  blog: {
    briefWords: W(["blog", "news section", "άρθρα", "νέα", "actualités", "noticias", "notizie", "notícias", "博客", "ブログ", "مدونة"]),
    markup: W(["blog", "άρθρ", "actualit", "noticia", "notizie", "notícia", "博客", "ブログ", "مدونة"]),
    tags: ["section", "article", "div", "a"],
  },
  social: {
    briefWords: W(["social (?:media|links?|icons?)", "instagram", "facebook", "tiktok", "κοινωνικ\\p{L}* (?:δίκτυ\\p{L}*|μέσ\\p{L}*)", "réseaux sociaux", "redes sociales", "soziale medien", "social network", "社交媒体", "ソーシャル", "التواصل الاجتماعي"]),
    markup: W(["instagram\\.com", "facebook\\.com", "tiktok\\.com", "twitter\\.com", "x\\.com/", "linkedin\\.com", "youtube\\.com/(?:@|channel|user|c/)"]),
    tags: ["a"],
  },
  chatWidget: {
    briefWords: W(["chat widget", "live chat", "chatbot", "whatsapp (?:button|widget)", "ζωντανή συνομιλία", "chat en vivo", "chat en direct", "live-chat", "在线客服", "チャット", "دردشة"]),
    markup: W(["live chat", "chat widget", "chatbot", "wa\\.me/", "whatsapp", "ζωντανή συνομιλία", "在线客服", "チャット", "دردشة"]),
    tags: ["a", "button", "div"],
  },
};

// ---------------------------------------------------------------------
// Reading the brief.
// ---------------------------------------------------------------------
// A negative clause: a negation word, then up to ~six words of X. One
// pattern per language family, with the negation forms the product's
// users actually type. The captured X is what is matched against the
// features' briefWords.
//
// NOT `\b`. JavaScript's \b is ASCII-only even under the `u` flag: between
// a space and "μ" there is no ASCII word character on either side, so
// "\bμην" never matches and every Greek negation was read as nothing.
// (The first draft of this file did exactly that, and the smoke test
// returned [] for "Μη βάλεις online κράτηση".) A letter/digit lookbehind
// is the boundary that works in every script the product ships.
const NOT_AFTER_WORD = "(?<![\\p{L}\\p{N}])";
const NEGATION_CLAUSE = new RegExp(
  [
    // English
    NOT_AFTER_WORD + "(?:no|without|don'?t (?:add|put|include|want)|do not (?:add|put|include|want)|never (?:add|put|include)|not? need(?: for)?|skip)\\s+(?<en>[^.,;!\\n]{2,60})",
    // Greek
    NOT_AFTER_WORD + "(?:μην? (?:βάλεις|βάλετε|προσθέσεις|προσθέσετε|έχει|υπάρχει|βάζεις)|χωρίς|όχι|να μην (?:έχει|υπάρχει|βάλεις))\\s+(?<el>[^.,;!\\n]{2,60})",
    // Spanish / Portuguese
    NOT_AFTER_WORD + "(?:sin|sem|no (?:pongas|incluyas|añadas|quiero)|não (?:coloque|inclua|quero))\\s+(?<es>[^.,;!\\n]{2,60})",
    // French
    NOT_AFTER_WORD + "(?:sans|ne (?:pas|jamais) (?:mettre|ajouter|inclure)|pas de)\\s+(?<fr>[^.,;!\\n]{2,60})",
    // German
    NOT_AFTER_WORD + "(?:ohne|kein[e]?[nsm]?|nicht (?:einbauen|hinzufügen|einfügen))\\s+(?<de>[^.,;!\\n]{2,60})",
    // Italian
    NOT_AFTER_WORD + "(?:senza|non (?:mettere|aggiungere|inserire|voglio))\\s+(?<it>[^.,;!\\n]{2,60})",
    // Chinese / Japanese / Arabic — no word boundaries in two of them
    "(?:不要|不需要|无需|没有)(?<zh>[^。，,;!\\n]{1,30})",
    "(?<ja>[^。、,;!\\n]{1,30})(?:は?不要|はいらない|は入れない|なし)",
    "(?:بدون|لا (?:تضع|تضيف|أريد)|من دون)\\s+(?<ar>[^.،,;!\\n]{2,60})",
  ].join("|"),
  "giu"
);

// "no booking but keep the map": X ends where the sentence turns. Without
// this cut the map would be read as forbidden too.
const ADVERSATIVE = /\s+(?:but|except|αλλά|εκτός|pero|excepto|mais|sauf|aber|außer|ma|tranne|mas|exceto)\s+|但|しかし|ただし|\s+(?:لكن|إلا)\s+/iu;

/**
 * Only the owner's own words. The design controls append a block of our
 * own prose to the description (lib/website-design-brief.ts: "This page
 * has NO photographs", "Do not draw ... any logo mark"), and a reader
 * that could not tell it from the brief would act on sentences nobody
 * typed.
 */
export function ownWordsOf(description: string): string {
  if (typeof description !== "string") return "";
  const header = description.lastIndexOf(DESIGN_BRIEF_HEADER);
  return (header === -1 ? description : description.slice(0, header)).trim();
}

/** Every negative clause in the owner's words, with the features it names. */
export function parseNegativeInstructions(description: string): NegativeInstruction[] {
  const text = ownWordsOf(description);
  if (text.length === 0) return [];
  const out: NegativeInstruction[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(NEGATION_CLAUSE)) {
    const raw = Object.values(m.groups ?? {}).find((g) => typeof g === "string" && g.length > 0)?.trim();
    if (!raw) continue;
    const x = raw.split(ADVERSATIVE)[0].trim();
    if (!x) continue;
    const phrase = m[0].slice(0, m[0].length - (raw.length - x.length)).trim();
    const features: NegativeFeature[] = [];
    for (const [name, spec] of Object.entries(FEATURE_SPECS) as [NegativeFeature, FeatureSpec][]) {
      if (spec.briefWords.test(x)) features.push(name);
    }
    const key = `${features.join("+") || "?"}:${x.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ phrase, features });
  }
  return out;
}

/** The forbidden features, deduplicated, for the prompt and the enforcer. */
export function forbiddenFeatures(negatives: NegativeInstruction[]): NegativeFeature[] {
  if (!Array.isArray(negatives)) return [];
  return [...new Set(negatives.flatMap((n) => (Array.isArray(n?.features) ? n.features : [])))];
}

/**
 * A whole PAGE that is the forbidden feature — slug "booking", label
 * "Κράτηση" — is not a section to cut out of a document; it is a document
 * that must not be served, and a nav entry that must not exist. Returns
 * the feature the page is, or null.
 */
export function featureOfPage(slug: string, label: string, forbidden: NegativeFeature[]): NegativeFeature | null {
  const text = `${slug ?? ""} ${label ?? ""}`;
  for (const f of forbidden) {
    if (FEATURE_SPECS[f]?.markup.test(text)) return f;
  }
  return null;
}

/**
 * The line that goes into the model's brief. Belt: the model is told, in
 * one unambiguous list, what it must not build. Braces: the enforcer
 * below runs regardless of whether it listened.
 */
export function negativeInstructionBlock(negatives: NegativeInstruction[]): string {
  const features = forbiddenFeatures(negatives);
  if (features.length === 0) return "";
  return (
    `THE BRIEF FORBIDS THESE, EXPLICITLY — do not build any of them, do not link to them, do not leave a placeholder for them:\n` +
    features.map((f) => `- ${FEATURE_LABELS_EN[f]}`).join("\n") +
    `\nAnything you build for one of these will be removed after generation, so a page that depends on it will look broken.`
  );
}

export const FEATURE_LABELS_EN: Record<NegativeFeature, string> = {
  booking: "online booking / reservations / appointment booking",
  contactForm: "a contact form",
  newsletter: "a newsletter or mailing-list signup",
  map: "an embedded map",
  prices: "prices or a price list",
  gallery: "a photo gallery",
  testimonials: "testimonials or reviews",
  blog: "a blog or news section",
  social: "social media links",
  chatWidget: "a chat widget",
};

// ---------------------------------------------------------------------
// Enforcing on markup.
// ---------------------------------------------------------------------
type Element = { start: number; end: number; tag: string; open: string; inner: string };

/**
 * Every balanced element of `tag` in `html`, outermost first. Void tags
 * (iframe is not void, but img/input are) are handled by the caller
 * choosing tags that close. Nested same-name elements are balanced by
 * depth count, which is what makes removing a whole <section> safe.
 */
function elementsOf(html: string, tag: string): Element[] {
  const out: Element[] = [];
  const re = new RegExp(`<(/?)${tag}\\b([^>]*)>`, "gi");
  const stack: { start: number; open: string }[] = [];
  for (const m of html.matchAll(re)) {
    const closing = m[1] === "/";
    const selfClosing = /\/\s*$/.test(m[2] ?? "");
    if (!closing && !selfClosing) {
      stack.push({ start: m.index ?? 0, open: m[0] });
      continue;
    }
    if (closing) {
      const opener = stack.pop();
      if (!opener) continue;
      const end = (m.index ?? 0) + m[0].length;
      if (stack.length === 0) {
        out.push({ start: opener.start, end, tag, open: opener.open, inner: html.slice(opener.start + opener.open.length, m.index ?? 0) });
      }
    }
  }
  return out;
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** Does this element, by its own attributes or text, ADVERTISE the feature? */
function isFeature(el: Element, spec: FeatureSpec): boolean {
  const attrs = el.open;
  const text = stripTags(el.inner);
  // A whole section is removed only when the feature is what it is ABOUT:
  // its heading, id, class or a form inside it says so — not when a
  // paragraph mentions the word once. For an <a>, <button>, <form> or
  // <iframe> the element is small enough that any match is the feature.
  if (el.tag === "section" || el.tag === "div" || el.tag === "article") {
    const idClass = attrs.match(/\b(?:id|class|aria-label|data-[a-z-]+)="([^"]*)"/gi)?.join(" ") ?? "";
    const heading = el.inner.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1] ?? "";
    const innerForm = /<form\b/i.test(el.inner) && spec.markup.test(stripTags(el.inner));
    const innerFrame = /<iframe\b/i.test(el.inner) && spec.markup.test(el.inner);
    return spec.markup.test(idClass) || spec.markup.test(stripTags(heading)) || innerForm || innerFrame;
  }
  return spec.markup.test(attrs) || spec.markup.test(text);
}

function removeRanges(html: string, ranges: { start: number; end: number }[]): string {
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  let out = html;
  for (const r of sorted) out = out.slice(0, r.start) + out.slice(r.end);
  return out;
}

/** Remove every element that IS a forbidden feature. Idempotent. */
export function enforceNegativeInstructions(html: string, negatives: NegativeInstruction[]): Enforcement {
  if (typeof html !== "string" || html.length === 0) return { html: typeof html === "string" ? html : "", removed: [] };
  const features = forbiddenFeatures(negatives);
  let out = html;
  const removed: Enforcement["removed"] = [];
  for (const feature of features) {
    const spec = FEATURE_SPECS[feature];
    let count = 0;
    // Big containers first, so a section that holds a booking form goes as
    // one removal rather than as a form plus an empty shell.
    for (const tag of spec.tags) {
      const hits = elementsOf(out, tag).filter((el) => isFeature(el, spec));
      // Never the <div> that is the whole page: a body wrapper that
      // happens to contain a booking form inside a section is not the
      // feature; the section is.
      const safe = hits.filter((el) => !(tag === "div" && el.inner.length > out.length * 0.6));
      if (safe.length === 0) continue;
      count += safe.length;
      out = removeRanges(out, safe);
    }
    if (count > 0) removed.push({ feature, count });
  }
  return { html: out, removed };
}

// ---------------------------------------------------------------------
// The page cap, enforced where the tokens are spent.
// ---------------------------------------------------------------------
const PAGE_MARKER = /<!--\s*IONEXA:PAGE\s+slug="[^"]{1,60}"\s+label="[^"]{1,80}"\s*-->/gi;

/** How many page markers the stream has produced so far. */
export function countPageMarkers(text: string): number {
  return (text.match(PAGE_MARKER) ?? []).length;
}

/**
 * True the moment the stream begins a page BEYOND the cap. The home page
 * carries a marker too, so `max` markers is exactly `max` pages; the
 * (max+1)th marker is the first token of a page nobody will be served —
 * and the moment to stop paying for it.
 */
export function pageCapReached(text: string, max: number): boolean {
  if (!Number.isFinite(max) || max < 1) return false;
  return countPageMarkers(text) > max;
}

/**
 * The text up to — not including — the marker that begins the page beyond
 * the cap. What the stream had produced for that page is discarded here;
 * what it cost is recorded by the caller before this is called, so the
 * discard is of markup, not of a charge that should have been made.
 */
export function truncateAtPageCap(text: string, max: number): string {
  if (typeof text !== "string") return "";
  if (!Number.isFinite(max) || max < 1) return text;
  const markers = [...text.matchAll(PAGE_MARKER)];
  if (markers.length <= max) return text;
  return text.slice(0, markers[max].index ?? text.length);
}

/**
 * Nav links whose target was never served. link-safety rewrites a link to
 * an unknown page to "#"; a menu of seven entries with two dead ones is
 * the "7 pages" the owner counted. Those two entries go.
 */
export function pruneDeadNavLinks(html: string): { html: string; pruned: number } {
  if (typeof html !== "string") return { html: "", pruned: 0 };
  let pruned = 0;
  const out = html.replace(/<nav\b[\s\S]*?<\/nav>/gi, (nav) => {
    const cleaned = nav.replace(/<li\b[^>]*>\s*<a\b[^>]*\bhref="#"[^>]*>[\s\S]*?<\/a>\s*<\/li>|<a\b[^>]*\bhref="#"[^>]*>[\s\S]*?<\/a>/gi, (m) => {
      // A "#" link whose text is "home"-like is the model's home link on
      // a one-page site (the prompt says home is href="#"); keep it.
      if (/href="#"[^>]*>\s*(?:home|αρχική|accueil|inicio|start|startseite|首页|ホーム|الرئيسية)\s*</i.test(m)) return m;
      pruned++;
      return "";
    });
    return cleaned;
  });
  return { html: out, pruned };
}
