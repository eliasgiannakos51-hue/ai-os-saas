"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Store, Loader2, Sparkles, User, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast/toast-context";
import { EmptyState } from "@/components/empty-state";
import { ListLayout } from "@/components/ui/list-layout";
import { matchesSearch } from "@/lib/text/search-match";
import { useScheduleLabel } from "@/components/agents/schedule-editor";
import { resolveBrowserTimeZone } from "@/lib/agents/cron-expression";

/**
 * BROWSING THE TEMPLATES THAT ALREADY EXISTED.
 *
 * The table, the sharing route and the adopting route have been live since
 * the 20260826 migration — what was missing was any way to LOOK at them.
 * Templates could be shared from the Agents screen and matched by the
 * create screen as you typed, but nobody could see what was there, so a
 * template nobody happened to describe in the right words was invisible.
 *
 * This page does not invent a marketplace. There is no buying, no selling
 * and no listing fee, and the copy says so — what it does is show the
 * library and let somebody run one.
 */

export type BrowsableTemplate = {
  slug: string;
  title: string;
  description: string;
  taskPattern: string;
  scheduleCron: string;
  depth: string;
  outputFormat: string;
  keywords: string[];
  useCount: number;
  /** True for the curated built-ins, which belong to nobody. */
  curated: boolean;
  /** True when the signed-in user is the one who shared it. */
  mine: boolean;
};

/**
 * Everything a search is allowed to look at, in one string.
 *
 * THE KEYWORDS COLUMN IS PART OF IT, and not as decoration: it is the only
 * place a template's translated spelling lives, so a Greek user typing
 * "ανταγωνιστές" reaches an English-titled template through here or not at
 * all. Built in one named place so the gate can check what is in it rather
 * than that the word appears somewhere in this file — it is declared on the
 * type above either way.
 */
function searchHaystack(tpl: BrowsableTemplate): string {
  return [tpl.title, tpl.description, tpl.taskPattern, ...tpl.keywords].join(
    " ",
  );
}

export function TemplateBrowser({
  templates,
}: {
  templates: BrowsableTemplate[];
}) {
  const t = useTranslations("dashboard.marketplace");
  const { addToast } = useToast();
  const router = useRouter();
  const scheduleLabel = useScheduleLabel();

  const [query, setQuery] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [adopting, setAdopting] = useState(false);

  // ACCENT-BLIND AND CASE-BLIND, through the same matcher the rest of the
  // app searches with, so a Greek user typing without τόνοι still finds
  // what they are looking for.
  //
  // IT DOES NOT STEM, and that is a real limit rather than an oversight:
  // "ανταγωνιστες" will not reach a template whose keywords only say
  // "ανταγωνιστών". The create screen's matcher does stem — it is Postgres
  // full-text through match_agent_templates — but that one is built to
  // answer "I found one that already does this" from a typed sentence: it
  // returns at most five rows and refuses anything under MIN_MATCH_SCORE.
  // Browsing needs the opposite: every row, instantly, filtered as you
  // type. Filtering the list already in hand is what gives that.
  const shown = useMemo(() => {
    if (query.trim().length === 0) return templates;
    // HAYSTACK FIRST, QUERY SECOND — matchesSearch(haystack, query). With
    // the arguments the other way round it asks whether the QUERY contains
    // the template, which is never true, and the search silently returns
    // nothing for everything. It shipped that way until the gate ran.
    return templates.filter((tpl) => matchesSearch(searchHaystack(tpl), query));
  }, [query, templates]);

  async function adopt(slug: string) {
    const wanted = subject.trim();
    if (wanted.length === 0) {
      addToast(t("subjectRequired"), "error");
      return;
    }
    setAdopting(true);
    try {
      const response = await fetch("/api/agents/templates/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          subject: wanted,
          timezone: resolveBrowserTimeZone(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        addToast(data?.error ?? t("adoptError"), "error");
        return;
      }
      addToast(t("adopted", { subject: wanted }));
      setOpenSlug(null);
      setSubject("");
      // The agent it just created lives on the Agents screen, so that is
      // where the user is taken — a success toast on a page that still
      // shows the template is the app telling you something happened
      // somewhere you cannot see.
      router.push("/dashboard/agents");
    } catch {
      addToast(t("adoptError"), "error");
    } finally {
      setAdopting(false);
    }
  }

  if (templates.length === 0) {
    return (
      <EmptyState icon={Store} title={t("empty.title")}>
        <p>{t("empty.why")}</p>
      </EmptyState>
    );
  }

  // THE SAME TOOLBAR AS EVERY OTHER LIST. Missions, documents, favourites
  // and the website builder all sit under ListLayout; a second search box
  // arranged differently here is how "one pattern" quietly stops being
  // true, which is what scripts/tests/layout-unification.test.mjs exists
  // to catch.
  return (
    <ListLayout
      searchValue={query}
      onSearchChange={setQuery}
      searchPlaceholder={t("searchPlaceholder")}
      searchId="marketplace-search"
      meta={
        <span className="text-xs text-muted">
          {t("counted", { shown: shown.length, total: templates.length })}
        </span>
      }
    >
      {shown.length === 0 ? (
        <p className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted">
          {t("noMatches", { query: query.trim() })}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((tpl) => (
            <li key={tpl.slug} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">
                    {tpl.title}
                  </h2>
                  <p className="mt-1 text-xs text-muted">{tpl.description}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {tpl.curated ? (
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <User className="h-3 w-3" aria-hidden="true" />
                  )}
                  {tpl.curated
                    ? t("badgeCurated")
                    : tpl.mine
                      ? t("badgeMine")
                      : t("badgeCommunity")}
                </span>
              </div>

              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {scheduleLabel(tpl.scheduleCron)}
                </span>
                {/* USE COUNT, NOT A RATING. Nobody is asked to score a
                    template, so a star would be invented — this is the only
                    figure the table keeps, and it is what it says it is. */}
                <span>{t("usedTimes", { count: tpl.useCount })}</span>
              </p>

              {openSlug === tpl.slug ? (
                <div className="mt-3 border-t border-border pt-3">
                  <label
                    className="block text-xs font-medium text-foreground"
                    htmlFor={`subject-${tpl.slug}`}
                  >
                    {t("subjectLabel")}
                  </label>
                  <p className="mt-1 text-[11px] text-muted">
                    {t("subjectHelp")}
                  </p>
                  <input
                    id={`subject-${tpl.slug}`}
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder={t("subjectPlaceholder")}
                    className="mt-2 min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => adopt(tpl.slug)}
                      disabled={adopting}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
                    >
                      {adopting ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : null}
                      {adopting ? t("adopting") : t("createFromTemplate")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenSlug(null);
                        setSubject("");
                      }}
                      className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOpenSlug(tpl.slug);
                    setSubject("");
                  }}
                  className="mt-3 inline-flex min-h-[44px] items-center rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors duration-150 hover:border-accent"
                >
                  {t("useThis")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </ListLayout>
  );
}
