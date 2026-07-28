import type { Idea } from "@/types/ideas";
import { DeleteButton } from "@/components/delete-button";

function verdictClasses(verdict: string | null) {
  const v = (verdict ?? "").toLowerCase();
  if (v.includes("pursue") || v.includes("go") || v.includes("build")) {
    return "border-emerald-800 bg-emerald-950/30 text-emerald-400";
  }
  if (v.includes("kill") || v.includes("no")) {
    return "border-red-900 bg-red-950/30 text-red-400";
  }
  if (v) return "border-amber-800 bg-amber-950/30 text-amber-400";
  return "border-border bg-black/30 text-muted";
}

export function IdeasList({ ideas }: { ideas: Idea[] }) {
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
    <div className="space-y-3">
      {ideas.map((idea) => (
        <div
          key={idea.id}
          className="rounded-md border border-border bg-panel p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {idea.name}
              </h3>
              {idea.customer && (
                <p className="text-xs text-muted">for: {idea.customer}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {idea.score !== null && (
                <span className="rounded border border-border bg-black/30 px-2 py-0.5 text-xs text-foreground">
                  score: {idea.score}
                </span>
              )}
              {idea.verdict && (
                <span
                  className={`rounded border px-2 py-0.5 text-xs ${verdictClasses(
                    idea.verdict
                  )}`}
                >
                  {idea.verdict}
                </span>
              )}
            </div>
          </div>

          {idea.problem && (
            <p className="mt-3 text-sm text-foreground/90">
              <span className="text-amber-500">problem:</span> {idea.problem}
            </p>
          )}
          {idea.competitors && (
            <p className="mt-1 text-sm text-foreground/90">
              <span className="text-amber-500">competitors:</span>{" "}
              {idea.competitors}
            </p>
          )}
          {idea.market_size && (
            <p className="mt-1 text-sm text-foreground/90">
              <span className="text-amber-500">market_size:</span>{" "}
              {idea.market_size}
            </p>
          )}
          {idea.mvp && (
            <p className="mt-1 text-sm text-foreground/90">
              <span className="text-amber-500">mvp:</span> {idea.mvp}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted">
              logged {new Date(idea.created_at).toLocaleString()}
            </p>
            <DeleteButton table="ideas" id={idea.id} label="idea" />
          </div>
        </div>
      ))}
    </div>
  );
}
