import { foldForMatch } from "@/lib/text/unicode-patterns";
import { buildDesignBrief, DEFAULT_DESIGN_CHOICES } from "@/lib/website-design-brief";

/**
 * THE BUSINESS, REMEMBERED (MASTER 16, package 6): «λέω στο Chat το όνομα
 * και τα χρώματα της επιχείρησής μου, και το Site τα χρησιμοποιεί χωρίς
 * να τα ξαναγράψω».
 *
 * THE CHAT WRITES TWO FIXED LINES, the Site reads them. Memory is free
 * prose everywhere else (lib/chat/memory.ts), and prose is what the model
 * gets for everything it should merely know. A name and a palette are not
 * that: they are values a site must use EXACTLY, so the extractor is asked
 * to write them in a shape this file can read without a model — one row
 * each, starting with BRAND_NAME_PREFIX or BRAND_COLOURS_PREFIX.
 *
 * ON THE SITE THEY TAKE THE PATH THE FORM'S OWN COLOURS TAKE: they are
 * appended to the brief as the same "PRIMARY COLOUR: exactly #…" lines
 * buildDesignBrief writes, so USER_BRIEF_PRECEDENCE in lib/website-builder.ts
 * puts them above the per-site palette draw. A colour the person picked in
 * the form for this site wins over the remembered one: the brief already
 * says PRIMARY COLOUR and nothing is added.
 *
 * Held by scripts/tests/brand-memory.test.mjs.
 */

export const BRAND_NAME_PREFIX = "Επιχείρηση:";
export const BRAND_COLOURS_PREFIX = "Χρώματα επιχείρησης:";

export type BrandColour = { said: string; hex: string | null };
export type RememberedBrand = { name: string | null; colours: BrandColour[] };

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

// The colour words people use for a brand, in the languages of the app
// that people most often write to it in, folded (no case, no accents).
// Longer names first, so "ναυτικο μπλε" is found before "μπλε". Values are
// a sober reading of each word; a person who wants an exact shade says it
// as #hex, which passes straight through.
const COLOUR_WORDS: readonly (readonly [string, string])[] = [
  ["ναυτικο μπλε", "#1f2a44"], ["σκουρο μπλε", "#1f2a44"], ["navy blue", "#1f2a44"], ["navy", "#1f2a44"],
  ["ανοιχτο μπλε", "#38bdf8"], ["γαλαζιο", "#38bdf8"], ["light blue", "#38bdf8"], ["sky blue", "#38bdf8"],
  ["σκουρο πρασινο", "#1b5e20"], ["dark green", "#1b5e20"], ["ανοιχτο πρασινο", "#7cb342"], ["light green", "#7cb342"],
  ["μπορντο", "#7b1e2e"], ["burgundy", "#7b1e2e"], ["τιρκουαζ", "#1aa39a"], ["turquoise", "#1aa39a"], ["teal", "#0f766e"],
  ["πορτοκαλι", "#e8772e"], ["orange", "#e8772e"], ["χρυσο", "#c9a227"], ["χρυση", "#c9a227"], ["gold", "#c9a227"],
  ["ασημι", "#c0c0c0"], ["silver", "#c0c0c0"], ["κοκκινο", "#c62828"], ["red", "#c62828"],
  ["πρασινο", "#2e7d32"], ["green", "#2e7d32"], ["λαδι", "#6b7a2a"], ["olive", "#6b7a2a"],
  ["κιτρινο", "#f2c230"], ["yellow", "#f2c230"], ["ροζ", "#e91e63"], ["pink", "#e91e63"],
  ["μωβ", "#6a1b9a"], ["purple", "#6a1b9a"], ["λιλα", "#9575cd"], ["lilac", "#9575cd"],
  ["μαυρο", "#111111"], ["black", "#111111"], ["ασπρο", "#ffffff"], ["λευκο", "#ffffff"], ["white", "#ffffff"],
  ["γκρι", "#6b7280"], ["grey", "#6b7280"], ["gray", "#6b7280"], ["καφε", "#6d4c41"], ["brown", "#6d4c41"],
  ["μπεζ", "#e8dcc4"], ["beige", "#e8dcc4"], ["κρεμ", "#f5efe0"], ["cream", "#f5efe0"],
  ["μπλε", "#1d4ed8"], ["blue", "#1d4ed8"],
];

/** A colour as a person says it — "navy", "χρυσό", "#C9A227" — as a hex, or null when it is not one this knows. */
export function colourHex(said: string): string | null {
  const s = said.trim();
  if (HEX.test(s)) return s.toLowerCase();
  const folded = foldForMatch(s).replace(/\s+/g, " ").trim();
  if (!folded) return null;
  for (const [word, hex] of COLOUR_WORDS) {
    if (folded === word || new RegExp(`(^|[^\\p{L}])${word}($|[^\\p{L}])`, "u").test(folded)) return hex;
  }
  return null;
}

/**
 * The extractor's answer split into the rows to record: each brand line on
 * its own, everything else as one row — so "Επιχείρηση: Αύρα" is one fact
 * that a later "Επιχείρηση: Αύρα Νάξου" sits beside rather than merges into.
 */
export function splitBrandLines(extracted: string): string[] {
  const brand: string[] = [];
  const rest: string[] = [];
  for (const line of extracted.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith(BRAND_NAME_PREFIX) || line.startsWith(BRAND_COLOURS_PREFIX)) {
      const value = line.slice(line.indexOf(":") + 1).trim().replace(/[.«»"]+$/u, "").replace(/^[«"]+/u, "");
      if (value) brand.push(`${line.slice(0, line.indexOf(":") + 1)} ${value}`);
    } else {
      rest.push(line);
    }
  }
  return [...(rest.length ? [rest.join(" ")] : []), ...brand];
}

function coloursIn(value: string): BrandColour[] {
  return value
    // "και" by letters, not \b: \b is ASCII-only, so it never sees a Greek word's edge.
    .split(/\s*(?:,|\/|&|\+|(?<!\p{L})(?:και|and)(?!\p{L}))\s*/u)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((said) => ({ said, hex: colourHex(said) }));
}

/**
 * The newest name and the newest colours among the remembered rows, which
 * come newest first (lib/memory/store.ts, by last_seen_at). Saying a new
 * name in Chat replaces the old one here without anyone deleting anything.
 */
export function readBrand(memories: readonly { text: string }[]): RememberedBrand {
  let name: string | null = null;
  let colours: BrandColour[] = [];
  for (const { text } of memories) {
    const t = text.trim();
    if (name === null && t.startsWith(BRAND_NAME_PREFIX)) {
      name = t.slice(BRAND_NAME_PREFIX.length).trim().slice(0, 80) || null;
    } else if (colours.length === 0 && t.startsWith(BRAND_COLOURS_PREFIX)) {
      colours = coloursIn(t.slice(BRAND_COLOURS_PREFIX.length));
    }
    if (name !== null && colours.length > 0) break;
  }
  return { name, colours };
}

/**
 * What to add to a site's brief from the remembered business, and what was
 * used — so the screen can say it. Nothing is added that the brief already
 * decides: a name the person already wrote, or colours they already chose
 * in the form for this site.
 */
export function brandBriefFor(
  brand: RememberedBrand,
  description: string
): { brief: string; used: { name: string | null; colours: string[] } } {
  const lines: string[] = [];
  const used = { name: null as string | null, colours: [] as string[] };
  if (brand.name && !foldForMatch(description).includes(foldForMatch(brand.name))) {
    lines.push(
      `BUSINESS NAME: «${brand.name}». The person told Ionexa this in an earlier conversation; use it as the name of the business everywhere on the site, spelled exactly like this.`
    );
    used.name = brand.name;
  }
  if (brand.colours.length > 0 && !/PRIMARY COLOUR:/.test(description)) {
    const hexes = brand.colours.map((c) => c.hex).filter((h): h is string => h !== null);
    const named = buildDesignBrief({ ...DEFAULT_DESIGN_CHOICES, primaryColor: hexes[0] ?? "", secondaryColor: hexes[1] ?? "" });
    const colourLines = named.split("\n").filter((l) => /COLOUR:|Build the rest of the palette/.test(l));
    if (colourLines.length > 0) lines.push(...colourLines);
    const unknown = brand.colours.filter((c) => c.hex === null).map((c) => c.said);
    if (unknown.length > 0) lines.push(`BRAND COLOURS, as the person said them: ${unknown.join(", ")}. Use these colours.`);
    used.colours = brand.colours.map((c) => c.said);
  }
  return { brief: lines.length ? `\n\n${lines.join("\n")}` : "", used };
}
