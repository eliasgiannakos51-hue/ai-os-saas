import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMyStuffKind, sourceForKind } from "@/lib/my-stuff/sources";
import { loadLinkedEntities, type LinkedEntity } from "@/lib/entity-links";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * «1. MY STUFF: ΝΕΑ ΟΘΟΝΗ», Κομμάτι 4 (the owner's message, 2026-10-28) —
 * the two things the details pane cannot already have from `MyStuffItem`
 * alone: "Used in" (what links to/from this record) and "Made from"
 * (what it was generated from), fetched only once something is actually
 * selected — the same lazy, on-demand shape Κομμάτι 2's ask already uses,
 * rather than paying for every one of up to 200 rows on every page load.
 *
 * "USED IN" IS lib/entity-links.ts's OWN loadLinkedEntities(), the exact
 * bidirectional read the 20-odd classic module pages already call — My
 * Stuff did not have its own concept of this and does not invent one.
 *
 * "MADE FROM" IS NARROW, ON PURPOSE. No table in this product records a
 * general "made from" pointer (checked every generation route — posts,
 * images, slides, sites, analyses — none of them). The one real,
 * persisted exception is research_reports.document_id, set when a
 * research report is saved into Documents — so a `document` row CAN
 * honestly say what research it came from; every other kind reports
 * `madeFrom: null` rather than a guess.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id");
  if (!isMyStuffKind(kind) || !id) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const source = sourceForKind(kind);
  if (!source) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const byRecord = await loadLinkedEntities(supabase, user.id, source.table, [id]);
  const usedIn: LinkedEntity[] = byRecord[id] ?? [];

  let madeFrom: { title: string; href: string } | null = null;
  if (kind === "document") {
    const { data } = await supabase
      .from("research_reports")
      .select("id, topic")
      .eq("document_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    const research = sourceForKind("research");
    if (data && research) {
      madeFrom = { title: String(data.topic ?? ""), href: research.hrefFor(String(data.id)) };
    }
  }

  return NextResponse.json({ ok: true, usedIn, madeFrom });
}
