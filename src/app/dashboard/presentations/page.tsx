import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Presentation } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { isAdminEmail } from "@/lib/admin";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { maxPresentationsForPlan } from "@/lib/presentations/presentation-limits";
import {
  PresentationsWorkspace,
  type PresentationListItem,
} from "@/components/presentations/presentations-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Presentations" };

/**
 * This page used to be a TRACKER — a BuildModulePage over `ai_presentations`,
 * where the user typed a name and a status by hand and nothing was ever
 * generated. It is now the real feature.
 *
 * The old table is deliberately left alone by the migration: an account
 * that wrote notes in the tracker still has them, and deleting a user's
 * notes to make a new page tidy is not a migration anybody asked for.
 */
export default async function PresentationsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.presentations");
  const isAdmin = isAdminEmail(user.email);
  const planSlug = await resolveEffectivePlanSlug(user);
  const cap = maxPresentationsForPlan(planSlug);

  if (!isAdmin && cap <= 0) {
    return (
      <main className="min-h-full bg-dot-grid">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <PageHeader icon={Presentation} title={t("title")} description={t("description")} />
          <UpgradeRequired featureName={t("title")} planName="Starter" />
        </div>
      </main>
    );
  }

  // The same calendar-month window the API enforces, computed here so the
  // number on screen is the number the server will act on.
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);

  const [{ data: presentations }, { count }] = await Promise.all([
    supabase
      .from("user_presentations")
      .select("id, title, theme, status, credits_charged, share_enabled, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("user_presentations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since.toISOString()),
  ]);

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader icon={Presentation} title={t("title")} description={t("description")} />

        <p className="mb-4 rounded-xl border border-border bg-panel/60 p-3 text-[11px] leading-relaxed text-muted">
          {t("intro")}
        </p>

        <PresentationsWorkspace
          initialPresentations={(presentations ?? []) as unknown as PresentationListItem[]}
          monthlyCap={isAdmin || !Number.isFinite(cap) ? null : cap}
          usedThisMonth={count ?? 0}
        />
      </div>
    </main>
  );
}
