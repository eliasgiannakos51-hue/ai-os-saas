/**
 * Client IP resolution from proxy headers — used for device fingerprinting
 * (api/auth/device-check) and IP-scoped rate limiting (signup, login
 * failures, delete-account confirmation, website form submissions).
 *
 * THE COMMENT USED TO CONTRADICT THE CODE. It said "on Vercel the
 * outermost value is set by the platform's edge", and the code read
 * `x-forwarded-for`.split(",")[0] — the INNERMOST value, which in the
 * standard `client, proxy1, proxy2` convention is the end a client can
 * write. Whether that was safe depended entirely on whether the platform
 * in front overwrites the inbound header or appends to it, which is a
 * property of the host, not of this function, and was checked by nothing.
 * If it appends, an attacker sending `x-forwarded-for: 203.0.113.<n>`
 * gets a fresh rate-limit bucket per request and every IP-scoped limit in
 * the product becomes decorative.
 *
 * SO IT NO LONGER DEPENDS ON THAT. The order below is most-trustworthy
 * first:
 *
 *   x-vercel-forwarded-for  Vercel strips inbound `x-vercel-*` headers and
 *                           sets this itself. A client cannot write it.
 *   x-real-ip               also set by the platform on Vercel; the
 *                           conventional single-value header elsewhere.
 *   x-forwarded-for [0]     the last resort, and the one a client CAN
 *                           write when nothing in front rewrites it.
 *
 * WHICH OF THE THREE THIS DEPLOYMENT ACTUALLY USES IS NOT ASSERTED HERE,
 * because it was not measured: a request's headers are not visible from
 * outside, and no route echoes them. The order is what makes the answer
 * stop mattering. The last branch is kept so that running anywhere else
 * degrades to the previous behaviour rather than to "unknown" — which
 * would put every request into one shared bucket and lock out the first
 * user to make a mistake.
 *
 * It is still not a security boundary. An attacker with a pool of real
 * addresses gets a bucket per address whatever this function does; what
 * it now costs them is the addresses.
 */
export function getClientIp(request: Request): string {
  // Single-value, platform-set. Taken whole, not split: if it ever does
  // carry a list, the first entry is still platform-written.
  const vercel = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;

  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
