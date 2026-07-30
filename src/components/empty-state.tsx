import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon = Inbox,
  children,
}: {
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
      <Icon className="mx-auto mb-3 h-6 w-6 text-muted/80" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
