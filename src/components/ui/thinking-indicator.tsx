import { GlobeMark } from "@/components/ui/globe-mark";

/**
 * What "the AI is working" looks like here, and nowhere else.
 *
 * WHY NOT BOUNCING DOTS. Three dots bouncing is what ChatGPT, Claude,
 * Gemini and every wrapper around them use. It is a perfectly good signal
 * and it belongs to nobody — a user who sees it learns nothing about
 * which product they are in.
 *
 * WHY NOT THE CONSTELLATION EITHER, WHICH IS WHAT THIS USED TO BE. It
 * drew three nodes and three edges, borrowed from NetworkField, and the
 * reasoning was sound as far as it went: reuse the identity already
 * running behind every page. But the product had THREE marks, not one —
 * the backdrop's wireframe globe, the favicon's sphere-and-orbit, and
 * this constellation — and a signature that appears in three different
 * drawings is not a signature. There is one now, defined in
 * lib/brand/globe.ts, and this renders it.
 *
 * IT ACCOMPANIES TEXT, IT DOES NOT REPLACE IT. Every place this is used
 * already knows what it is doing ("Reading your files…", "Checking it
 * against the files…") because ai_jobs.step_label says so. A spinner that
 * sits WHERE the sentence should be is a downgrade; this sits beside it.
 *
 * NO LIBRARY, NO IMAGE, NO CANVAS — see globe-mark.tsx.
 */
export function ThinkingIndicator({
  size = "md",
  tone = "accent",
  className = "",
  label,
}: {
  /** `sm` fits inside a button next to 11px text; `md` sits beside body
   *  copy. An inline SVG does not shrink with the viewport, so these
   *  measure the same at 375px and at 1280px — `sm` earns its place on
   *  DENSITY, not on screen size. */
  size?: "sm" | "md";
  /**
   * `accent` draws in the brand orange, themed so it clears 3:1 on the
   * page background in light as well as dark.
   *
   * `inherit` takes the parent's text colour instead, and it exists
   * because of a screenshot. The `sm` variant sits inside the orange
   * "Ask" button, whose background IS the accent — so an accent-coloured
   * indicator was drawn in orange on orange and simply was not there.
   * Nothing in the code says that; the picture did. On that button the
   * text is black, so `inherit` gives a black globe at roughly 8:1.
   */
  tone?: "accent" | "inherit";
  className?: string;
  /** Screen readers get this instead of the drawing. Callers that already
   *  render the step text in an aria-live region pass nothing, because
   *  announcing it twice is worse than not at all. */
  label?: string;
}) {
  const isSmall = size === "sm";
  return (
    <GlobeMark
      // 18px beside 11px button text, 26px beside body copy. Both stay
      // under the 28px threshold where interior bands stop being noise,
      // so both render the `mark` detail — the same three shapes as the
      // favicon.
      size={isSmall ? 18 : 26}
      spin
      title={label}
      className={`${tone === "inherit" ? "is-inherit" : ""} ${className}`}
    />
  );
}
