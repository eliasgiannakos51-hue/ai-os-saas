import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { callMcpTool, McpError } from "@/lib/mcp/client";
import { getMcpServerForUse } from "@/lib/mcp/store";
import { needsApproval } from "@/lib/mcp/plan";
import { MCP_LIMITS } from "@/lib/mcp/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // @function-limit 30

/**
 * RUN ONE TOOL CALL THE PERSON PRESSED. The only road by which a tool that
 * is not marked read-only ever runs: it needs `approved: true` in the body,
 * which only the press on the plan sends. The tool must be one the app
 * listed; the call is free (the app answers, nothing of ours is spent).
 * What comes back is data: shown as text, never run, never obeyed.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });
  const { id } = await ctx.params;

  try {
    const limited = await checkRateLimit({ scope: "mcp_call", identifier: user.id, maxAttempts: 60, windowMinutes: 60 });
    if (!limited.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const toolName = typeof body.tool === "string" ? body.tool : "";
    const args = body.arguments;
    if (args === null || typeof args !== "object" || Array.isArray(args) || JSON.stringify(args).length > MCP_LIMITS.maxArgumentsChars) {
      return NextResponse.json({ ok: false, code: "bad_arguments" }, { status: 400 });
    }

    const found = await getMcpServerForUse(user.id, id);
    if (!found.ok) return NextResponse.json({ ok: false, code: found.reason }, { status: found.reason === "not_found" ? 404 : 409 });
    const tool = found.summary.tools.find((t) => t.name === toolName);
    if (!tool) return NextResponse.json({ ok: false, code: "unknown_tool" }, { status: 400 });
    if (needsApproval(tool) && body.approved !== true) {
      return NextResponse.json({ ok: false, code: "approval_required" }, { status: 409 });
    }

    const result = await callMcpTool(found.summary.url, found.token, tool.name, args as Record<string, unknown>);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof McpError) return NextResponse.json({ ok: false, code: err.kind }, { status: 422 });
    logApiError("/api/mcp/call", err);
    return NextResponse.json({ ok: false, code: "call_failed" }, { status: 500 });
  }
}
