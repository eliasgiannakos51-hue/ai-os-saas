import { foldForMatch } from "@/lib/text/unicode-patterns";

/**
 * THE BUSINESS'S OWN NETWORK, REMEMBERED (the 2026-11-07 market round,
 * docs/QUEUE.md "ΤΟ MOAT" — not a roadmap item, a new feature chosen from
 * real evidence: the #1 complaint about ChatGPT/Claude/Gemini is memory
 * loss between sessions, IndieHackers' 500-post analysis, read
 * 2026-11-07, and what keeps people on one assistant instead is the
 * context and workflows they built around it, aiproductivity.ai, same
 * date).
 *
 * THE SAME SHAPE AS lib/memory/brand.ts, for the same reason: a name and
 * a role are values other tools must use exactly (an autocomplete list,
 * a future Sales "move this contact to the next stage"), not prose for a
 * model to paraphrase. The extractor is asked to write them in one shape
 * this file reads without a model — a line starting with CONTACT_PREFIX,
 * three fields separated by "|" — and everything else stays free prose.
 *
 * Unlike brand (one name, one palette — the newest value wins outright),
 * a business has MANY contacts, so the record here is a table
 * (supabase/migrations/20261121000000_business_contacts.sql) rather than
 * a line inside chat_memory: each contact is its own row, with its own
 * growing mention_count and its own first-seen date — the part of this
 * feature that compounds with use instead of merely being remembered
 * once.
 *
 * Held by scripts/tests/business-contacts.test.mjs.
 */

export const CONTACT_PREFIX = "Επαφή επιχείρησης:";

export type ContactRole = "customer" | "supplier" | "partner" | "other";
export type ParsedContact = { name: string; role: ContactRole; detail: string | null };

// The role words people use, in the languages this prompt is most often
// answered in, folded (no case, no accents) — same device as
// lib/memory/brand.ts's COLOUR_WORDS. An unrecognised word is not an
// error: it files as "other", because the word is a person's own guess
// at a category and the name itself is the fact worth keeping either way.
const ROLE_WORDS: Record<string, ContactRole> = {
  πελατησ: "customer",
  πελατισσα: "customer",
  customer: "customer",
  client: "customer",
  προμηθευτησ: "supplier",
  προμηθευτρια: "supplier",
  supplier: "supplier",
  vendor: "supplier",
  συνεργατησ: "partner",
  συνεργατιδα: "partner",
  συνεταιροσ: "partner",
  partner: "partner",
  collaborator: "partner",
};

/** A role as a person said it ("πελάτης", "supplier", "συνεργάτης") -> one of the four stored roles. Never fails: an unknown word is "other". */
export function roleFromWord(said: string | null | undefined): ContactRole {
  const folded = foldForMatch(String(said ?? ""))
    .replace(/[^\p{L}]/gu, "")
    .trim();
  return ROLE_WORDS[folded] ?? "other";
}

/** The dedup key for a contact name — the same fold the database re-derives in business_contact_record()'s caller, and the same device chat_memory's fold uses: "Γιώργος" and "γιωργος" are one row. */
export function contactNameFold(name: string): string {
  return foldForMatch(String(name ?? ""))
    .replace(/\s+/g, " ")
    .trim();
}

function cleanField(value: string): string {
  return value.trim().replace(/[.«»"']+$/u, "").replace(/^[«"']+/u, "").trim();
}

/** One CONTACT_PREFIX line -> its three fields, or null when the name is empty after cleaning. */
export function parseContactLine(line: string): ParsedContact | null {
  const body = line.slice(line.indexOf(":") + 1);
  const fields = body.split("|").map((f) => f.trim());
  const name = cleanField(fields[0] ?? "");
  if (!name) return null;
  const role = roleFromWord(fields[1]);
  const detailRaw = fields[2] ? cleanField(fields[2]) : "";
  return { name: name.slice(0, 120), role, detail: detailRaw ? detailRaw.slice(0, 200) : null };
}

/**
 * The extractor's answer, split into the contacts to record and whatever
 * ordinary prose is left — the same device splitBrandLines() in
 * lib/memory/brand.ts uses, so a contact line never also becomes a
 * chat_memory row and the sentence beside it is not lost either.
 */
export function splitContactLines(extracted: string): { contacts: ParsedContact[]; rest: string } {
  const contacts: ParsedContact[] = [];
  const rest: string[] = [];
  for (const line of extracted.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith(CONTACT_PREFIX)) {
      const parsed = parseContactLine(line);
      if (parsed) contacts.push(parsed);
    } else {
      rest.push(line);
    }
  }
  return { contacts, rest: rest.join(" ") };
}

export const CONTACT_ROLES: readonly ContactRole[] = ["customer", "supplier", "partner", "other"];

export function isContactRole(value: unknown): value is ContactRole {
  return typeof value === "string" && (CONTACT_ROLES as readonly string[]).includes(value);
}
