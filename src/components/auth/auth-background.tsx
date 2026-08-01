// Purely decorative wireframe-globe backdrop for the login/signup pages —
// a plain SVG (no 3D library) slowly rotating via a CSS animation, kept
// monochrome and very low-opacity so it reads as ambient texture, not a
// competing visual element. `animate-[spin_180s_linear_infinite]` reuses
// Tailwind's built-in `spin` keyframe at a much slower custom duration.
// Like every other animation in the app, this collapses to static under
// the "reduce motion" accessibility setting (globals.css's
// html[data-motion="reduce"] rule zeroes every animation-duration) with
// no extra logic needed here.
export function AuthBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
    >
      <svg
        viewBox="0 0 400 400"
        className="h-[140vmin] w-[140vmin] animate-[spin_180s_linear_infinite] text-foreground opacity-[0.05]"
        fill="none"
      >
        <circle cx="200" cy="200" r="170" stroke="currentColor" strokeWidth="0.75" />
        <ellipse cx="200" cy="200" rx="170" ry="60" stroke="currentColor" strokeWidth="0.5" />
        <ellipse cx="200" cy="200" rx="170" ry="110" stroke="currentColor" strokeWidth="0.5" />
        <ellipse
          cx="200"
          cy="200"
          rx="60"
          ry="170"
          stroke="currentColor"
          strokeWidth="0.5"
          transform="rotate(30 200 200)"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="110"
          ry="170"
          stroke="currentColor"
          strokeWidth="0.5"
          transform="rotate(30 200 200)"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="60"
          ry="170"
          stroke="currentColor"
          strokeWidth="0.5"
          transform="rotate(-30 200 200)"
        />
        <line x1="30" y1="200" x2="370" y2="200" stroke="currentColor" strokeWidth="0.5" />
        <line x1="200" y1="30" x2="200" y2="370" stroke="currentColor" strokeWidth="0.5" />
      </svg>
    </div>
  );
}
