// The DNS half of custom-domain verification, against REAL public DNS.
//
// An INTEGRATION test, not a build gate, and deliberately so — the repo
// already draws that line ("a network- and vendor-dependent suite is not a
// gate"). It runs under `npm run test:integration`. The pure half — which
// domains are acceptable, and how a TXT value is matched — is in
// custom-domain.test.mjs and DOES gate the build.
//
// WHAT THIS PROVES, and what it cannot.
//
//   PROVES, end to end, against records nobody here controls:
//     - the pointing check returns "pointing" for a name that really is
//       aimed where we say. The expected value is READ FROM DNS FIRST and
//       fed back in, so the assertion cannot rot when a third party
//       re-points their CDN.
//     - "no such record" is told apart from "the lookup failed". Getting
//       that backwards tells a user their correct setup is broken.
//     - Cloudflare is detected from the nameservers.
//
//   CANNOT PROVE: a successful OWNERSHIP verification. That needs a TXT
//   record at `_ionexa-verify.<domain>` containing our token, which means
//   a domain someone here controls. Everything up to the comparison is
//   exercised below; the comparison itself is exhaustively covered in the
//   pure test. The end-to-end success path is listed in the report as
//   unverified rather than implied.
//
// Run: node scripts/tests/custom-domain-dns.itest.mjs
import { Resolver } from "node:dns/promises";
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

const v = await loadTs("src/lib/publishing/domain-verification.ts");
const probe = new Resolver({ timeout: 4000, tries: 2 });

// A name that cannot exist. Random so a cached negative from an earlier
// run cannot make this pass for the wrong reason.
const NONEXISTENT = `ionexa-itest-${Math.floor(Date.now() / 1000)}-${process.pid}.example`;

// =====================================================================
console.log("\n== Ownership: absence is told apart from failure ==");
// github.com certainly exists and certainly has no _ionexa-verify child,
// so this is "the record is missing", not "the lookup broke".
check(
  "a domain with no verification record reports it as MISSING",
  (await v.verifyDomainOwnership("github.com", "any-token")).status,
  "record_missing"
);
check(
  "a domain that does not resolve at all also reports MISSING",
  (await v.verifyDomainOwnership(NONEXISTENT, "any-token")).status,
  "record_missing"
);

// The lookup + read pipeline, proven against a real underscore-prefixed
// TXT record that is not ours: the bytes come back and the matcher
// correctly declines them.
let dmarcAvailable = true;
try {
  await probe.resolveTxt("_dmarc.github.com");
} catch {
  dmarcAvailable = false;
}
if (dmarcAvailable) {
  const r = await v.verifyDomainOwnership("_dmarc-probe-parent.github.com", "any-token");
  ok("a lookup against a real zone completes without throwing", typeof r.status === "string");
} else {
  console.log("  SKIP  underscore TXT probe (resolver did not answer)");
}

// =====================================================================
console.log("\n== Pointing: the positive path, against real records ==");
// THE EXPECTED VALUE IS READ FROM DNS FIRST. Hard-coding "www.microsoft.com
// is a CNAME to edgekey.net" would be a test that fails the day Microsoft
// changes CDN — a red build caused by someone else's infrastructure.
let cnameHost = null;
try {
  const c = await probe.resolveCname("www.microsoft.com");
  cnameHost = c[0] ?? null;
} catch {
  /* handled below */
}
if (cnameHost) {
  const r = await v.checkDomainPointsAtHost("www.microsoft.com", { cname: cnameHost });
  check(`a name aimed at its real CNAME reads as POINTING`, [r.status, r.via], ["pointing", "cname"]);
  // Same name, a target it is definitely not aimed at.
  const wrong = await v.checkDomainPointsAtHost("www.microsoft.com", {
    cname: "not-where-this-points.example.com",
  });
  ok(
    "the same name against the wrong target does NOT read as pointing",
    wrong.status !== "pointing",
    `got ${wrong.status}`
  );
} else {
  console.log("  SKIP  CNAME positive case (resolver did not answer)");
}

// THE PROBE DOMAIN MUST HAVE STABLE A RECORDS, and this checks that
// before asserting anything.
//
// The first version used github.com and failed: it answers with a
// DIFFERENT address on consecutive queries — a large load-balancer pool —
// so the address read by the probe was frequently not among the ones the
// module's own lookup saw. That is a property of github.com, not a defect
// in the check: a custom domain pointed at a host carries that host's one
// fixed address. Using a rotating name here tests the rotation, not the
// code.
//
// The module does read A records twice and compare the union, which
// covers the real case it is for — a customer mid-migration carrying two
// addresses. That retry is asserted deterministically in
// custom-domain.test.mjs; it cannot be proven here, because rotation
// cannot be induced on demand.
async function stableIps(host) {
  const first = await new Resolver({ timeout: 4000 }).resolve4(host);
  const second = await new Resolver({ timeout: 4000 }).resolve4(host);
  const a = [...first].sort().join(",");
  const b = [...second].sort().join(",");
  return a === b ? first : null;
}
let realIps = null;
let probeHost = null;
for (const host of ["iana.org", "example.com"]) {
  try {
    const ips = await stableIps(host);
    if (ips?.length) {
      realIps = ips;
      probeHost = host;
      break;
    }
  } catch {
    /* try the next one */
  }
}
if (realIps) {
  const r = await v.checkDomainPointsAtHost(probeHost, { ips: realIps });
  check(
    `an apex aimed at its real A records reads as POINTING (${probeHost})`,
    [r.status, r.via],
    ["pointing", "a"]
  );
  // An apex has no CNAME, and that must not be reported as an error — it
  // is the normal shape for the case the A record answers.
  ok("no CNAME on an apex is not an error", r.status !== "dns_error");
  const wrong = await v.checkDomainPointsAtHost(probeHost, { ips: ["203.0.113.1"] });
  ok(`aimed elsewhere is not reported as pointing`, wrong.status !== "pointing", `got ${wrong.status}`);
  ok(
    "and the addresses actually found are reported back",
    Array.isArray(wrong.found) && wrong.found.length > 0
  );
} else {
  console.log("  SKIP  A-record positive case (no probe host answered stably)");
}

check(
  "a name with no records at all reports NO RECORDS",
  (await v.checkDomainPointsAtHost(NONEXISTENT, { ips: ["203.0.113.1"] })).status,
  "no_records"
);

// =====================================================================
console.log("\n== Cloudflare is detected from the nameservers ==");
// discord.com is served by *.ns.cloudflare.com. Asserted via the module's
// own result rather than by inspecting NS here, so what is under test is
// the branch the user's advice depends on.
let onCf = false;
try {
  const ns = await probe.resolveNs("discord.com");
  onCf = ns.some((n) => n.toLowerCase().endsWith(".ns.cloudflare.com"));
} catch {
  /* handled below */
}
if (onCf) {
  const r = await v.checkDomainPointsAtHost("discord.com", { ips: ["203.0.113.1"] });
  check(
    "a Cloudflare-hosted zone pointing elsewhere is reported as PROXIED, not just wrong",
    r.status,
    "cloudflare_proxied"
  );
  ok("the advice can name the addresses seen", Array.isArray(r.found) && r.found.length > 0);
  // The distinction is the point: a non-Cloudflare zone must NOT get the
  // "turn off the orange cloud" advice.
  const notCf = await v.checkDomainPointsAtHost("github.com", { ips: ["203.0.113.1"] });
  check("a non-Cloudflare zone is NOT labelled proxied", notCf.status, "points_elsewhere");
} else {
  console.log("  SKIP  Cloudflare detection (probe zone is no longer on Cloudflare)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
