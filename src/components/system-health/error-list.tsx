"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { formatDateTime } from "@/lib/format-number";
import { useLocale, useTranslations } from "next-intl";

export type ProductionErrorRow = {
  id: string;
  errorMessage: string;
  stackTrace: string | null;
  route: string;
  occurrenceCount: number;
  affectedUsers: number;
  firstSeenAt: string;
  occurredAt: string;
  resolved: boolean;
};

export function ErrorList({ rows }: { rows: ProductionErrorRow[] }) {
  const locale = useLocale();
  const t = useTranslations("dashboard.systemHealth");
  const formatRelativeTime = useFormatRelativeTime();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [locallyResolved, setLocallyResolved] = useState<Set<string>>(new Set());

  if (rows.length === 0) {
    return <EmptyState icon={ShieldCheck}>No errors recorded. Nothing is on fire.</EmptyState>;
  }

  async function resolve(id: string) {
    setResolving(id);
    try {
      const res = await fetch("/api/system-health/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setLocallyResolved((prev) => new Set(prev).add(id));
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => {
        const resolved = row.resolved || locallyResolved.has(row.id);
        const open = expanded === row.id;
        return (
          <div
            key={row.id}
            style={{ ["--i" as string]: i }}
            className={`list-slide-in rounded-2xl border p-4 transition-colors duration-200 ${
              resolved ? "border-border bg-panel/50 opacity-60" : "border-red-500/25 bg-panel"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{row.errorMessage}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <code className="rounded bg-white/[0.05] px-1.5 py-0.5">{row.route}</code>
                  <span>
                    {row.occurrenceCount}x
                    {row.affectedUsers > 0 && ` · ${row.affectedUsers} user${row.affectedUsers === 1 ? "" : "s"}`}
                  </span>
                  <span suppressHydrationWarning title={formatDateTime(row.occurredAt, locale)}>
                    last {formatRelativeTime(row.occurredAt)}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {row.stackTrace && (
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : row.id)}
                    aria-expanded={open}
                    aria-label={t("toggleStackTrace")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
                {!resolved && (
                  <button
                    type="button"
                    onClick={() => resolve(row.id)}
                    disabled={resolving === row.id}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-colors duration-150 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Resolve
                  </button>
                )}
              </div>
            </div>
            {open && row.stackTrace && (
              <pre className="content-fade-in mt-3 max-h-64 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-muted">
                {row.stackTrace}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
