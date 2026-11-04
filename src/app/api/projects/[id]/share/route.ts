import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * SHARE: A READ-ONLY LINK TO A PROJECT, REVOKED WITH ONE PRESS (Projects
 * Κομμάτι 7, owner's message 2026-10-28).
 *
 * POST makes a NEW token every time — pressing Share again after a
 * revoke is a fresh link, never the old one back. DELETE clears it. Both
 * use the person's own client, same as PATCH in api/projects/[id]/route.ts
 * beside this file: UPDATE on `projects` is still row-scoped by
 * `projects_update_own` (20261001000000_projects.sql), so the
 * `.eq("user_id", user.id)` here is belt-and-braces on the same verb as
 * that route, not the only thing stopping a cross-account write.
 *
 * randomBytes(24).toString("base64url") — 32 URL-safe characters, pasted
 * into a link rather than typed by hand, so this does NOT reuse
 * lib/affiliate/rules.ts's codeFromBytes (that alphabet exists to be
 * SAID and TYPED; a share token is neither).
 *
 * The public page this resolves, src/app/shared/[token]/page.tsx, reads
 * by this token alone, with no session — see that file for why it uses
 * the admin client and selects only what a stranger may see.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });

  try {
    const token = randomBytes(24).toString("base64url");
    const { data, error } = await supabase
      .from("projects")
      .update({ share_token: token, share_token_created_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("share_token")
      .maybeSingle();
    if (error) {
      logApiError("/api/projects/[id]/share", error, { stage: "update" });
      return NextResponse.json({ ok: false, code: "save_failed" }, { status: 500 });
    }
    if (!data?.share_token) return NextResponse.json({ ok: false, code: "no_such_project" }, { status: 404 });
    return NextResponse.json({ ok: true, token: data.share_token, url: `${getSiteUrl()}/shared/${data.share_token}` });
  } catch (err) {
    logApiError("/api/projects/[id]/share", err);
    return NextResponse.json({ ok: false, code: "save_failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });

  try {
    const { data, error } = await supabase
      .from("projects")
      .update({ share_token: null, share_token_created_at: null })
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) {
      logApiError("/api/projects/[id]/share", error, { stage: "revoke" });
      return NextResponse.json({ ok: false, code: "save_failed" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ ok: false, code: "no_such_project" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/projects/[id]/share", err);
    return NextResponse.json({ ok: false, code: "save_failed" }, { status: 500 });
  }
}
