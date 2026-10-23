import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGitHubAccessToken } from "@/lib/github/store";
import { logApiError } from "@/lib/log-error";
import { createInstallationToken } from "@/lib/github/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    repo?: string;
    baseBranch?: string;
    newBranch?: string;
  } | null;
  if (!body?.repo || !body.baseBranch || !body.newBranch || !body.repo.includes("/")) {
    return NextResponse.json({ ok: false, error: "Missing fields." }, { status: 400 });
  }

  const token = await getGitHubAccessToken(user.id);
  if (!token.ok || !token.installationId) {
    return NextResponse.json({ ok: false, reason: "not_connected" }, { status: 403 });
  }

  const instToken = await createInstallationToken(token.installationId);
  if (!instToken) return NextResponse.json({ ok: false, reason: "token_failed" }, { status: 500 });

  const [owner, name] = body.repo.split("/", 2);
  const headers = {
    Authorization: `Bearer ${instToken.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  try {
    const refRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/ref/heads/${encodeURIComponent(body.baseBranch)}`,
      { headers, cache: "no-store" }
    );
    if (!refRes.ok) return NextResponse.json({ ok: false, reason: "base_not_found" }, { status: 404 });
    const refData = (await refRes.json()) as { object?: { sha: string } };
    const sha = refData.object?.sha;
    if (!sha) return NextResponse.json({ ok: false, reason: "base_sha_missing" }, { status: 500 });

    const createRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/refs`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ ref: `refs/heads/${body.newBranch}`, sha }),
        cache: "no-store",
      }
    );
    if (!createRes.ok) {
      const ghBody = (await createRes.json().catch(() => ({}))) as { message?: string };
      const reason = ghBody.message?.includes("already exists") ? "branch_exists" : "create_failed";
      return NextResponse.json({ ok: false, reason }, { status: 422 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/github/create-branch", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
