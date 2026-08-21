// Purely decorative wireframe-globe backdrop for the login/signup/landing
// pages — a plain SVG (no 3D library) slowly rotating via a CSS
// animation, kept low-opacity so it reads as ambient texture, not a
// competing visual element. `animate-[spin_180s_linear_infinite]` reuses
// Tailwind's built-in `spin` keyframe at a much slower custom duration.
// Like every other animation in the app, this collapses to static under
// the "reduce motion" accessibility setting (globals.css's
// html[data-motion="reduce"] rule zeroes every animation-duration) with
// no extra logic needed here — that rule targets every element via `*`,
// so it also covers the pulsing "node" dots below.
//
// The wireframe uses an amber radial gradient (brand accent) instead of
// a flat `currentColor` stroke, and the dots are fixed decorative
// "connection point" markers at chosen coordinates — not data-driven, no
// meaning beyond visual texture (per explicit instruction: nothing here
// should look like it's reporting real activity).
//
// `opacity` defaults to 0.38 — raised twice (0.18 -> 0.28 -> 0.38) so the globe is a real,
// legible part of the page rather than a texture you have to look for,
// while still staying well below the point where it competes with
// foreground text (the wireframe strokes are sub-pixel-width and the
// gradient fades to fully transparent at the rim, so even at 0.28 the
// densest region is far dimmer than body copy). Deliberately the SAME
// value on every page that renders this (auth pages, landing, pricing,
// roadmap, every dashboard page via dashboard/layout.tsx) for consistent
// visual intensity across the whole app.
// PERFORMANCE NOTE, measured not assumed. This used to pulse the eight
// dots (animate-pulse) INSIDE the spinning SVG, each behind an
// feGaussianBlur filter. Animated content inside a filtered SVG cannot be
// cached as a texture, so the browser re-rasterised the whole 140vmin
// graphic on the main thread continuously — behind every page. Combined
// with NetworkField this measured as 120ms median keystroke latency in
// the dashboard, against 8ms with the layers hidden. Now the wireframe is
// STATIC SVG (rasterised once, the spin rotates the cached texture) and
// the dots are separate elements: radial-gradient glow instead of a blur
// filter, pulsing only `opacity`, each its own compositor layer.
const DOTS = [
  { cx: 200, cy: 32, delay: "0s" },
  { cx: 322, cy: 140, delay: "0.6s" },
  { cx: 288, cy: 305, delay: "1.2s" },
  { cx: 128, cy: 322, delay: "1.8s" },
  { cx: 68, cy: 195, delay: "2.4s" },
  { cx: 245, cy: 82, delay: "3s" },
  { cx: 155, cy: 258, delay: "3.6s" },
  { cx: 300, cy: 225, delay: "4.2s" },
];

export function AuthBackground({ opacity = 0.38 }: { opacity?: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
    >
      <div
        className="relative h-[140vmin] w-[140vmin] animate-[spin_180s_linear_infinite]"
        style={{
          // Scaled by the theme, not fixed. The value passed in is a
          // DARK-theme intensity; light multiplies it down (globals.css,
          // --backdrop-scale) because the same translucent warm layer adds
          // light on #0a0a0a and tints on #f7f7f8. Measured on production
          // before this: the backdrop pushed 33% of the viewport past the
          // just-noticeable threshold in both themes, and dropped #71717a
          // body text from 4.51:1 to 4.35:1 in light.
          opacity: `calc(${opacity} * var(--backdrop-scale, 1))`,
          willChange: "transform",
        }}
      >
      <svg viewBox="0 0 400 400" className="h-full w-full" fill="none">
        <defs>
          {/* userSpaceOnUse (not the SVG default objectBoundingBox) is
              required here — objectBoundingBox maps the gradient onto
              each individual shape's own bounding box, so a thin flat
              ellipse (e.g. ry=35) and the big outer circle (r=170) would
              each get a differently-squished copy of "the same" gradient
              instead of one gradient shared across the whole globe. With
              userSpaceOnUse + absolute coordinates matching the SVG's own
              200,200 center / 170 radius, every stroke fades consistently
              relative to the globe's actual center. */}
          <radialGradient
            id="globeGradient"
            gradientUnits="userSpaceOnUse"
            cx="200"
            cy="200"
            r="170"
          >
            {/* --globe-ink, not a literal: dimming alone would have taken
                the wireframe below visibility in light, losing the one
                brand element on the page. Light re-inks it to orange-800
                instead, which reads as line art on white where a bright
                amber reads as haze. */}
            <stop offset="0%" stopColor="var(--globe-ink, #f5a623)" stopOpacity="0.9" />
            <stop offset="65%" stopColor="var(--globe-ink, #f5a623)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--globe-ink, #f5a623)" stopOpacity="0" />
          </radialGradient>

        </defs>

        <circle cx="200" cy="200" r="170" stroke="url(#globeGradient)" strokeWidth="1.4" />

        {/* Latitude bands — horizontal ellipses at increasing "tilt" toward
            the poles, same technique as before, just denser. */}
        <ellipse cx="200" cy="200" rx="170" ry="35" stroke="url(#globeGradient)" strokeWidth="0.8" />
        <ellipse cx="200" cy="200" rx="170" ry="60" stroke="url(#globeGradient)" strokeWidth="0.95" />
        <ellipse cx="200" cy="200" rx="170" ry="85" stroke="url(#globeGradient)" strokeWidth="0.8" />
        <ellipse cx="200" cy="200" rx="170" ry="110" stroke="url(#globeGradient)" strokeWidth="0.95" />
        <ellipse cx="200" cy="200" rx="170" ry="140" stroke="url(#globeGradient)" strokeWidth="0.8" />

        {/* Meridian lines — vertical ellipses rotated around the center,
            more of them than before for a "fuller" sphere. */}
        <ellipse
          cx="200"
          cy="200"
          rx="60"
          ry="170"
          stroke="url(#globeGradient)"
          strokeWidth="0.95"
          transform="rotate(30 200 200)"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="110"
          ry="170"
          stroke="url(#globeGradient)"
          strokeWidth="0.95"
          transform="rotate(30 200 200)"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="60"
          ry="170"
          stroke="url(#globeGradient)"
          strokeWidth="0.95"
          transform="rotate(-30 200 200)"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="110"
          ry="170"
          stroke="url(#globeGradient)"
          strokeWidth="0.8"
          transform="rotate(-30 200 200)"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="85"
          ry="170"
          stroke="url(#globeGradient)"
          strokeWidth="0.8"
          transform="rotate(60 200 200)"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="85"
          ry="170"
          stroke="url(#globeGradient)"
          strokeWidth="0.8"
          transform="rotate(-60 200 200)"
        />

        <line x1="30" y1="200" x2="370" y2="200" stroke="url(#globeGradient)" strokeWidth="0.95" />
        <line x1="200" y1="30" x2="200" y2="370" stroke="url(#globeGradient)" strokeWidth="0.95" />

      </svg>

      {/* Decorative "connection" nodes — fixed points on the wireframe
          (they spin with it: same parent), gentle staggered pulse, no data
          behind them. The bloom is a radial gradient rather than a runtime
          blur — see the performance note above. Sized in % of the globe so
          the halo keeps the same relative size at every viewport. */}
      {DOTS.map((dot) => (
        <span
          key={`${dot.cx}-${dot.cy}`}
          className="absolute animate-pulse rounded-full"
          style={{
            left: `${(dot.cx / 400) * 100}%`,
            top: `${(dot.cy / 400) * 100}%`,
            width: "6%",
            height: "6%",
            transform: "translate(-50%, -50%)",
            // Themed for the same reason as the wireframe: at 6% of a
            // 140vmin globe these are large soft blobs, and a 95%-opaque
            // amber blob on white is the single most visible part of the
            // "orange fog" in the screenshots.
            background: "var(--globe-dot)",
            animationDelay: dot.delay,
            animationDuration: "3.5s",
            willChange: "opacity",
          }}
        />
      ))}
      </div>
    </div>
  );
}
