// The same device must be ONE row in Login Activity.
//
// THE BUG THIS PINS. The fingerprint was sha256(`${ip}|${userAgent}`), so
// a device got a new identity every time its address changed — and
// addresses change without the device moving: a carrier rotates its NAT
// pool, a router renews its DHCP lease, IPv6 privacy extensions mint a
// fresh address every few hours by design. Reported from a live account as
// "the same device appears many times for no reason".
//
// The security cost is larger than the clutter: a "new sign-in" email
// fires per new row, so the alert meant to say "somebody else is in your
// account" arrived every time a phone changed cell.
//
// Run: node scripts/tests/device-fingerprint.test.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

// The route is a Next handler, so networkOf is lifted out of the source
// rather than imported — the alternative is exporting an internal for the
// benefit of a test, which is how an internal stops being one.
const src = readFileSync("src/app/api/auth/device-check/route.ts", "utf8");
const body = /function networkOf\(ip: string\): string \{[\s\S]*?\n\}/.exec(src)?.[0];
if (!body) {
  console.log("  FAIL  networkOf() not found in the route");
  process.exit(1);
}
const networkOf = new Function(`${body.replace(/: string/g, "").replace(/\bfunction networkOf\(ip\)/, "function networkOf(ip)")}; return networkOf;`)();
const fp = (ip, ua) => createHash("sha256").update(`${networkOf(ip)}|${ua}`).digest("hex");

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const OTHER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0";

console.log("== 1. one device, one row, across an address that moves ==");
// A carrier NAT pool and a DHCP renewal both look like this.
check("a new address in the same /24 is the same device",
  fp("81.4.102.17", UA) === fp("81.4.102.203", UA),
  `${networkOf("81.4.102.17")} vs ${networkOf("81.4.102.203")}`);
// IPv6 privacy extensions rotate the low 64 bits every few hours.
check("an IPv6 privacy-extension rotation is the same device",
  fp("2a02:587:a01d:1200:acd3:11ff:fe22:1", UA) === fp("2a02:587:a01d:9900:7e5f:0:0:99", UA));
check("...and the two spellings of one IPv6 address agree",
  fp("2001:db8::1", UA) === fp("2001:0db8:0000:0000:0000:0000:0000:0001", UA),
  `${networkOf("2001:db8::1")} vs ${networkOf("2001:0db8:0000:0000:0000:0000:0000:0001")}`);
check("an IPv4-mapped IPv6 address is its IPv4 network",
  fp("::ffff:81.4.102.17", UA) === fp("81.4.102.17", UA),
  networkOf("::ffff:81.4.102.17"));

console.log("\n== 2. and it still separates what should be separate ==");
// The whole point of the alert: somebody else, somewhere else.
check("a different network IS a different device",
  fp("81.4.102.17", UA) !== fp("203.0.113.9", UA));
check("a different IPv6 /48 IS a different device",
  fp("2a02:587:a01d:1200::1", UA) !== fp("2a02:587:beef:1200::1", UA));
check("a different browser on the same network IS a different device",
  fp("81.4.102.17", UA) !== fp("81.4.102.17", OTHER_UA));

console.log("\n== 3. the route uses it ==");
check("the fingerprint is computed from the network, not the address",
  /update\(`\$\{networkOf\(ip\)\}\|\$\{userAgent\}`\)/.test(src),
  "computeFingerprint must not hash the raw ip");
check("and nothing else hashes a bare ip",
  !/update\(`\$\{ip\}\|/.test(src));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
