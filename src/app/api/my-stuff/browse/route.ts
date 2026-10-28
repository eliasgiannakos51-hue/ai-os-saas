import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadMyStuff } from "@/lib/my-stuff/load";
import { isMyStuffKind, type MyStuffKind } from "@/lib/my-stuff/sources";
import { IN_PROJECT, isUuid, projectEdgeFilter, projectMembers } from "@/lib/projects/project";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * «ΑΝΑΖΗΤΗΣΗ ΚΑΙ ΦΙΛΤΡΟ ΑΝΑ ΕΙΔΟΣ, ΓΙΑ ΟΠΟΙΟΝ ΘΕΛΕΙ ΝΑ ΨΑΞΕΙ ΜΟΝΟΣ» — the
 * plain, non-AI browse mode the shell's work panel calls, built on the
 * exact same loadMyStuff() the SSR page could call itself; a GET route
 * exists only because the panel that shows it is a client component
 * toggled inside ToolShell's `work`, not its own page. No AI call, no
 * credits: this is a read over the caller's own RLS-scoped rows.
 *
 * KΟΜΜΑΤΙ 3 (2026-10-28) adds two more query params, both optional:
 *
 * `kind` MAY NOW REPEAT — a bucket chip (buckets.ts) is several kinds at
 * once ("Documents" alone is five), so the filter row sends one `kind=`
 * per kind in the bucket rather than inventing a second param name.
 * ABSENT ENTIRELY still means "every kind", unchanged from Κομμάτι 1 —
 * but PRESENT-WITH-NOTHING-VALID (the Video/Audio buckets, which are
 * real, honestly-empty kind lists) must NOT collapse to the same thing,
 * so presence is read with `.has()`, not "did anything survive the
 * isMyStuffKind filter".
 *
 * `project`, A PROJECT ID, FILTERS BY MEMBERSHIP AFTER THE FACT — the
 * same `entity_links` read src/app/dashboard/projects/[id]/page.tsx
 * already does (projectEdgeFilter/projectMembers, lib/projects/project.ts),
 * through this same RLS-scoped client, intersected against the items
 * loadMyStuff already returned by their own `${table}:${id}` key (the
 * identical shape projectMembers() builds its own keys from). An invalid
 * id is ignored rather than erroring — this is a convenience filter, not
 * a security boundary; RLS already stands behind every row either way.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const url = new URL(request.url);
  const kinds = url.searchParams.has("kind") ? (url.searchParams.getAll("kind").filter(isMyStuffKind) as MyStuffKind[]) : null;
  const query = (url.searchParams.get("q") ?? "").slice(0, 200);
  const projectId = url.searchParams.get("project");

  const { items, failed } = await loadMyStuff(supabase, user.id, { kinds, query });

  if (projectId && isUuid(projectId)) {
    const { data: edgeRows } = await supabase
      .from("entity_links")
      .select("source_table, source_id, target_table, target_id, relationship_type")
      .eq("relationship_type", IN_PROJECT)
      .or(projectEdgeFilter(projectId))
      .limit(500);
    const memberKeys = new Set(projectMembers(edgeRows ?? [], projectId).map((m) => `${m.table}:${m.id}`));
    return NextResponse.json({ ok: true, items: items.filter((item) => memberKeys.has(item.key)), failed });
  }

  return NextResponse.json({ ok: true, items, failed });
}
