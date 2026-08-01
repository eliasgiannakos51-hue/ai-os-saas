"use client";

import { Lightbulb } from "lucide-react";
import type { TopModule } from "@/lib/use-smart-suggestions";

// A short, generic lead-in — works for any module title without needing
// per-module copy ("Log this as a new Idea entry: ", "... Trading entry:
// ", etc).
function suggestionPhrase(moduleTitle: string): string {
  return `Log this as a new ${moduleTitle} entry: `;
}

export function SmartSuggestions({
  modules,
  visible,
  onPick,
}: {
  modules: TopModule[];
  visible: boolean;
  onPick: (phrase: string) => void;
}) {
  if (!visible || modules.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <Lightbulb className="h-3.5 w-3.5 shrink-0 text-orange-400/70" aria-hidden="true" />
      {modules.map((m) => (
        <button
          key={m.slug}
          type="button"
          onClick={() => onPick(suggestionPhrase(m.title))}
          className="rounded-full border border-border px-2.5 py-1 transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
        >
          {m.title}
        </button>
      ))}
    </div>
  );
}
