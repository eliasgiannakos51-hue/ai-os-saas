"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, ShieldAlert, X } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-time";
import type { SecurityCheckResourceType, SecurityCheckResult } from "@/lib/security-check-log";

type SecurityCheckLogRow = {
  id: string;
  check_result: SecurityCheckResult;
  checked_at: string;
};

// AI Output Protection Layer — visible, clickable proof that a check
// actually ran, instead of an invisible in-app-only claim. Fetches the
// most recent security_check_log row for this exact resource (RLS-scoped
// to the caller) and renders nothing until it has a real row to show —
// no badge is ever shown speculatively before a check has actually
// completed and been logged.
export function SecurityCheckedBadge({
  resourceType,
  resourceId,
}: {
  resourceType: SecurityCheckResourceType;
  resourceId: string;
}) {
  const [log, setLog] = useState<SecurityCheckLogRow | null>(null);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/security-check-log?resourceType=${resourceType}&resourceId=${resourceId}`
        );
        const data = await res.json();
        if (!cancelled && res.ok && data.ok && data.log) {
          setLog(data.log as SecurityCheckLogRow);
        }
      } catch {
        // Best-effort — a badge that fails to load just doesn't show.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [resourceType, resourceId]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!log) return null;

  const passed = log.check_result.passed;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors duration-150 ${
          passed
            ? "border-emerald-800 bg-emerald-500/10 text-emerald-400 hover:border-emerald-600"
            : "border-amber-800 bg-amber-500/10 text-amber-400 hover:border-amber-600"
        }`}
        aria-expanded={open}
      >
        {passed ? (
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ShieldAlert className="h-3 w-3" aria-hidden="true" />
        )}
        {passed ? "Security checked" : "Security flagged"}
        <span className="text-muted" suppressHydrationWarning>
          · {formatRelativeTime(log.checked_at)}
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full z-20 mt-1.5 w-72 rounded-xl border border-border bg-panel p-3 text-left shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">AI Output Protection Layer</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-5 w-5 items-center justify-center rounded text-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <p className="mb-2 text-[11px] text-muted">
            Checked {new Date(log.checked_at).toLocaleString()}
          </p>
          <p className="mb-1 text-[11px] font-medium text-foreground">What was checked:</p>
          <ul className="mb-2 list-inside list-disc space-y-0.5 text-[11px] text-muted">
            {log.check_result.checks.map((check, i) => (
              <li key={i}>{check}</li>
            ))}
          </ul>
          {log.check_result.issues.length > 0 ? (
            <>
              <p className="mb-1 text-[11px] font-medium text-amber-400">Issues found:</p>
              <ul className="list-inside list-disc space-y-0.5 text-[11px] text-amber-300/80">
                {log.check_result.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[11px] text-emerald-400">No issues detected.</p>
          )}
        </div>
      )}
    </div>
  );
}
