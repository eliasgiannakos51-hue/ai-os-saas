import { NextResponse } from "next/server";
import { anyProviderConfigured } from "@/lib/ai/providers/registry";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { SUPPORTED_LOCALES } from "@/i18n/constants";
import { isFeatureOn } from "@/lib/flags/flags";
import { resolveLanguage } from "@/lib/text/resolve-language";
import { appGate } from "@/lib/apps/app-access";
import { chargedAppStep } from "@/lib/apps/charge";
import { planApp } from "@/lib/apps/app-call";
import { MAX_APP_DESCRIPTION_CHARS, planInputChars } from "@/lib/apps/app-plan";
import { appSystemPrompt } from "@/lib/apps/app-system";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // @function-limit 120

/**
 * AN APP, PLANNED FROM A DESCRIPTION (the owner's "APPS: ΛΕΙΤΟΥΡΓΙΚΟ,
 * ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ", 2026-10-24, κομμάτι 2), behind the switch
 * "apps-tool". The plan is four boxes — the data it keeps, the screens
 * that use it, who sees what, what gets told to whom — and nothing is
 * built yet: the person reads the plan, changes any box with words
 * (api/apps/[id], action "box") and approves it (action "approve").
 *
 * The row is written with the service role, scoped to the caller: the
 * account reads and deletes its apps but cannot write one itself
 * (supabase/migrations/20261030000000_user_apps.sql), so every stored
 * definition went through src/lib/apps/app-plan.ts's parse.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  // The switch first, before anything sent is looked at: a half-built
  // piece is never reachable by somebody the tool is not open to.
  if (!(await isFeatureOn("apps-tool", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) return NextResponse.json({ ok: false, code: "empty" }, { status: 400 });
  if (description.length > MAX_APP_DESCRIPTION_CHARS) return NextResponse.json({ ok: false, code: "too_long", limit: MAX_APP_DESCRIPTION_CHARS }, { status: 400 });
  const uiLocale = typeof body.locale === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(body.locale) ? body.locale : "en";

  const gate = await appGate(user);
  if (!gate.ok) return NextResponse.json({ ok: false, code: gate.code }, { status: 403 });
  // Refused before the hold: the router can be served by any configured
  // provider, so this asks whether ANY is, not whether one name is set.
  if (!anyProviderConfigured(process.env)) return NextResponse.json({ ok: false, code: "not_configured" }, { status: 503 });

  try {
    const locale = resolveLanguage(description, uiLocale);
    const step = await chargedAppStep({
      user,
      gate,
      action: "appPlan",
      inputChars: planInputChars(appSystemPrompt().length, description.length),
      fingerprint: description,
      route: "/api/apps",
      metadata: { step: "plan", descriptionChars: description.length },
      run: (costs) => planApp({ description, locale, costs, userId: user.id, signal: request.signal }),
    });
    if (!step.ok) return step.response;

    const { data: row, error } = await createAdminClient()
      .from("user_apps")
      .insert({ user_id: user.id, title: step.value.title, description, locale, definition: step.value, status: "planning" })
      .select("id, title, definition, status, versions, locale, updated_at")
      .single();
    if (error || !row) {
      logApiError("/api/apps", error, { stage: "save" });
      return NextResponse.json({ ok: false, code: "not_saved", creditsCharged: step.creditsCharged }, { status: 500 });
    }
    return NextResponse.json({ ok: true, app: row, creditsCharged: step.creditsCharged });
  } catch (err) {
    logApiError("/api/apps", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
