import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeRepoOperation } from "@/lib/github/access";
import { createBranch } from "@/lib/github/client";
import { isValidBranchName } from "@/lib/github/validate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    repo?: unknown;
    baseBranch?: unknown;
    newBranch?: unknown;
  } | null;
  if (!body?.repo || !isValidBranchName(body.baseBranch) || !isValidBranchName(body.newBranch)) {
    return NextResponse.json({ ok: false, error: "Missing fields." }, { status: 400 });
  }

  const access = await authorizeRepoOperation(user.id, body.repo, "create-branch");
  if (!access.ok) {
    return NextResponse.json({ ok: false, reason: access.reason }, { status: access.status });
  }

  const result = await createBranch(access.grant, body.baseBranch, body.newBranch);
  if (!result.ok) {
    const status = result.reason === "base_not_found" ? 404 : result.reason === "unexpected_error" ? 500 : 422;
    return NextResponse.json({ ok: false, reason: result.reason }, { status });
  }
  return NextResponse.json({ ok: true });
}
