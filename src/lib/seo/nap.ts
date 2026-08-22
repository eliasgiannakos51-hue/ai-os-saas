import { extractSeoFacts } from "./facts";

/**
 * NAME, ADDRESS, PHONE — THE SAME ON EVERY PAGE.
 *
 * The one piece of local SEO that is entirely within our control and
 * entirely mechanical. Google matches a business across the web by its
 * name, address and phone number agreeing; a site whose contact page
 * says "Tsimiski 42" and whose footer says "Tsimiski 42A" is two
 * businesses to a crawler, and the listing that should have won "bakery
 * near me" is split between them.
 *
 * A multi-page site made this a real risk here for the first time: each
 * page is written in its own turn, so nothing but chance keeps the
 * footer identical across four documents.
 *
 * THE HOME PAGE IS AUTHORITATIVE. Not a majority vote — a vote makes the
 * right answer depend on how many pages happen to mention the address,
 * so a site with three service pages that repeat a typo would outvote
 * the contact page. The home page is the site's front door and the one
 * document that always exists.
 *
 * WHAT THIS DOES NOT DO: rewrite the visible text. A page saying the
 * wrong phone number is the owner's to fix, and silently editing a
 * customer's contact details is worse than the inconsistency. It decides
 * what the STRUCTURED DATA says — one answer for the whole site — and
 * reports the disagreement so it can be logged.
 */

export type Nap = { name: string | null; address: string | null; phone: string | null };

export type NapDisagreement = {
  page: string;
  field: "name" | "address" | "phone";
  home: string;
  page_value: string;
};

export type NapReport = {
  /** What every page's schema should say. */
  nap: Nap;
  disagreements: NapDisagreement[];
};

export type NapDocument = { label: string; html: string };

export function siteNap(documents: NapDocument[]): NapReport {
  if (documents.length === 0) {
    return { nap: { name: null, address: null, phone: null }, disagreements: [] };
  }

  const read = (doc: NapDocument): Nap => {
    const f = extractSeoFacts(doc.html);
    return { name: f.businessName, address: f.address, phone: f.phone };
  };

  const home = read(documents[0]);
  const disagreements: NapDisagreement[] = [];

  for (const doc of documents.slice(1)) {
    const theirs = read(doc);
    for (const field of ["name", "address", "phone"] as const) {
      const mine = home[field];
      const other = theirs[field];
      // A page that simply does not state the fact is not a
      // disagreement — most pages of a site do not carry the address,
      // and flagging that would bury the one page that carries it wrong.
      if (!mine || !other) continue;
      if (sameValue(field, mine, other)) continue;
      disagreements.push({ page: doc.label, field, home: mine, page_value: other });
    }
  }

  return { nap: home, disagreements };
}

/**
 * Are these the same fact, written twice?
 *
 * A phone number is compared by its DIGITS: "+30 2310 555 123" and
 * "2310555123" are one number in two formats, and reporting that as an
 * inconsistency would make this warning worthless within a week. A name
 * or an address is compared with case and runs of whitespace and
 * punctuation flattened, for the same reason.
 */
function sameValue(field: "name" | "address" | "phone", a: string, b: string): boolean {
  if (field === "phone") {
    const digits = (s: string) => s.replace(/\D+/g, "");
    const x = digits(a);
    const y = digits(b);
    if (!x || !y) return a.trim() === b.trim();
    // A local number written without its country code is the same number
    // as one written with it.
    return x === y || x.endsWith(y) || y.endsWith(x);
  }
  const flat = (s: string) =>
    s
      .toLowerCase()
      .replace(/[.,;:·]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return flat(a) === flat(b);
}
