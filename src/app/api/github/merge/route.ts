import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeRepoOperation } from "@/lib/github/access";
import { mergePullRequest } from "@/lib/github/client";
import { parsePullNumber } from "@/lib/github/validate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { repo?: unknown; pr?: unknown } | null;
  const pr = parsePullNumber(body?.pr);
  if (!body?.repo || pr === null) {
    return NextResponse.json({ ok: false, error: "Missing repo or pr." }, { status: 400 });
  }

  const access = await authorizeRepoOperation(user.id, body.repo, "merge");
  if (!access.ok) {
    return NextResponse.json({ ok: false, reason: access.reason }, { status: access.status });
  }

  const result = await mergePullRequest(access.grant, pr);
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: result.reason === "unexpected_error" ? 500 : 422 });
  }
  return NextResponse.json({ ok: true });
}
