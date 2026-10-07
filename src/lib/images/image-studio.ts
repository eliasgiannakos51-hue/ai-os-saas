/**
 * IMAGE (MASTER 16, package 19: «παίρνω 4 παραλλαγές, αλλάζω μία με
 * λόγια, και την κατεβάζω στην υψηλότερη ανάλυση»), behind the switch
 * "image-studio". What the routes, the screen and the tests share; no
 * server imports, so the screen can read the same limits it is held to.
 *
 * THE SHAPE OF ONE REQUEST. A description becomes FOUR pictures at the
 * preview size, one call each, each told which of the four it is so the
 * four differ. One of them is pressed and changed with words: the picture
 * itself goes back with the words, so what changes is what was asked and
 * nothing else. The download is that picture at the largest size the
 * provider makes, made from the picture rather than from the words again
 * — a second roll of the dice would be a different picture.
 *
 * The routes: api/images/generate, api/images/[id]/edit,
 * api/images/[id]/full, api/images/[id]/download and api/images/[id].
 * The provider: lib/images/gemini-image.ts. The price:
 * lib/images/image-pricing.ts. Held by scripts/tests/image-studio.test.mjs.
 */

export const IMAGE_VARIANTS = 4;

/** Private; every address to it is signed by a route that checked the owner. */
export const IMAGE_BUCKET = "ai-images";
/** How long a signed address to a picture works. */
export const IMAGE_URL_TTL_SECONDS = 60 * 60;

/** The four shapes, as the provider names them. The first is the default. */
export const IMAGE_ASPECTS = ["1:1", "4:5", "16:9", "9:16"] as const;
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];

export function readAspect(value: unknown): ImageAspect {
  return (IMAGE_ASPECTS as readonly unknown[]).includes(value) ? (value as ImageAspect) : IMAGE_ASPECTS[0];
}

export const MIN_IMAGE_TEXT_CHARS = 3;
/** A description. Long enough for a paragraph of art direction. */
export const MAX_IMAGE_DESCRIPTION_CHARS = 1500;
/** A change to one picture: a sentence or two. */
export const MAX_IMAGE_INSTRUCTION_CHARS = 600;

export type TextVerdict = { ok: true; text: string } | { ok: false; reason: "too_short" | "too_long"; limit: number };

export function checkImageText(raw: unknown, max: number): TextVerdict {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length < MIN_IMAGE_TEXT_CHARS) return { ok: false, reason: "too_short", limit: MIN_IMAGE_TEXT_CHARS };
  if (text.length > max) return { ok: false, reason: "too_long", limit: max };
  return { ok: true, text };
}

/**
 * WHAT MAKES THE FOUR DIFFERENT. The same words four times give four near
 * copies; each call is told its place and a different way to read the
 * brief, and nothing else about the brief changes.
 */
const VARIANT_DIRECTIONS = [
  "the most direct reading of the description",
  "a different composition and camera angle",
  "a different light and colour mood",
  "a bolder, more unexpected interpretation",
] as const;

export function variantPrompt(description: string, index: number): string {
  const direction = VARIANT_DIRECTIONS[index % VARIANT_DIRECTIONS.length];
  return [
    `Create one image. Version ${index + 1} of ${IMAGE_VARIANTS}: ${direction}.`,
    "Do not add any text, watermark or signature unless the description asks for words.",
    "",
    "Description:",
    description,
  ].join("\n");
}

/** One picture, changed with words: the picture goes with this. */
export function editPrompt(instruction: string): string {
  return [
    "Change this image as follows, and change nothing else: keep the composition, the subject, the style and the colours wherever the request does not touch them.",
    "",
    "Change:",
    instruction,
  ].join("\n");
}

/** The same picture, larger: the picture goes with this. */
export const FULL_SIZE_PROMPT =
  "Reproduce this exact image at the highest resolution and detail. Do not change the composition, the subject, the colours, the style or anything in it.";

/**
 * WHAT IS STORED PER PICTURE. `path` is the preview in the ai-images
 * bucket; `fullPath` is the largest size, made only when asked for and
 * charged only then; `previous` keeps every picture a change replaced, so
 * changing one never loses the one before it.
 */
export type ImageVariant = { index: number; path: string; mime: string; fullPath: string | null; previous: string[] };

export function readVariants(raw: unknown, ownerId?: string): ImageVariant[] {
  if (!Array.isArray(raw)) return [];
  const own = (p: unknown): p is string =>
    typeof p === "string" && p.length > 0 && p.length < 300 && !p.includes("..") && (!ownerId || p.startsWith(`${ownerId}/`));
  const out: ImageVariant[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const index = Number(v.index);
    if (!Number.isInteger(index) || index < 0 || index >= IMAGE_VARIANTS || out.some((o) => o.index === index)) continue;
    if (!own(v.path)) continue;
    out.push({
      index,
      path: v.path,
      mime: typeof v.mime === "string" && /^image\/(png|jpeg|webp)$/.test(v.mime) ? v.mime : "image/png",
      fullPath: own(v.fullPath) ? v.fullPath : null,
      previous: Array.isArray(v.previous) ? v.previous.filter(own).slice(-20) : [],
    });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Where a picture lives: <owner>/<image id>/<name>. */
export function imagePath(userId: string, imageId: string, name: string, mime: string): string {
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  return `${userId}/${imageId}/${name}.${ext}`;
}

/**
 * The name the download is saved under: the first words of the
 * description, in letters any disk accepts, then which picture and which
 * size. Greek is kept — every system this is saved on reads UTF-8 names.
 */
export function imageFilename(description: string, index: number, full: boolean, mime: string): string {
  const words = description
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join("-")
    .slice(0, 60);
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  return `${words || "image"}-${index + 1}${full ? "-full" : ""}.${ext}`;
}

/** The row the screen draws. Addresses are signed by the server. */
export type ShownImage = {
  id: string;
  prompt: string;
  aspect: ImageAspect;
  createdAt: string;
  variants: { index: number; url: string; full: boolean }[];
};
