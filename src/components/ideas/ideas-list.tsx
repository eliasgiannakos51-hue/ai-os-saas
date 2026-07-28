"use client";

import { useMemo, useState } from "react";
import type { Idea } from "@/types/ideas";
import { IdeaRow } from "@/components/ideas/idea-row";

function searchableText(idea: Idea): string {
  return [
    idea.name,
    idea.problem,
    idea.customer,
    idea.competitors,
    idea.market_size,
    idea.mvp,
    idea.verdict,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

export function IdeasList({ ideas }: { ideas: Idea[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ideas;
    return ideas.filter((idea) => searchableText(idea).includes(q));
  }, [ideas, query]);

  if (ideas.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted">
        no ideas yet — run{" "}
        <span className="text-amber-500">ideas.insert()</span> to log your
        first one.
      </div>
    );
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search.filter()..."
        className="input mb-4"
      />

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted">
          no matches for &apos;{query}&apos;
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((idea) => (
            <IdeaRow key={idea.id} idea={idea} />
          ))}
        </div>
      )}
    </div>
  );
}
