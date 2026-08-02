import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getModule, type FieldConfig } from "@/lib/modules";
import { getBuildModule } from "@/lib/build-modules";
import { getPlan, planMeetsMinimum } from "@/lib/billing/plans";
import { deductCredits, insufficientCreditsMessage, resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Generous but bounded — enough for any real form entry, small enough to
// stop a single field from writing megabytes into a row.
const MAX_TEXT_LENGTH = 500;
const MAX_TEXTAREA_LENGTH = 10000;

function coerceFieldValue(field: FieldConfig, raw: unknown): string | number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (field.type === "number") {
    const num = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(num) ? num : null;
  }
  const str = String(raw);
  const max = field.type === "textarea" ? MAX_TEXTAREA_LENGTH : MAX_TEXT_LENGTH;
  return str.length > max ? str.slice(0, max) : str;
}

// Shared gated-creation endpoint for the handful of modules that have a
// creditCost, minPlanSlug, or countCapCapability set (lib/modules.ts,
// lib/build-modules.ts) — currently agents, websites, apps, automation.
// GenericAddForm posts here instead of inserting directly for those
// modules only; every other module keeps its existing direct-insert path
// unchanged (see components/modules/generic-add-form.tsx).
export async function POST(request: Request) {
  try {
    let moduleSlug: string;
    let fields: Record<string, unknown>;
    try {
      const body = await request.json();
      moduleSlug = typeof body?.moduleSlug === "string" ? body.moduleSlug : "";
      fields = body?.fields && typeof body.fields === "object" ? body.fields : {};
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    const moduleConfig = getBuildModule(moduleSlug) ?? getModule(moduleSlug);
    if (!moduleConfig) {
      return NextResponse.json({ ok: false, error: "Unknown module." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const isAdmin = isAdminEmail(user.email);
    const planSlug = await resolveEffectivePlanSlug(user);
    const plan = getPlan(planSlug) ?? getPlan("free")!;

    if (!isAdmin && moduleConfig.minPlanSlug && !planMeetsMinimum(planSlug, moduleConfig.minPlanSlug)) {
      return NextResponse.json(
        {
          ok: false,
          upgradeRequired: true,
          error: `${moduleConfig.title} requires the ${getPlan(moduleConfig.minPlanSlug)?.name ?? moduleConfig.minPlanSlug} plan or higher. Upgrade to continue.`,
        },
        { status: 403 }
      );
    }

    if (!isAdmin && moduleConfig.countCapCapability === "maxAiAgents") {
      const cap = plan.capabilities.maxAiAgents;
      if (cap !== "unlimited") {
        const { count, error: countError } = await supabase
          .from(moduleConfig.table)
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        if (countError) {
          logApiError("/api/modules/create", countError, { stage: "count_cap", moduleSlug });
        } else if ((count ?? 0) >= cap) {
          return NextResponse.json(
            {
              ok: false,
              upgradeRequired: true,
              error: `You've reached the ${cap} AI agent limit on the ${plan.name} plan. Upgrade to create more.`,
            },
            { status: 403 }
          );
        }
      }
    }

    if (!isAdmin && !(await hasActiveBetaBypass(user)) && moduleConfig.creditCost) {
      const deduction = await deductCredits(
        user.id,
        moduleConfig.creditCost,
        `${moduleConfig.slug}_create`,
        `${moduleConfig.title} created`,
        plan
      );
      if (!deduction.ok) {
        return NextResponse.json(
          {
            ok: false,
            insufficientCredits: true,
            error: insufficientCreditsMessage(deduction.remaining, moduleConfig.creditCost),
          },
          { status: 402 }
        );
      }
    }

    const payload: Record<string, string | number | null> = { user_id: user.id };
    for (const field of moduleConfig.fields) {
      payload[field.key] = coerceFieldValue(field, fields[field.key]);
    }

    const missingRequired = moduleConfig.fields.find(
      (f) => f.required && (payload[f.key] === null || payload[f.key] === undefined)
    );
    if (missingRequired) {
      return NextResponse.json(
        { ok: false, error: `${missingRequired.label} is required.` },
        { status: 400 }
      );
    }

    const { data: record, error: insertError } = await supabase
      .from(moduleConfig.table)
      .insert(payload)
      .select()
      .single();

    if (insertError) {
      logApiError("/api/modules/create", insertError, { stage: "insert", moduleSlug });
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, record });
  } catch (err) {
    logApiError("/api/modules/create", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
