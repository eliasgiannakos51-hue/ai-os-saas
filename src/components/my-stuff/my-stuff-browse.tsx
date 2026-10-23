"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { MyStuffKind } from "@/lib/my-stuff/sources";
import type { MyStuffItem } from "@/lib/my-stuff/load";
import { KIND_ICON } from "@/components/my-stuff/my-stuff-shell";

const ALL_KINDS: readonly MyStuffKind[] = [
  "site", "slides", "posts", "document", "research", "analysis", "file",
  "chat", "coding", "finance", "sales", "trading",
];

/**
 * «ΑΝΑΖΗΤΗΣΗ ΚΑΙ ΦΙΛΤΡΟ ΑΝΑ ΕΙΔΟΣ» (the owner's message, 2026-10-22,
 * item 3) — the non-AI browse mode, in the shell's `work` panel.
 *
 * ITS OWN FILE, NOT my-stuff-shell.tsx, so this search field is not read
 * as a second thing to type into alongside the shell's own field —
 * scripts/tests/tool-shell.test.mjs walks every file that renders
 * <ToolShell>, and this one does not.
 */
export function MyStuffBrowse() {
  const t = useTranslations("dashboard.myStuff");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<MyStuffKind | null>(null);
  const [items, setItems] = useState<MyStuffItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    if (query) params.set("q", query);
    fetch(`/api/my-stuff/browse?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { ok?: boolean; items?: MyStuffItem[] }) => {
        if (data.ok && Array.isArray(data.items)) setItems(data.items);
      })
      .catch(() => {
        // Left as the previous list — a failed browse read is not "nothing here".
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query, kind]);

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">{t("browse.searchLabel")}</span>
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("browse.searchPlaceholder")}
          data-testid="my-stuff-browse-search"
          className="search-pill-input"
        />
      </label>
      <nav aria-label={t("browse.kindsLabel")} className="mt-3 flex flex-wrap gap-1.5">
        {[null, ...ALL_KINDS].map((k) => (
          <button
            key={k ?? "all"}
            type="button"
            onClick={() => setKind(k)}
            aria-current={kind === k ? "true" : undefined}
            data-testid="my-stuff-browse-kind"
            className={`chip-link px-3 text-xs ${kind === k ? "bg-foreground/15 font-semibold text-foreground" : ""}`}
          >
            {k ? t(`kinds.${k}`) : t("browse.all")}
          </button>
        ))}
      </nav>
      <ul className="mt-4 space-y-2" data-testid="my-stuff-browse-items">
        {!loading && items.length === 0 && <p className="text-xs text-muted">{t("browse.empty")}</p>}
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind];
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                data-testid="my-stuff-browse-item"
                data-kind={item.kind}
                className="flex min-h-[44px] flex-col gap-0.5 surface-tight hover:border-foreground/40"
              >
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t(`kinds.${item.kind}`)}
                </span>
                <span className="break-words text-sm text-foreground">{item.title || t("browse.untitled")}</span>
                {item.snippet && <span className="break-words text-xs text-muted">{item.snippet}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
