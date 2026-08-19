"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LINKABLE_MODULES } from "@/lib/knowledge-graph";
import type { TimelineRange } from "@/lib/timeline";

const RANGE_ORDER: TimelineRange[] = ["today", "week", "month", "all"];

// Reads its current values from props (server-parsed searchParams, passed
// down by the page) instead of useSearchParams() — same reasoning as
// login-form.tsx's ?mode= handling: avoids needing a Suspense boundary for
// something this simple, and the page already has the values anyway.
export function TimelineFilters({
  moduleSlug,
  range,
}: {
  moduleSlug: string;
  range: TimelineRange;
}) {
  const t = useTranslations("dashboard.timeline");
  const tKey = useTranslations();
  const router = useRouter();

  function navigate(nextModule: string, nextRange: TimelineRange) {
    const params = new URLSearchParams();
    if (nextModule !== "all") params.set("module", nextModule);
    if (nextRange !== "all") params.set("range", nextRange);
    const qs = params.toString();
    router.push(`/dashboard/timeline${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {/* w-auto sizes a <select> to its WIDEST <option>, not to its
          container — so the longest label decides the page's width. In
          Greek "Εμφάνιση μόνο: Όλες οι ενότητες" and the longest module
          title together measured 420px, which is 45px wider than a 375px
          phone: the whole timeline page scrolled sideways, in Greek only,
          on the narrowest screen. min-w-0 is what lets a flex item shrink
          below its content at all (the default min-width:auto refuses),
          and max-w-full is the cap. Both are needed; either alone leaves
          the overflow. */}
      <select
        value={moduleSlug}
        onChange={(e) => navigate(e.target.value, range)}
        className="input w-auto min-w-0 max-w-full"
      >
        <option value="all">{t("showOnly", { module: t("allModules") })}</option>
        {LINKABLE_MODULES.map((m) => (
          <option key={m.slug} value={m.slug}>
            {t("showOnly", { module: tKey(m.titleKey) })}
          </option>
        ))}
      </select>
      <select
        value={range}
        onChange={(e) => navigate(moduleSlug, e.target.value as TimelineRange)}
        className="input w-auto min-w-0 max-w-full"
      >
        {RANGE_ORDER.map((value) => (
          <option key={value} value={value}>
            {t(`range${value.charAt(0).toUpperCase()}${value.slice(1)}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
