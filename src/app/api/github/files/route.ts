import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeRepoOperation } from "@/lib/github/access";
import { listFiles, readFile, getTree } from "@/lib/github/client";
import { isValidBranchName, isValidRepoPath } from "@/lib/github/validate";

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
    repo?: unknown;
    branch?: unknown;
    path?: unknown;
    mode?: unknown;
  } | null;

  if (!body?.repo || !isValidBranchName(body.branch)) {
    return NextResponse.json({ ok: false, error: "Missing repo or branch." }, { status: 400 });
  }
  const mode = body.mode === "tree" || body.mode === "read" ? body.mode : "list";
  const path = body.path ?? "";
  if (!isValidRepoPath(path, mode !== "read")) {
    return NextResponse.json({ ok: false, error: "Invalid path." }, { status: 400 });
  }

  const access = await authorizeRepoOperation(user.id, body.repo, "files");
  if (!access.ok) {
    return NextResponse.json({ ok: false, reason: access.reason }, { status: access.status });
  }

  if (mode === "tree") {
    const tree = await getTree(access.grant, body.branch);
    return NextResponse.json({ ok: true, tree });
  }

  if (mode === "read") {
    const file = await readFile(access.grant, body.branch, path);
    if (!file) return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
    return NextResponse.json({ ok: true, file });
  }

  const files = await listFiles(access.grant, body.branch, path);
  return NextResponse.json({ ok: true, files });
}
