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

  const body = (await request.json().catch(() => null)) as { repo?: string; pr?: number } | null;
  if (!body?.repo || !body.pr || !body.repo.includes("/")) {
    return NextResponse.json({ ok: false, error: "Missing repo or pr." }, { status: 400 });
  }

  const token = await getGitHubAccessToken(user.id);
  if (!token.ok || !token.installationId) {
    return NextResponse.json({ ok: false, reason: "not_connected" }, { status: 403 });
  }

  const instToken = await createInstallationToken(token.installationId);
  if (!instToken) return NextResponse.json({ ok: false, reason: "token_failed" }, { status: 500 });

  const [owner, name] = body.repo.split("/", 2);
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls/${body.pr}/merge`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${instToken.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ merge_method: "squash" }),
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      return NextResponse.json({ ok: false, reason: err.message ?? "merge_failed" }, { status: 422 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/github/merge", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
