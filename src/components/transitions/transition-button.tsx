"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  destinationById,
  detectTransition,
  hasActionCue,
  worthPaidDetection,
} from "@/lib/transitions/destinations";

/**
 * "GO TO THE CODE TOOL" BECOMES A BUTTON THAT GOES THERE.
 *
 * ONE BUTTON, NEVER TWO. lib/transitions/destinations.ts returns a single
 * destination or null; three buttons under an answer stop being a
 * suggestion and become a menu, which is what the sidebar was cut from 45
 * rows to 23 to avoid.
 *
 * IT NAVIGATES, IT DOES NOT ACT. That is the answer to "what if it picks
 * the wrong destination": the id comes from a closed list, the href comes
 * from that list rather than from any text, and pressing it opens a page
 * of this product. A wrong suggestion costs one click. Nothing here
 * creates, sends or spends.
 *
 * FREE. The detector is a fold and a regex — no model call, no latency,
 * no credits — so it can run on every finished answer without anyone
 * having to decide whether it is worth it.
 *
 * AND IT IS MEASURED NOW. The first version of this component carried a
 * paragraph here saying it was not: nav_events records the navigation
 * when a button is TAKEN and nothing recorded that one was OFFERED or
 * REFUSED, so a suggestion that irritated every user on every answer
 * looked exactly like one nobody ever needed. Three events go to
 * api/transitions/record — shown, taken, dismissed — and the rate is
 * `dismissed / shown` with both halves as rows. The same row carries
 * WHICH detector produced it, which is how "how often does the paid one
 * fire" is a count rather than an estimate.
 *
 * RECORDING NEVER BLOCKS THE BUTTON. Every call is fire-and-forget with
 * its rejection swallowed: a suggestion that fails to render because the
 * telemetry endpoint is slow would be a worse feature than one nobody
 * can measure.
 */
export function TransitionButton({ text }: { text: string }) {
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const [dismissed, setDismissed] = useState(false);

  const free = detectTransition(text);

  // THE PAID DETECTOR, AND WHEN IT IS ALLOWED TO RUN.
  //
  // Three conditions, all of them cheap, all of them checked BEFORE any
  // request leaves the browser: the free reader found nothing, the answer
  // is long enough to be worth a credit, and it carries an action cue at
  // all. That last one is what stops this firing on every factual answer
  // in the product — an answer with no verb pointing anywhere has nothing
  // for a model to find either, and paying to be told so on every message
  // would be the expensive way to learn what a regex already knows.
  //
  // THE SERVER RE-CHECKS THE FIRST CONDITION. api/transitions/detect runs
  // the free reader again and returns its answer for free if it places
  // the text — so a client that forgot this guard, or one written by
  // hand, cannot make it cost anything the free path would have saved.
  const [paid, setPaid] = useState<{ id: string } | null>(null);
  const askedFor = useRef<string | null>(null);
  useEffect(() => {
    if (free || !worthPaidDetection(text) || !hasActionCue(text)) return;
    if (askedFor.current === text) return;
    askedFor.current = text;
    let cancelled = false;
    void fetch("/api/transitions/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: text }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.destination) return;
        // The closed list, on this side too. The route already validates,
        // and a component that trusted a response body would be one
        // change away from rendering a link the list never approved.
        if (destinationById(data.destination)) setPaid({ id: data.destination });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [free, text]);

  const destination = free ?? (paid ? destinationById(paid.id) : null);
  const source: "offline" | "model" = free ? "offline" : "model";

  // ONE `shown` PER BUTTON, NOT ONE PER RENDER. React re-renders this on
  // every parent state change — a keystroke in the composer, a stream
  // tick on another message — and a denominator that counts renders is a
  // denominator that makes the dismissal rate look tiny for a reason that
  // has nothing to do with the user. The ref is keyed by destination id
  // so a genuinely new suggestion is still counted.
  const recordedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!destination || recordedFor.current === destination.id) return;
    recordedFor.current = destination.id;
    record(destination.id, source, "shown");
  }, [destination, source]);

  if (!destination || dismissed) return null;

  return (
    <div className="mt-2 flex items-center gap-2">
      <Link
        href={destination.href}
        onClick={() => record(destination.id, source, "taken")}
        className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-orange-500/30 px-3 text-xs font-medium text-orange-200 transition-colors duration-150 hover:border-orange-500/60 hover:bg-orange-500/10"
      >
        {t(destination.labelKey)}
        <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={() => {
          record(destination.id, source, "dismissed");
          setDismissed(true);
        }}
        aria-label={tCommon("dismissSuggestion")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Fire-and-forget. `keepalive` because a `taken` fires on a click that
 * navigates away — without it the browser is free to cancel the request
 * as the page unloads, which would under-count exactly the outcome the
 * feature most wants to be able to show.
 *
 * `source` says WHICH detector placed it — "offline" for the free fold
 * and regex, "model" for the paid route. That single field is what makes
 * "how often does the paid one fire" a count over rows rather than an
 * estimate, which is the question asked when the paid half was approved.
 */
function record(
  destination: string,
  source: "offline" | "model",
  outcome: "shown" | "taken" | "dismissed"
) {
  void fetch("/api/transitions/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination, source, outcome }),
    keepalive: true,
  }).catch(() => {});
}
