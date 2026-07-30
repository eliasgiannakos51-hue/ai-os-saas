import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-3 truncate text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-muted">{label}</p>
      {sublabel && <p className="mt-0.5 text-[13px] text-muted/80">{sublabel}</p>}
    </div>
  );
}
