// What an MCP app looks like to the browser. Nothing secret is here: the
// token never leaves the server, and `hasToken` is all the screen learns.

export type McpToolSummary = {
  name: string;
  description: string;
  /** The SERVER's own claim (annotations.readOnlyHint). A claim, not a fact:
   *  anything without it needs the person's press before it runs. */
  readOnly: boolean;
  inputSchema: Record<string, unknown>;
};

export type McpServerStatus = "connected" | "error";

export type McpServerSummary = {
  id: string;
  name: string;
  url: string;
  host: string;
  tools: McpToolSummary[];
  toolsCheckedAt: string | null;
  status: McpServerStatus;
  hasToken: boolean;
  createdAt: string;
};

export const MCP_LIMITS = {
  /** One HTTP exchange with a server. */
  requestTimeoutMs: 10_000,
  /** A whole connect or call, handshake included. */
  totalTimeoutMs: 25_000,
  /** The most a server may send back in one reply. */
  maxResponseBytes: 512 * 1024,
  maxToolsPerServer: 100,
  maxToolListPages: 5,
  maxNameChars: 80,
  maxUrlChars: 2048,
  maxTokenChars: 4096,
  maxDescriptionChars: 600,
  maxSchemaChars: 4000,
  maxArgumentsChars: 8000,
  maxRequestChars: 2000,
  /** What a tool result may show on screen. */
  maxResultChars: 20_000,
} as const;
