"use client";

import { useEffect, useState } from "react";
import { timeOfDayGreeting, displayNameFromEmail } from "@/lib/greeting";

export function GreetingHeader({ email }: { email: string }) {
  // Falls back to the device's local time on first render (matches this
  // component's original behavior), then — once mounted — recomputes
  // using the browser's actual IANA timezone via Intl, so the greeting is
  // explicitly tied to where the user is rather than whatever clock the
  // executing environment happens to have. Only relevant for travelers
  // whose OS timezone lags their real location; for everyone else the two
  // give the same answer.
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
      <h1 className="hero-gradient-text mt-2 text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl lg:text-[3.4rem]">
        What do you want to build today?
      </h1>
    </div>
  );
}
