"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { Earth } from "@/components/brand/earth";
import { CopyButton } from "@/components/ui/copy-button";
import { useToast } from "@/components/toast/toast-context";
import { nextRating, type AnswerRating } from "@/lib/chat/answer-rating";

/**
 * THE ROW UNDER EVERY ANSWER (docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN §5,
 * «ΣΥΝΟΜΙΛΙΑ»): the small earth, copy, thumbs up and down, again.
 *
 * THE EARTH IS 26px AND UNDER THE ANSWER (§2, «Η ΓΗ»): it turns while the
 * answer is being written and calms when it is done. Only the latest
 * finished answer keeps turning; older ones are drawn still, so a long
 * conversation is not a column of spinning globes.
 *
 * THE THUMBS STORE SOMETHING. A rating goes to
 * src/app/api/chat/messages/[id]/rating/route.ts and onto the answer's own
 * row; pressing the lit thumb takes it back (lib/chat/answer-rating.ts).
 * An answer that has no row yet — the one that just streamed, before the
 * server sent its id — has no thumbs, rather than thumbs that save nothing.
 *
 * AGAIN asks the same question once more, as a new turn: only under the
 * latest answer, and never while one is being written.
 */
export function AnswerActions({
  messageId,
  text,
  rating = null,
  persisted,
  working = false,
  still = false,
  onRetry,
  onRated,
}: {
  messageId: string;
  text: string;
  rating?: AnswerRating;
  /** Whether this answer has a row the rating can be written to. */
  persisted: boolean;
  working?: boolean;
  still?: boolean;
  /** Present only under the latest finished answer. */
  onRetry?: () => void;
  onRated?: (rating: AnswerRating) => void;
}) {
  const t = useTranslations("dashboard.chat.answer");
  const { addToast } = useToast();
  const [current, setCurrent] = useState<AnswerRating>(rating);
  const [saving, setSaving] = useState(false);

  async function rate(pressed: 1 | -1) {
    const before = current;
    const next = nextRating(before, pressed);
    setCurrent(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/chat/messages/${encodeURIComponent(messageId)}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      onRated?.(next);
    } catch {
      setCurrent(before);
      addToast(t("ratingFailed"), "error");
    } finally {
      setSaving(false);
    }
  }

  const BUTTON =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground disabled:opacity-50";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-0.5" data-testid="answer-actions">
      <Earth variant="small" px={26} working={working} still={still} className="me-1.5 shrink-0" />
      {!working && (
        <>
          <CopyButton text={text} label={t("copy")} variant="icon" className={BUTTON} data-testid="answer-copy" />
          {persisted && (
            <>
              <button
                type="button"
                onClick={() => void rate(1)}
                disabled={saving}
                aria-pressed={current === 1}
                aria-label={t("good")}
                data-testid="answer-good"
                className={`${BUTTON} ${current === 1 ? "text-foreground" : ""}`}
              >
                <ThumbsUp className={`h-4 w-4 ${current === 1 ? "fill-current" : ""}`} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => void rate(-1)}
                disabled={saving}
                aria-pressed={current === -1}
                aria-label={t("bad")}
                data-testid="answer-bad"
                className={`${BUTTON} ${current === -1 ? "text-foreground" : ""}`}
              >
                <ThumbsDown className={`h-4 w-4 ${current === -1 ? "fill-current" : ""}`} aria-hidden="true" />
              </button>
            </>
          )}
          {onRetry && (
            <button type="button" onClick={onRetry} aria-label={t("retry")} data-testid="answer-retry" className={BUTTON}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
