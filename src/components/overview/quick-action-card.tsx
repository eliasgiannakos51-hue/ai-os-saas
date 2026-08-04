import Link from "next/link";
import type { LucideIcon } from "lucide-react";

// Per-card accent. Amber stays the brand default and the first slot; the
// others differentiate the row so it scans as four distinct destinations
// rather than one repeated button. Kept as a closed union (not arbitrary
// strings) so Tailwind's JIT can see every class literally — dynamically
// built class names like `bg-${color}-500/15` are silently dropped from
// the compiled CSS.
export type QuickActionTone = "amber" | "violet" | "sky" | "emerald";

const TONES: Record<QuickActionTone, { chip: string; icon: string }> = {
  amber: {
    chip: "bg-gradient-to-br from-orange-500/30 to-amber-400/15 ring-orange-400/25",
    icon: "text-orange-300",
  },
  violet: {
    chip: "bg-gradient-to-br from-purple-500/30 to-fuchsia-400/15 ring-purple-400/25",
    icon: "text-purple-300",
  },
  sky: {
    chip: "bg-gradient-to-br from-sky-500/30 to-cyan-400/15 ring-sky-400/25",
    icon: "text-sky-300",
  },
  emerald: {
    chip: "bg-gradient-to-br from-emerald-500/30 to-teal-400/15 ring-emerald-400/25",
    icon: "text-emerald-300",
  },
};

export function QuickActionCard({
  href,
  icon: Icon,
  label,
  description,
  tone = "amber",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
  tone?: QuickActionTone;
}) {
  const t = TONES[tone];
  return (
    <Link href={href} className="glass-card group flex items-center gap-3 rounded-2xl p-4">
      <span
        className={`relative z-[1] flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-200 group-hover:scale-105 ${t.chip}`}
      >
        <Icon className={`h-5 w-5 ${t.icon}`} aria-hidden="true" />
      </span>
      <div className="relative z-[1] min-w-0">
        <p className="text-[15px] font-semibold text-foreground">{label}</p>
        <p className="truncate text-[13px] text-muted">{description}</p>
      </div>
    </Link>
  );
}
