"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { hasProvenance, type Provenance } from "@/lib/chat/provenance";
import { moduleHref } from "@/lib/classifier-modules";

/**
 * "Based on 12 entries from March" — under the answer, and clickable.
 *
 * V4.6 #9. Nothing here comes from the model. `provenance` is arithmetic
 * on the rows the server put into the prompt (lib/chat/provenance.ts), so
 * this line is true even when the answer above it is wrong — which is the
 * only version of a source line worth showing. A model asked to cite its
 * sources produces source-shaped text whether or not it read anything,
 * and a fabricated citation is worse than none because it looks
 * checkable.
 *
 * IT SAYS "THE MOST RECENT", NOT A TOTAL. The scan is capped per module,
 * so the number of rows in hand is not the number the account holds.
 * Saying "from 18 entries" in an account with two hundred would be a
 * quiet lie; when the cap was reached the wording says so instead.
 */
export function ProvenanceLine({ provenance }: { provenance: Provenance | null | undefined }) {
  const t = useTranslations("dashboard.chat.provenance");
  const locale = useLocale();
  if (!hasProvenance(provenance)) return null;
  const p = provenance as Provenance;

  // A month name is only honest when there is a date to name. Rows whose
  // timestamp did not parse are excluded upstream, so an undated set
  // gets the count without a period rather than an invented one.
  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(ms));
  const oldest = p.oldestMs === null ? null : fmt(p.oldestMs);
  const newest = p.newestMs === null ? null : fmt(p.newestMs);
  const period = oldest === null || newest === null ? null : oldest === newest ? oldest : `${oldest} – ${newest}`;

  const summary = p.capped
    ? period
      ? t("cappedWithPeriod", { count: p.entryCount, modules: p.moduleCount, cap: p.perModuleCap, period })
      : t("capped", { count: p.entryCount, modules: p.moduleCount, cap: p.perModuleCap })
    : period
      ? t("withPeriod", { count: p.entryCount, modules: p.moduleCount, period })
      : t("plain", { count: p.entryCount, modules: p.moduleCount });

  return (
    <details className="mt-2 border-t border-border/60 pt-2">
      <summary className="cursor-pointer list-none text-xs text-muted hover:text-foreground/80">
        {summary}
      </summary>
      <ul className="mt-2 space-y-1">
        {p.sources.map((s, i) => (
          <li key={`${s.slug}-${s.id ?? i}`} className="text-xs">
            {/* AN ENTRY WITH NO ID IS LISTED, NOT LINKED. Dropping it
                would make the list shorter than the count above it;
                linking it would send the reader to a page that opens
                nothing. */}
            {s.id ? (
              <Link
                href={`${moduleHref(s.slug)}?record=${encodeURIComponent(s.id)}`}
                className="text-muted underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                <span className="text-foreground/60">{s.title}</span> · {s.headline}
              </Link>
            ) : (
              <span className="text-muted">
                <span className="text-foreground/60">{s.title}</span> · {s.headline}
              </span>
            )}
          </li>
        ))}
      </ul>
      {p.emptyModules.length > 0 && (
        // WHICH PLACES ARE EMPTY, not just "no data". This is what the
        // model is also told, so a refusal upstairs and the line down
        // here name the same gap.
        <p className="mt-2 text-xs text-muted">
          {t("nothingIn", { modules: p.emptyModules.map((m) => m.title).join(", ") })}
        </p>
      )}
    </details>
  );
}
