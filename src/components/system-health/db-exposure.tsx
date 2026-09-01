import { Check, X } from "lucide-react";

export type ExposureRow = {
  key: string;
  found: number;
  expected: number;
  ok: boolean;
  detail: string;
};

/**
 * WHAT THIS DATABASE EXPOSES, asked of the database on every load.
 *
 * 20260916000000_extension_functions_not_anon ends its header by handing
 * the reader a query to run by hand, because a migration cannot know
 * whether pgcrypto lives in `public` (where CREATE EXTENSION puts it on a
 * plain PostgreSQL) or in `extensions` (where a real Supabase project
 * usually already has it). A query in a comment gets run once, by whoever
 * read the comment, on the day they read it. This asks it every time.
 *
 * The counts come from public.db_exposure_report(), which is SECURITY
 * DEFINER and granted to service_role alone — they are a map of where to
 * attack this database, so they belong on the owner's screen and nowhere
 * else.
 */
const LABELS: Record<string, string> = {
  extensions_in_public:
    "Extensions installed in the public schema — reachable through PostgREST unless their grants are off PUBLIC",
  anon_executable_functions: "Functions a signed-OUT visitor may execute",
  anon_readable_relations: "Tables and views a signed-OUT visitor may read",
  public_granted_relations: "Relations carrying a bare PUBLIC grant",
  tables_without_rls: "Tables with row-level security off",
  grant_without_policy: "Grants to signed-in users with no matching policy",
  secdef_without_search_path: "SECURITY DEFINER functions with no pinned search_path",
  default_acl_for_anon: "Default privileges that would grant future tables to anon",
};

const ALL_CLEAR = "Every check asked of the database itself came back clear.";
const WANT_ATTENTION = "checks want attention.";

export function DbExposure({ rows }: { rows: ExposureRow[] | null }) {
  if (rows === null) {
    return (
      <section className="mb-6 rounded-2xl border border-border bg-panel p-4">
        <h2 className="text-sm font-semibold text-fg">Database exposure</h2>
        <p className="mt-1 text-xs text-muted">
          Could not read it. public.db_exposure_report() is added by migration
          20260917000000 — apply it, or check that the service-role key is set.
        </p>
      </section>
    );
  }

  const bad = rows.filter((r) => !r.ok);
  // Named, not a ternary branch — same reason as env-warnings.tsx.
  const summary =
    bad.length === 0 ? ALL_CLEAR : `${bad.length} of ${rows.length} ${WANT_ATTENTION}`;
  return (
    <section className="mb-6 rounded-2xl border border-border bg-panel p-4">
      <h2 className="text-sm font-semibold text-fg">Database exposure</h2>
      <p className="mt-1 text-xs text-muted">{summary}</p>
      <ul className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-start gap-2 text-xs">
            {r.ok ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
            ) : (
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden="true" />
            )}
            <span className="min-w-0">
              <span className={r.ok ? "text-muted" : "text-red-300"}>
                {LABELS[r.key] ?? r.key}
              </span>{" "}
              <span className="font-mono text-fg">{r.found}</span>
              {/* THE EXPECTED VALUE IS PRINTED ONLY WHEN IT IS NOT MET.
                  "0, expected 0" on eight green rows is noise that makes
                  the one red row harder to find. */}
              {!r.ok && <span className="text-muted"> (expected {r.expected})</span>}
              {r.detail && <span className="ml-1 text-muted">— {r.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
