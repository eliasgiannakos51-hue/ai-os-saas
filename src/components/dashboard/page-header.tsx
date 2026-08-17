import type { LucideIcon } from "lucide-react";
import { GlowOrb } from "@/components/ui/glow-orb";
import { HelpTip } from "@/components/ui/help-tip";

// Shared by every page-level header (Home, module pages, Settings, Team,
// Marketplace, AI Memory) — the ambient glow behind it is applied once
// here rather than repeated per page, so "a warm glow behind headers
// across the app" stays one consistent effect instead of several
// hand-tuned ones.
export function PageHeader({
  icon: Icon,
  title,
  description,
  helpKey,
  helpArticle,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /**
   * Key prefix for the "?" beside the title — see lib/help-tips.ts, which
   * is the registry of which pages have one and what wrong assumption
   * each is there to correct.
   *
   * Here rather than per page so the control is always in the same place.
   * A help affordance that moves between pages is one users stop looking
   * for.
   */
  helpKey?: string;
  /** Help Centre article slug for the "?", when one exists. */
  helpArticle?: string;
}) {
  return (
    <div className="relative mb-6 flex items-center gap-3">
      <GlowOrb className="-left-8 -top-16 -z-10 h-40 w-40" />
      {Icon && (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      {/* `flex-1` so the title block claims the row's spare width; without
          it a long title truncates against its own content box while the
          header still has room to its right. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-2xl font-bold text-foreground">{title}</h1>
          {helpKey && <HelpTip helpKey={helpKey} articleSlug={helpArticle} />}
        </div>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
    </div>
  );
}
