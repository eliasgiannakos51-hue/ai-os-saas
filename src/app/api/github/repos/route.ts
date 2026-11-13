import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { visibleReposFor } from "@/lib/github/access";
import { logApiError } from "@/lib/log-error";
import type { GitHubRepo } from "@/lib/github/types";

export const dynamic = "force-dynamic";

// Only the repositories the signed-in person can see: GitHub's own list for
// their token, per installation they can reach (lib/github/permission.ts) —
// never an installation's whole list (SECURITY-AUDIT ΑΣ-1.15).
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const visible = await visibleReposFor(user.id);
    if (!visible.ok) {
      return NextResponse.json({ ok: false, reason: visible.reason }, { status: visible.status });
    }

    if (visible.installations === 0) {
      return NextResponse.json({ ok: true, repos: [], needsInstallation: true });
    }

    const repos: GitHubRepo[] = visible.repos.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      name: r.name,
      owner: r.owner,
      private: r.private,
      defaultBranch: r.defaultBranch,
    }));
    return NextResponse.json({ ok: true, repos });
  } catch (err) {
    logApiError("/api/github/repos", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
