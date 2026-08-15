import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

const TOP_N = 3;

// Backs the Create Anything "smart suggestions" chips (see
// lib/use-smart-suggestions.ts) — the caller's most-used modules (by
// total record count), so a short lead-in phrase can be offered while
// they type. Scoped to CLASSIFIER_MODULES only (the 13 business modules
// + ideas) since that's the exact universe /api/create itself routes
// into — Build modules aren't reachable from Create Anything at all.
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const counts = await Promise.all(
      CLASSIFIER_MODULES.map(async (config) => {
        const { count } = await supabase
          .from(config.table)
          .select("id", { count: "exact", head: true });
        return { slug: config.slug, titleKey: config.titleKey, count: count ?? 0 };
      })
    );

    const modules = counts
      .filter((m) => m.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_N)
      .map(({ slug, titleKey }) => ({ slug, titleKey }));

    return NextResponse.json({ ok: true, modules });
  } catch (err) {
    logApiError("/api/create/top-modules", err);
    return NextResponse.json({ ok: false, error: "Could not load suggestions." }, { status: 500 });
  }
}
