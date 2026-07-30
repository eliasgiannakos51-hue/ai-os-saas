// Reproduces the brand mark exactly: two offset chevrons (the abstract
// mark) plus the "veron" / "ai" wordmark in the brand's amber (#f5a623).
// `iconOnly` renders just the mark, cropped to its own square viewBox, for
// small contexts (sidebar header, favicon source).
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
        viewBox="270 105 140 140"
        role="img"
        aria-label="Veron AI"
        className={className}
      >
        <g stroke="#f5a623" strokeWidth="6" strokeLinecap="round" fill="none">
          <path d="M 300 130 L 340 190 L 380 130" />
          <path d="M 300 160 L 340 220 L 380 160" opacity="0.5" />
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox="255 90 220 200"
      role="img"
      aria-label="Veron AI"
      className={className}
    >
      <title>Veron AI</title>
      <g stroke="#f5a623" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M 300 130 L 340 190 L 380 130" />
        <path d="M 300 160 L 340 220 L 380 160" opacity="0.5" />
      </g>
      <text
        x="340"
        y="270"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize="34"
        fontWeight="400"
        fill="#f5f5f5"
        letterSpacing="4"
      >
        veron
      </text>
      <text
        x="340"
        y="270"
        dx="82"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize="34"
        fontWeight="400"
        fill="#f5a623"
        letterSpacing="4"
      >
        ai
      </text>
    </svg>
  );
}
