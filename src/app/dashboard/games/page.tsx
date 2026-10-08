import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Gamepad2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { upgradeWallProps } from "@/lib/billing/feature-catalog";
import { readRequestedId } from "@/lib/library/requested";
import { RECORD_CAP } from "@/lib/record-cap";
import { isFeatureOn } from "@/lib/flags/flags";
import { gameGate } from "@/lib/games/game-access";
import { gameSystemPrompt } from "@/lib/games/game-system";
import { GamesShell, type GameRow } from "@/components/games/games-shell";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.tools.names.games");
}

/**
 * GAMES (MASTER 16, package 26), behind the switch "games": for anybody
 * the switch does not admit, this address does not exist. With the switch
 * and without the Site's plan, the wall that says which plan has it — the
 * routes refuse the same two (lib/games/game-access.ts).
 */
export default async function GamesPage(props: { searchParams?: Promise<{ record?: string }> }) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (await isFeatureOn("games", user)) {
    const gate = await gameGate(user);
    if (!gate.ok) {
      const t = await getTranslations("dashboard.tools.names");
      return (
        <div className="min-h-full">
          <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
            <PageHeader helpKey="help.games" icon={Gamepad2} title={t("games")} />
            <UpgradeRequired {...upgradeWallProps("websiteBuilder", t("games"))!} />
          </div>
        </div>
      );
    }
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_games")
      .select("id, title, plan, html, versions, locale, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(RECORD_CAP);
    return (
      <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
        <GamesShell initialGames={(data as GameRow[] | null) ?? []} initialOpenId={readRequestedId(searchParams?.record)} systemChars={gameSystemPrompt().length} />
      </div>
    );
  }
  notFound();
}
