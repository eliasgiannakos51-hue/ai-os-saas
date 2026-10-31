import { NextResponse } from "next/server";
import { anyProviderConfigured } from "@/lib/ai/providers/registry";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { rebuildGate } from "@/lib/rebuild/access";
import { chargedRebuildStep } from "@/lib/rebuild/charge";
import { changeApp, planAppLogic, rewriteAppBox, writeApp } from "@/lib/rebuild/rebuild-call";
import { MAX_INSTRUCTION_CHARS, boxMessage, buildMessage, changeMessage, isRebuildBoxKind, planText, readPlan, withBox } from "@/lib/rebuild/rebuild-plan";
import { rebuildSystemPrompt } from "@/lib/rebuild/rebuild-system";
import { pushAppVersion, checkAppHtml } from "@/lib/rebuild/rebuild-html";
import { readDefinition } from "@/lib/apps/app-plan";
import { appSystemPrompt } from "@/lib/apps/app-system";
import { validateSubdomain } from "@/lib/publishing/subdomain";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // @function-limit 300

const COLUMNS = "id, title, plan, reference, html, versions, locale, has_app_phase, app_definition, subdomain, is_active, published_at, updated_at";

/**
 * EVERYTHING DONE TO ONE APP AFTER ITS PLAN (Rebuild), one action per
 * request:
 *
 *   "appLogic" Κομμάτι 3's first phase, only for a plan with has_app_phase:
 *              Apps' own planner (lib/apps/app-call.ts), called as a
 *              library, saves its structured definition on THIS row —
 *              never a separate Apps project, never Apps' ready flag.
 *   "box"     one box of the plan changed with words; every other box as it was
 *   "build"   the app written from the plan (folding in app_definition
 *             when the phase above has run), checked, kept as version 1
 *   "change"  the written app changed with words, kept as the next version
 *   "restore" an earlier version made the current one again — no model, no charge
 *   "publish" the built app gets its own address, /a/<subdomain> (Κομμάτι 4's
 *             third piece) — no model call, no charge: the bytes already
 *             exist and already passed the check once, this only makes
 *             them reachable. Re-checked here anyway (checkAppHtml again,
 *             fail-closed) because this is the moment it starts being
 *             served to a stranger with no session, same reasoning as
 *             api/websites/[id]/publish's own pre-publish scan.
 *   "unpublish" is_active off; the row and its subdomain are KEPT, so a
 *             later re-publish restores the same address and every link
 *             that was ever shared — same reversible rule published_sites
 *             already uses.
 *
 * The app is read by id AND owner with the person's own client; it is
 * written with the service role, scoped by id AND owner, because the
 * account cannot write apps itself (20261027000000_rebuild_projects.sql).
 * A version that the check refused is never stored, and its step charges
 * nothing (lib/rebuild/charge.ts).
 */
type Action = "appLogic" | "box" | "build" | "change" | "restore" | "publish" | "unpublish";
const isAction = (v: unknown): v is Action =>
  v === "appLogic" || v === "box" || v === "build" || v === "change" || v === "restore" || v === "publish" || v === "unpublish";

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
    const hasAppPhase = project.has_app_phase === true;
    const appDefinition = readDefinition(project.app_definition);
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

    // Κομμάτι 4's third piece: the app's own address. No model call, no
    // charge — the bytes already exist and were already checked once;
    // this only makes them reachable. Re-checked fail-closed anyway:
    // the moment it starts being served with no session at all is worth
    // paying the check's cost a second time, same reasoning as
    // api/websites/[id]/publish's own pre-publish scan.
    if (action === "publish") {
      if (!html) return NextResponse.json({ ok: false, code: "not_built" }, { status: 409 });
      const recheck = checkAppHtml(html);
      if (!recheck.ok) return NextResponse.json({ ok: false, code: "unusable", reason: recheck.reason }, { status: 422 });

      const existingSubdomain = typeof project.subdomain === "string" ? project.subdomain : null;
      const wanted = typeof body.subdomain === "string" && body.subdomain.trim() ? body.subdomain : existingSubdomain;
      const check = validateSubdomain(wanted);
      if (!check.ok) return NextResponse.json({ ok: false, code: "invalid_subdomain", reason: check.reason, error: check.message }, { status: 400 });

      if (check.subdomain !== existingSubdomain) {
        // Same limitation as published_sites' own subdomainTaken: RLS
        // means this can only ever confirm the address is free FOR THIS
        // caller, never enumerate the platform's addresses — the unique
        // index below is the real arbiter.
        const { data: ownClash } = await supabase.from("rebuild_projects").select("id").eq("subdomain", check.subdomain).neq("id", params.id).limit(1);
        if (ownClash && ownClash.length > 0) return NextResponse.json({ ok: false, code: "taken" }, { status: 409 });
      }

      const { data: row, error: saveError } = await save({
        subdomain: check.subdomain,
        is_active: true,
        published_at: project.published_at ?? new Date().toISOString(),
      });
      if (saveError || !row) {
        if (saveError && /duplicate key|unique/i.test(saveError.message)) {
          return NextResponse.json({ ok: false, code: "taken" }, { status: 409 });
        }
        logApiError("/api/rebuild/[id]", saveError, { action, stage: "publish" });
        return NextResponse.json({ ok: false, code: "not_saved" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, project: row, creditsCharged: 0 });
    }

    // The row and its subdomain are KEPT — only is_active changes — so a
    // later re-publish restores the same address and every link that
    // was ever shared, the same reversible rule published_sites uses.
    if (action === "unpublish") {
      if (!project.subdomain) return NextResponse.json({ ok: false, code: "not_published" }, { status: 404 });
      return answer({ is_active: false }, 0);
    }

    if (!anyProviderConfigured(process.env)) return NextResponse.json({ ok: false, code: "not_configured" }, { status: 503 });

    if (action === "appLogic") {
      if (!hasAppPhase) return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });
      const description = planText(plan);
      const step = await chargedRebuildStep({
        user, gate, action: "rebuildAppLogic", feature: "rebuild_generate",
        inputChars: appSystemPrompt().length + description.length,
        fingerprint: `${params.id}:appLogic`, route: "/api/rebuild/[id]",
        metadata: { step: "appLogic", projectId: params.id },
        run: (costs) => planAppLogic({ description, locale, costs, userId: user.id, signal: request.signal }),
      });
      if (!step.ok) return step.response;
      return answer({ app_definition: step.value }, step.creditsCharged);
    }

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
      const message = buildMessage(plan, locale, reference, appDefinition);
      const step = await chargedRebuildStep({
        user, gate, action: "rebuildBuild", feature: "rebuild_generate",
        inputChars: rebuildSystemPrompt().length + message.length,
        fingerprint: `${params.id}:build`, route: "/api/rebuild/[id]",
        metadata: { step: "build", projectId: params.id, withAppDefinition: Boolean(appDefinition) },
        run: (costs) => writeApp({ plan, locale, reference, appDefinition, costs, userId: user.id, signal: request.signal }),
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
