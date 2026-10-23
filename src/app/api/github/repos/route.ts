import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGitHubAccessToken } from "@/lib/github/store";
import { listUserInstallations } from "@/lib/github/auth";
import { listInstallationRepos } from "@/lib/github/client";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const token = await getGitHubAccessToken(user.id);
    if (!token.ok) {
      return NextResponse.json({ ok: false, reason: token.reason }, { status: 403 });
    }

    if (!token.installationId) {
      const installations = await listUserInstallations(token.token);
      if (installations.length === 0) {
        return NextResponse.json({ ok: true, repos: [], needsInstallation: true });
      }
      return NextResponse.json({ ok: true, repos: [], needsInstallation: true });
    }

    const repos = await listInstallationRepos(token.installationId);
    return NextResponse.json({ ok: true, repos });
  } catch (err) {
    logApiError("/api/github/repos", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
