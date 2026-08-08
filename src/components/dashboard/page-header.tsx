import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { GlowOrb } from "@/components/ui/glow-orb";

// Shared by every page-level header (Home, module pages, Settings, Team,
// Marketplace, AI Memory) — the ambient glow behind it is applied once
// here rather than repeated per page, so "a warm glow behind headers
// across the app" stays one consistent effect instead of several
// hand-tuned ones.
//
// helpSlug (V3 Task 13) is the contextual "?": pages that have a help
// centre article pass its slug and get a quiet icon linking straight to
// it — the article, not the help home.
export function PageHeader({
  icon: Icon,
  title,
  description,
  helpSlug,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  helpSlug?: string;
}) {
  return (
    <div className="relative mb-6 flex items-center gap-3">
      <GlowOrb className="-left-8 -top-16 -z-10 h-40 w-40" />
      {Icon && (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <span className="truncate">{title}</span>
          {helpSlug && (
            <Link
              href={`/help/${helpSlug}`}
              aria-label={`Help: ${title}`}
              title={`Help: ${title}`}
              className="shrink-0 text-muted transition-colors duration-150 hover:text-orange-400"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </h1>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
    </div>
  );
}
