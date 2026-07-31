import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { PasswordChangeForm } from "@/components/settings/password-change-form";
import { ChatMemorySettings } from "@/components/settings/chat-memory-settings";
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

  return (
    <main className="min-h-full bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <PageHeader icon={SettingsIcon} title="Settings" />

        <div className="mb-6 rounded-2xl border border-border bg-panel p-5">
          <p className="text-xs text-muted">Signed in as</p>
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

        <div className="mb-6 mt-6 space-y-3 rounded-2xl border border-border bg-panel p-5">
          <h2 className="text-sm font-semibold text-foreground">Export Data</h2>
          <p className="text-xs text-muted">
            Download everything you&apos;ve logged across all 13 modules as a
            single JSON file.
          </p>
          <ExportDataButton />
        </div>

        <DangerZone email={user.email ?? ""} />
      </div>
    </main>
  );
}
