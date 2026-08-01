import type { LucideIcon } from "lucide-react";
import { GlowOrb } from "@/components/ui/glow-orb";

// Shared by every page-level header (Home, module pages, Settings, Team,
// Marketplace, AI Memory) — the ambient glow behind it is applied once
// here rather than repeated per page, so "a warm glow behind headers
// across the app" stays one consistent effect instead of several
// hand-tuned ones.
export function PageHeader({
  icon: Icon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="relative mb-6 flex items-center gap-3">
      <GlowOrb className="-left-8 -top-16 -z-10 h-40 w-40" />
      {Icon && (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold text-foreground">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
    </div>
  );
}
