import { NextResponse } from "next/server";
import { anyProviderConfigured } from "@/lib/ai/providers/registry";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { appGate } from "@/lib/apps/app-access";
import { chargedAppStep } from "@/lib/apps/charge";
import { rewriteAppBox } from "@/lib/apps/app-call";
import { MAX_APP_INSTRUCTION_CHARS, boxInputChars, isAppBoxKind, readDefinition } from "@/lib/apps/app-plan";
import { appSystemPrompt } from "@/lib/apps/app-system";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // @function-limit 120

const SELECT = "id, title, definition, status, versions, locale, updated_at";

/**
 * ONE APP: change a box with words, or approve the plan (κομμάτι 2).
 * Behind the switch "apps-tool", like the route that plans it.
 *
 * A BOX CHANGE IS THE ONLY PAID ACTION HERE. Approving costs nothing —
 * it asks the model nothing, it only records that the person said yes,
 * which is what the later pieces build from.
 *
 * The row is read with the caller's own client, so RLS answers "is this
 * yours" rather than a check in this file
 * (supabase/migrations/20261030000000_user_apps.sql, select_own_user_apps),
 * and written with the service role because the account may not write
 * this table at all.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
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
  if (!(await isFeatureOn("apps-tool", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });

  const { data: row } = await supabase.from("user_apps").select(SELECT).eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!row) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
  const definition = readDefinition(row.definition);
  if (!definition) return NextResponse.json({ ok: false, code: "unusable" }, { status: 422 });

  const action = typeof body.action === "string" ? body.action : "";

  if (action === "approve") {
    const { data: saved, error } = await createAdminClient()
      .from("user_apps")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select(SELECT)
      .single();
    if (error || !saved) {
      logApiError("/api/apps/[id]", error, { stage: "approve" });
      return NextResponse.json({ ok: false, code: "not_saved" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, app: saved, creditsCharged: 0 });
  }

  if (action !== "box") return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });

  const kind = body.box;
  if (!isAppBoxKind(kind)) return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) return NextResponse.json({ ok: false, code: "empty" }, { status: 400 });
  if (instruction.length > MAX_APP_INSTRUCTION_CHARS) return NextResponse.json({ ok: false, code: "too_long", limit: MAX_APP_INSTRUCTION_CHARS }, { status: 400 });

  const gate = await appGate(user);
  if (!gate.ok) return NextResponse.json({ ok: false, code: gate.code }, { status: 403 });
  if (!anyProviderConfigured(process.env)) return NextResponse.json({ ok: false, code: "not_configured" }, { status: 503 });

  try {
    const step = await chargedAppStep({
      user,
      gate,
      action: "appBoxEdit",
      inputChars: boxInputChars(appSystemPrompt().length, definition, instruction.length),
      fingerprint: `${id}:${kind}:${instruction}`,
      route: "/api/apps/[id]",
      metadata: { step: "box", box: kind },
      run: (costs) => rewriteAppBox({ definition, kind, instruction, locale: row.locale, costs, userId: user.id, signal: request.signal }),
    });
    if (!step.ok) return step.response;

    const { data: saved, error } = await createAdminClient()
      .from("user_apps")
      .update({ definition: step.value.definition, title: step.value.definition.title, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select(SELECT)
      .single();
    if (error || !saved) {
      logApiError("/api/apps/[id]", error, { stage: "save" });
      return NextResponse.json({ ok: false, code: "not_saved", creditsCharged: step.creditsCharged }, { status: 500 });
    }
    // `dropped` is what a change to the data box took with it — a screen
    // whose collection is gone cannot stay, and the person is told by
    // name rather than finding it missing later.
    return NextResponse.json({ ok: true, app: saved, dropped: step.value.dropped, creditsCharged: step.creditsCharged });
  } catch (err) {
    logApiError("/api/apps/[id]", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  // Deleting is the account's own right under RLS (delete_own_user_apps),
  // so this runs on the caller's client and needs no service role.
  const { error } = await supabase.from("user_apps").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    logApiError("/api/apps/[id]", error, { stage: "delete" });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
