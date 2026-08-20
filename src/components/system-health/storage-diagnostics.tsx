"use client";

import { useState } from "react";
import { HardDrive, Loader2 } from "lucide-react";

type Check = { name: string; ok: boolean; detail: string };
type Result = { ok: boolean; checks: Check[]; remedy: string | null };

/**
 * One button that answers "why do uploads fail on THIS deployment" from
 * inside it: bucket existence, table reachability, and both RLS layers,
 * each exercised for real (see /api/system-health/files). English on
 * purpose — the whole system-health page is owner-only and untranslated.
 */
export function StorageDiagnostics() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState(false);

  async function run() {
    setRunning(true);
    setFailed(false);
    try {
      const response = await fetch("/api/system-health/files");
      if (!response.ok) throw new Error(String(response.status));
      setResult((await response.json()) as Result);
    } catch {
      setResult(null);
      setFailed(true);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-panel p-4" data-testid="storage-diagnostics">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted" aria-hidden />
          <h2 className="text-sm font-semibold">File storage</h2>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-white/5 disabled:opacity-50"
          data-testid="storage-diagnostics-run"
        >
          {running ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Checking…
            </span>
          ) : (
            "Run storage check"
          )}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Exercises the upload chain for real: bucket, table, and both RLS layers, with canaries
        that are removed in the same request.
      </p>

      {failed && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.05] p-3 text-xs text-red-300">
          The check itself failed to run — see the function logs for /api/system-health/files.
        </p>
      )}

      {result && (
        <ul className="mt-3 space-y-1.5" data-testid="storage-diagnostics-results">
          {result.checks.map((check) => (
            <li key={check.name} className="flex items-start gap-2 text-xs">
              <span className={check.ok ? "text-emerald-400" : "text-red-400"} aria-hidden>
                {check.ok ? "✓" : "✕"}
              </span>
              <span>
                <span className="font-medium">{check.name}</span>
                <span className="text-muted"> — {check.detail}</span>
              </span>
            </li>
          ))}
          {result.remedy && (
            <li className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-3 text-xs text-amber-300">
              {result.remedy}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
