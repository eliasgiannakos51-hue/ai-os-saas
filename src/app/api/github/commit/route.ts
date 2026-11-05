import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeRepoOperation } from "@/lib/github/access";
import { createBranchCommitAndPr } from "@/lib/github/client";
import { isValidBranchName, isValidRepoPath } from "@/lib/github/validate";
import type { GitHubDiffFile } from "@/lib/github/types";

export const dynamic = "force-dynamic";

/** One pull request's worth of files; the Coding screen sends what it shows. */
const MAX_FILES = 100;

function parseFiles(raw: unknown): GitHubDiffFile[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FILES) return null;
  const files: GitHubDiffFile[] = [];
  for (const f of raw as Array<{ path?: unknown; content?: unknown; action?: unknown }>) {
    if (!f || !isValidRepoPath(f.path) || typeof f.content !== "string") return null;
    files.push({ path: f.path, content: f.content, action: f.action === "update" ? "update" : "create" });
  }
  return files;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    repo?: unknown;
    baseBranch?: unknown;
    newBranch?: unknown;
    files?: unknown;
    commitMessage?: unknown;
    prTitle?: unknown;
    prBody?: unknown;
  } | null;

  const files = parseFiles(body?.files);
  if (
    !body?.repo ||
    !isValidBranchName(body.baseBranch) ||
    !isValidBranchName(body.newBranch) ||
    !files ||
    typeof body.commitMessage !== "string" ||
    !body.commitMessage ||
    typeof body.prTitle !== "string" ||
    !body.prTitle
  ) {
    return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 400 });
  }

  if (body.newBranch === body.baseBranch) {
    return NextResponse.json({ ok: false, error: "Cannot commit directly to the base branch." }, { status: 400 });
  }

  const access = await authorizeRepoOperation(user.id, body.repo, "commit");
  if (!access.ok) {
    return NextResponse.json({ ok: false, reason: access.reason }, { status: access.status });
  }

  const result = await createBranchCommitAndPr(access.grant, {
    baseBranch: body.baseBranch,
    newBranch: body.newBranch,
    files,
    commitMessage: body.commitMessage,
    prTitle: body.prTitle,
    prBody: typeof body.prBody === "string" ? body.prBody : "",
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 422 });
  }

  return NextResponse.json({ ok: true, pr: result.pr });
}
