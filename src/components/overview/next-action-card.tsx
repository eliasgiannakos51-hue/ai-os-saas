import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";

// Pure presentation — the message text arrives already translated/
// formatted from the page (see lib/next-action.ts + dashboard/overview/
// page.tsx), same convention as AiCoachCard/ActiveMissionCard.
export function NextActionCard({
  title,
  message,
  href,
  ctaLabel,
}: {
  title: string;
  message: string;
  href: string;
  ctaLabel: string;
}) {
  return (
    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/[0.03] p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
        <Compass className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{message}</p>
        <Link
          href={href}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-orange-400 transition-colors duration-150 hover:underline"
        >
          {ctaLabel} <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
