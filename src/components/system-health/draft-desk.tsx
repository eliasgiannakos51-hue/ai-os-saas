"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine } from "lucide-react";

/**
 * THE DRAFT DESK, for the owner: pick a writing agent, type a brief, get a
 * draft, approve or reject it. Rendered inside the owner-only
 * /dashboard/system-health page; both routes it calls 404 for anybody else.
 *
 * Approving only marks the draft approved. Nothing is sent or published.
 * `drafts === null` means company_agent_drafts could not be read (the
 * migration has not been run) and the desk says so instead of showing an
 * empty list.
 */

export type DeskAgent = { id: string; name: string; brief: string; web: boolean; department: string };
export type DeskDraft = {
  id: string;
  agentId: string;
  createdAt: string;
  brief: string;
  draft: string;
  status: "pending" | "approved" | "rejected";
  truncated: boolean;
  sources: { url: string; title: string }[] | null;
};

/** Named, not inline: this panel is owner-only English, and a message passed
 *  straight to setMessage would be read by the i18n scanner as customer prose. */
const LABELS = {
  write: "Write draft",
  writing: "Writing…",
  noSources: "Sources: the search found nothing to cite.",
};

const MESSAGES = {
  writeFailed: "The draft could not be written.",
  noReach: "The request did not reach the server.",
  decideFailed: "The decision could not be saved.",
};

export function DraftDesk({ agents, drafts, limit }: { agents: DeskAgent[]; drafts: DeskDraft[] | null; limit: number }) {
  const router = useRouter();
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const agent = agents.find((a) => a.id === agentId);

  async function write() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/company-agents/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, brief }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(body.error ?? MESSAGES.writeFailed);
      } else {
        setBrief("");
        router.refresh();
      }
    } catch {
      setMessage(MESSAGES.noReach);
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    setMessage(null);
    const res = await fetch(`/api/company-agents/drafts/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    }).catch(() => null);
    if (!res || !res.ok) setMessage(MESSAGES.decideFailed);
    else router.refresh();
  }

  return (
    <section className="mt-6 surface">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <PenLine className="h-4 w-4 text-foreground" aria-hidden="true" />
        Draft desk — {agents.length} writing agents
      </h2>
      <p className="mt-2 text-xs text-muted">
        Pick an agent, write a brief, read the draft. Approving a draft only marks it approved: nothing is sent or
        published. A draft knows only your brief (and, for the agents marked “web”, what a search found). At most {limit}{" "}
        drafts a day.
      </p>

      <label className="mt-3 block text-[11px] uppercase tracking-wide text-muted" htmlFor="draft-agent">
        Agent
      </label>
      <select
        id="draft-agent"
        value={agentId}
        onChange={(e) => setAgentId(e.target.value)}
        className="mt-1 w-full rounded-item bg-background/30 p-2 text-sm"
      >
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.department} · {a.name}
            {a.web ? " (web)" : ""}
          </option>
        ))}
      </select>
      {agent && <p className="mt-1 text-[11px] text-muted">Put in the brief: {agent.brief}</p>}

      <label className="mt-3 block text-[11px] uppercase tracking-wide text-muted" htmlFor="draft-brief">
        Brief
      </label>
      <textarea
        id="draft-brief"
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={5}
        className="mt-1 w-full rounded-item bg-background/30 p-2 text-sm"
      />
      <button
        type="button"
        onClick={write}
        disabled={busy || brief.trim().length < 20}
        className="mt-2 rounded-item bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50"
      >
        {busy ? LABELS.writing : LABELS.write}
      </button>
      {message && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {message}
        </p>
      )}

      {drafts === null ? (
        <p className="mt-4 text-xs text-muted">
          Could not read company_agent_drafts. Apply the migration 20261107000000_company_agent_drafts.sql, then reload.
        </p>
      ) : drafts.length === 0 ? (
        <p className="mt-4 text-xs text-muted">No drafts yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {drafts.map((d) => (
            <li key={d.id} className="rounded-item bg-background/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">
                {agents.find((a) => a.id === d.agentId)?.name ?? d.agentId} · {d.status} · {d.createdAt}
              </p>
              <p className="mt-1 line-clamp-3 text-[11px] text-muted">Brief: {d.brief}</p>
              {d.truncated && <p className="mt-1 text-xs text-danger">Cut off at the length limit: this draft is not complete.</p>}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold">Read the draft</summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs">{d.draft}</pre>
              </details>
              {d.sources !== null && (
                <p className="mt-2 text-[11px] text-muted">
                  {d.sources.length === 0
                    ? LABELS.noSources
                    : d.sources.map((s, i) => (
                        <span key={s.url}>
                          {i > 0 ? " · " : "Sources: "}
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                            {s.title || s.url}
                          </a>
                        </span>
                      ))}
                </p>
              )}
              {d.status === "pending" && (
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => decide(d.id, "approved")} className="rounded-item bg-foreground px-3 py-1 text-xs font-semibold text-background">
                    Approve
                  </button>
                  <button type="button" onClick={() => decide(d.id, "rejected")} className="rounded-item bg-background/50 px-3 py-1 text-xs font-semibold">
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
