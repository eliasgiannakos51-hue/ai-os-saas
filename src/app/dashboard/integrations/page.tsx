import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Plug } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { upgradeWallProps } from "@/lib/billing/feature-catalog";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { listIntegrations } from "@/lib/integrations/store";
import { maxIntegrationsForPlan } from "@/lib/integrations/limits";
import { encryptionAvailable } from "@/lib/integrations/crypto";
import { providerConfigured } from "@/lib/integrations/oauth";
import { PROVIDERS, type ProviderId } from "@/lib/integrations/providers";
import { IntegrationsList } from "@/components/integrations/integrations-list";
import { McpApps } from "@/components/integrations/mcp-apps";
import { TelegramConnect, type TelegramState } from "@/components/integrations/telegram-connect";
import { readTelegramState } from "@/lib/telegram/link-state";
import { logApiError } from "@/lib/log-error";
import { listMcpServers } from "@/lib/mcp/store";
import { maxMcpServersForPlan } from "@/lib/mcp/limits";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.integrations");
}

export default async function IntegrationsPage() {
  const supabase = await createClient();

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.integrations");
  const isAdmin = isAdminEmail(user.email);
  const planSlug = await resolveEffectivePlanSlug(user);
  const planCap = maxIntegrationsForPlan(planSlug);

  // Resolved on the server: `providerConfigured` reads process.env, and a
  // client component must never learn which secrets exist. What crosses is
  // a list of provider IDS, which is public information.
  const configured = PROVIDERS.map((p) => p.id).filter((id: ProviderId) => providerConfigured(id));
  // A card is drawn only for a provider whose OAuth app is set up on this
  // deployment: there is never a Connect button that cannot work. Those
  // cards are for paid plans (the cap is 0 on Free), so a Free account sees
  // the by-address section alone, which is open to every plan.
  const cardsAllowed = isAdmin || planCap > 0;
  const shown = cardsAllowed ? configured : [];

  const integrations = await listIntegrations(user.id);
  const cap = isAdmin ? Number.POSITIVE_INFINITY : planCap;
  const mcpServers = await listMcpServers(user.id);
  const mcpCap = isAdmin ? 100 : maxMcpServersForPlan(planSlug);

  // TELEGRAM (the owner's directive 24, κομμάτι 1). Read on the server so
  // a connected account does not see "not connected" for one frame.
  //
  // THE SWITCH IS READ INSIDE readTelegramState, NOT HERE, and that is a
  // rule about this page rather than a preference: google-calendar.test.mjs
  // forbids any isFeatureOn on dashboard/integrations/page.tsx, because a
  // switch once hid every connection from everybody. null means "not open
  // to this account", and the section is then not drawn at all.
  //
  // THE try/catch IS NOT DEFENSIVE NOISE. Every migration in this
  // repository is pasted into the SQL editor by hand (CLAUDE.md), so
  // public.telegram_links may not exist yet on a deployment that has this
  // code. Without this, the whole Connect page — Gmail, Drive, Calendar,
  // Slack, MCP — would 500 on a missing table, which is precisely how
  // user_websites.generation_notes broke website generation on 2026-09-04.
  // The section degrades to "not ready yet", which is true for a missing
  // table exactly as it is for a missing bot token.
  let telegramState: TelegramState | null = null;
  try {
    telegramState = await readTelegramState(user);
  } catch (err) {
    logApiError("/dashboard/integrations", err, { stage: "telegram-state" });
    telegramState = { status: "none", botUsername: null, ready: false };
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader helpKey="help.integrations" helpArticle="connect-gmail" icon={Plug} title={t("title")} description={t("description")} />

        <McpApps initialServers={mcpServers} cap={mcpCap} />

        {telegramState && <TelegramConnect initialState={telegramState} />}

        {shown.length > 0 && (
          <div className="mt-10">
            {/* Said once, at the top, in the user's own language: this is the
                place where somebody decides whether an AI may read their mail,
                and the terms of that should not be somewhere else. */}
            <p className="mb-4 surface-tight text-[11px] leading-relaxed text-muted">{t("privacyNotice")}</p>

            {/* useSearchParams (the ?status= the OAuth callback returns with)
                makes the list a client component that must be inside Suspense
                for the production build to prerender this route's shell. */}
            <Suspense fallback={null}>
              <IntegrationsList
                integrations={integrations}
                cap={cap}
                configured={configured}
                shown={shown}
                encryptionReady={encryptionAvailable()}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
