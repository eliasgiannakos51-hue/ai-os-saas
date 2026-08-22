// Custom design controls for the Website Builder — colours, background,
// and what to do with the photos the user uploaded.
//
// WHY IT IS A TEXT BRIEF RATHER THAN A SCHEMA.
//
// Everything the generator knows already arrives as one description
// string. Adding structured design fields would mean a database column, a
// migration, a new request field, a new worker parameter and a second
// place where "what the user asked for" lives — and the generation prompt
// would still have to be told about them in prose, because that is what a
// system prompt is. So the choices are compiled into an explicit,
// unambiguous block appended to the description, and every existing part
// of the pipeline (clarification, the classifier, the reference-image
// rules, the final self-check) keeps working unchanged.
//
// The wording is deliberately imperative and specific. "Use blue" gets
// ignored; "the primary colour is EXACTLY #1d4ed8, use it for ..." does
// not. Each background option names the pattern from ANIMATIONS_SECTION in
// lib/website-builder.ts that implements it, so the model reproduces a
// known-good CSS block instead of inventing one.
//
// Pure and dependency-free: the client builds the brief before submitting
// and the server sees an ordinary description, so this is unit-testable
// with no Next, no database and no AI call.

export type WebsiteBackgroundStyle =
  | "auto"
  | "solid"
  | "gradient"
  | "photo"
  | "pattern"
  | "own-photo";

export const BACKGROUND_STYLES: WebsiteBackgroundStyle[] = [
  "auto",
  "solid",
  "gradient",
  "photo",
  "pattern",
  "own-photo",
];

/** What to do with the images the user attached. */
export type ReferenceImageUse = "in-site" | "style-only";

/**
 * WHERE THE PHOTOS COME FROM — asked BEFORE generation, because after it
 * the answer is a regeneration.
 *
 * Unsplash has no photograph of THIS bakery. It has a bakery, and the
 * difference is the whole point of a site for a real business: a stock
 * interior is a stand-in the owner recognises instantly and a customer
 * eventually does too.
 *
 *   "own"   — the user is uploading. Theirs go in the hero and the
 *             gallery; anything left over falls back to stock.
 *   "stock" — what the app did before this existed, and the default, so
 *             an untouched form produces the generation it always did.
 *   "none"  — a page with no photographs at all. This is the one choice
 *             that has to be ENFORCED rather than asked for: the prompt
 *             can be ignored, and a single PLACEHOLDER slipping through
 *             costs an Unsplash request and puts a photo on a page whose
 *             owner said they did not want one.
 */
export type PhotoSource = "own" | "stock" | "none";

export const PHOTO_SOURCES: PhotoSource[] = ["own", "stock", "none"];

/**
 * Roughly how many photographs a generated site uses.
 *
 * Shown in the control ("I will need about 6 photographs") so the choice
 * is made against a real number rather than in the abstract. Derived from
 * the shape the prompt asks for — a hero, a few section illustrations, a
 * small gallery — and deliberately approximate: the model decides the
 * real count from the brief, and a promise of exactly six would be a
 * number the page then contradicts.
 */
export const TYPICAL_SITE_PHOTO_COUNT = 6;

/**
 * The machine-readable line the brief carries so the SERVER can enforce
 * the "none" choice.
 *
 * The design choices are compiled into the description and never stored
 * as columns — that is this module's whole design, and it is why the
 * generation worker cannot see them. Rather than add a column, a
 * migration and a second place where "what the user asked for" lives,
 * the brief states the answer in a form our own code can read back.
 *
 * The same trick as the page markers in lib/website-multipage.ts, and it
 * earns its keep the same way: build and parse are one round trip, tested
 * over every value, so the two halves cannot drift.
 */
export const PHOTO_SOURCE_MARKER = "PHOTOS:";

/** The logo question, asked BEFORE generation (reported bug: the model
 *  invented a mark that looked like OUR logo instead of asking).
 *  "uploaded": the first attached image IS the logo. "wordmark": the user
 *  has none — the header carries a styled text wordmark of the name.
 *  "auto": the user skipped the question; the prompt's own LOGO rule
 *  still forbids inventing one, so this also lands on a wordmark. */
export type LogoChoice = "uploaded" | "wordmark" | "auto";

export type WebsiteDesignChoices = {
  /** #rrggbb, or empty for "you choose". */
  primaryColor: string;
  secondaryColor: string;
  background: WebsiteBackgroundStyle;
  referenceImageUse: ReferenceImageUse;
  logo: LogoChoice;
  /** How many images were actually attached — "own-photo" and "in-site"
   *  are meaningless without any, and a brief that demands photos the
   *  model does not have produces an apology instead of a page. */
  imageCount: number;
  /** Where the page's photographs come from. See PhotoSource. */
  photoSource: PhotoSource;
};

export const DEFAULT_DESIGN_CHOICES: WebsiteDesignChoices = {
  primaryColor: "",
  secondaryColor: "",
  background: "auto",
  referenceImageUse: "in-site",
  logo: "auto",
  imageCount: 0,
  // The default is what the app did before this choice existed, so an
  // untouched form still produces a byte-identical brief.
  photoSource: "stock",
};

/**
 * The header this module writes above the compiled brief, and the anchor
 * parsePhotoSource searches from.
 *
 * One constant rather than a literal in each half: a header that drifted
 * between the writer and the reader would make every choice silently stop
 * applying, and nothing would look wrong.
 */
export const DESIGN_BRIEF_HEADER =
  "DESIGN BRIEF (the user chose these explicitly — follow them exactly, they override your own aesthetic judgement):";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR.test(value.trim());
}

// Each option's instruction names the exact ANIMATIONS_SECTION pattern
// that implements it, so the model reproduces a block it has already been
// given rather than improvising one.
const BACKGROUND_INSTRUCTIONS: Record<Exclude<WebsiteBackgroundStyle, "auto">, string> = {
  solid:
    "BACKGROUND: a clean, flat, solid background. One calm base colour for the page and at most one subtly different tone to separate alternating sections. No gradients, no background photos, no patterns.",
  gradient:
    "BACKGROUND: an ANIMATED GRADIENT for the hero section, built with the .gradient-bg + @keyframes gradientShift pattern given in ANIMATIONS above, using the colours specified in this brief. The rest of the page stays on a calm solid background so the hero is the only moving thing.",
  photo:
    "BACKGROUND: a full-bleed photographic hero. Use the PLACEHOLDER image convention for it, with a dark overlay (e.g. linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45))) over the photo so the heading stays readable, plus the .parallax-section pattern (background-attachment: fixed) given in ANIMATIONS above.",
  pattern:
    "BACKGROUND: a subtle geometric CSS pattern behind the page — a light dot grid, fine diagonal lines or a soft mesh, built with pure CSS (repeating-linear-gradient or radial-gradient), at low opacity so it reads as texture and never competes with the text. No background photos.",
  "own-photo":
    "BACKGROUND: use ONE of the user's own uploaded reference images as the hero background, via <img> or CSS background-image pointing at that image's exact given URL. Put a dark overlay over it so the heading stays readable. Do not use a stock photo for the hero when the user has supplied one.",
};

const IMAGE_USE_INSTRUCTIONS: Record<ReferenceImageUse, string> = {
  "in-site":
    "UPLOADED PHOTOS: the user's attached images are CONTENT, not mood board. EVERY listed reference-image URL must appear in the finished page inside an <img src=\"...\"> tag, copied character for character — in the hero, a gallery, section illustrations or the header logo, whichever fits each one. Count them before you finish.",
  "style-only":
    "UPLOADED PHOTOS: treat the user's attached images as STYLE REFERENCE ONLY — take the palette, mood and visual direction from them, but do NOT embed them in the page. Use the PLACEHOLDER convention for the photos the page actually shows.",
};

/**
 * The design brief to append to the user's description, or "" when every
 * choice is left on its default (which is the pre-existing behaviour, byte
 * for byte — a user who touches nothing gets exactly the generation they
 * got before this feature existed).
 */
export function buildDesignBrief(choices: WebsiteDesignChoices): string {
  const lines: string[] = [];

  const primary = choices.primaryColor.trim();
  const secondary = choices.secondaryColor.trim();
  if (isValidHexColor(primary)) {
    lines.push(
      `PRIMARY COLOUR: exactly ${primary.toLowerCase()}. Use it for the main call-to-action buttons, links, active states and key accents. Do not substitute a colour you consider more tasteful.`
    );
  }
  if (isValidHexColor(secondary)) {
    lines.push(
      `SECONDARY COLOUR: exactly ${secondary.toLowerCase()}. Use it for supporting accents, section backgrounds, borders, badges and hover states, so the page reads as a deliberate two-colour scheme rather than one colour plus grey.`
    );
  }
  if (isValidHexColor(primary) && isValidHexColor(secondary)) {
    lines.push(
      "Build the rest of the palette (neutrals, text, surfaces) around these two, and make sure every text/background pair still meets WCAG AA contrast — darken or lighten a NEUTRAL to achieve that, never one of the two colours above."
    );
  }

  // "own-photo" needs an actual uploaded photo. Silently demoting it to
  // the stock-photo hero is better than asking for an image that does not
  // exist, which produces an apology instead of a page.
  const background =
    choices.background === "own-photo" && choices.imageCount === 0 ? "photo" : choices.background;
  if (background !== "auto") {
    lines.push(BACKGROUND_INSTRUCTIONS[background]);
  }

  // Only meaningful when something was actually attached.
  if (choices.imageCount > 0) {
    lines.push(IMAGE_USE_INSTRUCTIONS[choices.referenceImageUse]);
  }

  // WHERE THE PHOTOS COME FROM.
  //
  // "stock" says nothing: it is the behaviour every prompt rule already
  // describes, and a line repeating it would only add tokens. The other
  // two both change what the page contains.
  //
  // "own" with nothing attached is the same demoted case as "own-photo"
  // and "uploaded" above — asking for photographs that do not exist
  // produces an apology instead of a page.
  const photoSource: PhotoSource =
    choices.photoSource === "own" && choices.imageCount === 0 ? "stock" : choices.photoSource;
  if (photoSource === "own") {
    lines.push(
      `${PHOTO_SOURCE_MARKER} own. The user's ${choices.imageCount} uploaded photograph(s) are the site's real photographs. Put them in the positions that matter FIRST — the hero, then any gallery, then section illustrations — before considering any other image. Only once every uploaded photo is placed may you use the PLACEHOLDER convention for what is still missing.`
    );
  } else if (photoSource === "none") {
    lines.push(
      `${PHOTO_SOURCE_MARKER} none. This page has NO photographs at all. Do not emit a single PLACEHOLDER image and do not reference any photo URL. Carry the page on typography, colour, spacing, CSS shapes and inline SVG icons instead — a deliberate illustration-free design, not a page with gaps where pictures should be.`
    );
  }

  // The logo answer. "uploaded" without any image attached is the same
  // demoted case as "own-photo" above: asking the model to use a file
  // that does not exist produces an apology instead of a page.
  if (choices.logo === "uploaded" && choices.imageCount > 0) {
    lines.push(
      "LOGO: the FIRST attached reference image is the business's actual logo. Use exactly that image in the header, at a sensible size. Do NOT draw, generate or substitute any other mark."
    );
  } else if (choices.logo === "wordmark" || (choices.logo === "uploaded" && choices.imageCount === 0)) {
    lines.push(
      "LOGO: the user has NO logo. The header shows the business name as a styled TEXT WORDMARK only. Do not draw, generate or fetch any logo mark, monogram or brand icon."
    );
  }

  if (lines.length === 0) return "";

  return `\n\n${DESIGN_BRIEF_HEADER}\n${lines
    .map((line) => `- ${line}`)
    .join("\n")}`;
}

/** The description as submitted: the user's own words plus the brief. */
export function applyDesignBrief(description: string, choices: WebsiteDesignChoices): string {
  return `${description}${buildDesignBrief(choices)}`;
}

/**
 * The photo source a description was submitted with, read back off the
 * brief our own code wrote into it.
 *
 * WHY READ IT BACK RATHER THAN PASS IT. The description is the one thing
 * that reaches the generation worker; the design choices are compiled
 * into it and deliberately never stored as columns. A new column would be
 * a migration, a request field, a worker parameter and a second place
 * where "what the user asked for" lives — and the two could then
 * disagree. There is exactly one source of truth here and this reads it.
 *
 * DEFAULTS TO "stock", which is the pre-existing behaviour: a description
 * written before this feature existed, or by anything that does not
 * compile a brief, must generate exactly as it always did.
 *
 * Anchored to the start of a line so the words "photos: none" inside a
 * user's own description cannot silently switch their images off.
 */
export function parsePhotoSource(description: string): PhotoSource {
  if (typeof description !== "string") return "stock";

  // READ ONLY INSIDE OUR OWN BLOCK.
  //
  // Anchoring to the start of a line was not enough: a description that
  // simply BEGINS "photos: none — that is what my competitor does" parsed
  // as a choice, and that owner's photographs would have been silently
  // switched off. The marker only means anything where this module put
  // it, so the search starts after the header this module writes.
  const header = description.lastIndexOf(DESIGN_BRIEF_HEADER);
  if (header === -1) return "stock";

  const block = description.slice(header);
  const re = new RegExp(`^-\\s*${PHOTO_SOURCE_MARKER}\\s*(own|stock|none)\\b`, "im");
  const match = re.exec(block);
  const value = match?.[1]?.toLowerCase();
  return value === "own" || value === "none" ? value : "stock";
}
