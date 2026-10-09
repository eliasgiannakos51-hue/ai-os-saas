import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { isFeatureOn } from "@/lib/flags/flags";
import { accountHasCapability } from "@/lib/billing/capability-gate";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { getPurchasedPackCreditPriceEur, hasEnoughCredits, insufficientCreditsMessage, resolveEffectivePlan, resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { releaseReservation, reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { isSupportedTargetLocale } from "@/lib/documents/translation";
import { FAIR_USE_WINDOW_MS, MAX_GENERATIONS_PER_DAY } from "@/lib/website-generation-limits";
import { MAX_TRANSLATE_CHARS, TRANSLATE_MODEL, textChars, translateInputChars } from "@/lib/translate/translate-prompt";
import { planDocument, planSite } from "@/lib/translate/sources";
import { translatePieces } from "@/lib/translate/translate-call";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // @function-limit 300

/**
 * A SITE OR A DOCUMENT IN ANOTHER LANGUAGE, IN THE SAME FORM (MASTER 16,
 * package 28), behind the switch "translate".
 *
 * GET is the price, POST is the translation. Both build the same pieces
 * (lib/translate/sources.ts) and the same messages
 * (lib/translate/translate-prompt.ts), so the number on screen and the
 * number held are one number.
 *
 * THE ORIGINAL IS NEVER CHANGED. The translation is a NEW site or a NEW
 * document beside it, named for its language. A site is written with the
 * service role, scoped to the caller, because the account cannot insert
 * sites itself (20261015000000_agents_websites_server_written.sql); a
 * document through the person's own client, as every document is.
 *
 * It charges like the PDF translation it grew out of (action
 * "documentTranslate", feature "document_translate"): the same model, the
 * same kind of work, the same margin. A copy of a site needs the plan that
 * includes the Site (websiteBuilder), and counts against the Site's daily
 * fair-use cap, because it is one more site.
 */
type Kind = "site" | "document";
const isKind = (v: unknown): v is Kind => v === "site" || v === "document";
const ID_SHAPE = /^[0-9a-f-]{36}$/i;

type Loaded =
  | { ok: true; kind: "site"; row: { id: string; name: string; description: string | null; html_content: string; pages: unknown }; plan: ReturnType<typeof planSite> }
  | { ok: true; kind: "document"; row: { id: string; title: string; content: Record<string, unknown> | null }; plan: ReturnType<typeof planDocument> }
  | { ok: false; response: NextResponse };

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The switch, the thing itself (the caller's own), and for a site the plan. */
async function load(supabase: Supabase, user: User, kind: Kind, id: string): Promise<Loaded> {
  if (!(await isFeatureOn("translate", user))) return { ok: false, response: NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 }) };
  if (kind === "site") {
    if (!accountHasCapability(await resolveEffectivePlanSlug(user), "websiteBuilder", isAdminEmail(user.email))) {
      return { ok: false, response: NextResponse.json({ ok: false, code: "not_included" }, { status: 403 }) };
    }
    const { data, error } = await supabase
      .from("user_websites")
      .select("id, name, description, html_content, pages, status")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, response: NextResponse.json({ ok: false, code: "not_found" }, { status: 404 }) };
    if (data.status !== "completed" || !String(data.html_content ?? "").trim()) {
      return { ok: false, response: NextResponse.json({ ok: false, code: "not_ready" }, { status: 409 }) };
    }
    const row = { id: String(data.id), name: String(data.name ?? ""), description: (data.description as string | null) ?? null, html_content: String(data.html_content), pages: data.pages };
    return { ok: true, kind, row, plan: planSite(row) };
  }
  const { data, error } = await supabase.from("user_documents").select("id, title, content").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, response: NextResponse.json({ ok: false, code: "not_found" }, { status: 404 }) };
  const content = (data.content as Record<string, unknown> | null) ?? null;
  const row = { id: String(data.id), title: String(data.title ?? ""), content };
  return { ok: true, kind, row, plan: planDocument({ title: row.title, html: typeof content?.html === "string" ? content.html : "" }) };
}

/** What stops a translation before any price: same language, nothing to say, too long. */
function refusal(loaded: Extract<Loaded, { ok: true }>, target: string): { code: string; status: number; chars?: number; limit?: number } | null {
  if (loaded.plan.pieces.length === 0) return { code: "nothing_to_translate", status: 400 };
  if (loaded.plan.from === target) return { code: "same_language", status: 400 };
  const chars = textChars(loaded.plan.pieces);
  if (chars > MAX_TRANSLATE_CHARS) return { code: "too_long", status: 413, chars, limit: MAX_TRANSLATE_CHARS };
  return null;
}

async function priceFor(user: User, inputChars: number) {
  const plan = await resolveEffectivePlan(user);
  const pricingConfig = resolvePricingConfig();
  const estimate = estimateForAction(
    "documentTranslate",
    { model: TRANSLATE_MODEL, inputChars, planSlug: plan?.slug ?? null },
    pricingConfig,
    plan ? effectiveCreditPriceEurForAccount(plan, await getPurchasedPackCreditPriceEur(user.id), pricingConfig) : undefined
  );
  return { plan, estimate };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id") ?? "";
  const target = url.searchParams.get("target");
  if (!isKind(kind) || !ID_SHAPE.test(id) || !isSupportedTargetLocale(target)) return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });

  try {
    const loaded = await load(supabase, user, kind, id);
    if (!loaded.ok) return loaded.response;
    const refused = refusal(loaded, target);
    const base = { ok: true, from: loaded.plan.from, pieces: loaded.plan.pieces.length, chars: textChars(loaded.plan.pieces) };
    if (refused) return NextResponse.json({ ...base, refused: refused.code, limit: refused.limit ?? null, estimatedCredits: null });
    const bypass = isAdminEmail(user.email) || (await hasActiveBetaBypass(user));
    const { estimate } = await priceFor(user, translateInputChars(loaded.plan.pieces, target));
    return NextResponse.json({ ...base, refused: null, estimatedCredits: estimate.estimatedCredits, reserveCredits: estimate.reserveCredits, bypass });
  } catch (err) {
    logApiError("/api/translate", err, { stage: "estimate" });
    return NextResponse.json({ ok: false, code: "estimate_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  const kind = body.kind;
  const id = typeof body.id === "string" ? body.id : "";
  const target = body.target;
  if (!isKind(kind) || !ID_SHAPE.test(id) || !isSupportedTargetLocale(target)) return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, code: "not_configured" }, { status: 503 });

  try {
    const loaded = await load(supabase, user, kind, id);
    if (!loaded.ok) return loaded.response;
    const refused = refusal(loaded, target);
    if (refused) return NextResponse.json({ ok: false, code: refused.code, chars: refused.chars, limit: refused.limit }, { status: refused.status });

    // ONE MORE SITE: the Site's own daily cap, counted the way it counts.
    if (kind === "site") {
      const { count } = await supabase
        .from("user_websites")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", new Date(Date.now() - FAIR_USE_WINDOW_MS).toISOString());
      if ((count ?? 0) >= MAX_GENERATIONS_PER_DAY) return NextResponse.json({ ok: false, code: "daily_limit" }, { status: 429 });
    }

    const breaker = await checkAiCallAllowed(user.id, "document_translate", fingerprintRequest(`${kind}:${id}`, target));
    if (!breaker.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
    const isAdmin = isAdminEmail(user.email);
    const isBeta = await hasActiveBetaBypass(user);
    const bypass = isAdmin || isBeta;
    if (bypass) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, isBeta);
      if (!ceiling.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
    }

    const pieces = loaded.plan.pieces;
    const { plan, estimate } = await priceFor(user, translateInputChars(pieces, target));
    let reservationId = "";
    if (!bypass && plan) {
      const enough = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!enough.ok) {
        return NextResponse.json({ ok: false, code: "insufficient_credits", detail: insufficientCreditsMessage(enough.remaining, estimate.reserveCredits) }, { status: 402 });
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "document_translate", { kind, id, target, pieces: pieces.length });
      if (!reservation.ok) return NextResponse.json({ ok: false, code: "insufficient_credits" }, { status: 402 });
      reservationId = reservation.reservationId;
    }

    const costs = new CostAccumulator();
    void recordAiCallForDailySpend(estimate.estimatedCredits);
    const outcome = await translatePieces({ apiKey, pieces, target, costs, signal: request.signal });
    if (!outcome.ok) {
      await releaseReservation(user.id, reservationId);
      if (outcome.kind === "aborted") return NextResponse.json({ ok: false, code: "stopped" }, { status: 499 });
      logApiError("/api/translate", new Error(outcome.detail), { kind, stage: "translate" });
      return NextResponse.json({ ok: false, code: "ai_unavailable" }, { status: 503 });
    }

    const settle = (metadata: Record<string, unknown>) =>
      settleReservation({ userId: user.id, reservationId, feature: "document_translate", costs, plan, bypassCharge: bypass, metadata: { kind, id, from: loaded.plan.from, to: target, ...metadata } });

    // Nothing came back usable: the tokens were spent, and nothing is written.
    if (outcome.unanswered >= pieces.length) {
      const settlement = await settle({ outcome: "unusable" });
      return NextResponse.json({ ok: false, code: "unusable", creditsCharged: settlement.creditsCharged }, { status: 502 });
    }

    if (loaded.kind === "site") {
      const site = loaded.plan.rebuild(outcome.value, target);
      const settlement = await settle({ pieces: pieces.length, kept: site.kept });
      const { data: record, error } = await createAdminClient()
        .from("user_websites")
        .insert({ user_id: user.id, name: site.name, description: loaded.row.description, html_content: site.html_content, pages: site.pages, status: "completed" })
        .select("*")
        .single();
      if (error || !record) {
        logApiError("/api/translate", error, { kind, stage: "save" });
        return NextResponse.json({ ok: false, code: "not_saved", creditsCharged: settlement.creditsCharged }, { status: 500 });
      }
      return NextResponse.json({ ok: true, kind, id: record.id, name: site.name, record, kept: site.kept, pieces: pieces.length, from: loaded.plan.from, target, creditsCharged: settlement.creditsCharged });
    }

    const doc = loaded.plan.rebuild(outcome.value, target);
    const settlement = await settle({ pieces: pieces.length, kept: doc.kept });
    const source = loaded.row.content?.source;
    const { data: row, error } = await supabase
      .from("user_documents")
      .insert({ user_id: user.id, title: doc.title, content: { html: doc.html, ...(typeof source === "string" ? { source } : {}), locale: target, translatedFrom: loaded.row.id } })
      .select("id")
      .single();
    if (error || !row) {
      logApiError("/api/translate", error, { kind, stage: "save" });
      return NextResponse.json({ ok: false, code: "not_saved", creditsCharged: settlement.creditsCharged }, { status: 500 });
    }
    return NextResponse.json({ ok: true, kind, id: row.id, name: doc.title, kept: doc.kept, pieces: pieces.length, from: loaded.plan.from, target, creditsCharged: settlement.creditsCharged });
  } catch (err) {
    logApiError("/api/translate", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
