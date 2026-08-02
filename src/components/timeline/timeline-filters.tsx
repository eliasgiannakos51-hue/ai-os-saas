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
      <select
        value={moduleSlug}
        onChange={(e) => navigate(e.target.value, range)}
        className="input w-auto"
      >
        <option value="all">{t("showOnly", { module: t("allModules") })}</option>
        {LINKABLE_MODULES.map((m) => (
          <option key={m.slug} value={m.slug}>
            {t("showOnly", { module: m.title })}
          </option>
        ))}
      </select>
      <select
        value={range}
        onChange={(e) => navigate(moduleSlug, e.target.value as TimelineRange)}
        className="input w-auto"
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
