"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, Link2, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LINKABLE_MODULES } from "@/lib/knowledge-graph";
import { useToast } from "@/components/toast/toast-context";
import type { ModuleConfig } from "@/lib/modules";

// Escapes ILIKE's own wildcard characters so a literal "%" or "_" typed by
// the user is matched literally instead of acting as a wildcard — same
// helper as api/search/route.ts.
function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
}

type SearchResultRow = { id: string; headline: string };

// Two-step picker: choose which module to search, then search its records
// by headline and click one to create the link. Both the search and the
// insert run as plain client-side Supabase calls (RLS-scoped to the
// signed-in user), the same direct-insert pattern GenericAddForm already
// uses for ungated modules — no dedicated API route needed since entity
// links carry no credit cost or plan gate.
export function LinkToModal({
  open,
  onClose,
  sourceTable,
  sourceId,
  sourceHeadline,
}: {
  open: boolean;
  onClose: () => void;
  sourceTable: string;
  sourceId: string;
  sourceHeadline: string;
}) {
  const t = useTranslations("entityLinks");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();
  const [selectedModule, setSelectedModule] = useState<ModuleConfig | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setSelectedModule(null);
    setQuery("");
    setResults([]);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!selectedModule) {
      setResults([]);
      return;
    }
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timeout = setTimeout(async () => {
      const { data, error: searchError } = await supabase
        .from(selectedModule.table)
        .select("*")
        .ilike(selectedModule.headlineKey, likePattern(q))
        .limit(8);
      if (cancelled) return;
      setSearching(false);
      if (searchError) {
        setError(searchError.message);
        return;
      }
      setResults(
        ((data as Record<string, unknown>[]) ?? [])
          .filter((row) => !(selectedModule.table === sourceTable && row.id === sourceId))
          .map((row) => ({
            id: String(row.id),
            headline: String(row[selectedModule.headlineKey] ?? "untitled"),
          }))
      );
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [selectedModule, query, supabase, sourceTable, sourceId]);

  async function handleLink(targetId: string) {
    if (!selectedModule) return;
    setLinkingId(targetId);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError(tCommon("notAuthenticated"));
      setLinkingId(null);
      return;
    }

    const { error: insertError } = await supabase.from("entity_links").insert({
      user_id: user.id,
      source_table: sourceTable,
      source_id: sourceId,
      target_table: selectedModule.table,
      target_id: targetId,
    });

    setLinkingId(null);

    if (insertError) {
      setError(insertError.message);
      addToast(`✗ ${tCommon("error")}: ${insertError.message}`, "error");
      return;
    }

    addToast(tCommon("linked"));
    onClose();
    router.refresh();
  }

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0">
      <div onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${t("modalTitle")}: ${sourceHeadline}`}
        className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-[0_0_0_1px_rgba(249,115,22,0.05)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400"
              aria-hidden="true"
            >
              <Link2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">{t("modalTitle")}</h2>
              <p className="truncate text-xs text-muted">{sourceHeadline}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon("close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!selectedModule ? (
            <>
              <p className="mb-3 text-xs text-muted">{t("pickModulePrompt")}</p>
              <div className="grid grid-cols-2 gap-2">
                {LINKABLE_MODULES.map((m) => (
                  <button
                    key={m.slug}
                    type="button"
                    onClick={() => setSelectedModule(m)}
                    className="rounded-xl border border-border bg-input px-3 py-2.5 text-left text-sm text-foreground transition-colors duration-150 hover:border-orange-500/60 hover:text-orange-400"
                  >
                    {m.title}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSelectedModule(null)}
                className="mb-3 inline-flex items-center gap-1 text-xs text-muted transition-colors duration-150 hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {selectedModule.title}
              </button>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                  placeholder={t("searchPlaceholder", { module: selectedModule.title })}
                  className="input pl-10"
                />
              </div>

              <div className="mt-3 space-y-1.5">
                {searching && <p className="text-xs text-muted">{t("searching")}</p>}
                {!searching && query.trim().length > 0 && results.length === 0 && (
                  <p className="text-xs text-muted">{t("noMatches")}</p>
                )}
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleLink(r.id)}
                    disabled={linkingId === r.id}
                    className="block w-full rounded-lg border border-border bg-input px-3 py-2 text-left text-sm text-foreground transition-colors duration-150 hover:border-orange-500/60 hover:text-orange-400 disabled:opacity-50"
                  >
                    {r.headline}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
              error: {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
