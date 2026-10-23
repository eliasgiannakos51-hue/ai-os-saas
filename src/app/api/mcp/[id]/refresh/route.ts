import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { listMcpTools, McpError } from "@/lib/mcp/client";
import { getMcpServerForUse, listMcpServers, saveMcpTools } from "@/lib/mcp/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // @function-limit 30

/** Ask one of the caller's apps for its tools again. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });
  const { id } = await ctx.params;

  const limited = await checkRateLimit({ scope: "mcp_refresh", identifier: user.id, maxAttempts: 60, windowMinutes: 60 });
  if (!limited.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });

  const found = await getMcpServerForUse(user.id, id);
  if (!found.ok) return NextResponse.json({ ok: false, code: found.reason }, { status: found.reason === "not_found" ? 404 : 409 });
  try {
    const tools = await listMcpTools(found.summary.url, found.token);
    await saveMcpTools(user.id, id, tools, "connected");
  } catch (err) {
    const kind = err instanceof McpError ? err.kind : "unreachable";
    if (!(err instanceof McpError)) logApiError("/api/mcp/refresh", err);
    await saveMcpTools(user.id, id, found.summary.tools, "error");
    return NextResponse.json({ ok: false, code: kind }, { status: 422 });
  }
  const servers = await listMcpServers(user.id);
  return NextResponse.json({ ok: true, server: servers.find((s) => s.id === id) ?? null });
}
