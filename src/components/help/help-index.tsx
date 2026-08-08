"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search, FileText } from "lucide-react";

export type HelpArticleSummary = {
  slug: string;
  title: string;
  category: string;
  sort_order: number;
};

const CATEGORY_ORDER = ["getting-started", "modules", "credits-billing", "troubleshooting"];

/** Category groups + instant title search over the (small) article list. */
export function HelpIndex({ articles }: { articles: HelpArticleSummary[] }) {
  const t = useTranslations("help");
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? articles.filter((a) => a.title.toLowerCase().includes(q)) : articles;
    const byCategory = new Map<string, HelpArticleSummary[]>();
    for (const article of filtered) {
      const list = byCategory.get(article.category) ?? [];
      list.push(article);
      byCategory.set(article.category, list);
    }
    const known = CATEGORY_ORDER.filter((c) => byCategory.has(c));
    const unknown = [...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
    return [...known, ...unknown].map((category) => ({
      category,
      articles: byCategory.get(category)!,
    }));
  }, [articles, query]);

  const categoryLabel = (category: string) =>
    CATEGORY_ORDER.includes(category) ? t(`categories.${category}`) : category;

  return (
    <div className="mt-6">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="w-full rounded-xl border border-border bg-input py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors duration-150 focus:border-orange-500"
        />
      </div>

      {grouped.length === 0 && <p className="mt-6 text-sm text-muted">{t("noResults")}</p>}

      <div className="mt-6 space-y-6">
        {grouped.map(({ category, articles: list }) => (
          <section key={category}>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {categoryLabel(category)}
            </h2>
            <ul className="mt-2 space-y-1.5">
              {list.map((article) => (
                <li key={article.slug}>
                  <Link
                    href={`/help/${article.slug}`}
                    className="flex items-center gap-2 rounded-xl border border-border bg-panel/60 p-3 text-sm font-medium text-foreground transition-colors duration-150 hover:border-orange-500/40"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />
                    {article.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
