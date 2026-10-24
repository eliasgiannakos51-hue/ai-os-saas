import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { allowExport } from "@/lib/export-guard";
import { downloadName, sealApp } from "@/lib/rebuild/rebuild-html";

export const dynamic = "force-dynamic";

/**
 * THE APP, DOWNLOADED (Rebuild): one HTML file that works when opened on
 * the person's own machine, sealed the way it is shown
 * (lib/rebuild/rebuild-html.ts sealApp). A file of what is already the
 * person's, so free — bounded by lib/export-guard.ts like every other
 * download of that kind. Read by id AND owner with the person's own client.
 */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  if (!(await allowExport(user.id))) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });
  try {
    const { data: app, error } = await supabase.from("rebuild_projects").select("title, html").eq("id", params.id).eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!app || typeof app.html !== "string" || !app.html) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    const name = downloadName(app.title);
    return new NextResponse(sealApp(app.html), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="app.html"; filename*=UTF-8''${encodeURIComponent(name)}.html`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    logApiError("/api/rebuild/[id]/download", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
