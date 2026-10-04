"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

// Spelt out here, not imported: no component may import the provider layer
// (scripts/tests/ai-providers.test.mjs). scripts/tests/key-inventory.test.mjs
// holds this list equal to KEY_STATUSES in the inventory.
type KeyStatus =
  | "ok"
  | "invalid"
  | "forbidden"
  | "rate-limited"
  | "unknown-endpoint"
  | "unreachable"
  | "not-set"
  | "no-check";
type KeyCheckResult = { id: string; envVar: string | null; status: KeyStatus; httpStatus: number | null };

/** What the server knows about each key without asking the provider. */
export type KeyInventoryRow = {
  id: string;
  label: string;
  envVars: string[];
  roles: string[];
  readBy: string[];
  missing: string | null;
  set: boolean;
};

const STATUS_TEXT: Record<KeyStatus, { text: string; tone: string }> = {
  ok: { text: "works", tone: "text-success" },
  invalid: { text: "rejected (401) — the provider does not know this key", tone: "text-danger" },
  forbidden: { text: "refused (403) — real key, not allowed this call", tone: "text-warning" },
  "rate-limited": { text: "out of quota right now (429)", tone: "text-warning" },
  "unknown-endpoint": { text: "check URL is wrong (404) — not the key's fault", tone: "text-warning" },
  unreachable: { text: "could not reach the provider", tone: "text-warning" },
  "not-set": { text: "not set", tone: "text-muted" },
  "no-check": { text: "set — this provider has no free call to test it", tone: "text-muted" },
};

// Named constants rather than literals in a ternary: English reached through
// a ternary is how a string escapes every scanner (i18n-coverage.test.mjs).
// This screen is owner-only and English on purpose (i18n-population).
const RUN = "Check keys";
const CHECKING = "Checking…";
const SET_UNCHECKED = "set — not checked yet";
const NOT_SET = "not set";
const UNREAD = "No code reads this key yet.";
const UNREAD_BUT_SET = "No code reads this key yet — it is set, and does nothing.";

/**
 * The owner's question of §1.0 (docs/v6-master.md): which keys work, and
 * which are set but read by nothing. The second half renders without a
 * click, from the inventory; the first needs one, because it calls every
 * provider (free reads only — see /api/system-health/keys). English, like
 * the rest of this owner-only page.
 */
export function KeyChecks({ rows }: { rows: KeyInventoryRow[] }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, KeyCheckResult> | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function run() {
    setRunning(true);
    setFailed(false);
    try {
      const response = await fetch("/api/system-health/keys", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { results: KeyCheckResult[]; checkedAt: string };
      setResults(Object.fromEntries(body.results.map((r) => [r.id, r])));
      setCheckedAt(body.checkedAt);
    } catch {
      setResults(null);
      setFailed(true);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mt-8 surface-tight" data-testid="key-checks">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted" aria-hidden />
          <h2 className="text-sm font-semibold">Provider keys</h2>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="rounded-item bg-foreground/5 px-3 py-1.5 text-xs font-medium hover:bg-foreground/10 disabled:opacity-50"
          data-testid="key-checks-run"
        >
          {running ? CHECKING : RUN}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        One free read per provider (a model or account list, never a generation). Names and
        statuses only; no value leaves the server.
        {checkedAt && <> Last checked {checkedAt}.</>}
      </p>

      {failed && (
        <p className="mt-3 rounded-item bg-danger/[0.08] p-3 text-xs text-danger">
          The check itself failed to run — see the function logs for /api/system-health/keys.
        </p>
      )}

      <ul className="mt-3 space-y-3" data-testid="key-checks-rows">
        {rows.map((row) => {
          const result = results?.[row.id];
          const status = result ? STATUS_TEXT[result.status] : null;
          return (
            <li key={row.id} className="text-xs" data-testid={`key-${row.id}`}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{row.label}</span>
                <code className="text-muted">{row.envVars.join(" | ")}</code>
                <span className={status ? status.tone : row.set ? "text-foreground" : "text-muted"}>
                  {status ? status.text : row.set ? SET_UNCHECKED : NOT_SET}
                </span>
              </div>
              <p className="text-muted">Role: {row.roles.join("; ")}</p>
              {row.readBy.length === 0 && (
                <p className="text-warning" data-testid={`key-${row.id}-unread`}>
                  {row.set ? UNREAD_BUT_SET : UNREAD}
                </p>
              )}
              {row.missing && <p className="text-muted">Missing: {row.missing}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
