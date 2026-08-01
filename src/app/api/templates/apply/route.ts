import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceTemplate } from "@/lib/workspace-templates";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Applies a "Quick Start" template (see lib/workspace-templates.ts) —
// plain inserts through the caller's own RLS-scoped client, same as any
// other direct-insert module create. No credits charged: these are static
// demo rows, not AI generations, so the usual per-action cost doesn't
// apply (same reasoning /api/create's classifier and /api/modules/create's
// gated inserts use credits for — actual model calls — just doesn't hold
// here since no model is called).
export async function POST(request: Request) {
  try {
    let templateId: string;
    try {
      const body = await request.json();
      templateId = typeof body?.templateId === "string" ? body.templateId : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    const template = getWorkspaceTemplate(templateId);
    if (!template) {
      return NextResponse.json({ ok: false, error: "Unknown template." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    let appliedCount = 0;
    for (const entry of template.entries) {
      const { error } = await supabase
        .from(entry.table)
        .insert({ ...entry.payload, user_id: user.id });

      if (error) {
        logApiError("/api/templates/apply", error, { stage: "insert", table: entry.table });
        continue;
      }
      appliedCount += 1;
    }

    if (appliedCount === 0) {
      return NextResponse.json(
        { ok: false, error: "Could not apply the template. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, appliedCount, totalCount: template.entries.length });
  } catch (err) {
    logApiError("/api/templates/apply", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
