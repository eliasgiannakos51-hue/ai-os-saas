import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeRepoOperation } from "@/lib/github/access";
import { getPullRequestStatus } from "@/lib/github/client";
import { parsePullNumber } from "@/lib/github/validate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(request.url);
  const repo = url.searchParams.get("repo");
  const pr = parsePullNumber(url.searchParams.get("pr"));
  if (!repo || pr === null) {
    return NextResponse.json({ ok: false, error: "Missing repo or pr." }, { status: 400 });
  }

  const access = await authorizeRepoOperation(user.id, repo, "pr-status");
  if (!access.ok) {
    return NextResponse.json({ ok: false, reason: access.reason }, { status: access.status });
  }

  const result = await getPullRequestStatus(access.grant, pr);
  if (!result.ok) {
    if (result.reason === "pr_not_found") {
      return NextResponse.json({ ok: false, error: "PR not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result.status });
}
