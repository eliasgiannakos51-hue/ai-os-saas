import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { encryptionAvailable } from "@/lib/integrations/crypto";
import { listMcpTools, McpError } from "@/lib/mcp/client";
import { parseMcpUrl } from "@/lib/mcp/ssrf";
import { addMcpServer, countMcpServers, listMcpServers } from "@/lib/mcp/store";
import { maxMcpServersForPlan } from "@/lib/mcp/limits";
import { MCP_LIMITS } from "@/lib/mcp/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // @function-limit 30

/**
 * CONNECT BY ADDRESS: the person's own apps (MCP servers over HTTPS).
 *
 * GET lists the caller's apps — name, address, tools; never a token, only
 * whether one is stored. POST adds one: the address is checked (https, no
 * private or metadata address — lib/mcp/ssrf.ts), the app is asked for its
 * tools, and only an app that answered is saved. The token, when there is
 * one, is encrypted before it is written and never comes back out.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });
  return NextResponse.json({ ok: true, servers: await listMcpServers(user.id) });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401 });

  try {
    const limited = await checkRateLimit({ scope: "mcp_add", identifier: user.id, maxAttempts: 20, windowMinutes: 60 });
    if (!limited.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const rawUrl = typeof body.url === "string" ? body.url : "";
    const token = typeof body.token === "string" && body.token.trim() !== "" ? body.token.trim() : null;
    if (name.length === 0 || name.length > MCP_LIMITS.maxNameChars) return NextResponse.json({ ok: false, code: "bad_name" }, { status: 400 });
    if (token && token.length > MCP_LIMITS.maxTokenChars) return NextResponse.json({ ok: false, code: "bad_token" }, { status: 400 });
    const parsed = parseMcpUrl(rawUrl);
    if (!parsed.ok) return NextResponse.json({ ok: false, code: parsed.reason }, { status: 400 });
    // Fail closed: a token that cannot be encrypted is not stored at all.
    if (token && !encryptionAvailable()) return NextResponse.json({ ok: false, code: "encryption_unavailable" }, { status: 503 });

    if (!isAdminEmail(user.email)) {
      const cap = maxMcpServersForPlan(await resolveEffectivePlanSlug(user));
      if ((await countMcpServers(user.id)) >= cap) return NextResponse.json({ ok: false, code: "limit", cap }, { status: 403 });
    }

    const url = parsed.url.toString();
    let tools;
    try {
      tools = await listMcpTools(url, token);
    } catch (err) {
      const kind = err instanceof McpError ? err.kind : "unreachable";
      if (!(err instanceof McpError)) logApiError("/api/mcp", err, { stage: "handshake" });
      return NextResponse.json({ ok: false, code: kind }, { status: 422 });
    }
    if (tools.length === 0) return NextResponse.json({ ok: false, code: "no_tools" }, { status: 422 });

    const saved = await addMcpServer({ userId: user.id, name, url, token, tools });
    if (!saved.ok) return NextResponse.json({ ok: false, code: saved.reason }, { status: saved.reason === "duplicate" ? 409 : 500 });
    return NextResponse.json({ ok: true, server: saved.server });
  } catch (err) {
    logApiError("/api/mcp", err);
    return NextResponse.json({ ok: false, code: "add_failed" }, { status: 500 });
  }
}
