import type { Metadata } from "next";
import { pageTitle } from "@/lib/page-title";
import { diagLog } from "@/lib/diag";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { InviteForm } from "@/components/team/invite-form";
import { TeamMembersList, type TeamMember } from "@/components/team/team-members-list";
import { getPlan, TEAM_SEAT_PRICE, CURRENCY_SYMBOL } from "@/lib/billing/plans";
import { isAdminEmail } from "@/lib/admin";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.team");
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: { setup?: string };
}) {
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

  // Arriving here straight from a successful "Set Up Team" checkout
  // (pricing page's Business card) — the Stripe webhook that writes
  // subscription_tier/stripe_subscription_id onto user_metadata may not
  // have landed yet by the time Stripe redirects the browser back, so the
  // strict gate below is bypassed for this one visit. /api/team/invite
  // enforces the real access check server-side regardless, so a user whose
  // webhook is unusually slow just sees "try again in a moment" there
  // instead of being bounced to Settings right after paying.
  const justSetUp = searchParams?.setup === "success";

  // TEMPORARY diagnostic logging for the "Business signup flow doesn't
  // work end-to-end" investigation — this sandbox can't reach live
  // Stripe/Supabase to reproduce the real redirect, so this traces exactly
  // what state this page sees on each load once deployed. Safe to remove
  // once confirmed.
  diagLog(`[team-page-diag] userId=${user.id} setupParam=${searchParams?.setup ?? "none"} justSetUp=${justSetUp} tier=${tier ?? "none"} ownsSubscription=${ownsSubscription} teamCollaboration=${tier ? Boolean(getPlan(tier)?.capabilities.teamCollaboration) : "n/a"}`);

  // Team collaboration is a Professional+ capability (see
  // lib/billing/plans.ts's PlanCapabilities.teamCollaboration) and for plan
  // owners only — a team member who joined via invite has subscription_tier
  // set too, but no stripe_subscription_id of their own, so this correctly
  // excludes them.
  if (!justSetUp && (!ownsSubscription || !tier || !getPlan(tier)?.capabilities.teamCollaboration)) {
    diagLog(`[team-page-diag] userId=${user.id} REDIRECTING to /dashboard/settings (gate failed)`);
    redirect("/dashboard/settings");
  }

  const { data: members } = await supabase
    .from("team_members")
    .select("id, member_email, status, role, invited_at, joined_at")
    .eq("owner_id", user.id)
    .order("invited_at", { ascending: false });

  const plan = tier ? getPlan(tier) : undefined;
  // Real seat usage vs. purchased count (see api/team/invite's new
  // seat-limit enforcement) — shown so a Professional-tier owner can see
  // how many seats they've used BEFORE hitting the limit, not just after
  // a rejected invite. Only meaningful for pay-per-seat plans; Ultimate/
  // Enterprise's "included, unlimited" copy already covers that case.
  const seatCount = typeof user.user_metadata?.seat_count === "number" ? user.user_metadata.seat_count : 0;
  const activeMemberCount = members?.length ?? 0;

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <PageHeader helpKey="help.team" helpArticle="team-members"
          icon={Users}
          title={t("title")}
          description={
            plan?.teamSeatsIncluded
              ? t("descriptionIncluded", { plan: plan?.name ?? tier ?? "" })
              : t("description", {
                  plan: plan?.name ?? tier ?? "",
                  price: `${CURRENCY_SYMBOL}${TEAM_SEAT_PRICE}`,
                })
          }
        />

        {!isAdmin && !plan?.teamSeatsIncluded && (
          <p className="mb-6 text-xs text-muted">
            {t("seatsUsed", { used: activeMemberCount, total: seatCount })}
          </p>
        )}

        {justSetUp && (
          <div className="mb-6 rounded-2xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-400">
            <p className="font-semibold">{t("setupSuccessTitle")}</p>
            <p className="mt-1 text-xs text-emerald-400/80">{t("setupSuccessBody")}</p>
          </div>
        )}

        <div className="mb-6">
          <InviteForm />
        </div>

        <TeamMembersList members={(members as TeamMember[] | null) ?? []} />
      </div>
    </main>
  );
}
