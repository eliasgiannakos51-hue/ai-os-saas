"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { timeOfDayGreeting } from "@/lib/greeting";
import { Earth } from "@/components/brand/earth";

/**
 * ONE LINE: THE SMALL EARTH AND THE GREETING (docs/CONTEXT.md, ΣΥΣΤΗΜΑ
 * DESIGN, «ΑΡΧΙΚΗ»): «Good morning, [όνομα]», by the hour, and no name
 * when we do not know it.
 *
 * Falls back to the device's local time on first render, then — once
 * mounted — recomputes with the browser's own IANA time zone, so the
 * greeting follows where the person is rather than the server's clock.
 */
export function GreetingHeader({ name }: { name: string | null }) {
  const tPromise = useTranslations("promise");
  const [greeting, setGreeting] = useState(() => timeOfDayGreeting());

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setGreeting(timeOfDayGreeting(new Date(), timeZone));
  }, []);

  return (
    <div className="flex items-center gap-4">
      <Earth variant="small" px={64} className="shrink-0" />
      <h1
        className="min-w-0 break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        suppressHydrationWarning
      >
        {tPromise(`greeting.${greeting.part}`)}
        {name ? `, ${name}` : ""}
      </h1>
    </div>
  );
}
