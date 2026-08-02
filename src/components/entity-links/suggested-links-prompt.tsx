"use client";

import { useEffect, useState } from "react";
import { Check, Link2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

type Suggestion = {
  table: string;
  id: string;
  headline: string;
  moduleTitle: string;
  href: string;
};

type SuggestionState = "pending" | "linking" | "linked" | "dismissed";

// Knowledge Graph "Smart Search": right after a new record is created,
// asks /api/entity-links/suggest for up to 3 other-module records whose
// keywords overlap with this one's title/description (simple substring
// matching, no AI — see lib/entity-link-suggestions.ts) and offers a
// one-click link per suggestion. Fully self-contained — fetches on mount,
// renders nothing once there's nothing left to show.
export function SuggestedLinksPrompt({
  sourceTable,
  sourceId,
}: {
  sourceTable: string;
  sourceId: string;
}) {
  const t = useTranslations("entityLinks");
  const supabase = createClient();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [states, setStates] = useState<Record<string, SuggestionState>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/entity-links/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceTable, sourceId }),
        });
        const data = await res.json();
        if (cancelled) return;
        setSuggestions(res.ok && data.ok && Array.isArray(data.suggestions) ? data.suggestions : []);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceTable, sourceId]);

  async function handleLink(suggestion: Suggestion) {
    setStates((s) => ({ ...s, [suggestion.id]: "linking" }));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStates((s) => ({ ...s, [suggestion.id]: "pending" }));
      return;
    }
    const { error } = await supabase.from("entity_links").insert({
      user_id: user.id,
      source_table: sourceTable,
      source_id: sourceId,
      target_table: suggestion.table,
      target_id: suggestion.id,
    });
    setStates((s) => ({ ...s, [suggestion.id]: error ? "pending" : "linked" }));
  }

  function handleDismiss(suggestion: Suggestion) {
    setStates((s) => ({ ...s, [suggestion.id]: "dismissed" }));
  }

  if (!suggestions || suggestions.length === 0) return null;

  const visible = suggestions.filter((s) => states[s.id] !== "dismissed");
  if (visible.length === 0) return null;

  const titles = visible.map((s) => s.headline).join(", ");

  return (
    <div className="mt-3 rounded-xl border border-orange-500/20 bg-orange-500/[0.03] p-3">
      <p className="flex items-start gap-1.5 text-xs text-muted">
        <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" aria-hidden="true" />
        {t("mightBeRelated", { titles })}
      </p>
      <ul className="mt-2 space-y-1.5">
        {visible.map((s) => {
          const state = states[s.id] ?? "pending";
          return (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-input px-2.5 py-1.5 text-xs"
            >
              <span className="min-w-0 truncate text-foreground">
                <span className="text-muted">{s.moduleTitle}:</span> {s.headline}
              </span>
              {state === "linked" ? (
                <span className="flex shrink-0 items-center gap-1 text-emerald-400">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t("linked")}
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleLink(s)}
                    disabled={state === "linking"}
                    className="rounded-md border border-border px-2 py-1 font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("yes")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDismiss(s)}
                    disabled={state === "linking"}
                    aria-label={t("no")}
                    title={t("no")}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
