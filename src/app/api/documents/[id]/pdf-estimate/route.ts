import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { getPurchasedPackCreditPriceEur, resolveEffectivePlan } from "@/lib/billing/credits";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { htmlToBlocks } from "@/lib/pdf/blocks";
import { resolveLanguage } from "@/lib/text/resolve-language";
import {
  MAX_TRANSLATION_CHARS,
  TRANSLATION_MODEL,
  isSupportedTargetLocale,
  needsTranslation,
  translationInput,
  translationSystemPrompt,
} from "@/lib/documents/translation";

export const dynamic = "force-dynamic";

/**
 * WHAT A TRANSLATED DOWNLOAD WILL COST, before anybody presses download.
 *
 * V4.6: "if it translates, it charges — say so BEFORE, with the amount."
 * The dialog calls this when a language is chosen and shows the number
 * it returns. The number is produced by the same estimator the PDF route
 * reserves against (estimateForAction, "documentTranslate"), on the same
 * input, so what is quoted and what is held cannot disagree.
 *
 * Read under the user's own session, so RLS decides whether the document
 * may be priced at all. No model call, no charge, no side effect.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });

  const lang = new URL(request.url).searchParams.get("lang");
  if (lang !== null && !isSupportedTargetLocale(lang)) {
    return NextResponse.json({ ok: false, error: "unsupported_language" }, { status: 400 });
  }

  try {
    const { data: doc, error } = await supabase
      .from("user_documents")
      .select("title, content")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!doc) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const html = typeof doc.content?.html === "string" ? doc.content.html : "";
    const title = String(doc.title ?? "").trim() || "Untitled";
    const blocks = htmlToBlocks(html);
    const detectedLocale = resolveLanguage(
      `${title} ${blocks.map((b) => ("runs" in b ? b.runs.map((r) => r.text).join(" ") : "")).join(" ")}`,
      "en"
    );
    const chars = html.length;

    if (lang === null || !needsTranslation(detectedLocale, lang)) {
      return NextResponse.json({ ok: true, detectedLocale, chars, needsTranslation: false, estimatedCredits: 0, bypass: false });
    }
    if (chars > MAX_TRANSLATION_CHARS) {
      return NextResponse.json({
        ok: true,
        detectedLocale,
        chars,
        needsTranslation: true,
        tooLong: true,
        limit: MAX_TRANSLATION_CHARS,
        estimatedCredits: null,
        bypass: false,
      });
    }

    const isAdmin = isAdminEmail(user.email);
    const bypass = isAdmin || (await hasActiveBetaBypass(user));
    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const estimate = estimateForAction(
      "documentTranslate",
      {
        model: TRANSLATION_MODEL,
        inputChars: translationSystemPrompt(lang).length + translationInput(title, html).length,
        planSlug: plan?.slug ?? null,
      },
      pricingConfig,
      plan
        ? effectiveCreditPriceEurForAccount(plan, await getPurchasedPackCreditPriceEur(user.id), pricingConfig)
        : undefined
    );

    return NextResponse.json({
      ok: true,
      detectedLocale,
      chars,
      needsTranslation: true,
      estimatedCredits: estimate.estimatedCredits,
      reserveCredits: estimate.reserveCredits,
      bypass,
    });
  } catch (err) {
    logApiError("/api/documents/[id]/pdf-estimate", err);
    return NextResponse.json({ ok: false, error: "estimate_failed" }, { status: 500 });
  }
}
