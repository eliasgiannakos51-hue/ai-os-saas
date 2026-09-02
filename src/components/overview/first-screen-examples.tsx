"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Hammer, Search, RotateCw } from "lucide-react";
import {
  FIRST_SCREEN_EXAMPLES,
  exampleHref,
  type FirstScreenCapability,
} from "@/lib/overview/first-screen-examples";

// Icons live here rather than in the shared list, because that list is
// read by a gate that cannot import from node_modules (see
// scripts/tests/load-ts.mjs). Keyed by capability so a new example
// cannot render without someone choosing what it looks like.
const ICONS: Record<FirstScreenCapability, typeof Hammer> = {
  build: Hammer,
  understand: Search,
  repeat: RotateCw,
};

/**
 * Three examples, under the input, each one a different capability.
 *
 * THEY RUN. A press does not write the sentence into the box above and
 * leave the user to find the send button — that is the pattern this
 * replaces, and it is why nobody in the test saw a capability. Each is a
 * link that carries its own text into the screen where the capability
 * lives, and that screen starts the work on arrival.
 *
 * Which is also why these are <Link>s and not <button>s: the work
 * happens somewhere else, so the press is a navigation, and a navigation
 * should be openable in a new tab, middle-clickable, and readable in the
 * status bar before it is followed.
 */
export function FirstScreenExamples() {
  const t = useTranslations("dashboard.firstScreen");

  return (
    <div className="mt-4">
      <p className="mb-2 text-center text-xs text-muted">{t("label")}</p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {FIRST_SCREEN_EXAMPLES.map((example) => {
          const Icon = ICONS[example.id];
          const sentence = t(`${example.id}.example`);
          return (
            <li key={example.id}>
              <Link
                href={exampleHref(example, sentence)}
                data-testid={`first-screen-${example.id}`}
                // min-h-[44px] is the tap floor the rest of the codebase
                // uses; these are three of the first things a new account
                // will ever press, on a phone.
                className="flex min-h-[44px] w-full items-start gap-2.5 rounded-xl border border-border bg-panel/60 px-3 py-2.5 text-left transition-colors duration-150 hover:border-orange-500/60 hover:bg-panel"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {t(`${example.id}.verb`)}
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug text-foreground">
                    {sentence}
                  </span>
                  {/* WHAT IT COSTS, BEFORE THE PRESS. Two of these three
                      reach a route that spends credits — the website
                      pre-check settles the measured cost of its own
                      Anthropic call, and a chat message reserves once
                      the account's monthly free messages are gone. A
                      press that quietly moves the balance is how
                      somebody finds out they paid after paying.
                      The wording comes from the cost the shared list
                      records, and first-screen.test.mjs checks that
                      record against the billing calls in the route
                      itself — a label nobody verifies is a label that
                      drifts the first time a route grows a charge. */}
                  <span
                    className={`mt-1 block text-[11px] ${
                      // Full opacity, no /90: an alpha-modified themed
                      // utility needs its own light-theme rule to stop
                      // the alpha washing toward white instead of
                      // dimming toward black, and this badge does not
                      // need one badly enough to add a CSS rule for it.
                      // light-theme-contrast.test.mjs caught the /90.
                      example.cost === "charged" ? "text-orange-400" : "text-muted"
                    }`}
                  >
                    {t(`cost.${example.cost}`)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
