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

  return (
    <div className="mb-6">
      <p className="text-base text-muted sm:text-lg" suppressHydrationWarning>
        {greeting.text}, {name} {greeting.emoji}
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        What do you want to build today?
      </h1>
    </div>
  );
}
