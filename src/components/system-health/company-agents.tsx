import { Bot } from "lucide-react";
import { BLOCKERS, DEPARTMENTS, ROSTER, RUNNING_AGENT_IDS, rosterCounts, type RosterStatus, type DepartmentKey } from "@/lib/company-agents/roster";

/**
 * THE COMPANY'S OWN AGENTS, for the owner: what each one's last run found,
 * and the whole roster with what is true of every entry.
 *
 * Server component, rendered inside the owner-only /dashboard/system-health
 * page (which 404s for anybody else). It receives the last row per running
 * agent, already read on the server; it reads nothing itself.
 *
 * `runs === null` means the table could not be read — almost always the
 * migration has not been run — and the section says so instead of showing
 * an empty list that would read as "nothing has run, nothing is wrong".
 */

export type CompanyAgentRunRow = {
  agentId: string;
  ranAt: string;
  status: "ok" | "warn" | "fail" | "unverified";
  summary: string;
  unverified: string[];
};

const STATUS_LABEL: Record<RosterStatus, string> = {
  running: "Running",
  built: "Built, runs when asked (not scheduled)",
  blocked: "Blocked",
  planned: "Planned",
};

const RUN_TONE: Record<CompanyAgentRunRow["status"], string> = {
  ok: "text-success",
  warn: "text-foreground",
  fail: "text-danger",
  unverified: "text-muted",
};

function nameOf(agentId: string): string {
  return ROSTER.find((a) => a.id === agentId)?.name ?? agentId;
}

function LastRuns({ runs }: { runs: CompanyAgentRunRow[] | null }) {
  if (runs === null) {
    return (
      <p className="mt-3 text-xs text-muted">
        Could not read company_agent_runs. Apply the migration 20261106000000_company_agent_runs.sql,
        then reload.
      </p>
    );
  }
  return (
    <ul className="mt-3 space-y-3">
      {RUNNING_AGENT_IDS.map((id) => {
        const last = runs.find((r) => r.agentId === id);
        return (
          <li key={id} className="rounded-item bg-background/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">{nameOf(id)}</p>
            {last === undefined ? (
              <p className="mt-1 text-xs text-muted">
                No run recorded yet. The first one happens at the next scheduled run (once a day).
              </p>
            ) : (
              <>
                <p className={`mt-1 text-sm font-semibold ${RUN_TONE[last.status]}`}>
                  {last.status.toUpperCase()} — {last.summary}
                </p>
                <p className="text-[11px] text-muted">{last.ranAt}</p>
                {last.unverified.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted">Not covered by this run: {last.unverified.join("; ")}</p>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function CompanyAgents({ runs }: { runs: CompanyAgentRunRow[] | null }) {
  const counts = rosterCounts();
  const departments = Object.keys(DEPARTMENTS) as DepartmentKey[];
  return (
    <section className="mt-6 surface">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Bot className="h-4 w-4 text-foreground" aria-hidden="true" />
        Company agents — {ROSTER.length} on the roster
      </h2>
      <p className="mt-2 text-xs text-muted">
        {counts.running} running · {counts.built} built, run when asked · {counts.blocked} blocked · {counts.planned} planned.
        Only “running” means code is executing. Every agent here reads and reports; none changes anything.
      </p>

      <LastRuns runs={runs} />

      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-semibold">The whole roster</summary>
        {departments.map((d) => (
          <div key={d} className="mt-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">{DEPARTMENTS[d]}</p>
            <ul className="mt-1 space-y-1">
              {ROSTER.filter((a) => a.department === d).map((a) => (
                <li key={a.id} className="py-2 text-xs">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted"> — {STATUS_LABEL[a.status]}, autonomy {a.autonomy}</span>
                  <p className="text-[11px] text-muted">{a.mission}</p>
                  {a.blockedBy && <p className="text-[11px] text-muted">Waiting on: {BLOCKERS[a.blockedBy]}</p>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </details>
    </section>
  );
}
