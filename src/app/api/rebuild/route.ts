import { NextResponse } from "next/server";
import { anyProviderConfigured } from "@/lib/ai/providers/registry";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { SUPPORTED_LOCALES } from "@/i18n/constants";
import { resolveLanguage } from "@/lib/text/resolve-language";
import { rebuildGate } from "@/lib/rebuild/access";
import { chargedRebuildStep } from "@/lib/rebuild/charge";
import { planApp } from "@/lib/rebuild/rebuild-call";
import { MAX_DESCRIPTION_CHARS, planMessage } from "@/lib/rebuild/rebuild-plan";
import { rebuildSystemPrompt } from "@/lib/rebuild/rebuild-system";
import { readReferencePage } from "@/lib/rebuild/reference";
import { firstUrl } from "@/lib/rebuild/structure";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // @function-limit 120

/** What a client may be handed of a stored app: never another account's, never a column it need not see. */
export const REBUILD_COLUMNS = "id, title, plan, reference, html, versions, locale, updated_at";

/**
 * AN APP, PLANNED FROM A DESCRIPTION (Rebuild, the final All tools grid),
 * for everybody. The plan is four boxes — screens, data, actions, look —
 * and nothing is written yet: the person reads the plan, changes any box
 * with words, and only then has the app written (api/rebuild/[id], action
 * "build"), with its price on the button.
 *
 * A PAGE THE PERSON POINTED AT is read FIRST and BEFORE anything is held,
 * through the same address guard Connect uses (lib/rebuild/reference.ts →
 * lib/mcp/ssrf.ts), for its labels only; a page that cannot be read is
 * refused with the reason, and nothing is charged. What was read is DATA
 * for the planning call, fenced, never an instruction.
 *
 * The row is written with the service role, scoped to the caller: the
 * account reads and deletes its apps but cannot write one itself
 * (supabase/migrations/20261027000000_rebuild_projects.sql), so every
 * stored app went through lib/rebuild/rebuild-html.ts's check.
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
    const message = planMessage(description, locale, reference?.rendered);
    const step = await chargedRebuildStep({
      user,
      gate,
      action: "rebuildPlan",
      feature: "rebuild_generate",
      inputChars: rebuildSystemPrompt().length + message.length,
      fingerprint: description,
      route: "/api/rebuild",
      metadata: { step: "plan", descriptionChars: description.length, withReference: Boolean(reference) },
      run: (costs) => planApp({ description, locale, reference: reference?.rendered, costs, userId: user.id, signal: request.signal }),
    });
    if (!step.ok) return step.response;

    const { data: row, error } = await createAdminClient()
      .from("rebuild_projects")
      .insert({ user_id: user.id, title: step.value.title, description, locale, plan: step.value, reference })
      .select(REBUILD_COLUMNS)
      .single();
    if (error || !row) {
      logApiError("/api/rebuild", error, { stage: "save" });
      return NextResponse.json({ ok: false, code: "not_saved", creditsCharged: step.creditsCharged }, { status: 500 });
    }
    return NextResponse.json({ ok: true, project: row, creditsCharged: step.creditsCharged });
  } catch (err) {
    logApiError("/api/rebuild", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
