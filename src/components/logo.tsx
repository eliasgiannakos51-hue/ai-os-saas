// Reproduces the brand mark exactly: the orbit/ion mark (a ringed sphere
// with an offset elliptical orbit) plus the "ionexa" / "ai" wordmark in
// the brand's amber (#f5a623). `iconOnly` renders just the mark, cropped
// to its own square viewBox, for small contexts (sidebar header, favicon
// source) — both share the same source coordinate system (circle/ellipse
// centered on 340,165; wordmark baseline at y=270), just cropped/
// backgrounded differently per context.
//
// THE ROOT CAUSE of "the logo won't get bigger no matter what I set the
// container to": the full (non-iconOnly) SVG's viewBox used to be
// "0 0 680 360" — the original source canvas — but the actual drawn
// content (circle + orbit + "ionexa ai" text) only occupies roughly
// x:[281,454] y:[117,270] of that, under 15% of the canvas AREA. Every
// previous "make the logo 3x bigger" pass bumped the container's
// className width/height, which scales the whole 680x360 box including
// all that invisible empty space — so the actual glyph grew by the same
// factor the box did, just from a much smaller effective starting point,
// making the visible change far less dramatic than the container number
// suggested. Cropping the viewBox tightly to the real content (below)
// means every pixel of the container is now the glyph, so container-size
// changes translate directly into visible-size changes, and every page
// using this component (sidebar, login, signup, forgot/reset-password,
// delete-account confirm) gets a real ~2-2.7x visible-size jump from this
// fix alone, with zero className changes anywhere.
//
// A second, separate bug from that same crop: the wordmark's <text>
// elements were left anchored at x="340" (the icon's own center) with
// the "ai" word tacked on via dx="98" — so the icon (bbox center x=340,
// measured via getBBox) and the "ionexa ai" wordmark (bbox center
// x≈367.6, wider because of the "ai" offset) were centered on two
// different points. Once the viewBox was tightened around their combined
// bounding box, that ~27.6-unit mismatch became visible as the icon
// sitting off-center to the left of the wordmark beneath it (reported as
// the logo "not being straight" on /login, where it renders large enough
// to notice). Fix: shift both <text> x positions left by that same
// measured offset (340 → 312.43, dx staying relative at 98) so the
// wordmark's bbox center lands on 340 too — verified via SVG
// getBBox() in a headless render, not eyeballed.
export function Logo({
  className = "h-8 w-auto",
  iconOnly = false,
}: {
  className?: string;
  iconOnly?: boolean;
}) {
  if (iconOnly) {
    return (
      <svg
        viewBox="270 95 140 140"
        role="img"
        aria-label="Ionexa AI"
        className={className}
      >
        <circle cx="340" cy="165" r="42" fill="none" stroke="#f5a623" strokeWidth="3" />
        <circle cx="340" cy="123" r="6" fill="#f5a623" />
        <ellipse
          cx="340"
          cy="165"
          rx="60"
          ry="22"
          fill="none"
          stroke="#f5a623"
          strokeWidth="2"
          opacity="0.5"
          transform="rotate(-20 340 165)"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="239 102 202 190" role="img" aria-label="Ionexa AI" className={className}>
      <title>Ionexa AI</title>
      <circle cx="340" cy="165" r="42" fill="none" stroke="#f5a623" strokeWidth="3" />
      <circle cx="340" cy="123" r="6" fill="#f5a623" />
      <ellipse
        cx="340"
        cy="165"
        rx="60"
        ry="22"
        fill="none"
        stroke="#f5a623"
        strokeWidth="2"
        opacity="0.5"
        transform="rotate(-20 340 165)"
      />
      <text
        x="312.43"
        y="270"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize="34"
        fontWeight="400"
        fill="#f5f5f5"
        letterSpacing="3"
      >
        ionexa
      </text>
      <text
        x="312.43"
        y="270"
        dx="98"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize="34"
        fontWeight="400"
        fill="#f5a623"
        letterSpacing="3"
      >
        ai
      </text>
    </svg>
  );
}
