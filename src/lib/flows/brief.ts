import { buildDesignBrief, DEFAULT_DESIGN_CHOICES } from "@/lib/website-design-brief";
import type { FlowKind } from "@/lib/flows/plan";

/**
 * WHAT EACH STEP OF A FLOW IS ASKED, AND THE ONE COLOUR THEY SHARE
 * (MASTER 6.2: «ώστε site, παρουσίαση, posts και βίντεο να μοιάζουν δικά
 * του ίδιου ανθρώπου»; package 36).
 *
 * Every step gets the whole sentence. The site and the pictures also get
 * the colour, in the words each of them already reads: the site the
 * PRIMARY COLOUR line its own design form writes (lib/website-design-brief.ts,
 * which the Site's memory brief also uses, so a colour said here wins over
 * one remembered), the pictures a plain sentence. Posts are text; a deck
 * made from a research is made from the report.
 *
 * Client-safe and pure. Held by scripts/tests/flows.test.mjs.
 */
export const HEX = /^#[0-9a-f]{6}$/i;

/** The colour a flow offers when Memory knows none: a camping green, changed with one press. */
export const DEFAULT_FLOW_COLOUR = "#2f6b4f";

/** The most the colour adds to a step's brief, so a price quoted for the longest sentence still covers it. */
export const MAX_COLOUR_CHARS = 400;

export function readColour(raw: unknown): string | null {
  return typeof raw === "string" && HEX.test(raw.trim()) ? raw.trim().toLowerCase() : null;
}

export function briefFor(kind: FlowKind, said: string, colour: string | null): string {
  const text = said.trim();
  if (!colour) return text;
  if (kind === "site") {
    // The whole brief the design form writes with only the colour chosen:
    // its heading and its "- PRIMARY COLOUR: exactly #…" line.
    const design = buildDesignBrief({ ...DEFAULT_DESIGN_CHOICES, primaryColor: colour }).trim();
    return design ? `${text}\n\n${design}` : text;
  }
  if (kind === "images") return `${text}\n\nMain colour of the pictures: ${colour}, as the brand's own colour.`;
  return text;
}
