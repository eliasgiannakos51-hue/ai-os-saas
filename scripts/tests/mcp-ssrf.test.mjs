#!/usr/bin/env node
// CONNECT BY ADDRESS: THE ADDRESS GUARD (2026-10-26, Phase 2 of the final
// All tools grid). A person types an address and the SERVER opens it, which
// is the shape of server-side request forgery: «https://169.254.169.254/»
// and «https://localhost:5432/» are addresses too.
//
// This RUNS src/lib/mcp/ssrf.ts: the text of the address (parseMcpUrl),
// the numbers it can resolve to (isBlockedAddress, IPv4 and IPv6 including
// the IPv4 hidden inside an IPv6), and the moment of connecting
// (guardedLookup, where the address that is judged is the one connected to).
// scripts/tests/mcp-ssrf.mutation.mjs requires every clause to go red.
//
// Run: node scripts/tests/mcp-ssrf.test.mjs
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const ssrf = await loadTs("src/lib/mcp/ssrf.ts");
delete process.env.MCP_ALLOW_INSECURE_LOCAL;

console.log("== 1. the numbers: every private, loopback, link-local and metadata address is blocked ==");
const MUST_BLOCK = [
  // IPv4
  "127.0.0.1", "127.255.255.254", "0.0.0.0", "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.1.1",
  "169.254.169.254", "169.254.0.1", "100.64.0.1", "100.127.255.255", "192.0.0.1", "192.0.2.5", "198.18.0.1", "198.19.255.255",
  "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.255.255.250", "240.0.0.1", "255.255.255.255", "192.88.99.1",
  // IPv6
  "::1", "::", "fe80::1", "fe80::abcd%eth0", "fc00::1", "fd12:3456:789a::1", "fec0::1", "ff02::1", "2001:db8::1",
  // the IPv4 hidden inside an IPv6
  "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::ffff:7f00:1", "::127.0.0.1", "64:ff9b::a00:1", "64:ff9b::169.254.169.254", "2002:7f00:1::1", "2002:a9fe:a9fe::1",
  // not an address at all
  "not-an-ip", "",
];
for (const ip of MUST_BLOCK) check(`blocked: ${ip || "(empty)"}`, ssrf.isBlockedAddress(ip) === true);
const MUST_ALLOW = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "169.253.1.1", "192.169.0.1", "198.17.0.1", "198.20.0.1", "223.255.255.254", "2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::1"];
for (const ip of MUST_ALLOW) check(`allowed (public): ${ip}`, ssrf.isBlockedAddress(ip) === false);

console.log("\n== 2. the text: only https, no credentials, no private literal, no private name ==");
const refuses = (url, reason) => {
  const r = ssrf.parseMcpUrl(url);
  return r.ok === false && (reason ? r.reason === reason : true);
};
check("an ordinary https address is accepted", ssrf.parseMcpUrl("https://mcp.example.com/mcp").ok === true);
check("...with a port and a query", ssrf.parseMcpUrl("https://mcp.example.com:8443/mcp?x=1").ok === true);
check("http is refused", refuses("http://mcp.example.com/mcp", "not_https"));
for (const scheme of ["ftp://x.example.com/", "file:///etc/passwd", "gopher://x.example.com/", "javascript:alert(1)", "data:text/plain,hi"]) {
  check(`${scheme.split(":")[0]}: is refused`, refuses(scheme));
}
check("a user name and password in the address are refused", refuses("https://user:pass@mcp.example.com/", "credentials_in_url"));
check("a user name alone is refused", refuses("https://user@mcp.example.com/", "credentials_in_url"));
check("not an address is refused", refuses("hello there", "invalid_url") && refuses("", "invalid_url") && refuses("   ", "invalid_url"));
check("an address longer than 2048 is refused", refuses(`https://mcp.example.com/${"a".repeat(2100)}`, "too_long"));
for (const url of [
  "https://127.0.0.1/", "https://10.1.2.3/", "https://192.168.0.1/", "https://169.254.169.254/latest/meta-data/",
  "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://[fd00::1]/", "https://[fe80::1]/", "https://0.0.0.0/", "https://100.64.0.1/",
  // forms that mean the same number and that URL parsing normalises
  "https://2130706433/", "https://0x7f000001/", "https://0177.0.0.1/", "https://127.1/", "https://0/", "https://017700000001/",
]) {
  check(`a private literal is refused: ${url}`, refuses(url, "blocked_host"));
}
for (const url of ["https://localhost/", "https://LOCALHOST:8443/", "https://printer.local/", "https://db.internal/", "https://router.lan/", "https://nas.home/", "https://app.corp/", "https://x.localhost/", "https://host.localdomain/", "https://intranet/"].slice(0, 9)) {
  check(`a name that only means something inside a network is refused: ${url}`, refuses(url, "blocked_host"));
}
check("the address returned is normalised by URL parsing", ssrf.parseMcpUrl("https://MCP.Example.com/mcp").url?.hostname === "mcp.example.com");

console.log("\n== 3. the test switch opens loopback over http, and nothing else ==");
process.env.MCP_ALLOW_INSECURE_LOCAL = "1";
check("with the switch: http on 127.0.0.1 is accepted", ssrf.parseMcpUrl("http://127.0.0.1:8080/mcp").ok === true);
check("...and http://localhost", ssrf.parseMcpUrl("http://localhost:8080/mcp").ok === true);
check("...but http on a public name is still refused", refuses("http://mcp.example.com/mcp", "not_https"));
check("...and the private ranges are still blocked", refuses("http://10.0.0.1/", "not_https") && refuses("https://10.0.0.1/", "blocked_host") && refuses("https://192.168.1.1/", "blocked_host"));
check("...and the metadata address is still blocked", refuses("https://169.254.169.254/", "blocked_host") && refuses("http://169.254.169.254/", "not_https"));
check("...and IPv4-mapped metadata stays blocked", refuses("https://[::ffff:169.254.169.254]/", "blocked_host"));
check("isBlockedAddress opens loopback only when asked to", ssrf.isBlockedAddress("127.0.0.1", true) === false && ssrf.isBlockedAddress("10.0.0.1", true) === true && ssrf.isBlockedAddress("169.254.169.254", true) === true && ssrf.isBlockedAddress("::1", true) === false);
delete process.env.MCP_ALLOW_INSECURE_LOCAL;
check("without the switch: http://127.0.0.1 is refused again", refuses("http://127.0.0.1:8080/mcp", "not_https") && refuses("https://127.0.0.1/", "blocked_host"));

console.log("\n== 4. the moment of connecting: the address that is judged is the one connected to ==");
const lookup = (host, options = {}) => new Promise((resolve) => ssrf.guardedLookup(host, options, (err, address, family) => resolve({ err, address, family })));
const blocked = await lookup("localhost");
check("a name that resolves to loopback is refused at the connection", blocked.err?.code === "EBLOCKED", JSON.stringify({ code: blocked.err?.code, address: blocked.address }));
const blockedAll = await lookup("localhost", { all: true });
check("...also when the caller asks for every address", blockedAll.err?.code === "EBLOCKED");
const literal = await lookup("127.0.0.1");
check("an address literal is judged too", literal.err?.code === "EBLOCKED");
const meta = await lookup("169.254.169.254");
check("...including the metadata address", meta.err?.code === "EBLOCKED");
process.env.MCP_ALLOW_INSECURE_LOCAL = "1";
const allowed = await lookup("127.0.0.1");
check("with the test switch, loopback connects", !allowed.err && allowed.address === "127.0.0.1", JSON.stringify(allowed));
const allowedAll = await lookup("127.0.0.1", { all: true });
check("...and answers a list when asked for one", !allowedAll.err && Array.isArray(allowedAll.address) && allowedAll.address[0].address === "127.0.0.1");
const stillMeta = await lookup("169.254.169.254");
check("...but never the metadata address", stillMeta.err?.code === "EBLOCKED");
delete process.env.MCP_ALLOW_INSECURE_LOCAL;
const nothing = await lookup("this-name-does-not-exist.invalid");
check("a name that does not resolve is an error, not an address", Boolean(nothing.err));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
