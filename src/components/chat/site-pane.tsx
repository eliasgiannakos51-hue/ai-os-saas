"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ExternalLink, Globe, Square, X, Zap } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { AiGeneratedNotice } from "@/components/ai/ai-generated-notice";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { OutOfCreditsNotice } from "@/components/credits/out-of-credits-notice";
import { useCredits } from "@/components/credits/credits-context";
import { useToast } from "@/components/toast/toast-context";
import { useRememberedLine } from "@/components/website-builder/use-remembered-line";
import { getErrorMessage } from "@/lib/get-error-message";
import { websiteNameFrom } from "@/lib/website-name";
import { appendClarificationAnswers } from "@/lib/clarification-client";
import { estimateForAction } from "@/lib/billing/estimate";
import { WEBSITE_BUILDER_MODEL } from "@/lib/ai-models";
import { DEFAULTS } from "@/lib/billing/pricing-config";
import { looksLikeCompleteHtmlDocument } from "@/lib/html-document-check";
import { parseGenerationNotes } from "@/lib/website-generation-notes";
import { requestSiteChange, requestSiteStop, startSiteGeneration, watchSite } from "@/lib/website-builder/site-requests";
import type { UserWebsite } from "@/types/user-website";

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 5000;

export type SitePaneHandle = {
  /**
   * The next thing said in Chat, offered to the open site first: an answer
   * to its questions, or a change to the finished site. True when the pane
   * took it — then Chat does not answer it in words.
   */
  take: (text: string) => boolean;
};

type Stage = "locked" | "confirm" | "questions" | "building" | "done" | "changing" | "failed";

/** The Site's plan wall (components/billing/upgrade-required.tsx), when this account's plan has no Site. */
export type SiteWall = { featureName: string; planName: string; planSlug: string; priceEur: number | null };

/**
 * THE SITE, OPENED FROM CHAT (MASTER 16, package 7), behind the switch
 * "chat-opens-tools": «γράφω "φτιάξε μου site για το camping" και ανοίγει
 * το Site δίπλα».
 *
 * Recognising is not permission (components/create/goal-preview.tsx): the
 * pane opens on what it will make and what it costs, and nothing is spent
 * until "Make it" is pressed. From there it is the Site's own flow,
 * through the requests the Site shell uses (lib/website-builder/site-requests.ts):
 * its questions, answered in the Chat field or skipped; the build, with
 * Stop; the finished site beside the conversation, in a preview that
 * stays sandbox="" with no scripts; and what is said next in Chat changes
 * it, as in the Site itself. The site is a row like any other, so it is in
 * the Site and in the Library afterwards, and "Open in Site" goes there.
 *
 * IN THE SCREEN'S LANGUAGE, ALL THE WAY TO THE END (2026-10-08,
 * scripts/tests/chat-opens-tools-edges.prodtest.mjs). The Site's routes
 * and its worker write their refusals and failures as English sentences —
 * and a provider's own error, `529 {"type":"error",…}`, reached this pane
 * as it came. So: a plan without the Site gets the plan's wall before
 * anything is offered (`wall`); no credits is said by OutOfCreditsNotice
 * from the code and numbers the route sends; a site that failed is said
 * by this pane's own sentence, or by the stopped note when it was stopped.
 * A server sentence is shown as it came only on an English screen.
 */
export const SitePane = forwardRef<
  SitePaneHandle,
  {
    brief: string;
    /** This account's plan has no Site: the wall, and nothing to press that would be refused. */
    wall?: SiteWall | null;
    /** Put aside on a phone: still open, so the next sentence still reaches it. */
    hidden: boolean;
    onBack: () => void;
    onClose: () => void;
  }
>(function SitePane({ brief, wall = null, hidden, onBack, onClose }, ref) {
  const t = useTranslations("dashboard.chat.sitePane");
  const tSite = useTranslations("dashboard.websiteBuilder");
  const tShell = useTranslations("dashboard.toolShell");
  const tWork = useTranslations("dashboard.chat.workArea");
  const tSteps = useTranslations("aiSteps");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const { refresh: refreshCredits, reportUsage, accountCreditPriceEur, planSlug } = useCredits();
  const { addToast } = useToast();
  const remembered = useRememberedLine();
  const [stage, setStage] = useState<Stage>(wall ? "locked" : "confirm");
  const [noCredits, setNoCredits] = useState<{ available: number | null; needed: number | null } | null>(null);
  const [site, setSite] = useState<UserWebsite | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const description = brief.slice(0, MAX_DESCRIPTION_LENGTH);
  const name = websiteNameFrom(description).slice(0, MAX_NAME_LENGTH);
  const say = (line: string) => setLines((prev) => [...prev, line]);
  const failWith = (line: string) => {
    say(line);
    setStage(site && site.status === "completed" ? "done" : "failed");
  };
  // A sentence the server wrote is English: shown as it came only where
  // the screen is English, and the pane's own words everywhere else.
  const serverSaid = (text: string | null | undefined, ours: string) => (locale.startsWith("en") && text ? text : ours);
  // Why a site that was being made ended without being made.
  const whyNotMade = (done: UserWebsite): string => {
    if (done.status === "flagged") return tSite("flaggedTitle");
    const stopped = parseGenerationNotes(done.generation_notes).find((n) => n.kind === "stopped");
    if (stopped && stopped.kind === "stopped") return tSite("notes.stopped", { count: stopped.credits });
    return t("failed");
  };

  // PRICE BEFORE, from the estimator the server reserves against — the
  // same call the Site shell makes under its field.
  const credits = estimateForAction(
    "websiteGenerate",
    { model: WEBSITE_BUILDER_MODEL, inputChars: description.length, imageCount: 0, planSlug },
    DEFAULTS,
    accountCreditPriceEur ?? undefined
  ).estimatedCredits;

  function watch(record: UserWebsite) {
    watchSite(record.id, {
      alive: () => mounted.current,
      onRecord: setSite,
      onDone: (done, usage) => {
        void reportUsage(usage);
        if (done.status === "completed") {
          say(tShell("site.done", { name: done.name }));
          const fromMemory = remembered.forRecord(done);
          if (fromMemory) say(fromMemory);
          setStage("done");
        } else {
          failWith(whyNotMade(done));
        }
      },
    });
  }

  async function make(withDescription: string, skipClarification: boolean) {
    setStage("building");
    try {
      const outcome = await startSiteGeneration({ name, description: withDescription, skipClarification });
      if (!mounted.current) return;
      if (outcome.kind === "refused") {
        void refreshCredits();
        failWith(
          outcome.code === "not_included"
            ? `${tErrors("codes.forbidden.what")} ${tErrors("codes.forbidden.next")}`
            : serverSaid(getErrorMessage(outcome.error, ""), tSite("generateFailed"))
        );
        return;
      }
      if (outcome.kind === "questions") {
        void refreshCredits();
        setQuestions(outcome.questions);
        say(tShell("site.questions"));
        setStage("questions");
        return;
      }
      if (outcome.kind === "notMade") {
        if (outcome.code === "insufficient_credits") {
          void refreshCredits();
          setNoCredits({ available: outcome.available, needed: outcome.needed });
          setStage("failed");
          return;
        }
        failWith(outcome.message ?? tSite("generateFailed"));
        return;
      }
      setSite(outcome.record);
      say(tShell("site.building", { name: outcome.record.name }));
      watch(outcome.record);
    } catch (err) {
      failWith(err instanceof TypeError ? tCommon("networkErrorCheckConnection") : getErrorMessage(err, tSite("generateFailed")));
    }
  }

  async function change(request: string, current: UserWebsite) {
    setStage("changing");
    try {
      const outcome = await requestSiteChange({ websiteId: current.id, changeRequest: request });
      void refreshCredits();
      if (!mounted.current) return;
      if (outcome.kind === "refused") {
        failWith(outcome.reason === "pageGone" ? tSite("editPageGone") : serverSaid(getErrorMessage(outcome.error, ""), tSite("generateFailed")));
        return;
      }
      setSite(outcome.record);
      say(tShell("site.changed"));
      setStage("done");
    } catch {
      failWith(tCommon("networkErrorCheckConnection"));
    }
  }

  useImperativeHandle(ref, () => ({
    take(text: string) {
      if (stage === "questions") {
        // THE ANSWERS, said in the Chat field: one message answers the
        // questions, exactly as in the Site shell.
        const enriched = appendClarificationAnswers(description, questions, questions.map((_, i) => (i === 0 ? text : "")));
        void make(enriched, true);
        return true;
      }
      if (stage === "done" && site && site.status === "completed") {
        void change(text, site);
        return true;
      }
      return false;
    },
  }));

  const html = site?.html_content ?? "";
  const showPreview = (stage === "done" || stage === "changing") && html && looksLikeCompleteHtmlDocument(html);
  const busy = stage === "building" || stage === "changing";
  const ACTION =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground";

  return (
    <section
      aria-label={site?.name || t("label")}
      data-testid="chat-site-pane"
      className={`fixed inset-0 z-[60] flex-col bg-workspace lg:static lg:z-auto lg:flex lg:w-[60%] lg:shrink-0 lg:border-s lg:border-border ${hidden ? "hidden" : "flex"}`}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button type="button" onClick={onBack} aria-label={tWork("back")} data-testid="chat-site-back" className={`${ACTION} lg:hidden`}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <Globe className="ms-1 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <p className="min-w-0 flex-1 break-words px-1 text-sm font-medium text-foreground">{site?.name || t("label")}</p>
        {stage === "building" && site && (
          <button
            type="button"
            data-testid="chat-site-stop"
            onClick={() => {
              void requestSiteStop(site.id).then(
                (ok) => addToast(ok ? tSteps("stopping") : tSite("generateFailed"), ok ? undefined : "error"),
                () => addToast(tSite("generateFailed"), "error")
              );
            }}
            className="chip-link gap-1.5"
          >
            <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
            {tSteps("stop")}
          </button>
        )}
        <Link
          href={
            site
              ? `/dashboard/website-builder?project=${encodeURIComponent(site.id)}`
              : `/dashboard/website-builder?brief=${encodeURIComponent(description.slice(0, 500))}`
          }
          className="chip-link gap-1.5"
          data-testid="chat-site-open"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          {t("openInSite")}
        </Link>
        <button type="button" onClick={onClose} aria-label={tWork("close")} className={`${ACTION} hidden lg:inline-flex`}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        {stage === "locked" && wall && (
          <div className="mx-auto mt-6 w-full max-w-md" data-testid="chat-site-locked">
            <p className="mb-3 break-words text-sm text-muted">«{description}»</p>
            <UpgradeRequired {...wall} />
          </div>
        )}

        {stage === "confirm" && (
          <div className="mx-auto mt-6 w-full max-w-md surface-tight" role="status" aria-live="polite">
            <p className="text-sm text-foreground">{t("willMake")}</p>
            <p className="mt-2 break-words text-sm text-muted">«{description}»</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <Zap className="h-3 w-3 text-foreground/70" aria-hidden="true" />
              {tSite("estimatedCost", { count: credits })}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void make(description, false)}
                data-testid="chat-site-make"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-item bg-button px-4 text-sm font-semibold text-button-ink hover:bg-button"
              >
                {t("make")}
              </button>
              <button type="button" onClick={onClose} data-testid="chat-site-not-now" className="inline-flex min-h-[44px] items-center rounded-item px-3 text-sm text-muted hover:text-foreground">
                {t("notNow")}
              </button>
            </div>
          </div>
        )}

        {lines.length > 0 && (
          <ul className="space-y-1.5 text-sm text-foreground" data-testid="chat-site-lines" aria-live="polite">
            {lines.map((line, i) => (
              <li key={i} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        )}

        {noCredits && (
          <OutOfCreditsNotice
            className="mx-auto mt-2 w-full max-w-md"
            {...(noCredits.available !== null && noCredits.needed !== null ? { available: noCredits.available, needed: noCredits.needed } : {})}
          />
        )}

        {stage === "questions" && (
          <div className="surface-tight" data-testid="chat-site-questions">
            <ol className="list-decimal space-y-1 ps-5 text-sm text-foreground">
              {questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
            <button type="button" onClick={() => void make(description, true)} data-testid="chat-site-skip" className="chip-link mt-3">
              {tShell("site.skip")}
            </button>
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted" role="status">
            <ThinkingIndicator />
            {stage === "changing" ? t("changing") : t("building")}
          </div>
        )}

        {showPreview && (
          <div data-testid="chat-site-preview" className="flex min-h-[60vh] flex-1 flex-col gap-2">
            <AiGeneratedNotice variant="block" />
            <iframe title={site?.name ?? t("label")} srcDoc={html} sandbox="" className="min-h-[60vh] w-full flex-1 rounded-card border border-border bg-panel" />
            <p className="text-xs text-muted">{t("nextChanges")}</p>
          </div>
        )}
      </div>
    </section>
  );
});
