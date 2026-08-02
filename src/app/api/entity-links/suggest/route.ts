import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { suggestEntityLinks } from "@/lib/entity-link-suggestions";
import { isLinkableTable } from "@/lib/knowledge-graph";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Knowledge Graph "Smart Search" — called right after a new record is
// created (see suggested-links-prompt.tsx). Pure keyword matching, no AI
// call, so no credit cost (same as the rest of the Knowledge Graph's
// reads — entity_links itself is free to create/browse too).
export async function POST(request: Request) {
  try {
    let sourceTable: string;
    let sourceId: string;
    try {
      const body = await request.json();
      sourceTable = typeof body?.sourceTable === "string" ? body.sourceTable : "";
      sourceId = typeof body?.sourceId === "string" ? body.sourceId : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!sourceTable || !sourceId || !isLinkableTable(sourceTable)) {
      return NextResponse.json({ ok: false, error: "Invalid source." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const suggestions = await suggestEntityLinks(supabase, sourceTable, sourceId);
    return NextResponse.json({ ok: true, suggestions });
  } catch (err) {
    logApiError("/api/entity-links/suggest", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong." },
      { status: 500 }
    );
  }
}
