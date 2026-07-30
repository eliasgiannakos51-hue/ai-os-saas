// Purely decorative radial glow used behind hero sections and along
// dividers — orange-to-red gradient, absolutely positioned, no pointer
// events, always aria-hidden. Renders once per placement; parent needs
// `relative` + `overflow-hidden` to clip it.
export function GlowOrb({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute rounded-full blur-3xl ${className}`}
      style={{
        background:
          "radial-gradient(circle, rgba(249,115,22,0.35) 0%, rgba(220,38,38,0.12) 45%, transparent 75%)",
      }}
    />
  );
}
