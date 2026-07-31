import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Settings as SettingsIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { PasswordChangeForm } from "@/components/settings/password-change-form";
import { ChatMemorySettings } from "@/components/settings/chat-memory-settings";
import { LoginActivity, type KnownDevice } from "@/components/settings/login-activity";
import { ExportDataButton } from "@/components/settings/export-data-button";
import { DangerZone } from "@/components/settings/danger-zone";
import { BillingSummary } from "@/components/settings/billing-summary";
import { BuyCredits } from "@/components/settings/buy-credits";
import { CreditHistory, type CreditTransaction } from "@/components/settings/credit-history";
import { isAdminEmail } from "@/lib/admin";

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
  const tier = isAdmin
    ? "enterprise"
    : (user.user_metadata?.subscription_tier as string | undefined) ?? "free";
  const seatCount = (user.user_metadata?.seat_count as number | undefined) ?? 0;
  const hasSubscription = Boolean(user.user_metadata?.stripe_customer_id);

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

  return (
    <main className="min-h-full bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <PageHeader icon={SettingsIcon} title={t("title")} />

        <div className="mb-6 rounded-2xl border border-border bg-panel p-5">
          <p className="text-xs text-muted">{t("signedInAs")}</p>
          <p className="mt-1 text-sm text-foreground">{user.email}</p>
        </div>

        <BillingSummary
          tier={tier}
          seatCount={seatCount}
          hasSubscription={hasSubscription}
          isAdmin={isAdmin}
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
