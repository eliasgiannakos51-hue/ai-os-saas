// WCAG 2.2 contrast arithmetic.
//
// Written down as code rather than checked by eye because the light theme
// was built by copying the dark one, and "it looks fine" is exactly the
// judgement that produced a 2.11:1 accent on white. A ratio is a number;
// either it clears the threshold or it does not.
//
// Pure and dependency-free on purpose: scripts/tests/light-theme-contrast
// .test.mjs runs this against the real values in src/app/globals.css and
// the real Tailwind palette, inside the build gate.

/** WCAG 1.4.3 — normal-size body text. */
export const WCAG_TEXT_MIN = 4.5;
/** WCAG 1.4.3 — text at 18.66px+bold or 24px+. */
export const WCAG_LARGE_TEXT_MIN = 3;
/** WCAG 1.4.11 — non-text contrast: UI component boundaries, icons,
 *  focus indicators, and any graphic needed to understand the page. */
export const WCAG_UI_MIN = 3;

export type Rgb = { r: number; g: number; b: number };

/** Accepts "#rgb", "#rrggbb", or "r g b" (the space-separated channel
 *  form Tailwind needs for `<alpha-value>` support, and therefore the
 *  form the CSS variables in globals.css are written in). */
export function parseColor(value: string): Rgb {
  const text = value.trim();
  if (text.startsWith("#")) {
    const hex = text.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Not a hex colour: ${value}`);
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }
  const parts = text.split(/[\s,]+/).filter(Boolean).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    throw new Error(`Not a colour: ${value}`);
  }
  return { r: parts[0], g: parts[1], b: parts[2] };
}

// The sRGB transfer function. The 0.04045 knee and the 2.4 exponent are
// from the spec; approximating this with a plain gamma would shift ratios
// enough to move a borderline colour across a threshold.
function channelToLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color: string | Rgb): number {
  const { r, g, b } = typeof color === "string" ? parseColor(color) : color;
  return (
    0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b)
  );
}

/** The WCAG ratio, always >= 1, order-independent. */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * What a translucent colour ACTUALLY looks like once composited.
 *
 * This is not a refinement, it is the difference between a real answer
 * and a wrong one. `border-orange-500/40` is not orange-500 — it is
 * orange-500 at 40% over whatever is behind it, and on white that lands
 * at 1.51:1 while the un-composited colour reads 2.80:1. Measuring the
 * token instead of the pixel would report a border as "nearly passing"
 * when what a person sees is half as strong as that.
 */
export function compositeOver(foreground: string | Rgb, alpha: number, background: string | Rgb): Rgb {
  const fg = typeof foreground === "string" ? parseColor(foreground) : foreground;
  const bg = typeof background === "string" ? parseColor(background) : background;
  const a = Math.min(1, Math.max(0, alpha));
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
  };
}

export function toHex(color: Rgb): string {
  return `#${[color.r, color.g, color.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export type ContrastVerdict = {
  ratio: number;
  required: number;
  passes: boolean;
};

export function checkContrast(
  foreground: string | Rgb,
  background: string | Rgb,
  required: number
): ContrastVerdict {
  // Rounded to 2dp BEFORE comparing, so a value that displays as "3.00:1"
  // is never reported as failing on a difference in the 15th decimal —
  // the reported number and the verdict must agree, or the table becomes
  // impossible to act on.
  const ratio = Math.round(contrastRatio(foreground, background) * 100) / 100;
  return { ratio, required, passes: ratio >= required };
}
