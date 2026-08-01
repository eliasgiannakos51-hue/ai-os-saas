import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { InviteForm } from "@/components/team/invite-form";
import { TeamMembersList, type TeamMember } from "@/components/team/team-members-list";
import { getPlan, TEAM_SEAT_PRICE, CURRENCY_SYMBOL } from "@/lib/billing/plans";
import { isAdminEmail } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Team",
};

export default async function TeamPage() {
  const t = await getTranslations("dashboard.team");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Admin-listed accounts (see lib/admin.ts) get full Enterprise-tier
  // access, including team management, without a real Stripe subscription.
  const isAdmin = isAdminEmail(user.email);
  const tier = isAdmin ? "enterprise" : (user.user_metadata?.subscription_tier as string | undefined);
  const ownsSubscription = isAdmin || Boolean(user.user_metadata?.stripe_subscription_id);

  // Team collaboration is a Professional+ capability (see
  // lib/billing/plans.ts's PlanCapabilities.teamCollaboration) and for plan
  // owners only — a team member who joined via invite has subscription_tier
  // set too, but no stripe_subscription_id of their own, so this correctly
  // excludes them.
  if (!ownsSubscription || !tier || !getPlan(tier)?.capabilities.teamCollaboration) {
    redirect("/dashboard/settings");
  }

  const { data: members } = await supabase
    .from("team_members")
    .select("id, member_email, status, invited_at, joined_at")
    .eq("owner_id", user.id)
    .order("invited_at", { ascending: false });

  const plan = getPlan(tier);

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <PageHeader
          icon={Users}
          title={t("title")}
          description={t("description", {
            plan: plan?.name ?? tier,
            price: `${CURRENCY_SYMBOL}${TEAM_SEAT_PRICE}`,
          })}
        />

        <div className="mb-6">
          <InviteForm />
        </div>

        <TeamMembersList members={(members as TeamMember[] | null) ?? []} />
      </div>
    </main>
  );
}
