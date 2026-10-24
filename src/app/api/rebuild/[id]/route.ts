import { NextResponse } from "next/server";
import { anyProviderConfigured } from "@/lib/ai/providers/registry";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { rebuildGate } from "@/lib/rebuild/access";
import { chargedRebuildStep } from "@/lib/rebuild/charge";
import { changeApp, rewriteAppBox, writeApp } from "@/lib/rebuild/rebuild-call";
import { MAX_INSTRUCTION_CHARS, boxMessage, buildMessage, changeMessage, isRebuildBoxKind, readPlan, withBox } from "@/lib/rebuild/rebuild-plan";
import { rebuildSystemPrompt } from "@/lib/rebuild/rebuild-system";
import { pushAppVersion } from "@/lib/rebuild/rebuild-html";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // @function-limit 300

const COLUMNS = "id, title, plan, reference, html, versions, locale, updated_at";

/**
 * EVERYTHING DONE TO ONE APP AFTER ITS PLAN (Rebuild), one action per
 * request:
 *
 *   "box"     one box of the plan changed with words; every other box as it was
 *   "build"   the app written from the plan, checked, and kept as version 1
 *   "change"  the written app changed with words, kept as the next version
 *   "restore" an earlier version made the current one again — no model, no charge
 *
 * The app is read by id AND owner with the person's own client; it is
 * written with the service role, scoped by id AND owner, because the
 * account cannot write apps itself (20261027000000_rebuild_projects.sql).
 * A version that the check refused is never stored, and its step charges
 * nothing (lib/rebuild/charge.ts).
 */
type Action = "box" | "build" | "change" | "restore";
const isAction = (v: unknown): v is Action => v === "box" || v === "build" || v === "change" || v === "restore";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  const action = body.action;
  if (!isAction(action)) return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, MAX_INSTRUCTION_CHARS) : "";
  if ((action === "box" || action === "change") && !instruction) return NextResponse.json({ ok: false, code: "empty" }, { status: 400 });
  if (action === "box" && !isRebuildBoxKind(body.kind)) return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  const gate = await rebuildGate(user);

  try {
    const { data: project, error } = await supabase.from("rebuild_projects").select(COLUMNS).eq("id", params.id).eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!project) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    const plan = readPlan(project.plan);
    if (!plan) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    const locale = typeof project.locale === "string" ? project.locale : "en";
    const html = typeof project.html === "string" ? project.html : "";
    const reference = typeof (project.reference as { rendered?: unknown } | null)?.rendered === "string" ? (project.reference as { rendered: string }).rendered : null;
    const save = async (patch: Record<string, unknown>) =>
      createAdminClient()
        .from("rebuild_projects")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", params.id)
        .eq("user_id", user.id)
        .select(COLUMNS)
        .single();
    const answer = async (patch: Record<string, unknown>, creditsCharged: number) => {
      const { data: row, error: saveError } = await save(patch);
      if (saveError || !row) {
        logApiError("/api/rebuild/[id]", saveError, { action, stage: "save" });
        return NextResponse.json({ ok: false, code: "not_saved", creditsCharged }, { status: 500 });
      }
      return NextResponse.json({ ok: true, project: row, creditsCharged });
    };

    if (action === "restore") {
      const at = Number(body.version);
      const versions = Array.isArray(project.versions) ? (project.versions as { html: string; at: string; note: string }[]) : [];
      const chosen = Number.isInteger(at) ? versions[at] : undefined;
      if (!chosen || typeof chosen.html !== "string") return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
      return answer({ html: chosen.html, versions: pushAppVersion(versions, { html: chosen.html, at: new Date().toISOString(), note: "restore" }) }, 0);
    }

    if (!anyProviderConfigured(process.env)) return NextResponse.json({ ok: false, code: "not_configured" }, { status: 503 });

    if (action === "box") {
      const kind = body.kind as Parameters<typeof withBox>[1];
      const message = boxMessage(plan, kind, instruction, locale);
      const step = await chargedRebuildStep({
        user, gate, action: "rebuildBoxEdit", feature: "rebuild_edit",
        inputChars: rebuildSystemPrompt().length + message.length,
        fingerprint: `${params.id}:${kind}:${instruction}`, route: "/api/rebuild/[id]",
        metadata: { step: "box", kind, projectId: params.id },
        run: (costs) => rewriteAppBox({ plan, kind, instruction, locale, costs, userId: user.id, signal: request.signal }),
      });
      if (!step.ok) return step.response;
      return answer({ plan: withBox(plan, kind, step.value) }, step.creditsCharged);
    }

    if (action === "build") {
      const message = buildMessage(plan, locale, reference);
      const step = await chargedRebuildStep({
        user, gate, action: "rebuildBuild", feature: "rebuild_generate",
        inputChars: rebuildSystemPrompt().length + message.length,
        fingerprint: `${params.id}:build`, route: "/api/rebuild/[id]",
        metadata: { step: "build", projectId: params.id },
        run: (costs) => writeApp({ plan, locale, reference, costs, userId: user.id, signal: request.signal }),
      });
      if (!step.ok) return step.response;
      return answer({ html: step.value, versions: pushAppVersion(project.versions, { html: step.value, at: new Date().toISOString(), note: "build" }) }, step.creditsCharged);
    }

    // action === "change"
    if (!html) return NextResponse.json({ ok: false, code: "not_built" }, { status: 409 });
    const message = changeMessage(html, instruction, locale);
    const step = await chargedRebuildStep({
      user, gate, action: "rebuildChange", feature: "rebuild_edit",
      inputChars: rebuildSystemPrompt().length + message.length,
      fingerprint: `${params.id}:${instruction}`, route: "/api/rebuild/[id]",
      metadata: { step: "change", projectId: params.id, htmlChars: html.length },
      run: (costs) => changeApp({ html, instruction, locale, costs, userId: user.id, signal: request.signal }),
    });
    if (!step.ok) return step.response;
    return answer({ html: step.value, versions: pushAppVersion(project.versions, { html: step.value, at: new Date().toISOString(), note: instruction.slice(0, 120) }) }, step.creditsCharged);
  } catch (err) {
    logApiError("/api/rebuild/[id]", err, { action });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}

/** An app the person no longer wants: their own client, their own row. */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  const { error } = await supabase.from("rebuild_projects").delete().eq("id", params.id).eq("user_id", user.id);
  if (error) {
    logApiError("/api/rebuild/[id]", error, { action: "delete" });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
