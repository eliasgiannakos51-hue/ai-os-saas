import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGitHubAccessToken } from "@/lib/github/store";
import { logApiError } from "@/lib/log-error";
import { createInstallationToken } from "@/lib/github/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(request.url);
  const repo = url.searchParams.get("repo");
  const pr = url.searchParams.get("pr");
  if (!repo || !pr || !repo.includes("/")) {
    return NextResponse.json({ ok: false, error: "Missing repo or pr." }, { status: 400 });
  }

  const token = await getGitHubAccessToken(user.id);
  if (!token.ok || !token.installationId) {
    return NextResponse.json({ ok: false, reason: "not_connected" }, { status: 403 });
  }

  const instToken = await createInstallationToken(token.installationId);
  if (!instToken) return NextResponse.json({ ok: false, reason: "token_failed" }, { status: 500 });

  const [owner, name] = repo.split("/", 2);
  const headers = {
    Authorization: `Bearer ${instToken.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    const prRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls/${pr}`,
      { headers, cache: "no-store" }
    );
    if (!prRes.ok) return NextResponse.json({ ok: false, error: "PR not found." }, { status: 404 });
    const prData = (await prRes.json()) as {
      state?: string;
      merged?: boolean;
      mergeable?: boolean;
      mergeable_state?: string;
      head?: { sha?: string };
    };

    const sha = prData.head?.sha;
    let checks: Array<{ name: string; status: string; conclusion: string | null }> = [];
    if (sha) {
      const checksRes = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${sha}/check-runs?per_page=100`,
        { headers, cache: "no-store" }
      );
      if (checksRes.ok) {
        const checksData = (await checksRes.json()) as {
          check_runs?: Array<{ name: string; status: string; conclusion: string | null }>;
        };
        checks = (checksData.check_runs ?? []).map((c) => ({
          name: c.name,
          status: c.status,
          conclusion: c.conclusion,
        }));
      }
    }

    return NextResponse.json({
      ok: true,
      state: prData.state,
      merged: prData.merged ?? false,
      mergeable: prData.mergeable ?? null,
      mergeableState: prData.mergeable_state ?? null,
      checks,
    });
  } catch (err) {
    logApiError("/api/github/pr-status", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
