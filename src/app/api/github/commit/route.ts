import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGitHubAccessToken } from "@/lib/github/store";
import { createBranchCommitAndPr } from "@/lib/github/client";
import type { GitHubDiffFile } from "@/lib/github/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    repo?: string;
    baseBranch?: string;
    newBranch?: string;
    files?: GitHubDiffFile[];
    commitMessage?: string;
    prTitle?: string;
    prBody?: string;
  } | null;

  if (!body?.repo || !body.baseBranch || !body.newBranch || !body.files?.length || !body.commitMessage || !body.prTitle) {
    return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 400 });
  }

  if (body.newBranch === body.baseBranch) {
    return NextResponse.json({ ok: false, error: "Cannot commit directly to the base branch." }, { status: 400 });
  }

  const token = await getGitHubAccessToken(user.id);
  if (!token.ok || !token.installationId) {
    return NextResponse.json({ ok: false, reason: "not_connected" }, { status: 403 });
  }

  const [owner, name] = body.repo.split("/", 2);
  if (!owner || !name) {
    return NextResponse.json({ ok: false, error: "Invalid repo format." }, { status: 400 });
  }

  const result = await createBranchCommitAndPr({
    installationId: token.installationId,
    owner,
    repo: name,
    baseBranch: body.baseBranch,
    newBranch: body.newBranch,
    files: body.files,
    commitMessage: body.commitMessage,
    prTitle: body.prTitle,
    prBody: body.prBody ?? "",
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 422 });
  }

  return NextResponse.json({ ok: true, pr: result.pr });
}
