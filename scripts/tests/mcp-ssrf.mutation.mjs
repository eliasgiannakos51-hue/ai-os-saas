#!/usr/bin/env node
/*
 * CAN mcp-ssrf.test.mjs AND mcp-client.test.mjs SEE THE ADDRESS GUARD AND THE
 * CLIENT'S LIMITS WEAKEN?
 *
 * One range of addresses left unblocked (private, metadata, CGNAT, unique
 * local, the IPv4 inside an IPv6), plain http or credentials let through, a
 * private name let through, the connection's own lookup no longer judging
 * the address it connects to, the test switch opening more than loopback; and
 * in the client: a redirect followed, an oversized reply read, a tool's
 * read-only claim believed when it is not an explicit true, a fence that no
 * longer removes its own closing tag, a tool the app never listed accepted.
 *
 * Run: node scripts/tests/mcp-ssrf.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/mcp-ssrf.test.mjs";
const CLIENT_GATE = "scripts/tests/mcp-client.test.mjs";
const SSRF = "src/lib/mcp/ssrf.ts";
const CLIENT = "src/lib/mcp/client.ts";
const PLAN = "src/lib/mcp/plan.ts";

const MUTANTS = [
  { name: "10.0.0.0/8 is let through", file: SSRF, from: "  if (a === 10) return true;\n", to: "", expect: "blocked: 10.0.0.1" },
  { name: "the cloud metadata range is let through", file: SSRF, from: "  if (a === 169 && c === 254) return true; // link-local, cloud metadata\n", to: "", expect: "blocked: 169.254.169.254" },
  { name: "172.16.0.0/12 is let through", file: SSRF, from: "  if (a === 172 && c >= 16 && c <= 31) return true;\n", to: "", expect: "blocked: 172.16.0.1" },
  { name: "192.168.0.0/16 is let through", file: SSRF, from: "  if (a === 192 && c === 168) return true;\n", to: "", expect: "blocked: 192.168.1.1" },
  { name: "carrier-grade NAT is let through", file: SSRF, from: "  if (a === 100 && c >= 64 && c <= 127) return true; // CGNAT\n", to: "", expect: "blocked: 100.64.0.1" },
  { name: "0.0.0.0 is let through", file: SSRF, from: '  if (a === 0) return true; // "this network", 0.0.0.0\n', to: "", expect: "blocked: 0.0.0.0" },
  { name: "multicast and reserved space is let through", file: SSRF, from: "  if (a >= 224) return true; // multicast, reserved, broadcast\n", to: "", expect: "blocked: 255.255.255.255" },
  { name: "loopback is let through even without the test switch", file: SSRF, from: "  if (a === 127) return !allowLoopback;", to: "  if (a === 127) return false;", expect: "blocked: 127.0.0.1" },
  { name: "the IPv4 inside an IPv4-mapped IPv6 is not judged", file: SSRF, from: "    if (allZero(0, 10) && b[10] === 0xff && b[11] === 0xff) return blockedV4(b.slice(12), allowLoopback);\n", to: "", expect: "blocked: ::ffff:10.0.0.1" },
  { name: "NAT64 can carry a private address in", file: SSRF, from: "    if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && allZero(4, 12)) return blockedV4(b.slice(12), allowLoopback);\n", to: "", expect: "blocked: 64:ff9b::a00:1" },
  { name: "6to4 can carry a private address in", file: SSRF, from: "    if (b[0] === 0x20 && b[1] === 0x02) return blockedV4(b.slice(2, 6), allowLoopback);\n", to: "", expect: "blocked: 2002:a9fe:a9fe::1" },
  { name: "IPv6 unique-local addresses are let through", file: SSRF, from: "    if ((b[0] & 0xfe) === 0xfc) return true; // unique local fc00::/7\n", to: "", expect: "blocked: fc00::1" },
  { name: "IPv6 link-local addresses are let through", file: SSRF, from: "    if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // link-local fe80::/10\n", to: "", expect: "blocked: fe80::1" },
  { name: "something that is not an address is called allowed", file: SSRF, from: "  return true; // not an address at all", to: "  return false; // not an address at all", expect: "blocked: not-an-ip" },
  { name: "plain http and every other scheme are let through", file: SSRF, from: '  } else if (url.protocol !== "https:") {\n    return { ok: false, reason: "not_https" };\n  }', to: "  }", expect: "ftp: is refused" },
  { name: "http is let through for any host under the test switch", file: SSRF, from: "    if (!(local && loopbackName)) return { ok: false, reason: \"not_https\" };", to: "    if (!local) return { ok: false, reason: \"not_https\" };", expect: "but http on a public name is still refused" },
  { name: "credentials in the address are let through", file: SSRF, from: '  if (url.username !== "" || url.password !== "") return { ok: false, reason: "credentials_in_url" };\n', to: "", expect: "a user name and password in the address are refused" },
  { name: "names that only mean something inside a network are let through", file: SSRF, from: "  } else if (LOCAL_NAME.test(host) && !(local && host.toLowerCase() === \"localhost\")) {\n    return { ok: false, reason: \"blocked_host\" };\n  }", to: "  }", expect: "a name that only means something inside a network is refused: https://localhost/" },
  { name: "a private literal address is let through", file: SSRF, from: "    if (isBlockedAddress(host, local)) return { ok: false, reason: \"blocked_host\" };\n  } else if", to: "  } else if", expect: "a private literal is refused: https://127.0.0.1/" },
  { name: "the length limit goes", file: SSRF, from: '  if (text.length > MCP_LIMITS.maxUrlChars) return { ok: false, reason: "too_long" };\n', to: "", expect: "an address longer than 2048 is refused" },
  { name: "the test switch opens the private ranges too", file: SSRF, from: "    const bad = list.find((a) => isBlockedAddress(a.address, local));", to: "    const bad = list.find((a) => isBlockedAddress(a.address, local) && !local);", expect: "...but never the metadata address" },
  { name: "the connection's own lookup stops judging the address", file: SSRF, from: '    if (bad) return callback(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }));\n', to: "", expect: "a name that resolves to loopback is refused at the connection" },
  { name: "the lookup judges only the first address of a list", file: SSRF, from: "    const bad = list.find((a) => isBlockedAddress(a.address, local));", to: "    const bad = [list[0]].find((a) => a && isBlockedAddress(a.address, local) && false);", expect: "a name that resolves to loopback is refused at the connection" },
  { name: "a redirect is followed (not refused)", gate: CLIENT_GATE, file: CLIENT, from: "        if (status >= 300 && status < 400) {", to: "        if (status >= 300 && status < 400 && false) {", expect: "a redirect is refused, not followed" },
  { name: "an oversized reply is read whole", gate: CLIENT_GATE, file: CLIENT, from: "          if (size > MCP_LIMITS.maxResponseBytes) return fail(new McpError(\"too_large\", \"The reply was too large.\"));\n", to: "", expect: "is refused" },
  { name: "the address is not parsed before connecting", gate: CLIENT_GATE, file: CLIENT, from: "  if (!parsed.ok) throw new McpError(\"bad_url\", parsed.reason);\n", to: "  if (!parsed.ok) throw new McpError(\"unreachable\", parsed.reason);\n", expect: "is refused before any request" },
  { name: "a read-only claim is believed when it is anything but a boolean true", gate: CLIENT_GATE, file: CLIENT, from: "readOnly: tool.annotations?.readOnlyHint === true,", to: "readOnly: tool.annotations?.readOnlyHint !== false && tool.annotations?.readOnlyHint !== undefined,", expect: "a hint that is the STRING" },
  { name: "a missing hint counts as read-only", gate: CLIENT_GATE, file: CLIENT, from: "readOnly: tool.annotations?.readOnlyHint === true,", to: "readOnly: tool.annotations?.readOnlyHint !== false,", expect: "a missing hint is not a read-only claim" },
  { name: "a tool name is clipped instead of refused", gate: CLIENT_GATE, file: CLIENT, from: '  const name = typeof tool.name === "string" ? tool.name : "";', to: '  const name = typeof tool.name === "string" ? tool.name.slice(0, 128) : "";', expect: "a name with a space, a slash or a quote is not a tool" },
  { name: "the fence stops removing its own closing tag", gate: CLIENT_GATE, file: PLAN, from: '    .replace(new RegExp(`<\\\\s*/?\\\\s*${tag}[^>]*>`, "gi"), "[removed]");', to: ";", expect: "the fence's own closing tag inside the description was removed" },
  { name: "the fence's tag is removed only in lower case", gate: CLIENT_GATE, file: PLAN, from: '"gi"), "[removed]")', to: '"g"), "[removed]")', expect: "the fence's tags are removed in any casing and spacing" },
  { name: "a tool the app never listed is accepted", gate: CLIENT_GATE, file: PLAN, from: "  const tool = tools.find((t) => t.name === name);\n  if (!tool) return null;", to: "  const tool = tools.find((t) => t.name === name) ?? { name, readOnly: true };", expect: "the model's choice of a tool the server did NOT list is refused" },
  { name: "the model decides whether a call needs a press", gate: CLIENT_GATE, file: PLAN, from: "readOnly: !needsApproval(tool) };", to: "readOnly: (input as { readOnly?: boolean }).readOnly === true || !needsApproval(tool) };", expect: "a read-only tool is read-only by the SERVER's list" },
  { name: "needsApproval trusts a missing hint", gate: CLIENT_GATE, file: PLAN, from: "  return tool.readOnly !== true;", to: "  return tool.readOnly === false;", expect: "approval is a property of the tool" },
];

runMutations({
  name: "mcp-ssrf",
  gate: GATE,
  targets: [SSRF, CLIENT, PLAN],
  mutants: MUTANTS,
});
