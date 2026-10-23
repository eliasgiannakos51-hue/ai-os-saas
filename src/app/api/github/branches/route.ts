import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGitHubAccessToken } from "@/lib/github/store";
import { listBranches } from "@/lib/github/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const url = new URL(request.url);
  const repo = url.searchParams.get("repo");
  if (!repo || !repo.includes("/")) {
    return NextResponse.json({ ok: false, error: "Missing repo parameter (owner/name)." }, { status: 400 });
  }

  const token = await getGitHubAccessToken(user.id);
  if (!token.ok || !token.installationId) {
    return NextResponse.json({ ok: false, reason: "not_connected" }, { status: 403 });
  }

  const [owner, name] = repo.split("/", 2);
  const branches = await listBranches(token.installationId, owner, name);
  return NextResponse.json({ ok: true, branches });
}
