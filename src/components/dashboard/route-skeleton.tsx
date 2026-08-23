"use client";

import { useTranslations } from "next-intl";
import { GlobeMark } from "@/components/ui/globe-mark";

/**
 * What a dashboard route looks like while it is arriving.
 *
 * WHY NOT LoadingState. The shared LoadingState is a centred block on a
 * full-height background — right for a whole-app boot, wrong for moving
 * between two dashboard pages. Between pages the chrome does not change:
 * the sidebar stays, the top bar stays, and only the body is replaced. A
 * centred block in that space reads as "everything went away", which is
 * the feeling the report described — a navigation that looked like a
 * reload.
 *
 * So this is the SHAPE of a dashboard page instead: the same max width,
 * the same padding, a heading-sized bar where the heading will be, and
 * rows where the content will be. The eye finds the layout already in
 * place and the text simply lands in it.
 *
 * Nothing here is a claim about the page underneath — no counts, no
 * titles, no numbers. It is furniture, and it is replaced the moment the
 * real content arrives.
 */
export function RouteSkeleton() {
  const t = useTranslations("common");

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6" role="status" aria-label={t("loadingContent")}>
        {/* The header row: icon tile, title, subtitle. */}
        <div className="mb-6 flex items-center gap-3">
          {/* The one place this furniture is allowed to say something:
              WHOSE page is arriving. It is the brand mark, not a claim
              about the content — the icon tile beside it stays a blank
              skeleton because that one WOULD be a claim. */}
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border">
            <GlobeMark size={22} spin />
          </span>
          <div className="min-w-0 flex-1">
            <div className="skeleton h-6 w-48 rounded" />
            <div className="skeleton mt-2 h-3 w-72 max-w-full rounded" style={{ animationDelay: "90ms" }} />
          </div>
        </div>

        {/* The toolbar every list page carries. */}
        <div className="mb-4 flex gap-2">
          <div className="skeleton h-10 flex-1 rounded-xl" style={{ animationDelay: "120ms" }} />
          <div className="skeleton h-10 w-28 rounded-xl" style={{ animationDelay: "150ms" }} />
        </div>

        {/* And the body. Four rows is enough to read as a list without
            pretending to know how many there are. */}
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="skeleton h-20 w-full rounded-xl"
              style={{ animationDelay: `${180 + i * 70}ms` }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
