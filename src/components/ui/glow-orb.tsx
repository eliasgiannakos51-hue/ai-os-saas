// Purely decorative radial glow used behind hero sections and along
// dividers — orange-to-red gradient, absolutely positioned, no pointer
// events, always aria-hidden. Renders once per placement; parent needs
// `relative` + `overflow-hidden` to clip it.
export function GlowOrb({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute rounded-full blur-3xl ${className}`}
      // THEMED, because a 32rem orb at 45% orange behind blur-3xl is a
      // warm light source on #0a0a0a and a peach cloud on #f7f7f8.
      // This is the layer that was still producing visible haze after the
      // globe, the constellation and the corner pools had all been
      // dimmed: sampled at the top of the landing page it read
      // rgb(244,199,180) against a rgb(247,247,248) page, and it read
      // that IDENTICALLY with the other three layers hidden — which is
      // how it stayed invisible to the backdrop measurement for so long.
      style={{ background: "var(--glow-orb)" }}
    />
  );
}
