/**
 * What "the AI is working" looks like here, and nowhere else.
 *
 * WHY NOT BOUNCING DOTS. Three dots bouncing is what ChatGPT, Claude,
 * Gemini and every wrapper around them use. It is a perfectly good
 * signal and it belongs to nobody — a user who sees it learns nothing
 * about which product they are in. This app already has a visual
 * identity running behind every page: NetworkField, a constellation of
 * twenty-six nodes joined by faint lines, orange with every fourth one
 * purple, each pulsing on its own offset. This is that, at fourteen
 * pixels.
 *
 * WHAT IT MEANS. An edge is drawn from one node to the next and the node
 * lights as it arrives. That is the product's actual claim — it connects
 * things you already have — rather than a generic "please wait".
 *
 * IT ACCOMPANIES TEXT, IT DOES NOT REPLACE IT. Every place this is used
 * already knows what it is doing ("Reading your files…", "Checking it
 * against the files…") because ai_jobs.step_label says so. A spinner
 * that sits WHERE the sentence should be is a downgrade; this sits
 * beside it.
 *
 * NO LIBRARY, NO IMAGE, NO CANVAS. One inline SVG of three circles and
 * three lines, animated by CSS in globals.css. The whole thing is under
 * a kilobyte of markup and costs nothing per frame that the compositor
 * cannot do — opacity and transform only, never layout.
 */
export function ThinkingIndicator({
  size = "md",
  tone = "accent",
  className = "",
  label,
}: {
  /** `sm` fits inside a button next to 11px text; `md` sits beside body
   *  copy. Nothing scales the stroke — a thinner line at a smaller size
   *  disappears, so both use the same 0.9. */
  size?: "sm" | "md";
  /**
   * `accent` draws in the brand orange and purple, measured to clear 3:1
   * on the page background in both themes.
   *
   * `inherit` takes the parent's text colour instead, and it exists
   * because of a screenshot. The `sm` variant sits inside the orange
   * "Ask" button, whose background IS the accent — so an accent-coloured
   * indicator was drawn in orange on orange and simply was not there.
   * Nothing in the code says that; the picture did. On that button the
   * text is black, so `inherit` gives a black constellation at roughly
   * 8:1 and the purple node drops out too, since purple on orange is no
   * better than orange on orange.
   */
  tone?: "accent" | "inherit";
  className?: string;
  /** Screen readers get this instead of the drawing. Callers that
   *  already render the step text in an aria-live region pass nothing,
   *  because announcing it twice is worse than not at all. */
  label?: string;
}) {
  // 48x16 at md, 26x12 at sm, both fixed — an inline SVG does not shrink
  // with the viewport, so measuring at 375px and at 1280px gives the same
  // 48x16 and the same 5px nodes. I had assumed the opposite and written
  // that three nodes "collapse into a smudge" on a phone; they do not,
  // and there is no small-screen variant because none is needed.
  //
  // `sm` earns its place for a different reason: DENSITY, not viewport.
  // Two nodes and one edge fit beside 11px text inside a button, where
  // 48px of drawing next to a six-word label is the drawing shouting.
  const isSmall = size === "sm";

  return (
    <span
      className={`ionexa-think ${isSmall ? "is-sm" : ""} ${tone === "inherit" ? "is-inherit" : ""} ${className}`}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-testid="thinking-indicator"
    >
      {isSmall ? (
        <svg viewBox="0 0 26 12" width="26" height="12" focusable="false">
          <line className="edge e1" x1="4" y1="8" x2="22" y2="4" pathLength="1" />
          <circle className="node n1" cx="4" cy="8" r="2" />
          <circle className="node n2 alt" cx="22" cy="4" r="2" />
        </svg>
      ) : (
        <svg viewBox="0 0 48 16" width="48" height="16" focusable="false">
          {/* The long edge closes the triangle. It is drawn last so the
              shape resolves into a network rather than a zig-zag. */}
          <line className="edge e1" x1="6" y1="9" x2="24" y2="4" pathLength="1" />
          <line className="edge e2" x1="24" y1="4" x2="42" y2="11" pathLength="1" />
          <line className="edge e3" x1="6" y1="9" x2="42" y2="11" pathLength="1" />
          <circle className="node n1" cx="6" cy="9" r="2.2" />
          {/* One in three purple here, where the background runs one in
              four — the same signature at a size where one in four would
              mean none at all. */}
          <circle className="node n2 alt" cx="24" cy="4" r="2.2" />
          <circle className="node n3" cx="42" cy="11" r="2.2" />
        </svg>
      )}
    </span>
  );
}
