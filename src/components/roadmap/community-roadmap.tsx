"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ThumbsUp, Loader2, Plus } from "lucide-react";

type FeatureRequest = {
  id: string;
  title: string;
  description: string;
  status: "under_review" | "planned" | "in_progress" | "shipped";
  votes: number;
  created_at: string;
};

const STATUS_BADGES: Record<FeatureRequest["status"], string> = {
  under_review: "border-border text-muted",
  planned: "border-sky-500/40 text-sky-400",
  in_progress: "border-amber-500/40 text-amber-400",
  shipped: "border-emerald-500/40 text-emerald-400",
};

/**
 * The community half of the roadmap (V3 Task 13): what people asked
 * for, with votes. Public read; voting and submitting need an account.
 * Statuses are set by the owner (service role) — the client can only
 * ask and vote.
 */
export function CommunityRoadmap({ isAuthed }: { isAuthed: boolean }) {
  const t = useTranslations("communityRoadmap");
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/feature-requests");
        const data = await response.json();
        if (!cancelled && data?.ok) {
          setRequests(data.requests ?? []);
          setVotedIds(new Set(data.votedIds ?? []));
        }
      } catch {
        // The static roadmap above still renders; this section just
        // stays empty.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleVote(id: string) {
    if (!isAuthed) return;
    const wasVoted = votedIds.has(id);
    // Optimistic: the trigger-maintained count on the server will agree.
    setVotedIds((current) => {
      const next = new Set(current);
      if (wasVoted) next.delete(id);
      else next.add(id);
      return next;
    });
    setRequests((current) =>
      current.map((r) => (r.id === id ? { ...r, votes: r.votes + (wasVoted ? -1 : 1) } : r))
    );
    try {
      const response = await fetch(`/api/feature-requests/${id}/vote`, { method: "POST" });
      const data = await response.json();
      if (!data?.ok) throw new Error("vote failed");
    } catch {
      // Roll back.
      setVotedIds((current) => {
        const next = new Set(current);
        if (wasVoted) next.add(id);
        else next.delete(id);
        return next;
      });
      setRequests((current) =>
        current.map((r) => (r.id === id ? { ...r, votes: r.votes + (wasVoted ? 1 : -1) } : r))
      );
    }
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/feature-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const data = await response.json();
      if (!data?.ok) {
        setError(typeof data?.error === "string" ? data.error : t("submitError"));
        return;
      }
      setRequests((current) => [data.request, ...current]);
      setVotedIds((current) => new Set(current).add(data.request.id));
      setTitle("");
      setDescription("");
      setShowForm(false);
    } catch {
      setError(t("submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-14">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <span aria-hidden="true">🗳️</span>
          {t("title")}
        </h2>
        {isAuthed ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t("requestButton")}
          </button>
        ) : (
          <Link
            href="/login?next=/roadmap"
            className="text-xs font-semibold text-orange-400 underline underline-offset-2"
          >
            {t("signInToRequest")}
          </Link>
        )}
      </div>
      <p className="mb-5 text-sm leading-relaxed text-muted">{t("intro")}</p>

      {showForm && (
        <div className="mb-6 space-y-3 rounded-2xl border border-orange-500/30 bg-panel p-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            maxLength={120}
            className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none transition-colors duration-150 focus:border-orange-500"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
            rows={3}
            maxLength={2000}
            className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none transition-colors duration-150 focus:border-orange-500"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || title.trim().length < 8}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {t("submit")}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t("loading")}</p>
      ) : requests.length === 0 ? (
        <p className="rounded-2xl border border-border bg-panel/60 p-4 text-sm text-muted">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => {
            const voted = votedIds.has(request.id);
            return (
              <li
                key={request.id}
                className="flex items-start gap-3 rounded-2xl border border-border bg-panel p-4"
              >
                <button
                  type="button"
                  onClick={() => void toggleVote(request.id)}
                  disabled={!isAuthed}
                  aria-pressed={voted}
                  aria-label={t("voteLabel", { title: request.title })}
                  title={isAuthed ? undefined : t("signInToVote")}
                  className={`flex min-w-[52px] flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-xs font-bold transition-colors duration-150 ${
                    voted
                      ? "border-orange-500 bg-orange-500/10 text-orange-400"
                      : "border-border text-muted hover:text-foreground"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                  {request.votes}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{request.title}</h3>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGES[request.status]}`}
                    >
                      {t(`statuses.${request.status}`)}
                    </span>
                  </div>
                  {request.description && (
                    <p className="mt-1 text-xs leading-relaxed text-muted">{request.description}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
