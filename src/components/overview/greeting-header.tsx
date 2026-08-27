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
  const t = useTranslations("dashboard.overview");
  const [greeting, setGreeting] = useState(() => timeOfDayGreeting());
  const name = displayNameFromEmail(email);

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setGreeting(timeOfDayGreeting(new Date(), timeZone));
  }, []);

  // Centred, and the headline is the single largest thing on the page —
  // this is the page's one focal point, everything below it is support.
  // The greeting sits above it, deliberately small and muted, so it reads
  // as context rather than as a second heading competing for attention.
  return (
    <div className="mb-8 text-center">
      <p className="text-sm text-muted sm:text-base" suppressHydrationWarning>
        {greeting.text}, {name} {greeting.emoji}
      </p>
      {/* THE "?" BESIDE THE PAGE'S ONE FOCAL POINT. This page renders no
          PageHeader on purpose — a shared header above a personal
          greeting would be a second title — so the tip is mounted here
          instead, at the heading somebody already reads first.
          The `mt-2` moves from the heading to the row, so the gap above
          is unchanged, and the heading keeps every one of its own
          classes: hero-gradient-text clips a background to the text and
          would stop working if it were merged into a flex container.
          The heading's line box is 40px at the base size, 54px from sm
          and 61px from lg (leading-[1.12] on 36/48/54.4px). The control's
          margin box is 28px — h-11 is 44px, and -m-2 takes 8px off each
          side — so the row's height is the heading's at every breakpoint
          and nothing below it moves. */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <h1 className="hero-gradient-text text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl lg:text-[3.4rem]">
          {t("heroQuestion")}
        </h1>
        <HelpTip helpKey="help.overview" />
      </div>
    </div>
  );
}
