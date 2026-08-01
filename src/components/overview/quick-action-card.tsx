import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function QuickActionCard({
  href,
  icon: Icon,
  label,
  description,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-[linear-gradient(160deg,var(--panel)_0%,var(--panel)_65%,rgba(249,115,22,0.035)_100%)] p-4 transition-all duration-200 hover:scale-[1.015] hover:border-orange-500/40 hover:shadow-[0_0_20px_rgba(249,115,22,0.12)]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400 transition-colors duration-200 group-hover:bg-orange-500/15">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-foreground">{label}</p>
        <p className="truncate text-[13px] text-muted">{description}</p>
      </div>
    </Link>
  );
}
