"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { ACTION, OPTION } from "@/components/shell/tool-shell-styles";

/**
 * THE MOTION BUTTON, shared by Site and Apps (the owner's own words on
 * the Apps directive, 2026-10-30: "το ίδιο κουμπί «Motion» με το Site,
 * από το ίδιο κοινό κομμάτι κώδικα, όχι αντίγραφο" — the same button,
 * from the same shared piece of code, not a copy). Site built it first
 * (package 5, Κομμάτι 1) as code inline in website-shell.tsx; this file
 * is that code pulled out, unchanged in behaviour, so Apps imports the
 * real thing instead of a second copy.
 *
 * STILL ONLY THE BUTTON AND THE LIST — the owner's own stop-gate from
 * Site's directive. Nothing here applies a style to real content: no
 * scope choice (whole-site/section, or Apps' own equivalent), no
 * wording-based change, nothing persisted. That is the next piece, for
 * both callers at once, once he writes «εγκρίνω».
 *
 * i18n lives under the shared `dashboard.toolShell.motion` namespace,
 * not a per-tool one, for the same reason `box.*` already does.
 */
export const MOTION_STYLES = ["none", "softFade", "slideUp", "parallax", "glass", "holographic", "typewriter", "hoverLift"] as const;
export type MotionStyle = (typeof MOTION_STYLES)[number];

export function MotionButton() {
  const tShell = useTranslations("dashboard.toolShell");
  const [motionOpen, setMotionOpen] = useState(false);
  const [motionPreview, setMotionPreview] = useState<MotionStyle | null>(null);

  // EVERY t() CALL HERE USES A STATIC STRING KEY, on purpose — a
  // template key is the "unbounded component" shape
  // scripts/tests/message-slices.test.mjs holds at a recorded count.
  const motionLabels: Record<MotionStyle, string> = {
    none: tShell("motion.styles.none"),
    softFade: tShell("motion.styles.softFade"),
    slideUp: tShell("motion.styles.slideUp"),
    parallax: tShell("motion.styles.parallax"),
    glass: tShell("motion.styles.glass"),
    holographic: tShell("motion.styles.holographic"),
    typewriter: tShell("motion.styles.typewriter"),
    hoverLift: tShell("motion.styles.hoverLift"),
  };

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setMotionOpen((v) => !v)}
        aria-expanded={motionOpen}
        aria-label={tShell("motion.button")}
        title={tShell("motion.button")}
        data-testid="motion-button"
        className={ACTION}
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </button>
      {motionOpen && (
        <div role="menu" aria-label={tShell("motion.button")} className="surface absolute end-0 top-full z-10 mt-2 w-64" onMouseLeave={() => setMotionPreview(null)}>
          <ul className="flex flex-col gap-1">
            {MOTION_STYLES.map((style) => (
              <li key={style}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={false}
                  data-testid="motion-choice"
                  data-motion-style={style}
                  onMouseEnter={() => setMotionPreview(style)}
                  onFocus={() => setMotionPreview(style)}
                  className={`${OPTION} w-full justify-start`}
                >
                  {motionLabels[style]}
                </button>
              </li>
            ))}
          </ul>
          <div data-testid="motion-preview" className="mt-2 flex items-center justify-center rounded-item bg-panel-hover p-3">
            <span className={`motion-demo motion-demo-${motionPreview ?? "none"} rounded-item bg-paper px-4 py-2 text-xs text-foreground`}>{tShell("motion.previewSample")}</span>
          </div>
        </div>
      )}
    </span>
  );
}
