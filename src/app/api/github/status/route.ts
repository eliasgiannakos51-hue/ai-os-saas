import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { githubAppConfigured } from "@/lib/github/auth";
import { getGitHubConnection } from "@/lib/github/store";
import { isFeatureOn } from "@/lib/flags/flags";
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

    const featureOn = await isFeatureOn("coding-github", user);
    if (!featureOn || !githubAppConfigured()) {
      return NextResponse.json({ ok: true, available: false });
    }

    const connection = await getGitHubConnection(user.id);
    return NextResponse.json({
      ok: true,
      available: true,
      connected: connection?.status === "connected",
      login: connection?.login ?? null,
      hasInstallation: !!connection?.installationId,
    });
  } catch (err) {
    logApiError("/api/github/status", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
