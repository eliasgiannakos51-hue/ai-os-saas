import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { REFERENCE_IMAGE_BUCKET } from "@/lib/website-reference-image";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { storageLimitBytes, summariseStorage } from "@/lib/websites/storage-quota";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * How much of their own photography this account is holding.
 *
 * Read through the CALLER'S OWN client, so Storage RLS scopes the listing
 * to their folder — an admin client here would be a way to ask about
 * somebody else's uploads by changing a parameter.
 *
 * The folder is the user's id, which is the same convention every other
 * owner-scoped resource in this app uses (see
 * lib/website-reference-image.ts).
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

  const plan = await resolveEffectivePlan(user);
  const limitBytes = storageLimitBytes(plan);

  try {
    // Storage list() is paged. A user with more files than one page is
    // exactly the user this endpoint exists for, so reading one page and
    // reporting the total would understate the account that matters.
    let usedBytes = 0;
    const PAGE = 100;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase.storage
        .from(REFERENCE_IMAGE_BUCKET)
        .list(user.id, { limit: PAGE, offset });
      if (error) throw error;
      const files = data ?? [];
      for (const file of files) {
        const size = Number((file.metadata as { size?: unknown } | null)?.size ?? 0);
        if (Number.isFinite(size) && size > 0) usedBytes += size;
      }
      if (files.length < PAGE) break;
      // A bound, so a listing that never returns a short page cannot spin.
      if (offset > 10_000) break;
    }

    return NextResponse.json({ ok: true, usage: summariseStorage(usedBytes, limitBytes) });
  } catch (err) {
    logApiError("/api/websites/storage-usage", err, { stage: "list" });
    // FAILS OPEN, and says so. This gates an upload; a storage hiccup
    // must not stop somebody adding a photograph to their own site. The
    // cleanup is what bounds growth for real.
    return NextResponse.json({
      ok: true,
      degraded: true,
      usage: summariseStorage(0, limitBytes),
    });
  }
}
