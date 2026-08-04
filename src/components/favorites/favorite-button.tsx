"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

// Optimistic star toggle — flips immediately, only rolls back on a real
// failure. No AI call, no credit cost. Rendered next to LinkToButton in
// every module's record row (generic-record-row.tsx, idea-row.tsx), same
// sourceTable/sourceId shape entity_links already uses.
export function FavoriteButton({
  table,
  recordId,
  headline,
  initialFavorited,
}: {
  table: string;
  recordId: string;
  headline: string;
  initialFavorited: boolean;
}) {
  const t = useTranslations("favorites");
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    const next = !favorited;
    setFavorited(next);
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

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${favorited ? t("remove") : t("add")}: ${headline}`}
      aria-pressed={favorited}
      title={favorited ? t("remove") : t("add")}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-orange-500/10 ${
        favorited ? "text-orange-400" : "text-muted hover:text-orange-400"
      }`}
    >
      <Star className="h-4 w-4" fill={favorited ? "currentColor" : "none"} />
    </button>
  );
}
