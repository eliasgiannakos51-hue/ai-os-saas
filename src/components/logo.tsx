import { Earth } from "@/components/brand/earth";

// THE LOGO — ΣΥΣΤΗΜΑ DESIGN (docs/CONTEXT.md, 2026-10-04): "Λογότυπο: η γη
// και η λέξη IONEXA", and the earth "Στατική στο λογότυπο", in the signal
// colour. The earth is components/brand/earth.tsx at its logo size, which
// never animates; the word is the text colour.
//
// It used to be its own drawing — a ringed sphere and an "ionexa ai"
// wordmark in amber, with its inks as literals. The design made the earth
// the one mark, so the logo is now drawn from the same geometry as the
// earth beside the greeting and above the sign-in form.
//
// The word is the brand name, the same in every language, and so not a
// message key (i18n-population.test.mjs records this file's exemption).
export function Logo({
  className = "",
  iconOnly = false,
  px = 24,
}: {
  className?: string;
  iconOnly?: boolean;
  /** The earth's size in CSS pixels; the word scales with it. */
  px?: number;
}) {
  if (iconOnly) {
    return <Earth variant="logo" px={px} label="Ionexa" className={className} />;
  }
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} role="img" aria-label="Ionexa">
      <Earth variant="logo" px={px} />
      <span
        aria-hidden="true"
        className="font-medium tracking-[0.18em] text-foreground"
        style={{ fontSize: Math.round(px * 0.62) }}
      >
        IONEXA
      </span>
    </span>
  );
}
