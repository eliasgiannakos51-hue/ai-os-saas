"use client";

import { timeOfDayGreeting, displayNameFromEmail } from "@/lib/greeting";

export function GreetingHeader({ email }: { email: string }) {
  const { text, emoji } = timeOfDayGreeting();
  const name = displayNameFromEmail(email);

  return (
    <div className="mb-6">
      <p className="text-base text-muted sm:text-lg" suppressHydrationWarning>
        {text}, {name} {emoji}
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        What do you want to build today?
      </h1>
    </div>
  );
}
