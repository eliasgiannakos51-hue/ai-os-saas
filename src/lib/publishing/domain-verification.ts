import "server-only";
import { Resolver } from "node:dns/promises";
import {
  verificationRecordName,
  txtRecordsContainToken,
  asciiLowerCase,
} from "@/lib/publishing/custom-domain";

// Does this person control this domain, and is it pointed at us?
//
// Two SEPARATE questions, answered by two separate functions, because they
// fail for different reasons and the user has to do different things about
// each:
//
//   OWNERSHIP  — a TXT record only the domain's controller could have
//                created. Proves the claim. Without it, anyone could type
//                `bank.example` into the form and have us serve a page on
//                a name they do not own.
//   POINTING   — an A or CNAME record aimed at the host. Makes the site
//                actually load. A domain can be verified and not pointed
//                (nothing serves yet), or pointed and not verified (we
//                refuse to serve it, which is the safe direction).
//
// Collapsing them into one "is it working" boolean is what produces the
// support ticket that says "it says failed and I don't know which part".

// A DNS lookup inside a request has to have a deadline. Node's resolver
// retries internally, so `timeout` is per try and the worst case is
// timeout x tries — sized here to stay well inside a normal request.
const DNS_TIMEOUT_MS = 3000;
const DNS_TRIES = 2;

function resolver(): Resolver {
  return new Resolver({ timeout: DNS_TIMEOUT_MS, tries: DNS_TRIES });
}

/**
 * DNS answers that mean "this name has no such record", as opposed to
 * "the lookup failed".
 *
 * The distinction is the whole difference between telling someone "add the
 * record" and telling them "we could not check just now, try again" — and
 * getting it backwards means telling a user their correct configuration is
 * wrong. ENOTFOUND is NXDOMAIN (no such name); ENODATA is the name exists
 * but carries no record of that type.
 */
const NO_RECORD_CODES = new Set(["ENOTFOUND", "ENODATA"]);

export type OwnershipResult =
  | { status: "verified" }
  | { status: "record_missing" }
  /** The record exists but none of its values is ours — usually a token
   *  from an earlier attempt, or a copy/paste that lost characters. */
  | { status: "record_mismatch"; found: string[] }
  | { status: "dns_error"; code: string };

/**
 * Looks for our token in the TXT records of `_ionexa-verify.<domain>`.
 *
 * A TXT record is returned as an array of strings per record because DNS
 * splits values longer than 255 bytes into chunks; they are joined with no
 * separator, which is what every other consumer of TXT does and what the
 * registrar UI implies when it shows one long value.
 */
export async function verifyDomainOwnership(
  domain: string,
  token: string
): Promise<OwnershipResult> {
  try {
    const records = await resolver().resolveTxt(verificationRecordName(domain));
    // The matching itself lives in the pure module, where the chunk-join,
    // quote-strip and trim rules can be tested exhaustively without a
    // socket. This function owns the lookup and the error classification,
    // nothing else.
    if (txtRecordsContainToken(records, token)) return { status: "verified" };
    return { status: "record_mismatch", found: records.map((c) => c.join("")).slice(0, 5) };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "UNKNOWN";
    if (NO_RECORD_CODES.has(code)) return { status: "record_missing" };
    return { status: "dns_error", code };
  }
}

/** Nameservers ending here mean the zone is hosted on Cloudflare. */
const CLOUDFLARE_NS_SUFFIX = ".ns.cloudflare.com";

/**
 * True when the domain's zone is served by Cloudflare.
 *
 * Detected from the NAMESERVERS, not from the address the A record
 * resolves to. An IP-range list would have to be kept in sync with
 * Cloudflare's published ranges forever and would silently rot; the
 * nameserver suffix is stable and is one lookup.
 *
 * This is what turns a useless "your DNS points somewhere else" into the
 * message that actually fixes it — on Cloudflare the orange-cloud proxy is
 * ON by default, and a proxied record answers with Cloudflare's own
 * address rather than the one the user entered. The record is correct and
 * the site still will not load.
 */
async function isOnCloudflare(domain: string): Promise<boolean> {
  try {
    const ns = await resolver().resolveNs(domain);
    return ns.some((n) => asciiLowerCase(n).endsWith(CLOUDFLARE_NS_SUFFIX));
  } catch {
    // Never the reason a verification fails — this only chooses which
    // advice to show.
    return false;
  }
}

export type PointingResult =
  | { status: "pointing"; via: "cname" | "a" }
  /** On Cloudflare, records present, none of them ours: the overwhelmingly
   *  likely cause is the proxy, and the fix is one toggle. */
  | { status: "cloudflare_proxied"; found: string[] }
  | { status: "points_elsewhere"; found: string[] }
  | { status: "no_records" }
  | { status: "dns_error"; code: string };

/**
 * Is the domain aimed at us yet?
 *
 * `expectedCname` and `expectedIps` come from the HOST, not from this
 * file — they must come from whatever route eventually offers this, which
 * DOES NOT EXIST YET (see the header of custom-domain.ts). Hard-coding a
 * provider's address here would put a value that only that provider can
 * change into a module that has no way to notice when it does.
 *
 * CNAME is checked first because a name that has one cannot also have an
 * A record; only if there is no CNAME is the A record meaningful.
 */
export async function checkDomainPointsAtHost(
  domain: string,
  expected: { cname?: string | null; ips?: readonly string[] }
): Promise<PointingResult> {
  const wantCname = expected.cname ? asciiLowerCase(expected.cname.trim()).replace(/\.$/, "") : null;
  const wantIps = new Set((expected.ips ?? []).map((ip) => ip.trim()));
  const found: string[] = [];
  const r = resolver();

  try {
    const cnames = await r.resolveCname(domain);
    for (const c of cnames) found.push(c);
    if (wantCname && cnames.some((c) => asciiLowerCase(c).replace(/\.$/, "") === wantCname)) {
      return { status: "pointing", via: "cname" };
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "UNKNOWN";
    // ENODATA here is normal and expected: an apex has no CNAME by
    // definition, and the A record below is the real answer for it.
    if (!NO_RECORD_CODES.has(code)) return { status: "dns_error", code };
  }

  // A RECORDS ARE READ TWICE ON A MISS, and only on a miss.
  //
  // A name with several A records can be answered with a ROTATING SUBSET —
  // measured: github.com returns a different single address on
  // consecutive queries. That matters here because a customer mid-migration
  // legitimately has two A records, ours and their old host's, and a
  // single query that happens to return only the old one would report
  // "points elsewhere" for a domain that is correctly configured. The
  // check would then flap: right on one attempt, wrong on the next.
  //
  // The second lookup costs nothing in the normal case, which returns on
  // the first, and the union is what gets compared.
  const seenIps = new Set<string>();
  for (let attempt = 0; attempt < 2; attempt++) {
    let ips: string[];
    try {
      ips = await r.resolve4(domain);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "UNKNOWN";
      if (!NO_RECORD_CODES.has(code)) return { status: "dns_error", code };
      break;
    }
    for (const ip of ips) seenIps.add(ip);
    if (wantIps.size > 0 && [...seenIps].some((ip) => wantIps.has(ip))) {
      for (const ip of seenIps) if (!found.includes(ip)) found.push(ip);
      return { status: "pointing", via: "a" };
    }
  }
  for (const ip of seenIps) if (!found.includes(ip)) found.push(ip);

  if (found.length === 0) return { status: "no_records" };
  if (await isOnCloudflare(domain)) return { status: "cloudflare_proxied", found: found.slice(0, 5) };
  return { status: "points_elsewhere", found: found.slice(0, 5) };
}
