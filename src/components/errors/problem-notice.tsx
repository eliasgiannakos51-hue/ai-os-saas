"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, CreditCard, Clock, WifiOff, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  CREDIT_OUTCOME_FOR,
  creditOutcomeKey,
  problemKey,
  type ProblemCode,
} from "@/lib/errors/problem-codes";

const ICONS: Record<ProblemCode, LucideIcon> = {
  out_of_credits: Zap,
  rate_limited: Clock,
  timeout: Clock,
  network: WifiOff,
};

/**
 * A failure, told in three parts: what happened, what you can do, and
 * what happened to your credits.
 *
 * Rendered WHERE the action failed rather than as a toast, for the reason
 * OutOfCreditsNotice already gives: a toast disappears, and the person is
 * looking at the button they just pressed. This is that component's shape
 * generalised to the other three failures, and OutOfCreditsNotice stays
 * as-is for out_of_credits — it does more than this can (a live balance,
 * two recovery links), and replacing a better component with a general one
 * would be a downgrade dressed as consistency.
 *
 * THE MONEY LINE ALWAYS RENDERS. Not when it is interesting, not when the
 * route bothered to say — always, from CREDIT_OUTCOME_FOR, which is keyed
 * on the code so a route cannot report the wrong one. A failure message
 * that leaves "was I charged for that?" unanswered has failed at the one
 * job it had.
 */
export function ProblemNotice({
  code,
  /** Where to go when the fix is elsewhere — /pricing for credits. */
  action,
  onRetry,
  className = "",
}: {
  code: ProblemCode;
  action?: { href: string; labelKey: string };
  onRetry?: () => void;
  className?: string;
}) {
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const Icon = ICONS[code] ?? AlertTriangle;
  const outcome = CREDIT_OUTCOME_FOR[code];

  return (
    <div
      role="alert"
      data-testid={`problem-${code}`}
      className={`rounded-xl border border-orange-500/40 bg-orange-500/[0.07] p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-400">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{t(problemKey(code, "what"))}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t(problemKey(code, "next"))}</p>
          {/* Its own line, with its own icon, because it is a different
              kind of fact from the other two and the one the reader is
              scanning for. */}
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400/90">
            <CreditCard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t(creditOutcomeKey(outcome))}
          </p>
          {(action || onRetry) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex min-h-[36px] items-center rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-black transition-opacity duration-150 hover:opacity-90"
                >
                  {tCommon("retry")}
                </button>
              )}
              {action && (
                <Link
                  href={action.href}
                  className="inline-flex min-h-[36px] items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500"
                >
                  {t(action.labelKey)}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
