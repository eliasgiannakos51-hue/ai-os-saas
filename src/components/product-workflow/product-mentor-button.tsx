import Link from "next/link";
import { Compass } from "lucide-react";

// Links straight into Ionexa Chat with ?preset=product — chat-workspace.tsx
// reads that (via dashboard/chat/page.tsx) to start Mentor Mode already on
// with the last 20 products loaded as system-prompt context (see
// lib/chat/product-mentor-context.ts). No client state needed here at all.
// Structurally identical to trading-mentor-button.tsx — duplicated rather
// than shared because the brief was explicit that Trading Workflow's
// existing files must not be touched, so extracting a common component
// out of it wasn't an option here.
export function ProductMentorButton({ label, description }: { label: string; description: string }) {
  return (
    <Link
      href="/dashboard/chat?preset=product"
      className="flex items-center gap-3 rounded-2xl border border-border bg-panel p-4 transition-all duration-200 hover:border-orange-500/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
        <Compass className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
    </Link>
  );
}
