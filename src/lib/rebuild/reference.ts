// BOUNDARY-FORMAT: http
import "server-only";
import http from "node:http";
import https from "node:https";
import { guardedLookup, parseMcpUrl } from "@/lib/mcp/ssrf";
import { extractStructure, renderReference, type PageStructure } from "@/lib/rebuild/structure";

/**
 * ONE PUBLIC PAGE, READ FOR ITS STRUCTURE (Rebuild) — through the SAME
 * address guard Connect uses (lib/mcp/ssrf.ts), not a second one:
 *
 *   - https only, no credentials in the address, no private, loopback,
 *     link-local or metadata address and no name that only means something
 *     inside a network (parseMcpUrl);
 *   - the address that is checked is the address that is connected to,
 *     because the check runs inside the socket's own DNS lookup
 *     (guardedLookup) — a name that answers public to a pre-check and
 *     private to the connection is refused at the connection;
 *   - a redirect is followed at most MAX_REDIRECTS times and EVERY hop goes
 *     back through both checks, so a public page that redirects to a
 *     private one is refused at that hop;
 *   - ONE page: no link on it is ever followed, no sign-in is attempted, no
 *     cookie is sent or kept, and the body is capped in size and in time.
 *
 * What comes back is lib/rebuild/structure.ts's bounded labels, never the
 * page itself.
 */
export const REFERENCE_LIMITS = { maxBytes: 400_000, timeoutMs: 8_000, maxRedirects: 3 } as const;

export type ReferenceFailure =
  | "invalid_url" | "not_https" | "credentials_in_url" | "blocked_host" | "too_long"
  | "unreachable" | "timeout" | "too_large" | "too_many_redirects" | "not_html" | "http_error";

export type ReferenceResult =
  | { ok: true; host: string; structure: PageStructure; rendered: string }
  | { ok: false; reason: ReferenceFailure };

type Hop = { status: number; location: string | null; contentType: string; body: string };

function get(url: URL, deadline: number): Promise<Hop | ReferenceFailure> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.resolve("timeout");
  const transport = url.protocol === "http:" ? http : https;
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: Hop | ReferenceFailure) => {
      if (settled) return;
      settled = true;
      req.destroy();
      resolve(value);
    };
    const req = transport.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup as never,
        headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "IonexaRebuild/1.0 (reads one public page for its structure)" },
        timeout: Math.min(REFERENCE_LIMITS.timeoutMs, remaining),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
        if (status >= 300 && status < 400) {
          res.resume();
          return done({ status, location, contentType, body: "" });
        }
        if (status >= 400 || !/\b(?:text\/html|application\/xhtml)/.test(contentType)) {
          res.resume();
          return done(status >= 400 ? "http_error" : "not_html");
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > REFERENCE_LIMITS.maxBytes) return done("too_large");
          chunks.push(chunk);
        });
        res.on("end", () => done({ status, location: null, contentType, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", () => done("unreachable"));
      }
    );
    req.on("timeout", () => done("timeout"));
    req.on("error", () => done("unreachable"));
    req.end();
  });
}

export async function readReferencePage(rawUrl: string): Promise<ReferenceResult> {
  const deadline = Date.now() + REFERENCE_LIMITS.timeoutMs * 2;
  let current = rawUrl;
  for (let hop = 0; hop <= REFERENCE_LIMITS.maxRedirects; hop++) {
    const parsed = parseMcpUrl(current);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    const answer = await get(parsed.url, deadline);
    if (typeof answer === "string") return { ok: false, reason: answer };
    if (answer.status >= 300 && answer.status < 400) {
      if (!answer.location) return { ok: false, reason: "http_error" };
      try {
        current = new URL(answer.location, parsed.url).toString();
      } catch {
        return { ok: false, reason: "invalid_url" };
      }
      continue;
    }
    const structure = extractStructure(answer.body);
    return { ok: true, host: parsed.url.hostname, structure, rendered: renderReference(parsed.url.hostname, structure) };
  }
  return { ok: false, reason: "too_many_redirects" };
}
