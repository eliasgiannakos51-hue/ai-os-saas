// Custom domain validation — the half that needs no network.
//
// WHY THIS IS SPLIT FROM THE DNS CHECKS. Deciding whether a string is a
// domain we will accept is a pure function; deciding whether its owner
// controls it is a network call. Only the first belongs in a build gate —
// the repo already draws that line for scripts/safety-eval.mjs ("a
// network- and vendor-dependent suite is not a gate"). The DNS half lives
// in custom-domain-dns.itest.mjs and runs against real public records.
//
// THE FAILURE THIS FILE EXISTS TO PREVENT is not a malformed string. It is
// a customer verifying `ionexa.ai`, or any `*.vercel.app` name, and being
// handed a page served from our own origin under our own name — every
// phishing property you could want, granted by a form that only checked
// the shape of what was typed.
//
// Run: node scripts/tests/custom-domain.test.mjs
import { readdirSync, readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

const d = await loadTs("src/lib/publishing/custom-domain.ts");

// =====================================================================
console.log("\n== Accepted, and canonicalised on the way in ==");
// The stored value must be what was CHECKED, never the raw input — the
// same rule validateSubdomain follows. Anything else means the database
// holds a string no validator ever saw.
const ACCEPTED = [
  ["acme.com", "acme.com"],
  ["ACME.COM", "acme.com"],
  ["  acme.com  ", "acme.com"],
  ["https://acme.com", "acme.com"],
  ["http://www.acme.com/pricing?a=1#top", "www.acme.com"],
  ["acme.com.", "acme.com"], // the root's trailing dot
  ["acme.com:443", "acme.com"],
  ["user@acme.com", "acme.com"], // pasted from an email address
  ["shop.acme.co.uk", "shop.acme.co.uk"],
  ["a-b.acme-co.com", "a-b.acme-co.com"],
  ["xn--80ak6aa92e.com", "xn--80ak6aa92e.com"], // already punycode
];
for (const [input, expected] of ACCEPTED) {
  const r = d.validateCustomDomain(input);
  check(`${JSON.stringify(input)} -> ${expected}`, r.ok ? r.domain : r, expected);
}

// =====================================================================
console.log("\n== Refused ==");
const REFUSED = [
  ["", "empty"],
  ["   ", "empty"],
  [null, "empty"],
  [42, "empty"],
  ["com", "too_few_labels"],
  ["localhost", "reserved"],
  ["acme", "too_few_labels"],
  ["*.acme.com", "wildcard"],
  ["acme.*.com", "wildcard"],
  ["192.168.1.1", "looks_like_ip"],
  ["1.2.3.4", "looks_like_ip"],
  ["[::1]", "looks_like_ip"],
  ["acme.123", "looks_like_ip"], // an all-digit TLD is never real
  ["-acme.com", "invalid_characters"],
  ["acme-.com", "invalid_characters"],
  ["ac me.com", "invalid_characters"],
  ["acme_site.com", "invalid_characters"],
  ["καφές.gr", "not_ascii"], // must be entered as punycode
  [`${"a".repeat(64)}.com`, "label_too_long"],
  [`${"a.".repeat(130)}com`, "too_long"],
];
for (const [input, reason] of REFUSED) {
  const r = d.validateCustomDomain(input);
  check(`${JSON.stringify(input)} -> ${reason}`, r.ok ? "ACCEPTED" : r.reason, reason);
}

// =====================================================================
console.log("\n== Our own names cannot be claimed ==");
// Cross-product over the reserved set AND a subdomain of each, because a
// check that only matched the exact string would let `pay.ionexa.ai`
// through — a more convincing phishing address than the apex.
for (const reserved of d.RESERVED_DOMAINS) {
  const exact = d.validateCustomDomain(reserved);
  ok(`${reserved} is refused`, !exact.ok && exact.reason === "reserved");
  const child = d.validateCustomDomain(`login.${reserved}`);
  ok(`login.${reserved} is refused`, !child.ok && child.reason === "reserved");
}
ok("the list actually covers our own domain", d.RESERVED_DOMAINS.has("ionexa.ai"));
ok("and the host we deploy on", d.RESERVED_DOMAINS.has("vercel.app"));
// A name that merely CONTAINS a reserved one is a different domain and
// must still be accepted — `notionexa.ai` belongs to someone else.
ok("a name that only contains a reserved word is fine", d.validateCustomDomain("notionexa.ai").ok);
// The reserved check matches on SUFFIXES, so a name that merely starts
// with one is a different domain belonging to someone else and must be
// accepted. `ionexa-ai.com` and `myionexa.com` are ordinary registrations.
for (const lookalike of ["ionexa-ai.com", "myionexa.com", "ionexa.ai.someone-else.co"]) {
  ok(`${lookalike} is accepted — it is not ours`, d.validateCustomDomain(lookalike).ok);
}

// =====================================================================
console.log("\n== Apex or subdomain — which record to show ==");
// This decides whether the user is told to create an A record or a CNAME,
// and the rule is DNS's own: a CNAME cannot coexist with the SOA and NS
// records an apex must carry.
const APEX = [
  ["acme.com", true, true],
  ["acme.gr", true, true],
  ["www.acme.com", false, true],
  ["shop.acme.com", false, true],
  ["acme.co.uk", true, true], // known multi-part suffix
  ["www.acme.co.uk", false, true],
  ["acme.com.gr", true, true],
];
for (const [domain, isApex, confident] of APEX) {
  const v = d.isApexDomain(domain);
  check(`${domain} apex=${isApex} confident=${confident}`, [v.isApex, v.confident], [isApex, confident]);
}
// The honest case: an unlisted multi-part suffix cannot be resolved from
// the string alone, so the module says so instead of guessing.
const unsure = d.isApexDomain("acme.unknown-suffix");
ok("a two-label name is always apex, whatever the TLD", unsure.isApex && unsure.confident);
const three = d.isApexDomain("acme.co.zz");
ok("three labels under an unknown suffix is NOT claimed confidently", !three.confident,
  "an unlisted suffix must produce 'show both records', not a confident wrong answer");

// =====================================================================
console.log("\n== The ownership record ==");
check(
  "the TXT name is an underscore child, so it can never collide with a host",
  d.verificationRecordName("acme.com"),
  "_ionexa-verify.acme.com"
);
check(
  "the value is namespaced",
  d.verificationRecordValue("abc123"),
  "ionexa-site-verification=abc123"
);
ok(
  "the prefix is an underscore label",
  d.VERIFICATION_TXT_PREFIX.startsWith("_"),
  "a name without an underscore could collide with a real host the customer serves"
);
// A bare token would match another vendor's record that happened to hold
// the same string; the namespace is what makes the scan specific.
ok(
  "the value is not the bare token",
  d.verificationRecordValue("abc123") !== "abc123"
);

// =====================================================================
console.log("\n== Matching the TXT record — where correct setups read as wrong ==");
// Every case here is a real configuration that IS correct and that a naive
// comparison rejects. Each one produces the same support ticket: "I added
// the record exactly as shown and it says it did not work."
const TOKEN = "a1b2c3d4e5f6";
const VALUE = d.verificationRecordValue(TOKEN);
const MATCHES = [
  [[[VALUE]], "the plain value"],
  [[[" " + VALUE + " "]], "whitespace from a copy-paste"],
  [[['"' + VALUE + '"']], "the quotes a zone file uses"],
  [[[' "' + VALUE + '" ']], "quotes AND whitespace"],
  // DNS splits anything over 255 bytes; the resolver returns the pieces.
  [[[VALUE.slice(0, 5), VALUE.slice(5)]], "a value split into DNS chunks"],
  [[["v=spf1 -all"], [VALUE]], "ours alongside another vendor's record"],
];
for (const [records, label] of MATCHES) {
  ok(`matches: ${label}`, d.txtRecordsContainToken(records, TOKEN));
}
const NON_MATCHES = [
  [[], "no records at all"],
  [[["v=spf1 -all"]], "someone else's record only"],
  [[[d.verificationRecordValue("wrong-token")]], "a token from an earlier attempt"],
  [[[TOKEN]], "the bare token without our namespace"],
  [[[VALUE + "extra"]], "a value with trailing junk"],
  [[["x" + VALUE]], "a value with leading junk"],
];
for (const [records, label] of NON_MATCHES) {
  ok(`does NOT match: ${label}`, !d.txtRecordsContainToken(records, TOKEN));
}
// The chunk join must be lossless. Joining with a space is the plausible
// mistake and it breaks ONLY long tokens, so it would ship looking fine.
const longToken = "z".repeat(300);
ok(
  "a >255-byte value still matches when split",
  d.txtRecordsContainToken(
    [[d.verificationRecordValue(longToken).slice(0, 255), d.verificationRecordValue(longToken).slice(255)]],
    longToken
  )
);

// =====================================================================
console.log("\n== The module stays testable without a network ==");
const src = readFileSync("src/lib/publishing/custom-domain.ts", "utf8");
ok("it imports nothing from node:dns", !/node:dns/.test(src));
ok("it is not server-only, so the form can use it too", !/^import "server-only"/m.test(src),
  "the settings form checks as the user types with the SAME function the route uses");
ok("it makes no network call", !/\bfetch\(/.test(src));

// =====================================================================
console.log("\n== The DNS module's shape, checked deterministically ==");
// The union-of-two-lookups behaviour cannot be proven reliably against
// third-party DNS — rotation is intermittent, so the real-DNS assertion in
// custom-domain-dns.itest.mjs skips whenever the probe zone happens to
// answer identically twice. This is the deterministic half: the retry has
// to still be there.
const dnsSrc = readFileSync("src/lib/publishing/domain-verification.ts", "utf8");
ok(
  "the A-record check reads twice and compares the union",
  /for \(let attempt = 0; attempt < 2; attempt\+\+\)[\s\S]{0,600}?seenIps\.add\(ip\)/.test(dnsSrc),
  "a single lookup misses a rotating record and flaps between right and wrong"
);
ok(
  "ENOTFOUND and ENODATA are treated as 'no record', not as a failure",
  /NO_RECORD_CODES = new Set\(\["ENOTFOUND", "ENODATA"\]\)/.test(dnsSrc)
);
ok(
  "Cloudflare is detected from nameservers, not an IP list",
  /resolveNs\(domain\)/.test(dnsSrc) && !/104\.1[6-9]\./.test(dnsSrc),
  "a bundled IP range list rots silently; the nameserver suffix does not"
);
ok(
  "every DNS call has a deadline",
  /new Resolver\(\{ timeout: DNS_TIMEOUT_MS, tries: DNS_TRIES \}\)/.test(dnsSrc),
  "an un-deadlined lookup inside a request hangs the request"
);

console.log("\n== the wiring, stated rather than assumed ==");
{
  // 104 GREEN CHECKS OVER A LIBRARY NOTHING CALLS is the easiest thing
  // in a codebase to mistake for a shipped feature — and V4 re-audit #6
  // asks about a settings field, DNS instructions per provider, four
  // states in ten languages and a tier gate, none of which exist. The
  // modules are complete; the FEATURE is not built.
  //
  // So the state is asserted rather than left to be inferred from a
  // green run. When somebody wires it up, this goes red and the header
  // note in custom-domain.ts is what has to be rewritten.
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const q = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(q, out);
      else if (/\.tsx?$/.test(e.name)) out.push(q);
    }
    return out;
  };
  const appFiles = [...walk("src/app"), ...walk("src/components")];
  // THE FLOOR ON THE SCAN, not on the result. `importers` being empty is
  // the answer we want; `appFiles` being empty means the walk found no
  // source at all and the check below proves nothing. Third time
  // scripts/tests/gate-vacuity.test.mjs has caught me on exactly this.
  ok(`the walk found the app's source (${appFiles.length} files)`, appFiles.length >= 200);
  const importers = appFiles.filter((f) =>
    /publishing\/(custom-domain|domain-verification)/.test(readFileSync(f, "utf8"))
  );
  ok(
    `no route or component imports these modules yet (${importers.length})`,
    importers.length === 0,
    `${importers.join(", ")} — the feature is being wired up; rewrite the header note in custom-domain.ts, which currently tells the reader it is not`
  );
  ok(
    "...and the header says so, so a green run is not read as 'shipped'",
    /NOTHING IN THE APP CALLS THIS YET/.test(readFileSync("src/lib/publishing/custom-domain.ts", "utf8"))
  );
  ok(
    "no comment points at a settings route that does not exist",
    !/see the note in the custom-domain settings route/.test(
      readFileSync("src/lib/publishing/domain-verification.ts", "utf8")
    )
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
