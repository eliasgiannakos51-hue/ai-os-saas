import type { Metadata } from "next";
import { pageTitle } from "@/lib/page-title";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Plug } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { isAdminEmail } from "@/lib/admin";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { listIntegrations } from "@/lib/integrations/store";
import { maxIntegrationsForPlan } from "@/lib/integrations/limits";
import { encryptionAvailable } from "@/lib/integrations/crypto";
import { providerConfigured } from "@/lib/integrations/oauth";
import { PROVIDERS, type ProviderId } from "@/lib/integrations/providers";
import { IntegrationsList } from "@/components/integrations/integrations-list";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.integrations");
}

export default async function IntegrationsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.integrations");
  const isAdmin = isAdminEmail(user.email);
  const planSlug = await resolveEffectivePlanSlug(user);
  const planCap = maxIntegrationsForPlan(planSlug);

  if (!isAdmin && planCap <= 0) {
    return (
      <main className="min-h-full bg-dot-grid">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <PageHeader helpKey="help.integrations" helpArticle="connect-gmail" icon={Plug} title={t("title")} description={t("description")} />
          <UpgradeRequired featureName={t("title")} planName="Starter" />
        </div>
      </main>
    );
  }

  // Resolved on the server: `providerConfigured` reads process.env, and a
  // client component must never learn which secrets exist. What crosses is
  // a list of provider IDS, which is public information.
  const configured = PROVIDERS.map((p) => p.id).filter((id: ProviderId) => providerConfigured(id));

  const integrations = await listIntegrations(user.id);
  const cap = isAdmin ? Number.POSITIVE_INFINITY : planCap;

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader icon={Plug} title={t("title")} description={t("description")} />

        {/* Said once, at the top, in the user's own language: this is the
            page where somebody decides whether an AI may read their mail,
            and the terms of that should not be somewhere else. */}
        <p className="mb-4 rounded-xl border border-border bg-panel/60 p-3 text-[11px] leading-relaxed text-muted">
          {t("privacyNotice")}
        </p>

        {/* useSearchParams (the ?status= the OAuth callback returns with)
            makes the list a client component that must be inside Suspense
            for the production build to prerender this route's shell. */}
        <Suspense fallback={null}>
          <IntegrationsList
            integrations={integrations}
            cap={cap}
            configured={configured}
            encryptionReady={encryptionAvailable()}
          />
        </Suspense>
      </div>
    </main>
  );
}
