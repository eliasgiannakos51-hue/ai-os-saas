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
// `opacity` defaults to 0.28 — raised from 0.18 so the globe is a real,
// legible part of the page rather than a texture you have to look for,
// while still staying well below the point where it competes with
// foreground text (the wireframe strokes are sub-pixel-width and the
// gradient fades to fully transparent at the rim, so even at 0.28 the
// densest region is far dimmer than body copy). Deliberately the SAME
// value on every page that renders this (auth pages, landing, pricing,
// roadmap, every dashboard page via dashboard/layout.tsx) for consistent
// visual intensity across the whole app.
export function AuthBackground({ opacity = 0.28 }: { opacity?: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
    >
      <svg
        viewBox="0 0 400 400"
        className="h-[140vmin] w-[140vmin] animate-[spin_180s_linear_infinite]"
        style={{ opacity }}
        fill="none"
      >
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
            <stop offset="0%" stopColor="#f5a623" stopOpacity="0.9" />
            <stop offset="65%" stopColor="#f5a623" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#f5a623" stopOpacity="0" />
          </radialGradient>

          {/* Soft bloom around the connection dots. stdDeviation is in
              the SVG's own 400x400 user space, so it scales with the
              globe rather than being a fixed pixel blur — the dots keep
              the same relative halo at every viewport size. */}
          <filter id="globeDotGlow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx="200" cy="200" r="170" stroke="url(#globeGradient)" strokeWidth="0.75" />

        {/* Latitude bands — horizontal ellipses at increasing "tilt" toward
            the poles, same technique as before, just denser. */}
        <ellipse cx="200" cy="200" rx="170" ry="35" stroke="url(#globeGradient)" strokeWidth="0.4" />
        <ellipse cx="200" cy="200" rx="170" ry="60" stroke="url(#globeGradient)" strokeWidth="0.5" />
        <ellipse cx="200" cy="200" rx="170" ry="85" stroke="url(#globeGradient)" strokeWidth="0.4" />
        <ellipse cx="200" cy="200" rx="170" ry="110" stroke="url(#globeGradient)" strokeWidth="0.5" />
        <ellipse cx="200" cy="200" rx="170" ry="140" stroke="url(#globeGradient)" strokeWidth="0.4" />

        {/* Meridian lines — vertical ellipses rotated around the center,
            more of them than before for a "fuller" sphere. */}
        <ellipse
          cx="200"
          cy="200"
          rx="60"
          ry="170"
          stroke="url(#globeGradient)"
          strokeWidth="0.5"
          transform="rotate(30 200 200)"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="110"
          ry="170"
          stroke="url(#globeGradient)"
          strokeWidth="0.5"
          transform="rotate(30 200 200)"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="60"
          ry="170"
          stroke="url(#globeGradient)"
          strokeWidth="0.5"
          transform="rotate(-30 200 200)"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="110"
          ry="170"
          stroke="url(#globeGradient)"
          strokeWidth="0.4"
          transform="rotate(-30 200 200)"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="85"
          ry="170"
          stroke="url(#globeGradient)"
          strokeWidth="0.4"
          transform="rotate(60 200 200)"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="85"
          ry="170"
          stroke="url(#globeGradient)"
          strokeWidth="0.4"
          transform="rotate(-60 200 200)"
        />

        <line x1="30" y1="200" x2="370" y2="200" stroke="url(#globeGradient)" strokeWidth="0.5" />
        <line x1="200" y1="30" x2="200" y2="370" stroke="url(#globeGradient)" strokeWidth="0.5" />

        {/* Decorative "connection" nodes — fixed points, gentle staggered
            pulse, no data behind them. Radius raised 2.5 -> 4 and given a
            gaussian bloom so they read as glowing nodes on the wireframe
            rather than stray specks; that plus the higher globe opacity is
            what makes the backdrop actually noticeable. */}
        {[
          { cx: 200, cy: 32, delay: "0s" },
          { cx: 322, cy: 140, delay: "0.6s" },
          { cx: 288, cy: 305, delay: "1.2s" },
          { cx: 128, cy: 322, delay: "1.8s" },
          { cx: 68, cy: 195, delay: "2.4s" },
          { cx: 245, cy: 82, delay: "3s" },
          { cx: 155, cy: 258, delay: "3.6s" },
          { cx: 300, cy: 225, delay: "4.2s" },
        ].map((dot) => (
          <circle
            key={`${dot.cx}-${dot.cy}`}
            cx={dot.cx}
            cy={dot.cy}
            r="4"
            fill="#f5a623"
            filter="url(#globeDotGlow)"
            className="animate-pulse"
            style={{ animationDelay: dot.delay, animationDuration: "3.5s" }}
          />
        ))}
      </svg>
    </div>
  );
}
