import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { getPurchasedPackCreditPriceEur, resolveEffectivePlan } from "@/lib/billing/credits";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { ANALYSIS_MODEL, ANALYSIS_SYSTEM, buildProfileBrief } from "@/lib/data-analysis/analyse";
import { estimateForAction } from "@/lib/billing/estimate";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import type { TableProfile } from "@/lib/data-analysis/profile";

export const dynamic = "force-dynamic";

/**
 * WHAT ANALYSING THIS FILE WILL HOLD, before it is asked (package 36: a
 * flow shows its total before it is approved, and an analysis costs what
 * its file's columns make it cost). The same brief and the same estimate
 * as api/data-analysis/[id]/analyse — scripts/tests/flows.test.mjs holds
 * the two calls equal — read under the person's own row;
 * nothing is called and nothing is charged.
 */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  try {
    const { data: analysis, error } = await supabase
      .from("data_analyses")
      .select("id, title, file_name, headers, rows, profile")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!analysis) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const brief = buildProfileBrief({
      fileName: String(analysis.file_name ?? analysis.title ?? "dataset"),
      profile: analysis.profile as TableProfile,
      headers: (analysis.headers ?? []) as string[],
      rows: (analysis.rows ?? []) as string[][],
    });
    const plan = await resolveEffectivePlan(user);
    // The analyse route's own estimate, argument for argument.
    const pricingConfig = resolvePricingConfig();
    const estimate = estimateForAction(
      "dataAnalyse",
      { model: ANALYSIS_MODEL, inputChars: ANALYSIS_SYSTEM.length + brief.length, planSlug: plan?.slug ?? null },
      pricingConfig,
      plan
        ? effectiveCreditPriceEurForAccount(plan, await getPurchasedPackCreditPriceEur(user.id), pricingConfig)
        : undefined
    );
    return NextResponse.json({ ok: true, credits: estimate.reserveCredits });
  } catch (err) {
    logApiError("/api/data-analysis/[id]/price", err);
    return NextResponse.json({ error: "price_failed" }, { status: 500 });
  }
}
