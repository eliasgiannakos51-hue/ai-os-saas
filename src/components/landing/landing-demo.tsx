"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Globe, Bot, Target, CornerDownLeft } from "lucide-react";

// The first thing under the headline, and the only thing on the page that
// answers "what IS this" by doing rather than saying.
//
// WHY IT IS A RECORDED EXAMPLE AND NOT A LIVE CALL. A visitor here has no
// account, no credits and no session. Running a real generation would mean
// an unauthenticated, uncapped, paid model call reachable by anyone with
// the URL — a bill and an abuse vector, not a demo. So this replays a
// scripted run, and says so, in the panel, in words: "a recorded example".
// The alternative — an unlabelled fake that looks live — is the same class
// of dishonesty as the copy this page replaced.
//
// EVERY STEP IS A REAL STEP. The three runs mirror what the product
// actually does with those three requests: Website Builder writes a single
// HTML document, scans it (lib/website-html-security-scan.ts) and can
// publish it at a real address (app/s/[subdomain]); Mission Control breaks
// a goal into steps with an outcome and an estimate each and can put one
// in tomorrow (api/mission/schedule-step); an agent is stored with a cron
// schedule and mails its output (api/cron/agent-runs). Nothing here
// describes a capability that does not exist.

const EXAMPLES = [
  { key: "website", Icon: Globe, steps: 3 },
  { key: "goal", Icon: Target, steps: 3 },
  { key: "agent", Icon: Bot, steps: 3 },
] as const;

type ExampleKey = (typeof EXAMPLES)[number]["key"];

const TYPE_MS_PER_CHAR = 26;
const STEP_INTERVAL_MS = 720;

export function LandingDemo() {
  const t = useTranslations("landing.demo");

  const [active, setActive] = useState<ExampleKey>("website");
  const [typed, setTyped] = useState("");
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [done, setDone] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const run = useCallback(
    (key: ExampleKey) => {
      clearTimers();
      const full = t(`examples.${key}`);
      const stepCount = EXAMPLES.find((e) => e.key === key)!.steps;

      // Reduced motion means no typing and no staged reveal — the same
      // final state, immediately. Read from the attribute the root layout
      // sets before first paint, with the OS query as the floor, so this
      // matches every other animation in the app.
      const reduced =
        typeof document !== "undefined" &&
        (document.documentElement.dataset.motion === "reduce" ||
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

      setActive(key);
      if (reduced) {
        setTyped(full);
        setVisibleSteps(stepCount);
        setDone(true);
        return;
      }

      setTyped("");
      setVisibleSteps(0);
      setDone(false);

      for (let i = 1; i <= full.length; i++) {
        timers.current.push(setTimeout(() => setTyped(full.slice(0, i)), i * TYPE_MS_PER_CHAR));
      }
      const afterTyping = full.length * TYPE_MS_PER_CHAR + 320;
      for (let s = 1; s <= stepCount; s++) {
        timers.current.push(
          setTimeout(() => setVisibleSteps(s), afterTyping + (s - 1) * STEP_INTERVAL_MS)
        );
      }
      timers.current.push(
        setTimeout(() => setDone(true), afterTyping + stepCount * STEP_INTERVAL_MS)
      );
    },
    [clearTimers, t]
  );

  // Runs once on mount rather than on an intersection observer: the panel
  // is above the fold at every viewport this page targets, so waiting to
  // be scrolled into view would just mean it is already finished by the
  // time anyone looks at it.
  useEffect(() => {
    run("website");
    return clearTimers;
  }, [run, clearTimers]);

  const activeExample = EXAMPLES.find((e) => e.key === active)!;

  return (
    <div className="w-full">
      {/* Fixed height per row and a fixed panel height below: the chips and
          the output must not resize as the run progresses, or this
          component becomes the very layout shift the page is fixing. */}
      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLES.map(({ key, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => run(key)}
            aria-pressed={active === key}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-left text-xs font-medium transition-colors duration-150 sm:text-sm ${
              active === key
                ? "border-orange-500/60 bg-orange-500/10 text-orange-300"
                : "border-border bg-panel/70 text-muted hover:border-orange-500/40 hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t(`examples.${key}`)}
          </button>
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-panel/95 text-left backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <span className="text-[11px] uppercase tracking-wider text-muted">{t("panelTitle")}</span>
          <span className="rounded-full border border-border bg-input px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {t("exampleTag")}
          </span>
        </div>

        <div className="px-4 py-4">
          <div className="flex items-start gap-2 rounded-xl border border-border bg-input px-3 py-2.5">
            <CornerDownLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            {/* THE HEIGHT IS RESERVED BY THE CONTENT ITSELF, not by a
                guessed min-height. All three examples are rendered into the
                same grid cell; the two that are not running are invisible
                but still lay out, so the box is always as tall as the
                LONGEST of them and stops changing height when the text
                types in, when the example switches, or when a translation
                wraps to a different number of lines. A hardcoded min-h
                would have to be right for ten languages at every width,
                which is a promise no number can keep. */}
            <div className="grid flex-1">
              {EXAMPLES.map(({ key }) => (
                <p
                  key={key}
                  aria-hidden="true"
                  className="invisible col-start-1 row-start-1 text-sm leading-relaxed"
                >
                  {t(`examples.${key}`)}
                </p>
              ))}
              <p className="col-start-1 row-start-1 text-sm leading-relaxed text-foreground">
                {typed}
              </p>
            </div>
            {/* A caret placed AFTER the text moves once per character, and
                every one of those is a layout shift the browser counts —
                small, but this page is held to a budget that a defect
                cannot pass. Pinned to the row's right edge instead: it
                still says "something is happening" and never moves. */}
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-400 transition-opacity duration-200 ${
                done ? "opacity-0" : "animate-pulse opacity-100"
              }`}
            />
          </div>

          {/* Three step rows are always in the DOM at full height; only
              their contents fade in. A list that grows row by row would
              push the page down three times per run. The marker is always
              visible (unlit) so the panel reads as three waiting steps
              rather than as a blank rectangle. */}
          <ul className="mt-3 space-y-2" aria-live="polite">
            {[0, 1, 2].map((i) => {
              const shown = i < visibleSteps;
              return (
                <li key={i} className="flex min-h-[1.75rem] items-center gap-2.5 text-xs sm:text-sm">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 ${
                      shown
                        ? "border-emerald-700/60 bg-emerald-500/10"
                        : "border-border bg-input"
                    }`}
                  >
                    <Check
                      className={`h-3 w-3 text-emerald-400 transition-opacity duration-300 ${
                        shown ? "opacity-100" : "opacity-0"
                      }`}
                      aria-hidden="true"
                    />
                  </span>
                  {/* Stacked like the prompt and the result: step 2 of the
                      agent example is a good deal longer than step 2 of the
                      website one, so a row sized to only the visible text
                      changes height every time the example changes. */}
                  <span className="grid flex-1">
                    {EXAMPLES.map(({ key }) => (
                      <span
                        key={key}
                        aria-hidden="true"
                        className="invisible col-start-1 row-start-1"
                      >
                        {t(`steps.${key}.${i + 1}`)}
                      </span>
                    ))}
                    <span
                      className={`col-start-1 row-start-1 text-muted transition-opacity duration-300 ${
                        shown ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      {t(`steps.${active}.${i + 1}`)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Same stacking trick as the prompt box above, for the same
              reason: the three result sentences are different lengths, so
              anything sized to just the visible one changes height when the
              run finishes or when the visitor picks another example. */}
          <div
            className={`mt-3 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-opacity duration-300 ${
              done
                ? "border-orange-500/40 bg-orange-500/[0.06] opacity-100"
                : "border-transparent opacity-0"
            }`}
          >
            <activeExample.Icon className="h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />
            <div className="grid flex-1">
              {EXAMPLES.map(({ key }) => (
                <p
                  key={key}
                  aria-hidden="true"
                  className="invisible col-start-1 row-start-1 text-xs font-medium leading-relaxed sm:text-sm"
                >
                  {t(`results.${key}`)}
                </p>
              ))}
              <p className="col-start-1 row-start-1 text-xs font-medium leading-relaxed text-foreground sm:text-sm">
                {t(`results.${active}`)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-2.5 text-center text-[11px] leading-relaxed text-muted">{t("note")}</p>
    </div>
  );
}
