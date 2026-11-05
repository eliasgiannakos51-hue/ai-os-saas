import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { githubAppConfigured } from "@/lib/github/auth";
import { getGitHubAccessToken, getGitHubConnection, markGitHubConnectionStatus } from "@/lib/github/store";
import { listUserInstallations } from "@/lib/github/permission";
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

    if (!githubAppConfigured()) {
      return NextResponse.json({ ok: true, available: false });
    }

    const connection = await getGitHubConnection(user.id);
    let connected = connection?.status === "connected";
    let hasInstallation = false;

    // Asked of GitHub with the person's own token rather than read from the
    // row (SECURITY-AUDIT ΑΣ-1.15): a token GitHub refuses is a connection
    // that has to be made again, and an App installed after connecting is
    // seen without a reconnect.
    if (connected) {
      const token = await getGitHubAccessToken(user.id);
      if (!token.ok) {
        connected = false;
      } else {
        const installations = await listUserInstallations(token.token);
        if (installations.ok) {
          hasInstallation = installations.value.length > 0;
        } else if (installations.failure === "token_dead") {
          await markGitHubConnectionStatus(user.id, "expired");
          connected = false;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      available: true,
      connected,
      login: connected ? connection?.login ?? null : null,
      hasInstallation,
    });
  } catch (err) {
    logApiError("/api/github/status", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
