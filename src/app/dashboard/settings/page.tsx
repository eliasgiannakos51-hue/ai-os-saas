import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Settings as SettingsIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { PasswordChangeForm } from "@/components/settings/password-change-form";
import { ChatMemorySettings } from "@/components/settings/chat-memory-settings";
import { AccessibilitySettings } from "@/components/settings/accessibility-settings";
import { ThemeSettings } from "@/components/settings/theme-settings";
import { LoginActivity, type KnownDevice } from "@/components/settings/login-activity";
import { ExportDataButton } from "@/components/settings/export-data-button";
import { DangerZone } from "@/components/settings/danger-zone";
import { BillingSummary } from "@/components/settings/billing-summary";
import { BuyCredits } from "@/components/settings/buy-credits";
import { CreditHistory, type CreditTransaction } from "@/components/settings/credit-history";
import { AiUsageSettings } from "@/components/settings/ai-usage-settings";
import { AiPersonaSettings } from "@/components/settings/ai-persona-settings";
import { isAdminEmail } from "@/lib/admin";
import { isBetaTester, getBetaDaysRemaining } from "@/lib/beta";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import { BUILD_MODULES } from "@/lib/build-modules";
import { getPlan } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = isAdminEmail(user.email);
  // Mutually exclusive with isAdmin by construction — an admin account is
  // never also flagged is_beta_tester (see lib/beta.ts), but this makes
  // that guarantee explicit here too rather than relying on the flag
  // alone, since this is exactly the display logic the "don't touch admin
  // access" instruction is protecting.
  //
  // betaDaysRemaining is only computed for accounts that were ever granted
  // beta access — null means "never a beta tester" (most accounts), so the
  // badge doesn't show at all. Once the 30-day window closes this goes
  // negative/zero, at which point isBeta below is false and `tier` (via
  // resolveEffectivePlanSlug) has already collapsed back to "free" — the
  // badge simply stops appearing rather than showing a stale "0 days left".
  const betaDaysRemaining = !isAdmin && isBetaTester(user) ? await getBetaDaysRemaining(user.id) : null;
  const isBeta = !isAdmin && betaDaysRemaining !== null && betaDaysRemaining > 0;
  const tier = isAdmin ? "enterprise" : await resolveEffectivePlanSlug(user);
  const seatCount = (user.user_metadata?.seat_count as number | undefined) ?? 0;
  const hasSubscription = Boolean(user.user_metadata?.stripe_customer_id);
  const hasCustomAiPersona = getPlan(tier)?.capabilities.customAiPersona ?? false;
  const aiPersonaName = (user.user_metadata?.ai_persona_name as string | undefined) ?? "";

  const { data: transactions } = await supabase
    .from("credit_transactions")
    .select("id, amount, action_type, description, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const chatMemoryEnabled = user.user_metadata?.chat_memory_enabled !== false;
  const { count: chatMemoryCount } = await supabase
    .from("chat_memory")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data: knownDevices } = await supabase
    .from("known_devices")
    .select("id, user_agent, ip_address, last_seen")
    .eq("user_id", user.id)
    .order("last_seen", { ascending: false });

  // AI Usage — credits spent lifetime (soft-capped at 5000 rows; a simple
  // sum, not a running ledger balance, good enough for a usage summary)
  // plus a per-module entry count across every module with a ModuleConfig
  // (same 23-table union the AI Memory page searches — see
  // dashboard/memory/page.tsx), computed in parallel.
  const usageModules = [...CLASSIFIER_MODULES, ...BUILD_MODULES];
  const [{ data: usedTransactions }, moduleUsage] = await Promise.all([
    supabase
      .from("credit_transactions")
      .select("amount")
      .eq("user_id", user.id)
      .lt("amount", 0)
      .limit(5000),
    Promise.all(
      usageModules.map(async (module) => {
        const { count } = await supabase
          .from(module.table)
          .select("id", { count: "exact", head: true });
        return { title: module.title, count: count ?? 0 };
      })
    ),
  ]);

  const totalCreditsUsed = (usedTransactions ?? []).reduce(
    (sum, tx) => sum + Math.abs(tx.amount),
    0
  );
  const totalEntries = moduleUsage.reduce((sum, m) => sum + m.count, 0);
  const mostActiveModule = moduleUsage.reduce<(typeof moduleUsage)[number] | null>(
    (max, m) => (m.count > (max?.count ?? -1) ? m : max),
    null
  );

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <PageHeader icon={SettingsIcon} title={t("title")} />

        <nav aria-label="Jump to section" className="mb-6 flex flex-wrap gap-2 text-xs">
          <a
            href="#accessibility"
            className="rounded-full border border-border px-3 py-1.5 text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
          >
            Accessibility
          </a>
          <a
            href="#ai-usage"
            className="rounded-full border border-border px-3 py-1.5 text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
          >
            AI Usage
          </a>
          <a
            href="#buy-credits"
            className="rounded-full border border-border px-3 py-1.5 text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
          >
            Billing
          </a>
        </nav>

        <div className="mb-6 rounded-2xl border border-border bg-panel p-5">
          <p className="text-xs text-muted">{t("signedInAs")}</p>
          <p className="mt-1 text-sm text-foreground">{user.email}</p>
        </div>

        <BillingSummary
          tier={tier}
          seatCount={seatCount}
          hasSubscription={hasSubscription}
          isAdmin={isAdmin}
          isBetaTester={isBeta}
          betaDaysRemaining={isBeta ? betaDaysRemaining : null}
        />

        <BuyCredits />

        <CreditHistory transactions={(transactions as CreditTransaction[] | null) ?? []} />

        <PasswordChangeForm />

        <div className="mt-6">
          <ChatMemorySettings
            userId={user.id}
            initialEnabled={chatMemoryEnabled}
            initialCount={chatMemoryCount ?? 0}
          />
        </div>

        <LoginActivity devices={(knownDevices as KnownDevice[] | null) ?? []} />

        {hasCustomAiPersona && <AiPersonaSettings initialName={aiPersonaName} />}

        <ThemeSettings />

        <AccessibilitySettings />

        <AiUsageSettings
          totalCreditsUsed={totalCreditsUsed}
          totalEntries={totalEntries}
          mostActiveModuleTitle={
            mostActiveModule && mostActiveModule.count > 0 ? mostActiveModule.title : null
          }
          moduleUsage={moduleUsage}
        />

        <div className="mb-6 space-y-3 rounded-2xl border border-border bg-panel p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("exportData.title")}</h2>
          <p className="text-xs text-muted">{t("exportData.description")}</p>
          <ExportDataButton />
        </div>

        <DangerZone email={user.email ?? ""} />
      </div>
    </main>
  );
}
