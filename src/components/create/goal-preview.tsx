"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Mic, Pencil, Send, Zap } from "lucide-react";
import { PRODUCER_SPECS, type ProducerKey } from "@/lib/create-studio/producer-routes";
import type { Preflight } from "@/lib/voice/voice-command";

/**
 * WHAT IT WILL DO, BEFORE IT DOES IT.
 *
 * Redesign phase 1 Γ. The Home field can now recognise six producers for
 * free (lib/create-studio/producer-routes.ts), and recognising is not
 * permission: a person who typed "θέλω e-shop" has not agreed to open the
 * Website Builder, and certainly not to spend anything there.
 *
 * So nothing moves until this card is answered. It names the destination
 * with THE SIDEBAR'S OWN KEY — the same words the menu uses, in the same
 * language — because a receipt that invents a second name for a place is
 * how "Goals & Plans" became "Mission Control" in a confirmation.
 *
 * THE NUMBER IS AN ESTIMATE OF THE DESTINATION'S OWN ACTION, and the card
 * says so: pressing "Yes" navigates and fills the box, it does not spend.
 * The credits go when the person presses the button on the page they land
 * on, which is where the same estimator is shown again. Printing a figure
 * here and charging a different one there is the drift this shares one
 * calculation to avoid.
 */
/**
 * WHAT THE MICROPHONE HEARD, quoted, above whatever it would do.
 *
 * A typed sentence is on screen because the person wrote it. A spoken one
 * is on screen because Whisper wrote it, and the person has to be able to
 * see the mishearing before agreeing to it - "Κατάλαβα: «…»" is the owner's
 * own wording for that. Present only when the card came from the
 * microphone (lib/voice/voice-command.ts).
 */
function Heard({ heard }: { heard?: string }) {
  const t = useTranslations("dashboard.goal");
  if (!heard) return null;
  return (
    <p className="mb-2 flex items-start gap-1.5 text-sm text-foreground">
      <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" aria-hidden="true" />
      <span>{t("heard", { heard })}</span>
    </p>
  );
}

/**
 * THE FRAME BOTH "YES" CARDS SHARE: one filled control and one outline.
 *
 * GoalPreview ("Yes" opens a page) and VoiceSendConfirm ("Yes" sends now)
 * are never on screen together, but written out twice they read as two
 * filled accent buttons on /dashboard/overview to
 * scripts/tests/one-primary-action.test.mjs, and as two more orange frames
 * to design-density.test.mjs. Drawn once here, the page has one primary
 * action in the source as well as on the screen, and the two cards can
 * only differ in what they SAY - which is the part that must differ.
 */
function ConfirmCard({
  heard,
  line,
  cost,
  confirmIcon,
  confirmLabel,
  onConfirm,
  secondaryLabel,
  onSecondary,
  onCancel,
}: {
  heard?: string;
  line: string;
  cost: string;
  confirmIcon: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("dashboard.goal");
  return (
    <div className="mb-3 rounded-card border border-foreground/30 bg-panel p-4" role="status" aria-live="polite">
      <Heard heard={heard} />
      <p className="text-sm text-foreground">{line}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <Zap className="h-3 w-3 text-foreground/70" aria-hidden="true" />
        {cost}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-item bg-button px-4 text-sm font-semibold text-button-ink hover:bg-button"
        >
          {confirmIcon}
          {confirmLabel}
        </button>
        <button type="button" onClick={onSecondary} className="btn-outline">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          {secondaryLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-[44px] items-center rounded-item px-3 text-sm text-muted hover:text-foreground"
          >
            {t("dismiss")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function GoalPreview({
  producer,
  credits,
  onConfirm,
  onChange,
  heard,
}: {
  producer: ProducerKey;
  /** From useCostEstimate on the destination's own profile; 0 means the
   *  destination charges nothing on arrival AND nothing on its button. */
  credits: number;
  onConfirm: () => void;
  onChange: () => void;
  /** The transcript, when this card answers the microphone. */
  heard?: string;
}) {
  const t = useTranslations("dashboard.goal");
  const tKey = useTranslations();
  const destination = tKey(PRODUCER_SPECS[producer].destinationKey);

  return (
    <ConfirmCard
      heard={heard}
      line={t("willOpen", { destination })}
      cost={credits > 0 ? t("costsThere", { credits }) : t("freeThere")}
      confirmIcon={<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
      confirmLabel={t("confirm")}
      onConfirm={onConfirm}
      secondaryLabel={t("change")}
      onSecondary={onChange}
    />
  );
}

/**
 * THE ONE QUESTION, and there is only ever one.
 *
 * Two cases reach it and neither costs anything: the free ambiguity
 * reader (lib/ai/ambiguity.ts) said the request is too thin to act on, or
 * the free producer matcher found TWO producers named in one sentence.
 * Both are answered here, in the box the person is already looking at,
 * and neither has made a model call to get this far.
 */
export function GoalQuestion({
  choices,
  onPick,
  onDismiss,
  heard,
}: {
  /** Empty when the request was merely vague — then there is nothing to
   *  pick and the only answer is to say more. */
  choices: ProducerKey[];
  onPick: (producer: ProducerKey) => void;
  onDismiss: () => void;
  heard?: string;
}) {
  const t = useTranslations("dashboard.goal");
  const tKey = useTranslations();

  return (
    <div className="mb-3 surface-tight" role="status" aria-live="polite">
      <Heard heard={heard} />
      <p className="text-sm text-foreground">{choices.length > 0 ? t("which") : t("vague")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {choices.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key)}
            className="inline-flex min-h-[44px] items-center rounded-item border border-border px-3 text-sm font-medium text-foreground hover:border-foreground/60"
          >
            {tKey(PRODUCER_SPECS[key].destinationKey)}
          </button>
        ))}
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex min-h-[44px] items-center rounded-item px-3 text-sm text-muted hover:text-foreground"
        >
          {t("dismiss")}
        </button>
      </div>
    </div>
  );
}

/**
 * THE ONE CARD WHERE "YES" SPENDS, AND IT SAYS SO.
 *
 * Reached only from the microphone, and only when the free readers named
 * no producer: the sentence would go to the paid classifier (/api/create),
 * which may answer it or FILE IT AS AN ENTRY. Typed text goes there on
 * Send, because Send is the person's decision; spoken text waits here,
 * because a transcript is nobody's decision yet. Unlike GoalPreview, whose
 * "Yes" only navigates, this "Yes" charges - so the figure is "now", not
 * "there".
 */
export function VoiceSendConfirm({
  heard,
  credits,
  onConfirm,
  onFix,
  onCancel,
}: {
  heard: string;
  /** useCostEstimate on the createAnything profile for this text. */
  credits: number;
  onConfirm: () => void;
  onFix: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("dashboard.goal");
  return (
    <ConfirmCard
      heard={heard}
      line={t("willHandle")}
      cost={t("costsNow", { credits })}
      confirmIcon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}
      confirmLabel={t("sendIt")}
      onConfirm={onConfirm}
      secondaryLabel={t("fix")}
      onSecondary={onFix}
      onCancel={onCancel}
    />
  );
}

/**
 * WHERE THE SENTENCE IS GOING, WHILE IT IS BEING TYPED.
 *
 * The design's routing line ("Θα ανοίξει → Site · αλλαγή", docs/mockups/
 * README.md, "Three roads to every tool"). It reads the same free
 * preflight() that Send and the microphone read (lib/voice/voice-command.ts),
 * so what it says is what Send will do — never a second guess.
 *
 * SHIPPED ON A MEASUREMENT, as the owner asked: scripts/router-accuracy.mjs,
 * 2026-10-02, 50 sentences — when the router names a page it named the
 * right one 30 of 30 times; 10 of the 40 that meant a page were not named
 * and fell back to "Ionexa reads it", which is the safe direction. Too thin
 * to act on draws no line: the one question after Send says that better.
 *
 * "change" opens the ⌘K palette — every tool, narrowed by typing — because
 * a pick nobody can undo before the credits go is the thing this line exists
 * to prevent.
 */
export function RouteLine({
  plan,
  credits,
  onChange,
}: {
  plan: Preflight | null;
  /** The estimate of what Send leads to: the destination's own action
   *  ("there"), or the classifier's ("now"). */
  credits: number;
  onChange: () => void;
}) {
  const t = useTranslations("dashboard.goal");
  const tKey = useTranslations();
  if (!plan || plan.kind === "question") return null;
  const destination = plan.kind === "open" ? tKey(PRODUCER_SPECS[plan.producer].destinationKey) : null;
  return (
    <p
      className="route-line mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted"
      data-route={plan.kind === "open" ? plan.producer : "classify"}
    >
      {destination ? (
        <>
          <span>{t("goingTo")}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-panel px-2.5 py-0.5 font-medium text-foreground">
            <ArrowRight className="h-3.5 w-3.5 text-foreground" aria-hidden="true" />
            {destination}
          </span>
        </>
      ) : (
        <span>{t("routeAsk")}</span>
      )}
      <button
        type="button"
        onClick={onChange}
        className="inline-flex min-h-[44px] items-center px-1 text-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
      >
        {t("routeChange")}
      </button>
      {credits > 0 && (
        <span className="tabular-nums">
          {plan.kind === "open" ? t("routeCostThere", { credits }) : t("routeCostNow", { credits })}
        </span>
      )}
    </p>
  );
}
