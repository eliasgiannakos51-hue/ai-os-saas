import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isFeatureOn } from "@/lib/flags/flags";
import { loadMyStuff } from "@/lib/my-stuff/load";
import { isMyStuffKind } from "@/lib/my-stuff/sources";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * «ΑΝΑΖΗΤΗΣΗ ΚΑΙ ΦΙΛΤΡΟ ΑΝΑ ΕΙΔΟΣ, ΓΙΑ ΟΠΟΙΟΝ ΘΕΛΕΙ ΝΑ ΨΑΞΕΙ ΜΟΝΟΣ» — the
 * plain, non-AI browse mode the shell's work panel calls, built on the
 * exact same loadMyStuff() the SSR page could call itself; a GET route
 * exists only because the panel that shows it is a client component
 * toggled inside ToolShell's `work`, not its own page. No AI call, no
 * credits: this is a read over the caller's own RLS-scoped rows.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  if (!(await isFeatureOn("my-stuff", user))) return NextResponse.json({ error: "not_enabled" }, { status: 404 });

  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  const kind = isMyStuffKind(kindParam) ? kindParam : null;
  const query = (url.searchParams.get("q") ?? "").slice(0, 200);

  const { items, failed } = await loadMyStuff(supabase, user.id, { kind, query });
  return NextResponse.json({ ok: true, items, failed });
}
