"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FlaskConical } from "lucide-react";
import { LoadSampleButton } from "@/components/sample-data/load-sample-button";
import { SampleDataClearButton } from "@/components/sample-data/sample-data-banner";
import { OVERVIEW_NAV_ITEM } from "@/lib/modules";

/**
 * "See it with sample data", on the page where a person looks for it.
 *
 * WHAT WAS REPORTED. "I cannot find 'See it with sample data' anywhere.
 * Was it ever built? Is it on another branch?" It was built, merged, and
 * live — as a button on Home that renders ONLY while the account has
 * zero records and no sample loaded (dashboard/overview/page.tsx:
 * `totalEntries === 0 && !sampleLoaded`). The person asking had records.
 * So on the one account that was looking for it, it was rendered nowhere,
 * and nothing anywhere said that it existed.
 *
 * A feature reachable only from a state the user is no longer in is a
 * feature that does not exist for them. This card is the permanent
 * address: it says whether the sample is loaded, offers the one button
 * that applies, and links to where the data shows up. Home keeps its
 * conditional offer for the empty account it was designed for.
 *
 * Same two buttons as everywhere else — the load button from Home and
 * the clear button from the banner — so this card cannot drift from the
 * API they share.
 */
export function SampleDataSettings({ loaded }: { loaded: boolean }) {
  const t = useTranslations("settings.sampleData");

  return (
    <div
      id="sample-data"
      className="mb-6 scroll-mt-20 space-y-3 rounded-2xl border border-border bg-panel p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <FlaskConical className="h-4 w-4 text-emerald-400/80" aria-hidden="true" /> {t("title")}
      </h2>
      <p className="text-xs text-muted">{t("description")}</p>

      {loaded ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-foreground">{t("loaded")}</p>
          <SampleDataClearButton />
          <Link
            href={OVERVIEW_NAV_ITEM.href}
            className="inline-flex min-h-[44px] items-center text-xs font-medium text-orange-400 underline-offset-2 hover:underline"
          >
            {t("open")}
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted">{t("notLoaded")}</p>
          <LoadSampleButton />
        </div>
      )}
    </div>
  );
}
