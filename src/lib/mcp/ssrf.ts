import "server-only";
import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns";
import { MCP_LIMITS } from "@/lib/mcp/types";

/**
 * THE ONE DOOR OUT TO A SERVER THE PERSON TYPED IN.
 *
 * An MCP address is a URL the server will open on the person's behalf, so
 * it is the textbook shape of server-side request forgery: «http://169.254.169.254/»
 * and «https://localhost:5432/» are addresses too. Three layers, and each
 * one alone is not enough:
 *
 *   1. parseMcpUrl: the text. https only, no credentials in the URL, no
 *      address literal that is private, no name that is only meaningful
 *      inside a network (localhost, .local, .internal).
 *   2. isBlockedAddress: the numbers. Every address a name RESOLVES to is
 *      checked, IPv4 and IPv6, including the IPv4 hidden inside an IPv6
 *      (::ffff:10.0.0.1, 64:ff9b::, 6to4).
 *   3. guardedLookup: the moment of connecting. The check runs inside the
 *      socket's own DNS lookup, so the address that is checked is the
 *      address that is connected to. A name that answers a public address
 *      to a pre-check and a private one to the connection (DNS rebinding)
 *      is refused at the connection.
 *
 * MCP_ALLOW_INSECURE_LOCAL=1 lets the tests reach a stand-in server on this
 * machine over http. It is a test switch: it must never be set on a deploy,
 * and it opens loopback ONLY, never the private ranges or the metadata
 * address.
 */

export function insecureLocalAllowed(): boolean {
  return process.env.MCP_ALLOW_INSECURE_LOCAL === "1";
}

function ipv4ToBytes(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return bytes.every((b) => b >= 0 && b <= 255) ? bytes : null;
}

function ipv6ToBytes(ip: string): number[] | null {
  let text = ip;
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);
  // A dotted IPv4 tail (::ffff:1.2.3.4) becomes two groups.
  const tail = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const v4 = ipv4ToBytes(tail[2]);
    if (!v4) return null;
    text = `${tail[1]}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...(halves.length === 2 ? Array(missing).fill("0") : []), ...rest];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.flatMap((g) => {
    const n = parseInt(g, 16);
    return [n >> 8, n & 255];
  });
}

function blockedV4(b: number[], allowLoopback: boolean): boolean {
  const [a, c] = b;
  if (a === 127) return !allowLoopback;
  if (a === 0) return true; // "this network", 0.0.0.0
  if (a === 10) return true;
  if (a === 100 && c >= 64 && c <= 127) return true; // CGNAT
  if (a === 169 && c === 254) return true; // link-local, cloud metadata
  if (a === 172 && c >= 16 && c <= 31) return true;
  if (a === 192 && c === 0 && (b[2] === 0 || b[2] === 2)) return true; // protocol assignments, TEST-NET-1
  if (a === 192 && c === 88 && b[2] === 99) return true; // 6to4 relay
  if (a === 192 && c === 168) return true;
  if (a === 198 && (c === 18 || c === 19)) return true; // benchmarking
  if (a === 198 && c === 51 && b[2] === 100) return true; // TEST-NET-2
  if (a === 203 && c === 0 && b[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/** True for any address a person's server must never be asked to open. */
export function isBlockedAddress(ip: string, allowLoopback = false): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const b = ipv4ToBytes(ip);
    return b ? blockedV4(b, allowLoopback) : true;
  }
  if (family === 6) {
    const b = ipv6ToBytes(ip);
    if (!b) return true;
    const allZero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
    if (allZero(0, 15) && (b[15] === 0 || b[15] === 1)) return b[15] === 1 ? !allowLoopback : true; // :: and ::1
    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge the IPv4 inside.
    if (allZero(0, 10) && b[10] === 0xff && b[11] === 0xff) return blockedV4(b.slice(12), allowLoopback);
    if (allZero(0, 12)) return blockedV4(b.slice(12), allowLoopback);
    // NAT64 (64:ff9b::/96): the IPv4 inside.
    if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && allZero(4, 12)) return blockedV4(b.slice(12), allowLoopback);
    // 6to4 (2002::/16): the IPv4 right after the prefix.
    if (b[0] === 0x20 && b[1] === 0x02) return blockedV4(b.slice(2, 6), allowLoopback);
    if ((b[0] & 0xfe) === 0xfc) return true; // unique local fc00::/7
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // link-local fe80::/10
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return true; // site-local fec0::/10
    if (b[0] === 0xff) return true; // multicast
    if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // documentation
    return false;
  }
  return true; // not an address at all
}

export type ParsedMcpUrl = { ok: true; url: URL } | { ok: false; reason: "invalid_url" | "not_https" | "credentials_in_url" | "blocked_host" | "too_long" };

const LOCAL_NAME = /(^|\.)(localhost|local|internal|localdomain|lan|home|corp|intranet)$/i;

export function parseMcpUrl(raw: string): ParsedMcpUrl {
  const text = String(raw ?? "").trim();
  if (text.length === 0) return { ok: false, reason: "invalid_url" };
  if (text.length > MCP_LIMITS.maxUrlChars) return { ok: false, reason: "too_long" };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  const local = insecureLocalAllowed();
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "") return { ok: false, reason: "invalid_url" };
  // Plain http exists only for the stand-in server on this machine, under
  // the test switch; everything else is https.
  const loopbackName = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (url.protocol === "http:") {
    if (!(local && loopbackName)) return { ok: false, reason: "not_https" };
  } else if (url.protocol !== "https:") {
    return { ok: false, reason: "not_https" };
  }
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "credentials_in_url" };
  if (isIP(host)) {
    if (isBlockedAddress(host, local)) return { ok: false, reason: "blocked_host" };
  } else if (LOCAL_NAME.test(host) && !(local && host.toLowerCase() === "localhost")) {
    return { ok: false, reason: "blocked_host" };
  }
  return { ok: true, url };
}

type LookupOptions = { all?: boolean; family?: number | string; hints?: number };
type LookupAddress = { address: string; family: number };

/**
 * The socket's own DNS lookup, with the check inside it. Passed as the
 * `lookup` option of http(s).request, so the address that was judged is the
 * address that is connected to.
 */
export function guardedLookup(
  hostname: string,
  options: LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void
): void {
  const local = insecureLocalAllowed();
  const resolve = dnsLookup as unknown as (
    host: string,
    opts: LookupOptions,
    cb: (err: NodeJS.ErrnoException | null, addresses?: LookupAddress[]) => void
  ) => void;
  resolve(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses ?? [];
    if (list.length === 0) return callback(Object.assign(new Error("no address"), { code: "ENOTFOUND" }));
    const bad = list.find((a) => isBlockedAddress(a.address, local));
    if (bad) return callback(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }));
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}
