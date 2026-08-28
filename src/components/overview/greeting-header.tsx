"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { timeOfDayGreeting, displayNameFromEmail } from "@/lib/greeting";
import { HelpTip } from "@/components/ui/help-tip";

export function GreetingHeader({ email }: { email: string }) {
  // Falls back to the device's local time on first render (matches this
  // component's original behavior), then — once mounted — recomputes
  // using the browser's actual IANA timezone via Intl, so the greeting is
  // explicitly tied to where the user is rather than whatever clock the
  // executing environment happens to have. Only relevant for travelers
  // whose OS timezone lags their real location; for everyone else the two
  // give the same answer.
  const tPromise = useTranslations("promise");
  const [greeting, setGreeting] = useState(() => timeOfDayGreeting());
  const name = displayNameFromEmail(email);

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setGreeting(timeOfDayGreeting(new Date(), timeZone));
  }, []);

  // Centred, and the headline is the single largest thing on the page —
  // this is the page's one focal point, everything below it is support.
  // The greeting sits BELOW it now, deliberately small and muted, so it
  // reads as a pleasantry rather than as the first thing the screen has
  // to say for itself.
  return (
    <div className="mb-8 text-center">
      {/* THE SENTENCE IS THE HEADLINE.
          It began one step short of this: the sentence went in as a small
          line ABOVE a much larger "What do you want to build today?" —
          which left the vaguest thing on the screen as the loudest, and
          that is the state seven testers were shown before giving six
          different answers to "what does it do". A newcomer is also the
          person least equipped to answer "what do you want to build";
          the three examples below the input answer it for them instead.
          So the generic question is gone — deleted from all ten locales,
          not merely unused — and the one sentence has its size.

          The heading keeps every one of its own classes:
          hero-gradient-text clips a background to the text and would
          stop working if it were merged into the flex container.

          THE "?" BESIDE THE PAGE'S ONE FOCAL POINT. This page renders no
          PageHeader on purpose — a shared header above a personal
          greeting would be a second title — so the tip is mounted here
          instead, at the heading somebody already reads first. The
          control's margin box is 28px (h-11 is 44px, -m-2 takes 8px off
          each side), which is shorter than the heading's line box at
          every breakpoint, so the row's height is the heading's and
          nothing below it moves. */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <h1 className="hero-gradient-text text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl lg:text-5xl">
          {tPromise("oneSentence")}
        </h1>
        <HelpTip helpKey="help.overview" />
      </div>
      <p className="mt-2 text-sm text-muted" suppressHydrationWarning>
        {greeting.text}, {name} {greeting.emoji}
      </p>
    </div>
  );
}
