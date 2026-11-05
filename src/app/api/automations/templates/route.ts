import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { checkRateLimit } from "@/lib/rate-limit";
import { FLOW_COLUMNS, MAX_FLOWS, flowGate, readTimeZone, refuse } from "@/lib/automations/flow-access";
import { isTemplateId, templateFlow, type TemplateId } from "@/lib/automations/templates";

export const dynamic = "force-dynamic";

/**
 * AN AUTOMATION FROM A READY-MADE ONE, WITH ONE PRESS (the owner,
 * 2026-11-05, after the automation videos; the switch
 * "automation-templates").
 *
 * {template, timeZone}: the template is a key from lib/automations/
 * templates.ts, never boxes — the browser names WHICH ready-made one, and
 * the rows are written here, from this product's own list. Its name, its
 * sentence and its AI box's words are the reader's language
 * (messages/<locale>.json, dashboard.automations.templates), so the model
 * answers in it when it runs.
 *
 * NO MODEL IS CALLED AND NOTHING IS CHARGED: the boxes are written out,
 * not made. So the bounds are the ones that bound a free insert — the
 * person's MAX_FLOWS, and a limit per hour on the presses — and not a
 * hold. Each RUN is priced and held per AI box by the runner, as for any
 * other automation, and the gallery card says that price before the press.
 *
 * It is made OFF, with version 1, exactly as POST /api/automations/flows
 * makes one from a sentence (src/app/api/automations/flows/route.ts):
 * switching on is its own press, after the boxes have been seen, and
 * from here on it is an ordinary automation — every box changes, by
 * words or by hand, and «Αναίρεση» takes a change back.
 *
 * THE ROWS ARE WRITTEN THROUGH THE SERVICE ROLE, with user_id from the
 * session: automation_flows revokes insert and update from authenticated
 * (20261021000000_automation_flows.sql).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return refuse("invalid_body", 400);
  }
  if (!isTemplateId(body.template)) return refuse("bad_template", 400);
  const template: TemplateId = body.template;
  const timeZone = readTimeZone(body.timeZone);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);
  const gate = await flowGate(user);
  if (gate instanceof NextResponse) return gate;
  if (!(await isFeatureOn("automation-templates", user))) return refuse("not_enabled", 403);

  // Twenty presses an hour per account: a person starting from the
  // gallery makes one or two; a script making rows is what this stops.
  const limited = await checkRateLimit({ scope: "automation_template", identifier: user.id, maxAttempts: 20, windowMinutes: 60 });
  if (!limited.allowed) return refuse("rate_limited", 429);

  const { count, error: countError } = await supabase
    .from("automation_flows")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countError) {
    logApiError("/api/automations/templates", countError, { stage: "count" });
    return refuse("load_failed", 500);
  }
  if ((count ?? 0) >= MAX_FLOWS) return refuse("too_many", 409, { limit: MAX_FLOWS });

  // Every key written out, not built from the id: a computed key is one
  // nothing can check exists (scripts/check-i18n.js reads literals).
  const t = await getTranslations("dashboard.automations.templates");
  // The automation's sentence (automation_flows.said) is the card's own
  // description: what the person read before the press is what it says it is.
  const words: Record<TemplateId, { name: string; said: string; instruction: string }> = {
    finance_daily: { name: t("finance_daily.name"), said: t("finance_daily.description"), instruction: t("finance_daily.instruction") },
    finance_weekly: { name: t("finance_weekly.name"), said: t("finance_weekly.description"), instruction: t("finance_weekly.instruction") },
  };
  const { name, said, instruction } = words[template];
  const boxes = templateFlow(template, instruction);
  if (!boxes) {
    // The template's own words did not make a row: a translation shorter
    // than an AI box allows. scripts/tests/automations.test.mjs §12 holds
    // every language against this, so this is a bug, said as one.
    logApiError("/api/automations/templates", new Error("template is not a row"), { template });
    return refuse("bad_template", 500);
  }

  try {
    const admin = createAdminClient();
    const id = crypto.randomUUID();
    const { data: row, error: saveError } = await admin
      .from("automation_flows")
      .insert({ id, user_id: user.id, name: name.slice(0, 60), said, boxes, version: 1, is_active: false, time_zone: timeZone })
      .select(FLOW_COLUMNS)
      .single();
    if (saveError || !row) {
      logApiError("/api/automations/templates", saveError ?? new Error("no row"), { stage: "save", template });
      return refuse("save_failed", 500);
    }
    const { error: versionError } = await admin.from("automation_flow_versions").insert({ flow_id: id, user_id: user.id, version: 1, boxes, said });
    if (versionError) logApiError("/api/automations/templates", versionError, { stage: "version", template });
    return NextResponse.json({ ok: true, flow: row });
  } catch (err) {
    logApiError("/api/automations/templates", err, { template });
    return refuse("save_failed", 500);
  }
}
