import type { ReactNode } from "react";
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
  help,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /**
   * The contextual "?" — pass <HelpTip slug="..." /> from a SERVER page.
   *
   * A ReactNode rather than a slug string on purpose: HelpTip reaches the
   * database, so taking a slug here would drag `server-only` into a
   * component that 22 pages import and that nothing today stops from
   * being used in a client tree. This way the dependency stays at the
   * call site, where it is visible.
   */
  help?: ReactNode;
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
        {/* The heading keeps `truncate`; the "?" sits outside it, or a
            long title on a 375px screen would clip the help away. */}
        <div className="flex min-w-0 items-center gap-1">
          <h1 className="truncate text-2xl font-bold text-foreground">{title}</h1>
          {help}
        </div>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
    </div>
  );
}
