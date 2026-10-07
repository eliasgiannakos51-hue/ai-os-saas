import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { hasEnoughCredits } from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { releaseReservation, reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { buildFlow } from "@/lib/automations/builder";
import { FLOW_FEATURE, flowPrices } from "@/lib/automations/flow-pricing";
import { FLOW_COLUMNS, MAX_FLOWS, MAX_SAID_CHARS, flowGate, readTimeZone, refuse } from "@/lib/automations/flow-access";

export const dynamic = "force-dynamic";
// One forced-tool call of at most 1,500 tokens.
export const maxDuration = 60;

/**
 * AN AUTOMATION FROM ONE SENTENCE (MASTER 16, package 30), behind the
 * switch "automations".
 *
 * «Κάθε πρωί στις 9 στείλε μου στο Telegram τι έχω σήμερα» comes back as
 * boxes; a sentence that leaves out WHEN or WHAT comes back as one
 * question, and the person's answer is sent again with the sentence. Both
 * are one call to the model, held at the price shown under the field
 * (lib/automations/flow-pricing.ts) and settled on what it used.
 *
 * It is made OFF. Switching it on is its own press, after the boxes have
 * been seen (api/automations/flows/[id]/active).
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
  const said = typeof body.said === "string" ? body.said.trim() : "";
  if (said.length < 3) return refuse("empty", 400);
  if (said.length > MAX_SAID_CHARS) return refuse("too_long", 400, { limit: MAX_SAID_CHARS });
  const timeZone = readTimeZone(body.timeZone);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return refuse("not_configured", 503);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);
  const gate = await flowGate(user);
  if (gate instanceof NextResponse) return gate;

  const { count, error: countError } = await supabase
    .from("automation_flows")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countError) {
    logApiError("/api/automations/flows", countError, { stage: "count" });
    return refuse("load_failed", 500);
  }
  if ((count ?? 0) >= MAX_FLOWS) return refuse("too_many", 409, { limit: MAX_FLOWS });

  const breaker = await checkAiCallAllowed(user.id, "automation_build", fingerprintRequest(said));
  if (!breaker.allowed) return refuse("rate_limited", 429);
  // Accounts that are not charged: their own ceiling in euros.
  const isBeta = await hasActiveBetaBypass(user);
  const bypass = gate.isAdmin || isBeta;
  if (bypass) {
    const ceiling = await checkBypassCeiling(user.id, gate.isAdmin, isBeta);
    if (!ceiling.allowed) return refuse("bypass_ceiling", 429);
  }
  const price = flowPrices(gate.plan, gate.packPriceEur).build;

  let reservationId = "";
  let settled = false;
  try {
    if (!bypass && gate.plan) {
      const enough = await hasEnoughCredits(user.id, price, gate.plan);
      if (!enough.ok) return refuse("insufficient_credits", 402, { remaining: enough.remaining, needed: price });
      const reservation = await reserveCredits(user.id, price, FLOW_FEATURE, { kind: "build" });
      if (!reservation.ok) return refuse("reserve_failed", 402);
      reservationId = reservation.reservationId;
    }
    void recordAiCallForDailySpend(price);

    const costs = new CostAccumulator();
    const built = await buildFlow({ apiKey, said, timeZone, costs, signal: request.signal });
    if (!built.ok && built.kind === "provider") {
      await releaseReservation(user.id, reservationId);
      logApiError("/api/automations/flows", new Error(built.detail), { stage: "build" });
      return refuse(request.signal.aborted ? "stopped" : "ai_unavailable", request.signal.aborted ? 499 : 503);
    }

    // A question or an answer that is not a row of boxes still used the
    // model: it is settled like a made one, on what it used.
    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: FLOW_FEATURE,
      costs,
      plan: gate.plan,
      bypassCharge: bypass,
      metadata: { kind: "build", outcome: built.ok ? "boxes" : built.kind },
    });
    settled = true;

    if (!built.ok && built.kind === "question") {
      return NextResponse.json({ ok: true, question: built.question, creditsCharged: settlement.creditsCharged });
    }
    if (!built.ok) {
      logApiError("/api/automations/flows", new Error(built.detail), { stage: "unusable" });
      return refuse("unusable", 422, { creditsCharged: settlement.creditsCharged });
    }

    const admin = createAdminClient();
    const id = crypto.randomUUID();
    const { data: row, error: saveError } = await admin
      .from("automation_flows")
      .insert({ id, user_id: user.id, name: built.name, said, boxes: built.boxes, version: 1, is_active: false, time_zone: timeZone })
      .select(FLOW_COLUMNS)
      .single();
    if (saveError || !row) {
      logApiError("/api/automations/flows", saveError ?? new Error("no row"), { stage: "save" });
      return refuse("save_failed", 500, { creditsCharged: settlement.creditsCharged });
    }
    const { error: versionError } = await admin
      .from("automation_flow_versions")
      .insert({ flow_id: id, user_id: user.id, version: 1, boxes: built.boxes, said });
    if (versionError) logApiError("/api/automations/flows", versionError, { stage: "version" });

    return NextResponse.json({ ok: true, flow: row, unsupported: built.unsupported, creditsCharged: settlement.creditsCharged });
  } catch (err) {
    logApiError("/api/automations/flows", err);
    if (!settled) await releaseReservation(user.id, reservationId);
    return refuse("build_failed", 500);
  }
}
