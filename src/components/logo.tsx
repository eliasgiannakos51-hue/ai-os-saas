// Reproduces the brand mark exactly: the orbit/ion mark (a ringed sphere
// with an offset elliptical orbit) plus the "ionexa" / "ai" wordmark in
// the brand's amber (#f5a623). `iconOnly` renders just the mark, cropped
// to its own square viewBox, for small contexts (sidebar header, favicon
// source) — both share the same 0 0 680 360 coordinate system as the
// source SVG, just cropped/backgrounded differently per context.
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
    <svg viewBox="0 0 680 360" role="img" aria-label="Ionexa AI" className={className}>
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
        x="340"
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
        x="340"
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
