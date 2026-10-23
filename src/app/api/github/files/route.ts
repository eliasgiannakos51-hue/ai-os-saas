import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGitHubAccessToken } from "@/lib/github/store";
import { listFiles, readFile, getTree } from "@/lib/github/client";

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
    branch?: string;
    path?: string;
    mode?: "list" | "read" | "tree";
  } | null;

  if (!body?.repo || !body.branch) {
    return NextResponse.json({ ok: false, error: "Missing repo or branch." }, { status: 400 });
  }

  const token = await getGitHubAccessToken(user.id);
  if (!token.ok || !token.installationId) {
    return NextResponse.json({ ok: false, reason: "not_connected" }, { status: 403 });
  }

  const [owner, name] = body.repo.split("/", 2);
  if (!owner || !name) {
    return NextResponse.json({ ok: false, error: "Invalid repo format." }, { status: 400 });
  }

  if (body.mode === "tree") {
    const tree = await getTree(token.installationId, owner, name, body.branch);
    return NextResponse.json({ ok: true, tree });
  }

  if (body.mode === "read" && body.path) {
    const file = await readFile(token.installationId, owner, name, body.branch, body.path);
    if (!file) return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
    return NextResponse.json({ ok: true, file });
  }

  const files = await listFiles(token.installationId, owner, name, body.branch, body.path ?? "");
  return NextResponse.json({ ok: true, files });
}
