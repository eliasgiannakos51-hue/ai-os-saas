// Subdomain validation for published sites.
//
// Pure and client-safe: the publish dialog checks as the user types, and
// the API route checks the same string again with the same function. The
// client check is a convenience; the server check is the boundary, and the
// unique index in the database is the backstop behind both.

export const SUBDOMAIN_MIN_LENGTH = 3;
export const SUBDOMAIN_MAX_LENGTH = 30;

// Lowercase letters, digits and hyphens only — the LDH subset that is
// valid in a DNS label, so the same string works when real subdomains
// (acme.ionexa.ai) replace the /s/acme path we serve from today. Anything
// that would need punycode or percent-encoding is refused now rather than
// becoming a migration problem later.
const SHAPE_RE = /^[a-z0-9-]+$/;

// Names that must never belong to a customer.
//
// Three separate reasons, all of which end the same way:
//   - it would shadow a real route on the apex domain (www, api, app,
//     dashboard, login) once these become real subdomains;
//   - it would let someone impersonate us to our own users (admin,
//     support, billing, security, help, official);
//   - it is infrastructure that expects to be ours (mail, smtp, ns1, mx,
//     cdn, static, assets).
//
// A user who wants "support" for their own business can have
// "acme-support". Losing that is a smaller cost than one phishing page at
// support.ionexa.ai.
export const RESERVED_SUBDOMAINS = new Set([
  // our own routes / product surface
  "www", "app", "api", "admin", "dashboard", "login", "signup", "auth",
  "account", "settings", "billing", "pricing", "checkout", "portal",
  "docs", "doc", "help", "support", "status", "blog", "news", "about",
  "contact", "terms", "privacy", "legal", "security", "roadmap",
  "changelog", "marketplace", "community", "forum", "chat", "agents",
  // brand and impersonation
  "ionexa", "ionexaai", "official", "team", "staff", "root", "system",
  "no-reply", "noreply", "postmaster", "webmaster", "hostmaster",
  // infrastructure
  "mail", "email", "smtp", "imap", "pop", "mx", "ns", "ns1", "ns2", "dns",
  "cdn", "static", "assets", "media", "img", "images", "files", "download",
  "ftp", "vpn", "proxy", "gateway", "server", "host", "cloud", "db",
  "database", "storage", "backup", "test", "testing", "dev", "staging",
  "stage", "preview", "demo", "sandbox", "local", "localhost", "internal",
  // things that make a URL look like something it is not
  "secure", "verify", "verification", "update", "confirm", "payment",
  "pay", "wallet", "bank", "invoice",
]);

export type SubdomainCheck =
  | { ok: true; subdomain: string }
  | {
      ok: false;
      /** Stable code so the UI can translate it — the message is English. */
      reason: "empty" | "too_short" | "too_long" | "invalid_characters" | "bad_edges" | "reserved";
      message: string;
    };

/**
 * Normalises and validates. Returns the CANONICAL form on success — always
 * lowercase and trimmed — so callers store exactly what was checked rather
 * than the raw input.
 */
export function validateSubdomain(raw: unknown): SubdomainCheck {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  if (!value) return { ok: false, reason: "empty", message: "Choose an address for your site." };
  if (value.length < SUBDOMAIN_MIN_LENGTH)
    return {
      ok: false,
      reason: "too_short",
      message: `At least ${SUBDOMAIN_MIN_LENGTH} characters.`,
    };
  if (value.length > SUBDOMAIN_MAX_LENGTH)
    return {
      ok: false,
      reason: "too_long",
      message: `At most ${SUBDOMAIN_MAX_LENGTH} characters.`,
    };
  if (!SHAPE_RE.test(value))
    return {
      ok: false,
      reason: "invalid_characters",
      message: "Only lowercase letters, numbers and hyphens.",
    };
  // A leading or trailing hyphen is invalid in a DNS label, and a doubled
  // one is how punycode-looking prefixes ("xn--") get smuggled in.
  if (value.startsWith("-") || value.endsWith("-") || value.includes("--"))
    return {
      ok: false,
      reason: "bad_edges",
      message: "Can't start or end with a hyphen, or contain two in a row.",
    };
  if (RESERVED_SUBDOMAINS.has(value))
    return { ok: false, reason: "reserved", message: "That address is reserved." };

  return { ok: true, subdomain: value };
}

/**
 * A suggested address from a site's name — what the publish dialog
 * pre-fills. Never returns an invalid or reserved value: a suggestion the
 * user then has to fix is worse than an empty box.
 */
export function suggestSubdomain(name: string): string {
  const base = String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    // Strip combining marks, so "Café Ελλάς" contributes "caf" rather than
    // being mangled into percent-escapes.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SUBDOMAIN_MAX_LENGTH)
    .replace(/-$/, "");

  const check = validateSubdomain(base);
  return check.ok ? check.subdomain : "";
}

/**
 * The public URL for a subdomain.
 *
 * Path-based today (`/s/acme`) because there is no wildcard domain to
 * point at yet. `PUBLISHED_SITE_DOMAIN`, when set, switches this to real
 * subdomains without touching a single stored row — which is the entire
 * reason the subdomain is stored as a bare label rather than as a URL.
 */
/**
 * Stand-in for a subdomain when building a URL TEMPLATE rather than a URL.
 *
 * The publish dialog previews the address while it is being typed, and the
 * two URL shapes put the subdomain in different places — `/s/acme` versus
 * `acme.example.com`. Passing this token through publishedSiteUrl and
 * splitting on it gives the client a prefix and a suffix that are correct
 * for whichever shape is configured, without the client knowing which.
 *
 * Chosen to be impossible as a real subdomain: braces are rejected by
 * validateSubdomain, so it can never collide with a stored value.
 */
export const SUBDOMAIN_TOKEN = "{subdomain}";

export function publishedSiteUrl(subdomain: string, siteUrl: string, domain?: string | null): string {
  if (domain && domain.trim()) {
    const clean = domain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `https://${subdomain}.${clean}`;
  }
  return `${siteUrl.replace(/\/+$/, "")}/s/${subdomain}`;
}

/**
 * The absolute PATH a published site is served under — "/s/acme", or "/"
 * when a wildcard domain puts the site on its own host.
 *
 * Derived from publishedSiteUrl rather than rebuilt, so the two can never
 * disagree about which shape is configured. It is what turns a page link
 * into something a browser resolves the same way from every page of the
 * site: a nav written relative is right on /s/acme/services and wrong on
 * /s/acme, and no amount of care in the prompt fixes that.
 */
export function publishedSiteBasePath(subdomain: string): string {
  const url = publishedSiteUrl(subdomain, "https://example.invalid", process.env.PUBLISHED_SITE_DOMAIN);
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path === "" ? "/" : path;
  } catch {
    // Unreachable with a validated subdomain; a link left relative is a
    // far better failure than one pointing at a path built from a throw.
    return "/";
  }
}
