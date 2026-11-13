import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isFeatureOn } from "@/lib/flags/flags";
import { readDiscordScreen } from "@/lib/discord/screen";
import { BOT_PERMISSIONS } from "@/lib/discord/permissions";
import { DiscordShell } from "@/components/discord/discord-shell";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.tools.names.discord");
}

/**
 * DISCORD (the owner's Discord directive, 2026-11-05), behind the switch
 * "discord-bot". notFound() for anyone it is not open to, the shape
 * src/app/dashboard/sheets/page.tsx uses: there is no All tools tile for
 * it to fall back to, and a «Notify me» that no job answers is worse than
 * an address that honestly does not exist yet.
 *
 * Everything the screen draws is read here once (lib/discord/screen.ts):
 * the missing values, the connected servers, the newest plan and what its
 * apply made, the price.
 */
export default async function DiscordPage(props: { searchParams: Promise<{ discord?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isFeatureOn("discord-bot", user))) notFound();
  const screen = await readDiscordScreen(user);
  const { discord } = await props.searchParams;
  const flash = typeof discord === "string" && /^[a-z_]{2,30}$/.test(discord) ? discord : null;

  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <DiscordShell initial={screen} flash={flash} botPermissions={BOT_PERMISSIONS.map((p) => p.name)} />
    </div>
  );
}
