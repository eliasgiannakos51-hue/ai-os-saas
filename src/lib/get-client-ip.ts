// Best-effort client IP resolution from proxy headers — used for device
// fingerprinting (api/auth/device-check) and IP-scoped rate limiting
// (api/signup). Not spoof-proof (a client can send its own
// x-forwarded-for), but on Vercel the outermost value is set by the
// platform's edge, which is good enough for abuse-mitigation purposes.
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
