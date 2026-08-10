/**
 * Keeps a generated site's own links INSIDE the generated site.
 *
 * THE BUG THIS FIXES, as reported. A generated camping site's top menu
 * sent visitors to the Ionexa login page. Nothing was hacked and the model
 * did nothing unreasonable: it wrote an ordinary multi-page nav —
 *
 *     <a href="/about">About</a>
 *
 * — because that is what a nav looks like on a normal site. But a
 * published site is ONE file served from /s/<subdomain>, so a browser
 * resolves href="/about" against the ORIGIN, not against the page. The
 * visitor lands on https://<our-domain>/about, which is ours, and ours
 * bounces anyone without a session to /login. Every "internal" link was a
 * one-way door out of the customer's site and into our sign-in form.
 *
 * WHY THIS CANNOT BE FIXED WITH <base href>. That is the textbook answer
 * and it is unavailable here: lib/publishing/public-serving.ts sets
 * `base-uri 'none'` in the CSP, deliberately, so that injected HTML cannot
 * re-point every relative URL on the page. Relaxing it to rescue a nav
 * would trade a broken link for an open redirect primitive. A <base> tag
 * would also not survive DOWNLOAD, which is the other way these files are
 * used.
 *
 * WHY NOT JUST TELL THE MODEL. The prompt does now say it (see
 * lib/website-builder.ts). A prompt rule is a strong prior, not a
 * guarantee, and the failure mode is silent and user-visible on the
 * customer's live site. So the prompt asks and this ENFORCES: every
 * generated document goes through here before it is stored, on both the
 * generate and the edit path.
 *
 * WHAT IS DELIBERATELY LEFT ALONE. Absolute external links (a Google Maps
 * pin, a Facebook page, a booking platform), mailto:, tel:, sms: — all of
 * those are things the site owner genuinely wants, and rewriting them
 * would break the site in the opposite direction. Only links that CLAIM to
 * be internal are touched.
 */

/** A link that was changed, kept so the caller can log or assert on it. */
export type LinkRewrite = {
  from: string;
  to: string;
  reason: "internal-path" | "dangerous-scheme" | "base-tag" | "form-action";
};

export type LinkSafetyResult = {
  html: string;
  rewrites: LinkRewrite[];
  /** Absolute off-site links that were KEPT, by host. The site owner asked
   *  for these; they are reported so a test can assert on them rather than
   *  guess. */
  externalHosts: string[];
};

const DANGEROUS_SCHEME = /^(javascript|vbscript|data)\s*:/i;
/** Schemes a marketing page legitimately uses that are not navigation. */
const KEPT_SCHEME = /^(mailto|tel|sms|geo|callto|whatsapp|fax):/i;
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * How a browser would treat this href from /s/<subdomain>.
 *
 * "internal-path" is the whole point: it is the class that LOOKS internal
 * to whoever wrote it and resolves off-site to whoever clicks it.
 */
export function classifyHref(rawHref: string): LinkRewrite["reason"] | "anchor" | "external" | "scheme" {
  const href = rawHref.trim();
  if (href === "" || href === "#") return "anchor";
  if (href.startsWith("#")) return "anchor";
  if (DANGEROUS_SCHEME.test(href)) return "dangerous-scheme";
  if (KEPT_SCHEME.test(href)) return "scheme";
  if (ABSOLUTE_URL.test(href)) return "external";
  // Protocol-relative (//example.com/x) is absolute to a browser even
  // though it reads like a path. Treating it as internal would silently
  // break a real external link.
  if (href.startsWith("//")) return "external";
  return "internal-path";
}

/** Every id in the document — the set of places an anchor can actually go. */
export function collectAnchorTargets(html: string): string[] {
  const ids = new Set<string>();
  for (const m of html.matchAll(/\bid\s*=\s*"([^"]+)"/g)) ids.add(m[1].trim());
  for (const m of html.matchAll(/\bid\s*=\s*'([^']+)'/g)) ids.add(m[1].trim());
  // <a name="about"> is the pre-HTML5 anchor form and still works. Scoped
  // to <a> tags on purpose: every <input name="email"> in a contact form
  // would otherwise be registered as a jump target, and "email" is exactly
  // the kind of slug a nav link would then match against.
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const named = tag.match(/\bname\s*=\s*"([^"]+)"/) ?? tag.match(/\bname\s*=\s*'([^']+)'/);
    if (named) ids.add(named[1].trim());
  }
  return [...ids].filter(Boolean);
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * The section slug an internal path was aiming at.
 *
 * A fragment already present wins outright — `/about#team` was asking for
 * `team` and saying so. Otherwise the last path segment, minus any file
 * extension, is the intent: `/about`, `about.html` and `./pages/about/`
 * all mean "about". A bare `/` or `index.html` means the top of the page.
 */
export function internalHrefSlug(rawHref: string): string {
  const href = rawHref.trim();
  const hash = href.indexOf("#");
  if (hash !== -1) {
    const frag = href.slice(hash + 1).trim();
    if (frag) return normalise(frag);
    return "";
  }
  const path = href.split("?")[0].replace(/\/+$/, "");
  const last = path.split("/").filter(Boolean).pop() ?? "";
  const withoutExt = last.replace(/\.(html?|php|aspx?|jsp)$/i, "");
  if (!withoutExt || /^index$/i.test(withoutExt)) return "";
  return normalise(withoutExt);
}

/**
 * Turns a slug into an anchor that exists.
 *
 * A link to `#about` on a page with no `id="about"` is not a fix — it is a
 * dead click, which is how a "fix" like this quietly fails. So the slug is
 * matched against the ids the document actually has, and only falls back
 * to the top of the page when nothing matches. `#` always works.
 */
export function resolveInternalHref(rawHref: string, ids: string[]): string {
  const slug = internalHrefSlug(rawHref);
  if (!slug) return "#";

  const byNorm = new Map<string, string>();
  for (const id of ids) if (!byNorm.has(normalise(id))) byNorm.set(normalise(id), id);

  const exact = byNorm.get(slug);
  if (exact) return `#${exact}`;

  // "services" should find id="our-services"; "contact-us" should find
  // id="contact". BOTH sides need the length floor: a document containing
  // id="a" would otherwise swallow every slug that has an "a" in it.
  if (slug.length >= 3) {
    for (const [norm, id] of byNorm) {
      if (norm.length < 3) continue;
      if (norm.includes(slug) || slug.includes(norm)) return `#${id}`;
    }
  }
  return "#";
}

const HREF_ATTR = /\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi;
const ACTION_ATTR = /\baction\s*=\s*("([^"]*)"|'([^']*)')/gi;

/**
 * The enforcement pass. Runs on every generated and every edited document,
 * immediately before it is stored.
 */
export function makeGeneratedLinksSafe(html: string): LinkSafetyResult {
  const rewrites: LinkRewrite[] = [];
  const externalHosts = new Set<string>();
  const ids = collectAnchorTargets(html);

  // A <base> tag re-points every relative URL on the page, which is the
  // same bug by another route — and the CSP blocks it, so it is dead
  // markup that only misleads whoever reads the file after downloading it.
  let out = html.replace(/<base\b[^>]*>/gi, (tag) => {
    rewrites.push({ from: tag, to: "", reason: "base-tag" });
    return "";
  });

  out = out.replace(/<a\b[^>]*>/gi, (tag) => {
    HREF_ATTR.lastIndex = 0;
    const m = HREF_ATTR.exec(tag);
    if (!m) return tag;
    const quote = m[1][0];
    const href = m[2] ?? m[3] ?? "";
    const kind = classifyHref(href);

    if (kind === "anchor" || kind === "scheme") return tag;
    if (kind === "external") {
      try {
        externalHosts.add(new URL(href.startsWith("//") ? `https:${href}` : href).host);
      } catch {
        /* an unparseable absolute URL is left exactly as written */
      }
      return tag;
    }

    const to = kind === "dangerous-scheme" ? "#" : resolveInternalHref(href, ids);
    rewrites.push({ from: href, to, reason: kind === "dangerous-scheme" ? "dangerous-scheme" : "internal-path" });

    let next = tag.replace(HREF_ATTR, `href=${quote}${to}${quote}`);
    // target="_blank" on an in-page anchor opens a second copy of the same
    // page in a new tab, which is worse than the link it replaced.
    next = next.replace(/\s+target\s*=\s*("[^"]*"|'[^']*')/gi, "");
    next = next.replace(/\s+rel\s*=\s*("\s*noopener[^"]*"|'\s*noopener[^']*')/gi, "");
    return next;
  });

  // A form whose action is a path posts to /s/<subdomain>, which serves
  // GET only. The prompt already says not to set one; this makes it true.
  out = out.replace(/<form\b[^>]*>/gi, (tag) => {
    ACTION_ATTR.lastIndex = 0;
    const m = ACTION_ATTR.exec(tag);
    if (!m) return tag;
    const action = m[2] ?? m[3] ?? "";
    const kind = classifyHref(action);
    if (kind === "external" || kind === "anchor") return tag;
    rewrites.push({ from: action, to: "", reason: "form-action" });
    return tag.replace(ACTION_ATTR, "").replace(/\s+>/, ">");
  });

  return { html: out, rewrites, externalHosts: [...externalHosts].sort() };
}

/**
 * Read-only version, for asserting on a document without changing it.
 *
 * Returns the hrefs that would leave the site. Used by the test that says
 * "no generated HTML may contain a link off the site unless the user asked
 * for it" — an empty array is that guarantee.
 */
export function findEscapingLinks(html: string): string[] {
  const escaping: string[] = [];
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    HREF_ATTR.lastIndex = 0;
    const m = HREF_ATTR.exec(tag);
    if (!m) continue;
    const href = m[2] ?? m[3] ?? "";
    const kind = classifyHref(href);
    if (kind === "internal-path" || kind === "dangerous-scheme") escaping.push(href);
  }
  if (/<base\b/i.test(html)) escaping.push("<base>");
  return escaping;
}
