import { NextResponse } from "next/server";
import { anyProviderConfigured } from "@/lib/ai/providers/registry";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { fingerprintRequest } from "@/lib/request-fingerprint";
import { getPurchasedPackCreditPriceEur, hasEnoughCredits, resolveEffectivePlan } from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { releaseReservation, reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { DISCORD_FEATURE, discordPlanPrice } from "@/lib/discord/pricing";
import { planServer } from "@/lib/discord/planner";
import { boxKindOf, carryTicks, removeBox, replaceOneBox, setTick } from "@/lib/discord/blueprint";
import { createBuild, loadBuild, ownsGuild, saveBlueprint, screenBuild } from "@/lib/discord/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // @function-limit 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SAID_CHARS = 2000;

function refuse(code: string, status: number, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: false, code, ...extra }, { status });
}

/**
 * A DISCORD SERVER PLAN: MADE FROM WORDS, CHANGED WITH WORDS, TICKED,
 * TRIMMED (the owner's Discord directive, 2026-11-05). Nothing here
 * touches Discord — the plan is ours until «Φτιάξ' το στο Discord»
 * (api/discord/apply).
 *
 *   action "plan"    {guild, said}           a new plan, for a server this account connected
 *   action "change"  {build, said, box?}     the plan, or ONE box of it, changed with words
 *   action "tick"    {build, role, permission, on}   the person's own tick on an elevated permission
 *   action "remove"  {build, box}            one box deleted, with every reference to it
 *
 * "plan" and "change" call the model: held at discordPlanPrice before —
 * the number under the field — and settled on what the call used; a
 * provider failure releases the hold, so a failed plan costs nothing.
 * "tick" and "remove" call nothing and cost nothing. Every action is on
 * the session's own rows (lib/discord/store.ts filters by user id).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return refuse("invalid_body", 400);
  }
  const action = body.action;
  if (action !== "plan" && action !== "change" && action !== "tick" && action !== "remove") return refuse("invalid_action", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);
  if (!(await isFeatureOn("discord-bot", user))) return refuse("not_found", 404);

  const limited = await checkRateLimit({ scope: "discord_plan", identifier: user.id, maxAttempts: 60, windowMinutes: 60 });
  if (!limited.allowed) return refuse("rate_limited", 429);

  try {
    // ---- the free actions ---------------------------------------------------
    if (action === "tick" || action === "remove") {
      const buildId = typeof body.build === "string" && UUID.test(body.build) ? body.build : "";
      const build = buildId ? await loadBuild(user.id, buildId) : null;
      if (!build) return refuse("not_found", 404);
      if (build.status !== "planned") return refuse("already_applied", 409);
      const verdict =
        action === "tick"
          ? setTick(build.blueprint, typeof body.role === "string" ? body.role : "", body.permission, body.on === true)
          : removeBox(build.blueprint, typeof body.box === "string" ? body.box : "");
      if (!verdict.ok) return refuse(verdict.reason, 400);
      if (!(await saveBlueprint(user.id, build.id, build.version, verdict.blueprint))) return refuse("conflict", 409);
      return NextResponse.json({ ok: true, build: screenBuild({ ...build, blueprint: verdict.blueprint, version: build.version + 1 }) });
    }

    // ---- the two that call the model ----------------------------------------
    const said = typeof body.said === "string" ? body.said.trim() : "";
    if (said.length < 3) return refuse("empty", 400);
    if (said.length > MAX_SAID_CHARS) return refuse("too_long", 400, { limit: MAX_SAID_CHARS });

    let current: Awaited<ReturnType<typeof loadBuild>> = null;
    let box: string | null = null;
    let guildId = "";
    if (action === "change") {
      const buildId = typeof body.build === "string" && UUID.test(body.build) ? body.build : "";
      current = buildId ? await loadBuild(user.id, buildId) : null;
      if (!current) return refuse("not_found", 404);
      if (current.status !== "planned") return refuse("already_applied", 409);
      box = typeof body.box === "string" && body.box ? body.box : null;
      if (box && !boxKindOf(current.blueprint, box)) return refuse("no_such_box", 400);
      guildId = current.guild_id;
    } else {
      guildId = typeof body.guild === "string" ? body.guild : "";
      if (!/^\d{15,22}$/.test(guildId) || !(await ownsGuild(user.id, guildId))) return refuse("not_connected", 404);
    }

    if (!anyProviderConfigured(process.env)) return refuse("not_configured", 503);
    const breaker = await checkAiCallAllowed(user.id, "discord_plan", fingerprintRequest(guildId, current?.id ?? "", box ?? "", said));
    if (!breaker.allowed) return refuse("rate_limited", 429);
    const isAdmin = isAdminEmail(user.email);
    const isBeta = await hasActiveBetaBypass(user);
    const bypass = isAdmin || isBeta;
    if (bypass) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, isBeta);
      if (!ceiling.allowed) return refuse("bypass_ceiling", 429);
    }
    const plan = await resolveEffectivePlan(user);
    const price = discordPlanPrice(plan, await getPurchasedPackCreditPriceEur(user.id));

    let reservationId = "";
    let settled = false;
    try {
      if (!bypass && plan) {
        const enough = await hasEnoughCredits(user.id, price, plan);
        if (!enough.ok) return refuse("insufficient_credits", 402, { remaining: enough.remaining, needed: price });
        const reservation = await reserveCredits(user.id, price, DISCORD_FEATURE, { kind: action });
        if (!reservation.ok) return refuse("reserve_failed", 402);
        reservationId = reservation.reservationId;
      }
      void recordAiCallForDailySpend(price);

      const costs = new CostAccumulator();
      const answer = await planServer({ said, current: current ? { blueprint: current.blueprint, box } : null, costs, userId: user.id, signal: request.signal });
      if (!answer.ok && answer.kind === "provider") {
        await releaseReservation(user.id, reservationId);
        settled = true;
        logApiError("/api/discord/plan", new Error(answer.detail), { stage: "model" });
        return refuse(request.signal.aborted ? "stopped" : "ai_unavailable", request.signal.aborted ? 499 : 503);
      }
      const settlement = await settleReservation({
        userId: user.id,
        reservationId,
        feature: DISCORD_FEATURE,
        costs,
        plan,
        bypassCharge: bypass,
        metadata: { kind: action, outcome: answer.ok ? "plan" : answer.kind },
      });
      settled = true;
      if (!answer.ok) {
        if (answer.kind === "question") return NextResponse.json({ ok: true, question: answer.question, creditsCharged: settlement.creditsCharged });
        return refuse("unusable", 422, { creditsCharged: settlement.creditsCharged });
      }

      if (!current) {
        const id = await createBuild(user.id, guildId, said, answer.blueprint);
        if (!id) return refuse("save_failed", 500, { creditsCharged: settlement.creditsCharged });
        const created = await loadBuild(user.id, id);
        if (!created) return refuse("save_failed", 500, { creditsCharged: settlement.creditsCharged });
        return NextResponse.json({ ok: true, build: screenBuild(created), creditsCharged: settlement.creditsCharged });
      }
      const next = box ? replaceOneBox(current.blueprint, answer.blueprint, box) : { ok: true as const, blueprint: carryTicks(current.blueprint, answer.blueprint) };
      if (!next.ok) return refuse("unusable", 422, { creditsCharged: settlement.creditsCharged });
      if (!(await saveBlueprint(user.id, current.id, current.version, next.blueprint))) return refuse("conflict", 409, { creditsCharged: settlement.creditsCharged });
      return NextResponse.json({ ok: true, build: screenBuild({ ...current, blueprint: next.blueprint, version: current.version + 1 }), changed: box, creditsCharged: settlement.creditsCharged });
    } catch (err) {
      if (!settled) await releaseReservation(user.id, reservationId);
      throw err;
    }
  } catch (err) {
    logApiError("/api/discord/plan", err);
    return refuse("failed", 500);
  }
}
