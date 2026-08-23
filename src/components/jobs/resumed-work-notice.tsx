"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, X } from "lucide-react";
import { watchJob } from "@/lib/jobs/start-and-watch";
import { markJobConsumed } from "@/lib/jobs/consume";
import { JobSeen } from "@/components/jobs/job-seen";
import type { JobKind } from "@/lib/jobs/job-types";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";

/**
 * "You already asked for this — here is where it got to."
 *
 * THE FAILURE IT REMOVES IS A DUPLICATE CHARGE, and it is a different one
 * from the lost draft that consumed_at was built for. A plan and a routed
 * entry are both SAVED when they finish, so nothing is lost — but while
 * the worker is still going, a page that shows no sign of it looks exactly
 * like a page where nothing was ever started. The honest reaction is to
 * press the button again, and pressing it again starts a second job, makes
 * a second model call and takes a second charge for the same sentence.
 *
 * So this states the one fact that stops that: something is already
 * running, and it will finish whether or not this page stays open.
 *
 * IT DOES NOT RENDER THE RESULT, deliberately. For these kinds the result
 * is a row in a list the page is already showing; re-rendering it here
 * would be a second copy of the same thing that could disagree with the
 * first. What is offered instead is a link to where it actually lives.
 */
export function ResumedWorkNotice({ kind }: { kind: JobKind }) {
  const t = useTranslations("dashboard.backgroundWork");
  const router = useRouter();
  const [state, setState] = useState<
    { phase: "none" } | { phase: "working" } | { phase: "finished"; jobId: string; href: string | null }
  >({ phase: "none" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/jobs?kind=${kind}`);
        const data = await response.json();
        if (cancelled || !data.ok || !data.job) return;
        const job = data.job as {
          id: string;
          status: string;
          result: Record<string, unknown> | null;
          consumedAt: string | null;
        };

        if (job.status === "done") {
          setState({ phase: "finished", jobId: job.id, href: hrefOf(job.result) });
          // The list this page is showing was rendered before the worker
          // wrote its row, so it does not contain the new thing yet.
          router.refresh();
          return;
        }

        setState({ phase: "working" });
        const outcome = await watchJob(job.id);
        if (cancelled) return;
        if (outcome.ok) {
          setState({ phase: "finished", jobId: job.id, href: hrefOf(outcome.result) });
          router.refresh();
          return;
        }
        // A failure has already refunded and is announced by whichever
        // screen started it; "still_running" means only that this page
        // stopped watching. Neither is something to leave a stale "still
        // working" strip on the screen for.
        if (outcome.code === "still_running") return;
        setState({ phase: "none" });
        void markJobConsumed(job.id);
      } catch {
        // Nothing in flight is the common answer, and a failed check is
        // not evidence of one.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount only: re-running this would attach a second watcher to the
    // same job and double the polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  if (dismissed || state.phase === "none") return null;

  return (
    <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-border bg-panel/60 px-3 py-2.5">
      {state.phase === "working" ? (
        <ThinkingIndicator size="sm" className="mt-0.5 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-relaxed text-foreground">
          {state.phase === "working" ? t("working") : t("finished")}
        </p>
        {state.phase === "finished" && state.href && (
          <Link href={state.href} className="mt-1 inline-block text-xs font-medium text-orange-400 hover:underline">
            {t("open")}
          </Link>
        )}
      </div>
      {/* Marked seen by being on screen, exactly like a preview is — so a
          finished notice is shown once and then stops. */}
      {state.phase === "finished" && <JobSeen jobId={state.jobId} />}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={t("dismiss")}
        className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Where the finished thing lives, if the handler said. Only ever an
 *  in-app path: an href from a job result is data, and a link that could
 *  be made to point off-site is a link worth not rendering. */
function hrefOf(result: Record<string, unknown> | null | undefined): string | null {
  const href = result?.href;
  if (typeof href !== "string") return null;
  return href.startsWith("/") && !href.startsWith("//") ? href : null;
}
