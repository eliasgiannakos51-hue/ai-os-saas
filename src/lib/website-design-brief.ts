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

export type WebsiteDesignChoices = {
  /** #rrggbb, or empty for "you choose". */
  primaryColor: string;
  secondaryColor: string;
  background: WebsiteBackgroundStyle;
  referenceImageUse: ReferenceImageUse;
  /** How many images were actually attached — "own-photo" and "in-site"
   *  are meaningless without any, and a brief that demands photos the
   *  model does not have produces an apology instead of a page. */
  imageCount: number;
};

export const DEFAULT_DESIGN_CHOICES: WebsiteDesignChoices = {
  primaryColor: "",
  secondaryColor: "",
  background: "auto",
  referenceImageUse: "in-site",
  imageCount: 0,
};

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

  if (lines.length === 0) return "";

  return `\n\nDESIGN BRIEF (the user chose these explicitly — follow them exactly, they override your own aesthetic judgement):\n${lines
    .map((line) => `- ${line}`)
    .join("\n")}`;
}

/** The description as submitted: the user's own words plus the brief. */
export function applyDesignBrief(description: string, choices: WebsiteDesignChoices): string {
  return `${description}${buildDesignBrief(choices)}`;
}
