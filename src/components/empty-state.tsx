import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// The pulsing ring + gently bobbing icon are pure CSS animation — both
// collapse to a static state automatically under the "reduce motion"
// accessibility setting (globals.css's html[data-motion="reduce"] rule
// zeroes every animation-duration), so this needs no extra logic here to
// stay accessible.
export function EmptyState({
  icon: Icon = Inbox,
  children,
}: {
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(249,115,22,0.18) 0%, rgba(220,38,38,0.06) 50%, transparent 75%)",
        }}
      />
      <span className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-orange-500/10" />
        <span className="absolute inset-2 rounded-full border border-orange-500/15" />
        <span className="relative flex h-20 w-20 animate-[float_3s_ease-in-out_infinite] items-center justify-center rounded-full bg-orange-500/10">
          <Icon className="h-9 w-9 text-orange-400/80" aria-hidden="true" />
        </span>
      </span>
      <div className="relative">{children}</div>
    </div>
  );
}
