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
    <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
      <span className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-orange-500/10" />
        <span className="relative flex h-14 w-14 animate-[float_3s_ease-in-out_infinite] items-center justify-center rounded-full bg-orange-500/10">
          <Icon className="h-6 w-6 text-orange-400/80" aria-hidden="true" />
        </span>
      </span>
      <div>{children}</div>
    </div>
  );
}
