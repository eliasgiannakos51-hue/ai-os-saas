"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useErrorTextForStatus } from "@/lib/errors/use-error-text";

/**
 * The banner a page shows when its data would not load.
 *
 * WHAT THIS USED TO RENDER, verbatim, in a Greek dashboard:
 *
 *     loading ai_websites: JWT expired          [ Retry ]
 *
 * Three separate faults in one line. It is English in a UI the reader has
 * set to Greek. It names an internal table, which is nobody's business
 * outside this codebase and is a free hint to anyone probing the app. And
 * it answers none of the questions the person actually has — what do I do
 * now, and did that cost me anything.
 *
 * The replacement says what happened, what to do, and what it cost, and it
 * says all three in the reader's language. The technical detail does not
 * disappear — it goes to `title`, where a developer can still read it and a
 * screenshot of the page does not carry it.
 */
export function ErrorMessage({
  /**
   * HTTP-ish status for the failure. Defaults to 500: these banners are
   * rendered from a server-side data load that threw, which is our fault
   * by definition.
   */
  status = 500,
  /** Whether credits were returned, when the caller knows. */
  creditsRefunded,
  /** Internal detail — logged and put in `title`, never rendered as text. */
  detail,
  /** Overrides the generated sentence, for a caller with something better to say. */
  message,
}: {
  status?: number;
  creditsRefunded?: boolean;
  detail?: string;
  message?: string;
}) {
  const router = useRouter();
  const t = useTranslations("errors");
  const describe = useErrorTextForStatus();
  const failure = describe(status, creditsRefunded);

  return (
    <div
      className="mb-4 rounded-xl border border-red-900/60 bg-red-500/5 px-4 py-3 text-xs text-red-400"
      title={detail}
      role="alert"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium text-red-300">{message ?? failure.what}</p>
            {!message && <p className="text-red-400/90">{failure.next}</p>}
            {!message && (
              <p className="text-red-400/70">
                {failure.credits}
                {failure.showCreditHistory && (
                  <>
                    {" "}
                    <Link
                      href="/dashboard/settings#ai-usage"
                      className="underline underline-offset-2 hover:text-red-200"
                    >
                      {t("creditHistory")}
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-red-900/60 px-3 text-[11px] text-red-300 transition-colors duration-150 hover:border-red-500 hover:text-red-100"
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" /> {t("retry")}
        </button>
      </div>
    </div>
  );
}
