"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

// Optimistic star toggle — flips immediately, only rolls back on a real
// failure. No AI call, no credit cost. Same sourceTable/sourceId shape
// entity_links already uses.
//
// This used to render as the 4th of five identical grey 32px icon buttons
// in the row's bottom action bar — measured at 125px from the card's right
// edge, in `text-muted` (rgb(138,138,138)), the same colour as Ask AI,
// Link, Edit and Delete beside it. It was present but unfindable: nothing
// about it said "favourite", and nobody looks for that control at the
// bottom of a card.
//
// It now pins to the card's top-right corner (`variant="corner"`), which
// is where the control is conventionally expected, at 36px with a visible
// resting ring so it reads as an affordance before you hover it. The
// parent card must be `position: relative`.
export function FavoriteButton({
  table,
  recordId,
  headline,
  initialFavorited,
  variant = "corner",
}: {
  table: string;
  recordId: string;
  headline: string;
  initialFavorited: boolean;
  /** "corner" pins to the card's top-right; "inline" keeps the old flow
   *  position for surfaces that aren't cards (e.g. the favorites list
   *  itself, where every row is a favourite by definition). */
  variant?: "corner" | "inline";
}) {
  const t = useTranslations("favorites");
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);
  // Drives the one-shot pop on the star itself. Keyed by a counter rather
  // than a boolean so a rapid re-toggle replays it — a CSS animation only
  // runs on mount or when the animation name actually changes.
  const [popKey, setPopKey] = useState(0);

  async function toggle() {
    if (pending) return;
    const next = !favorited;
    setFavorited(next);
    if (next) setPopKey((n) => n + 1);
    setPending(true);
    try {
      const res = await fetch("/api/favorites/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, recordId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setFavorited(!next);
      }
    } catch {
      setFavorited(!next);
    } finally {
      setPending(false);
    }
  }

  const corner = variant === "corner";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${favorited ? t("remove") : t("add")}: ${headline}`}
      aria-pressed={favorited}
      title={favorited ? t("remove") : t("add")}
      data-favorited={favorited}
      className={[
        "z-[2] flex shrink-0 items-center justify-center rounded-xl transition-all duration-200",
        // Both variants are 36px: "inline" now sits beside the card's
        // "..." menu (components/ui/card-menu.tsx) and has to match it.
        corner ? "absolute right-3 top-3 h-9 w-9" : "h-9 w-9",
        favorited
          ? "bg-orange-500/20 text-orange-300 shadow-[0_0_0_1px_rgba(249,115,22,0.55),0_0_16px_-2px_rgba(249,115,22,0.6)] hover:bg-orange-500/30"
          : // A resting ring, not bare grey: the control has to look
            // clickable before the pointer is anywhere near it.
            "bg-white/[0.04] text-muted shadow-[0_0_0_1px_rgba(255,255,255,0.09)] hover:bg-orange-500/15 hover:text-orange-300 hover:shadow-[0_0_0_1px_rgba(249,115,22,0.5)]",
      ].join(" ")}
    >
      <Star
        key={popKey}
        className={`h-[18px] w-[18px] ${popKey > 0 && favorited ? "favorite-pop" : ""}`}
        fill={favorited ? "currentColor" : "none"}
        strokeWidth={favorited ? 2 : 1.9}
      />
    </button>
  );
}
