import "server-only";
import http from "node:http";
import https from "node:https";
import { guardedLookup, parseMcpUrl } from "@/lib/mcp/ssrf";
import { MCP_LIMITS, type McpToolSummary } from "@/lib/mcp/types";

/**
 * A MODEL CONTEXT PROTOCOL CLIENT over Streamable HTTP: JSON-RPC 2.0 sent
 * with POST, answered either as one JSON body or as a text/event-stream
 * carrying the reply. Only what Connect needs: initialize, tools/list and
 * tools/call.
 *
 * EVERYTHING A SERVER SENDS BACK IS DATA. This file parses it and bounds it
 * (size, tool count, text length); it never evaluates it, and what it
 * returns is plain strings and flags — nothing here, or anywhere that calls
 * it, treats a description or a result as an instruction.
 *
 * NO REDIRECTS: a 3xx is refused, because a public address that redirects
 * to a private one would walk past the address check. The connection itself
 * is address-checked inside the socket's DNS lookup (lib/mcp/ssrf.ts).
 */

export type McpErrorKind =
  | "bad_url" | "blocked_address" | "unreachable" | "timeout" | "too_large"
  | "redirect_refused" | "unauthorized" | "http_error" | "protocol" | "tool_error";

export class McpError extends Error {
  constructor(public kind: McpErrorKind, message: string) {
    super(message);
    this.name = "McpError";
  }
}

const PROTOCOL_VERSION = "2025-06-18";

type RawReply = { status: number; headers: http.IncomingHttpHeaders; text: string };

function post(url: URL, headers: Record<string, string>, body: string, deadline: number): Promise<RawReply> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new McpError("timeout", "The server took too long."));
  const timeout = Math.min(MCP_LIMITS.requestTimeoutMs, remaining);
  const transport = url.protocol === "http:" ? http : https;
  return new Promise<RawReply>((resolve, reject) => {
    let settled = false;
    const fail = (error: McpError) => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(error);
    };
    const req = transport.request(
      url,
      {
        method: "POST",
        lookup: guardedLookup as never,
        headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)) },
        timeout,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return fail(new McpError("redirect_refused", "The server redirected, which is not followed."));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MCP_LIMITS.maxResponseBytes) return fail(new McpError("too_large", "The reply was too large."));
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({ status, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") });
        });
        res.on("error", () => fail(new McpError("unreachable", "The connection broke.")));
      }
    );
    req.on("timeout", () => fail(new McpError("timeout", "The server took too long.")));
    req.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EBLOCKED") return fail(new McpError("blocked_address", "That address is not allowed."));
      fail(new McpError("unreachable", "The server could not be reached."));
    });
    req.end(body);
  });
}

/** The JSON-RPC message with this id, from a JSON body or an event stream. */
export function readReply(contentType: string, text: string, id: number): unknown {
  if (/text\/event-stream/i.test(contentType)) {
    for (const event of text.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data) continue;
      try {
        const message = JSON.parse(data) as { id?: unknown };
        if (message && message.id === id) return message;
      } catch {
        // an event that is not JSON is not the reply
      }
    }
    throw new McpError("protocol", "The reply never came.");
  }
  try {
    const message = JSON.parse(text) as unknown;
    const found = Array.isArray(message) ? message.find((m) => (m as { id?: unknown })?.id === id) : message;
    if (!found) throw new Error("none");
    return found;
  } catch {
    throw new McpError("protocol", "The reply was not understood.");
  }
}

type Session = { url: URL; headers: Record<string, string>; deadline: number; nextId: number };

async function rpc(session: Session, method: string, params: unknown): Promise<unknown> {
  const id = session.nextId++;
  const reply = await post(session.url, session.headers, JSON.stringify({ jsonrpc: "2.0", id, method, params }), session.deadline);
  if (reply.status === 401 || reply.status === 403) throw new McpError("unauthorized", "The server did not accept the token.");
  if (reply.status < 200 || reply.status >= 300) throw new McpError("http_error", `The server answered ${reply.status}.`);
  const sid = reply.headers["mcp-session-id"];
  if (typeof sid === "string" && sid && !session.headers["Mcp-Session-Id"]) session.headers["Mcp-Session-Id"] = sid;
  const message = readReply(String(reply.headers["content-type"] ?? ""), reply.text, id) as { error?: { message?: unknown }; result?: unknown };
  if (message.error) throw new McpError("protocol", typeof message.error.message === "string" ? message.error.message.slice(0, 200) : "The server refused.");
  return message.result;
}

async function open(rawUrl: string, token: string | null): Promise<Session> {
  const parsed = parseMcpUrl(rawUrl);
  if (!parsed.ok) throw new McpError("bad_url", parsed.reason);
  const session: Session = {
    url: parsed.url,
    deadline: Date.now() + MCP_LIMITS.totalTimeoutMs,
    nextId: 1,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": "Ionexa-MCP/1",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  const init = (await rpc(session, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "ionexa", version: "1" },
  })) as { protocolVersion?: unknown } | undefined;
  session.headers["MCP-Protocol-Version"] = typeof init?.protocolVersion === "string" ? init.protocolVersion : PROTOCOL_VERSION;
  // The notification has no id and no reply worth reading; a server that
  // refuses it still answered initialize, so its failure is not ours to raise.
  await post(session.url, session.headers, JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), session.deadline).catch(() => undefined);
  return session;
}

const clip = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "";

/** One tool as the server described it, bounded and flattened to plain data. */
export function normaliseTool(raw: unknown): McpToolSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const tool = raw as { name?: unknown; description?: unknown; inputSchema?: unknown; annotations?: { readOnlyHint?: unknown } };
  // Not clipped: a name cut short would be a name the server does not have.
  const name = typeof tool.name === "string" ? tool.name : "";
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(name)) return null;
  let inputSchema: Record<string, unknown> = { type: "object" };
  if (tool.inputSchema && typeof tool.inputSchema === "object" && !Array.isArray(tool.inputSchema)) {
    const text = JSON.stringify(tool.inputSchema);
    if (text.length <= MCP_LIMITS.maxSchemaChars) inputSchema = tool.inputSchema as Record<string, unknown>;
  }
  return {
    name,
    description: clip(tool.description, MCP_LIMITS.maxDescriptionChars),
    // Only an explicit true counts. A missing hint is "not known to be read-only".
    readOnly: tool.annotations?.readOnlyHint === true,
    inputSchema,
  };
}

/** Connect, ask for the tools, return them. Used to validate a new address and to refresh. */
export async function listMcpTools(rawUrl: string, token: string | null): Promise<McpToolSummary[]> {
  const session = await open(rawUrl, token);
  const tools: McpToolSummary[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MCP_LIMITS.maxToolListPages; page++) {
    const result = (await rpc(session, "tools/list", cursor ? { cursor } : {})) as { tools?: unknown; nextCursor?: unknown } | undefined;
    if (!Array.isArray(result?.tools)) throw new McpError("protocol", "The server did not list its tools.");
    for (const raw of result.tools) {
      const tool = normaliseTool(raw);
      if (tool && !tools.some((t) => t.name === tool.name)) tools.push(tool);
      if (tools.length >= MCP_LIMITS.maxToolsPerServer) return tools;
    }
    if (typeof result?.nextCursor !== "string" || !result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return tools;
}

export type McpCallResult = { text: string; isError: boolean; truncated: boolean };

/** Call one tool. The caller has already decided this call may run. */
export async function callMcpTool(rawUrl: string, token: string | null, name: string, args: Record<string, unknown>): Promise<McpCallResult> {
  const session = await open(rawUrl, token);
  const result = (await rpc(session, "tools/call", { name, arguments: args })) as { content?: unknown; isError?: unknown; structuredContent?: unknown } | undefined;
  const parts: string[] = [];
  if (Array.isArray(result?.content)) {
    for (const item of result.content) {
      const block = item as { type?: unknown; text?: unknown };
      if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
      else parts.push(`[${typeof block?.type === "string" ? clip(block.type, 20) : "content"} not shown]`);
    }
  } else if (result?.structuredContent !== undefined) {
    parts.push(JSON.stringify(result.structuredContent));
  }
  const joined = parts.join("\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  const truncated = joined.length > MCP_LIMITS.maxResultChars;
  return { text: truncated ? joined.slice(0, MCP_LIMITS.maxResultChars) : joined, isError: result?.isError === true, truncated };
}
