import type { Idea } from "@/types/ideas";
import { IdeaRow } from "@/components/ideas/idea-row";

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
        <IdeaRow key={idea.id} idea={idea} />
      ))}
    </div>
  );
}
