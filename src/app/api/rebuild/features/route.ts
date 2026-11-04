import { NextResponse } from "next/server";
import { anyProviderConfigured } from "@/lib/ai/providers/registry";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { SUPPORTED_LOCALES } from "@/i18n/constants";
import { resolveLanguage } from "@/lib/text/resolve-language";
import { rebuildGate } from "@/lib/rebuild/access";
import { chargedRebuildStep } from "@/lib/rebuild/charge";
import { deriveFeatures } from "@/lib/rebuild/rebuild-call";
import { MAX_DESCRIPTION_CHARS } from "@/lib/rebuild/rebuild-plan";
import { featuresMessage } from "@/lib/rebuild/rebuild-features";
import { rebuildSystemPrompt } from "@/lib/rebuild/rebuild-system";
import { readReferencePage } from "@/lib/rebuild/reference";
import { firstUrl } from "@/lib/rebuild/structure";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // @function-limit 60

/**
 * REBUILD, Κομμάτι 2 (2026-10-29): «I want something like X» — the
 * CAPABILITIES such apps typically have, as a list the person can choose
 * from before anything is planned. Nothing is stored here: no project
 * exists yet (api/rebuild, unchanged, still creates the row), so this call
 * is read-only on the account's data and keeps no row of its own. The
 * person reviews, drops or edits the labels on the client; what they keep
 * is sent BACK to api/rebuild as `features`, which folds it into the SAME
 * plan call (rebuild-plan.ts's planMessage) as additional context.
 *
 * A page the person points at is read exactly as api/rebuild reads it —
 * same guard, same labels-only render — a SECOND time if they go on to
 * build: the server never trusts a client-supplied "reference" blob, it
 * always re-reads and re-verifies the page itself.
 */
export async function POST(request: Request) {
  if (!anyProviderConfigured(process.env)) return NextResponse.json({ ok: false, code: "not_configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) return NextResponse.json({ ok: false, code: "empty" }, { status: 400 });
  if (description.length > MAX_DESCRIPTION_CHARS) return NextResponse.json({ ok: false, code: "too_long", limit: MAX_DESCRIPTION_CHARS }, { status: 400 });
  const uiLocale = typeof body.locale === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(body.locale) ? body.locale : "en";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  const gate = await rebuildGate(user);

  try {
    // The Free plan's protection (one app kept) would mean nothing if a
    // second description still spent credits deriving capabilities for an
    // app api/rebuild would refuse anyway: the SAME cap, checked first.
    const { count, error: countError } = await supabase.from("rebuild_projects").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if (countError) throw countError;
    if ((count ?? 0) >= gate.cap) return NextResponse.json({ ok: false, code: "limit_reached", limit: gate.cap }, { status: 403 });

    const url = firstUrl(description);
    let reference: { url: string; host: string; rendered: string } | null = null;
    if (url) {
      const read = await readReferencePage(url);
      if (!read.ok) return NextResponse.json({ ok: false, code: "reference_failed", reason: read.reason }, { status: 422 });
      reference = { url, host: read.host, rendered: read.rendered };
    }

    const locale = resolveLanguage(description, uiLocale);
    const message = featuresMessage(description, locale, reference?.rendered);
    const step = await chargedRebuildStep({
      user,
      gate,
      action: "rebuildFeatures",
      feature: "rebuild_generate",
      inputChars: rebuildSystemPrompt().length + message.length,
      fingerprint: description,
      route: "/api/rebuild/features",
      metadata: { step: "features", descriptionChars: description.length, withReference: Boolean(reference) },
      run: (costs) => deriveFeatures({ description, locale, reference: reference?.rendered, costs, userId: user.id, signal: request.signal }),
    });
    if (!step.ok) return step.response;

    return NextResponse.json({ ok: true, features: step.value, reference, creditsCharged: step.creditsCharged });
  } catch (err) {
    logApiError("/api/rebuild/features", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
