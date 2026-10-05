import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BarChart3, PenLine, Play, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WORK_MODES, workModeHref, type WorkMode } from "@/lib/chat/work-modes";

const ICONS: Record<WorkMode, LucideIcon> = {
  research: Search,
  create: PenLine,
  run: Play,
  analyze: BarChart3,
};

/**
 * THE FOUR QUICK ACTIONS under the Home field (docs/CONTEXT.md, ΣΥΣΤΗΜΑ
 * DESIGN, «ΑΡΧΙΚΗ»): Research, Create, Run, Analyze. Each opens the chat
 * in that way of working (lib/chat/work-modes.ts). Links, not buttons:
 * the work happens on another screen, so a press is a navigation, and
 * nothing is sent or charged until the person writes and presses Send.
 */
export async function QuickActions() {
  const t = await getTranslations("dashboard.home.actions");
  return (
    <ul className="mt-4 flex flex-wrap justify-center gap-2" data-testid="quick-actions">
      {WORK_MODES.map((mode) => {
        const Icon = ICONS[mode];
        return (
          <li key={mode}>
            <Link
              href={workModeHref(mode)}
              data-testid={`quick-action-${mode}`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border px-4 text-sm text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {t(mode)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
