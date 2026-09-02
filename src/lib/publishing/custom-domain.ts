// Custom domain validation for published sites.
//
// Pure and client-safe, exactly like lib/publishing/subdomain.ts and for
// the same reason: the settings form checks as the user types, the API
// route checks the same string again with the same function, and the
// database's unique index is the backstop behind both. The client check is
// a convenience; the server check is the boundary.
//
// WHAT THIS FILE IS NOT. It does not talk to DNS and it does not talk to a
// hosting provider. Deciding whether a string is a domain we are willing
// to accept is a different question from whether its owner has proved
// control of it (lib/publishing/domain-verification.ts) and from whether
// the host is configured to serve it. Keeping them apart is what lets the
// first one be tested without a network.

// ---------------------------------------------------------------------
// NOTHING IN THE APP CALLS THIS YET, AND THAT IS THE POINT OF SAYING SO.
// ---------------------------------------------------------------------
//
// This module and lib/publishing/domain-verification.ts are complete and
// carry 104 passing checks between them. They are imported by their own
// tests and by each other, and by NO route and NO component. There is no
// settings field, no API route, no DNS instructions in any locale, and no
// tier gate — measured on 2026-09-02, and a sibling comment in
// domain-verification.ts pointed at "the custom-domain settings route",
// which has never existed.
//
// A green gate over an unreachable library is the easiest thing in a
// codebase to mistake for a shipped feature, so scripts/tests/
// custom-domain.test.mjs asserts the wiring state explicitly and will go
// red the day it changes — at which point this note is what has to be
// updated.
//
// WHAT IS STILL NEEDED, beyond a form: an operator has to tell the HOST
// about each customer domain so it will terminate TLS for it. On Vercel
// that is an API call with a token, a project id and a team id, none of
// which exist in lib/env-check.ts. Shipping the form without that half
// produces a screen that accepts a domain, shows correct DNS records,
// verifies ownership honestly — and then serves nothing over HTTPS.

export const CUSTOM_DOMAIN_MAX_LENGTH = 253; // RFC 1035 total length
const LABEL_MAX_LENGTH = 63;

// A DNS label: letters, digits, hyphens, not at the edges. Deliberately
// ASCII-only — see the IDN note in validateCustomDomain.
const LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Hosts a customer must never be able to claim.
 *
 * Someone who verifies `ionexa.ai` or a `*.vercel.app` name does not get a
 * website — they get our own traffic, our cookies' domain, and a
 * convincing address to phish our own users from. This is the same class
 * of protection as RESERVED_SUBDOMAINS, applied one level up.
 *
 * Matched on the registrable name AND every parent, so `pay.ionexa.ai` is
 * refused along with `ionexa.ai`.
 */
export const RESERVED_DOMAINS = new Set([
  "ionexa.ai",
  "ionexa.com",
  "ionexa.gr",
  "vercel.app",
  "vercel.com",
  "supabase.co",
  "supabase.com",
  // Reserved and special-use names (RFC 2606 / 6761). A site served from
  // one of these can never be reached from the public internet, so
  // accepting one only produces a support ticket later.
  "localhost",
  "example.com",
  "example.org",
  "example.net",
  "invalid",
  "test",
  "local",
  "localdomain",
  "internal",
  "onion",
]);

/**
 * Multi-part public suffixes common enough to matter for the DNS
 * instructions.
 *
 * NOT the full Public Suffix List, and deliberately so: the PSL is ~10,000
 * entries that change monthly, and bundling a stale copy would be worse
 * than being explicitly partial. It is used for ONE decision — whether to
 * show the user an A record or a CNAME — and `isApexDomain` reports its
 * own uncertainty rather than guessing, so an unlisted suffix produces
 * "show both" instead of a confidently wrong instruction.
 */
const KNOWN_MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "me.uk", "ac.uk", "gov.uk",
  "com.au", "net.au", "org.au", "edu.au",
  "co.nz", "co.za", "co.jp", "or.jp", "ne.jp",
  "com.br", "com.mx", "com.ar", "com.tr", "com.cn",
  "co.in", "com.sg", "com.hk",
  // Greece: .gr is a single-label suffix, but these delegated ones exist.
  "com.gr", "edu.gr", "net.gr", "org.gr", "gov.gr",
]);

/**
 * TLDs known to have NO delegated second level, so a three-label name
 * under one of them is unambiguously a subdomain.
 *
 * The companion to KNOWN_MULTI_PART_SUFFIXES, and needed for the same
 * decision from the other side: without it, `www.acme.com` came back as
 * "not confident" and the user was shown both record types for a case
 * that has never been ambiguous. Partial on purpose, like its companion —
 * an unlisted TLD produces "show both", which is the honest answer.
 */
const KNOWN_SINGLE_LABEL_SUFFIXES = new Set([
  "com", "net", "org", "info", "biz", "io", "ai", "co", "dev", "app",
  "shop", "store", "online", "site", "xyz", "me", "tv", "cc", "gg",
  "gr", "de", "fr", "es", "it", "nl", "be", "at", "ch", "se", "no",
  "dk", "fi", "pl", "pt", "cz", "ro", "bg", "hu", "ie", "eu",
  "us", "ca", "mx", "br", "cl", "ar",
]);

/**
 * Case-folds a string that is ASCII by construction.
 *
 * Used instead of toLowerCase() everywhere a DNS NAME is folded — here
 * after the non-ASCII gate, and in lib/publishing/domain-verification.ts
 * on nameservers and CNAME targets, which arrive from the DNS protocol and
 * are LDH by definition (an internationalised name reaches us as punycode).
 *
 * Two reasons it is written out rather than borrowed:
 *
 *   - It makes the ASCII precondition VISIBLE. toLowerCase() on Greek is
 *     lossy in a way that matters elsewhere in this app — "ΚΑΦΕΣ" folds to
 *     "καφεσ" and stops matching "καφές" — and
 *     scripts/tests/accent-search.test.mjs is a build gate that exists
 *     because nine components got exactly that wrong. Code that folds a
 *     name should say why it is allowed to.
 *   - DNS is case-insensitive per RFC 4343, so folding is correct here;
 *     that is a property of DNS, not a general licence to fold text.
 */
export function asciiLowerCase(value: string): string {
  return value.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

export type CustomDomainCheck =
  | { ok: true; domain: string }
  | {
      ok: false;
      /** Stable code so the UI can translate it — the message is English,
       *  same contract as validateSubdomain. */
      reason:
        | "empty"
        | "too_long"
        | "label_too_long"
        | "not_ascii"
        | "too_few_labels"
        | "invalid_characters"
        | "looks_like_ip"
        | "wildcard"
        | "reserved";
      message: string;
    };

function isIpLike(value: string): boolean {
  // IPv4 in dotted-quad, and anything containing a colon (IPv6, or a
  // host:port that survived stripping). A bare number-only last label
  // is also an IPv4-ish shape TLDs never have.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true;
  if (value.includes(":")) return true;
  const last = value.split(".").pop() ?? "";
  return /^\d+$/.test(last);
}

/**
 * Normalises and validates. Returns the CANONICAL form on success — always
 * lowercase, without scheme, port, path or a trailing dot — so callers
 * store exactly what was checked rather than the raw input.
 */
export function validateCustomDomain(raw: unknown): CustomDomainCheck {
  let value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: false, reason: "empty", message: "Enter your domain." };

  // People paste what they see in the browser bar. Strip the parts of a
  // URL that are not the host rather than rejecting a paste that is
  // obviously the right domain wearing the wrong clothes.
  //
  // Done BEFORE the ASCII check and before lower-casing, in that order,
  // and the order is load-bearing. `https://acme.com/καφές` has a
  // perfectly good ASCII host and a Greek path; checking the whole string
  // first would reject it for characters that were never part of the
  // domain. The `i` flags are what let this run before the fold.
  value = value
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "") // scheme
    .replace(/^[^/@]*@/, "") // userinfo
    .split("/")[0] // path
    .split("?")[0]
    .split("#")[0]
    .replace(/\.$/, ""); // the root's trailing dot
  // Port, but only when what follows is digits — an IPv6 literal also has
  // colons and must stay intact so isIpLike can reject it as an address
  // rather than this quietly turning it into something else.
  value = value.replace(/:\d+$/, "");

  if (!value) return { ok: false, reason: "empty", message: "Enter your domain." };

  // NON-ASCII IS REFUSED RATHER THAN CONVERTED.
  //
  // An internationalised domain has to reach DNS as punycode
  // (`xn--...`), and converting it here would mean this module, the API
  // route and the verification lookup each had to agree on the same
  // encoder for the string to round-trip. They would not: one missed
  // conversion stores a name that can never match what DNS returns, and
  // the failure looks like "verification just never succeeds". Asking for
  // the already-encoded form keeps one representation everywhere. The
  // `xn--` form itself passes LABEL_RE normally.
  if (!/^[\x00-\x7F]*$/.test(value)) {
    return {
      ok: false,
      reason: "not_ascii",
      message:
        "Enter the domain in its ASCII (punycode) form — your registrar shows it, and it starts with xn--.",
    };
  }

  // ASCII-ONLY BY CONSTRUCTION FROM HERE DOWN.
  //
  // The fold happens AFTER the check above, so it can only ever act on
  // a-z/A-Z — never on a Greek or Turkish letter, where case folding is
  // lossy and locale-dependent. Written as an explicit ASCII map rather
  // than toLowerCase() so that property is visible in the code instead of
  // being an argument someone has to reconstruct. DNS is case-insensitive
  // per RFC 4343, which is why folding is correct here at all.
  value = asciiLowerCase(value);

  if (value.startsWith("*.") || value.includes("*")) {
    return {
      ok: false,
      reason: "wildcard",
      message: "Enter one exact domain — wildcards are not supported.",
    };
  }

  if (isIpLike(value)) {
    return {
      ok: false,
      reason: "looks_like_ip",
      message: "That looks like an IP address. Enter a domain name, for example acme.com.",
    };
  }

  if (value.length > CUSTOM_DOMAIN_MAX_LENGTH) {
    return {
      ok: false,
      reason: "too_long",
      message: `A domain cannot be longer than ${CUSTOM_DOMAIN_MAX_LENGTH} characters.`,
    };
  }

  const labels = value.split(".");

  // RESERVED IS CHECKED BEFORE THE LABEL COUNT, and the order is the whole
  // point. `localhost`, `test`, `local`, `invalid` and `onion` are all
  // single-label names, so a length check placed first refuses them with
  // "enter a full domain" — which is true of the shape and wrong about the
  // reason, and sends someone off to type `localhost.com`. The reason code
  // is what the UI translates into advice, so it has to name the real
  // problem.
  //
  // Checked against the name AND every parent, so a subdomain of a
  // reserved name is refused too: `pay.ionexa.ai` is a more convincing
  // phishing address than the apex it hangs off.
  for (let i = 0; i < labels.length; i++) {
    if (RESERVED_DOMAINS.has(labels.slice(i).join("."))) {
      return {
        ok: false,
        reason: "reserved",
        message: "That domain cannot be used. Enter a domain you own.",
      };
    }
  }

  if (labels.length < 2) {
    return {
      ok: false,
      reason: "too_few_labels",
      message: "Enter a full domain, for example acme.com.",
    };
  }

  for (const label of labels) {
    if (label.length > LABEL_MAX_LENGTH) {
      return {
        ok: false,
        reason: "label_too_long",
        message: `Each part of a domain can be at most ${LABEL_MAX_LENGTH} characters.`,
      };
    }
    if (!LABEL_RE.test(label)) {
      return {
        ok: false,
        reason: "invalid_characters",
        message:
          "Use only letters, digits and hyphens, and don't start or end a part with a hyphen.",
      };
    }
  }

  return { ok: true, domain: value };
}

export type ApexVerdict = {
  /** True when the name is the registrable domain itself (acme.com), which
   *  cannot carry a CNAME and therefore needs an A record. */
  isApex: boolean;
  /** False when the public suffix is not one this file knows, so the
   *  caller should offer BOTH records instead of asserting one. */
  confident: boolean;
};

/**
 * Apex or subdomain — the question that decides which DNS record the user
 * is told to create.
 *
 * It matters because of a rule in DNS itself, not a hosting preference: a
 * CNAME cannot coexist with any other record at the same name, and the
 * apex must carry SOA and NS records. So `acme.com` needs an A record
 * while `www.acme.com` can take a CNAME.
 *
 * Reports `confident: false` rather than guessing when the suffix is
 * outside KNOWN_MULTI_PART_SUFFIXES: telling someone with an unusual TLD
 * to create the wrong record type produces a domain that resolves nowhere
 * and a user who believes they followed the instructions.
 */
export function isApexDomain(domain: string): ApexVerdict {
  const labels = domain.split(".");
  // Two labels is an apex under every suffix, known or not: there is
  // nothing left for a registrable name to hang off.
  if (labels.length <= 2) return { isApex: true, confident: true };

  const lastTwo = labels.slice(-2).join(".");
  if (KNOWN_MULTI_PART_SUFFIXES.has(lastTwo)) {
    // acme.co.uk -> apex; www.acme.co.uk -> subdomain.
    return { isApex: labels.length === 3, confident: true };
  }

  // Three or more labels whose last two are NOT a multi-part suffix.
  //
  // Whether that is confidently a subdomain depends on the TLD. Under
  // `.com` it plainly is — `.com` has no delegated second level, so
  // `www.acme.com` is a subdomain of `acme.com` and nothing else. Under a
  // TLD this file has never heard of, the same shape could be an apex
  // beneath an unlisted multi-part suffix, and saying "subdomain" would
  // hand the user a CNAME instruction for a name that must carry an A
  // record. That mistake produces a domain resolving nowhere and a user
  // who is certain they followed the steps.
  const tld = labels[labels.length - 1];
  return { isApex: false, confident: KNOWN_SINGLE_LABEL_SUFFIXES.has(tld) };
}

// ---------------------------------------------------------------------
// The ownership-proof record
// ---------------------------------------------------------------------
//
// Verification is a TXT record on a `_`-prefixed child of the domain
// rather than on the domain itself. Two reasons, both practical:
//
//   - An underscore label cannot be a real host, so it can never collide
//     with anything the customer is already serving.
//   - Apex TXT records are shared real estate (SPF, DMARC, other vendors'
//     verification strings). Writing to a child leaves them alone, and
//     reading from a child avoids parsing a crowded record set.

export const VERIFICATION_TXT_PREFIX = "_ionexa-verify";

/** The exact hostname the user creates the TXT record at. */
export function verificationRecordName(domain: string): string {
  return `${VERIFICATION_TXT_PREFIX}.${domain}`;
}

/**
 * The value the TXT record must contain.
 *
 * Prefixed so a record set containing several vendors' tokens can be
 * scanned for ours without matching a bare hex string that happens to
 * belong to someone else.
 */
export function verificationRecordValue(token: string): string {
  return `ionexa-site-verification=${token}`;
}

/**
 * Does any of these TXT values carry our token?
 *
 * PURE ON PURPOSE, and separated from the DNS call in
 * lib/publishing/domain-verification.ts, because this is the part that is
 * easy to get subtly wrong and impossible to test through a socket:
 *
 *   - DNS splits a TXT value longer than 255 bytes into several strings.
 *     The resolver hands them back as an array per record and they must be
 *     joined with NOTHING between them; joining with a space silently
 *     breaks verification for long tokens only.
 *   - Several registrar UIs store the value with the surrounding quotes
 *     the zone-file format uses, so the record comes back wearing quotes
 *     the user never typed and cannot see.
 *   - Copy-paste adds whitespace at both ends far more often than not.
 *
 * Each of those makes a correct configuration read as wrong, which is the
 * worst failure this feature has: the user did exactly what they were told
 * and the page says it did not work.
 */
export function txtRecordsContainToken(
  records: readonly (readonly string[])[],
  token: string
): boolean {
  const expected = verificationRecordValue(token);
  return records.some((chunks) => normaliseTxtValue(chunks.join("")) === expected);
}

function normaliseTxtValue(value: string): string {
  // [\s\S] rather than the `s` (dotAll) flag: this project's tsconfig
  // target predates ES2018 and tsc rejects the flag outright. A TXT value
  // can legitimately contain a newline, so `.` alone would fail to strip
  // the quotes around one and the comparison would miss.
  return value.trim().replace(/^"([\s\S]*)"$/, "$1").trim();
}
