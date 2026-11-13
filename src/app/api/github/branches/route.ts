import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeRepoOperation } from "@/lib/github/access";
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
  const access = await authorizeRepoOperation(user.id, url.searchParams.get("repo"), "branches");
  if (!access.ok) {
    return NextResponse.json({ ok: false, reason: access.reason }, { status: access.status });
  }

  const branches = await listBranches(access.grant);
  return NextResponse.json({ ok: true, branches });
}
