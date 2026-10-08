import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { hasEnoughCredits } from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { releaseReservation, reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { readFlow } from "@/lib/automations/boxes";
import { changeBox } from "@/lib/automations/builder";
import { FLOW_FEATURE, flowPrices } from "@/lib/automations/flow-pricing";
import {
  FLOW_COLUMNS,
  MAX_SAID_CHARS,
  UUID,
  claimFlow,
  flowGate,
  refuse,
  releaseFlow,
  saveVersion,
  scheduleAfterChange,
  type FlowRecord,
} from "@/lib/automations/flow-access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ONE BOX CHANGED WITH WORDS (MASTER 16, package 30): the person chooses
 * a box and says «στις 8 αντί για 9»; that box comes back changed and
 * every other box stays exactly as it was — the route puts the one box in
 * its place itself, it does not take a whole row back from the model.
 *
 * Held at the price shown under the field, settled on what the call used,
 * kept as a new version so «Αναίρεση» goes back one.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID.test(id)) return refuse("not_found", 404);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return refuse("invalid_body", 400);
  }
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  const boxId = typeof body.box === "string" ? body.box : "";
  if (instruction.length < 2) return refuse("empty", 400);
  if (instruction.length > MAX_SAID_CHARS) return refuse("too_long", 400, { limit: MAX_SAID_CHARS });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return refuse("not_configured", 503);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);
  const gate = await flowGate(user);
  if (gate instanceof NextResponse) return gate;

  const { data: found, error: loadError } = await supabase
    .from("automation_flows")
    .select(FLOW_COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (loadError) {
    logApiError("/api/automations/flows/[id]/change", loadError, { stage: "load" });
    return refuse("load_failed", 500);
  }
  if (!found) return refuse("not_found", 404);
  const flow = found as FlowRecord;
  const current = readFlow(flow.boxes);
  if (!current.ok) return refuse("bad_boxes", 409, { reason: current.reason });
  if (!current.boxes.some((b) => b.id === boxId)) return refuse("no_such_box", 400);

  const breaker = await checkAiCallAllowed(user.id, "automation_change", fingerprintRequest(id, boxId, instruction));
  if (!breaker.allowed) return refuse("rate_limited", 429);
  // Accounts that are not charged: their own ceiling in euros.
  const isBeta = await hasActiveBetaBypass(user);
  const bypass = gate.isAdmin || isBeta;
  if (bypass) {
    const ceiling = await checkBypassCeiling(user.id, gate.isAdmin, isBeta);
    if (!ceiling.allowed) return refuse("bypass_ceiling", 429);
  }
  const price = flowPrices(gate.plan, gate.packPriceEur).build;

  if (!(await claimFlow(id, user.id))) return refuse("busy", 409);
  let reservationId = "";
  let settled = false;
  try {
    if (!bypass && gate.plan) {
      const enough = await hasEnoughCredits(user.id, price, gate.plan);
      if (!enough.ok) return refuse("insufficient_credits", 402, { remaining: enough.remaining, needed: price });
      const reservation = await reserveCredits(user.id, price, FLOW_FEATURE, { kind: "change", flow: id });
      if (!reservation.ok) return refuse("reserve_failed", 402);
      reservationId = reservation.reservationId;
    }
    void recordAiCallForDailySpend(price);

    const costs = new CostAccumulator();
    const changed = await changeBox({ apiKey, boxes: current.boxes, id: boxId, instruction, timeZone: flow.time_zone, costs, signal: request.signal });
    if (!changed.ok && changed.kind === "provider") {
      await releaseReservation(user.id, reservationId);
      logApiError("/api/automations/flows/[id]/change", new Error(changed.detail), { stage: "change" });
      return refuse(request.signal.aborted ? "stopped" : "ai_unavailable", request.signal.aborted ? 499 : 503);
    }
    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: FLOW_FEATURE,
      costs,
      plan: gate.plan,
      bypassCharge: bypass,
      metadata: { kind: "change", flow: id, box: boxId, outcome: changed.ok ? "box" : changed.kind },
    });
    settled = true;
    if (!changed.ok) return refuse("unusable", 422, { creditsCharged: settlement.creditsCharged });

    const boxes = current.boxes.map((b) => (b.id === boxId ? changed.box : b));
    const schedule = await scheduleAfterChange(user.id, flow, boxes);
    const saved = await saveVersion({ flowId: id, userId: user.id, version: flow.version + 1, boxes, said: instruction, extra: schedule.patch });
    if (!saved) return refuse("save_failed", 500, { creditsCharged: settlement.creditsCharged });
    const { data: row } = await supabase.from("automation_flows").select(FLOW_COLUMNS).eq("id", id).eq("user_id", user.id).maybeSingle();
    return NextResponse.json({ ok: true, flow: row, paused: schedule.paused, creditsCharged: settlement.creditsCharged });
  } catch (err) {
    logApiError("/api/automations/flows/[id]/change", err);
    if (!settled) await releaseReservation(user.id, reservationId);
    return refuse("change_failed", 500);
  } finally {
    await releaseFlow(id, user.id);
  }
}
