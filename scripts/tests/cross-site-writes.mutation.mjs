#!/usr/bin/env node
/*
 * CAN cross-site-writes.test.mjs SEE A CROSS-SITE WRITE GET THROUGH?
 *
 * One mutant per wall (2026-11-05 review, A5): each header the verdict
 * reads, the opaque origin, an exception grown wider than its route, the
 * middleware's refusal, and the JSON-only rule on its two halves.
 *
 * Run: node scripts/tests/cross-site-writes.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/cross-site-writes.test.mjs";
const LIB = "src/lib/security/cross-site.ts";
const MW = "src/proxy.ts";
const LOGIN = "src/app/api/auth/login/route.ts";
const SIGNUP = "src/app/api/signup/route.ts";

const MUTANTS = [
  {
    name: "Sec-Fetch-Site is not read",
    file: LIB,
    from: '  if (input.secFetchSite?.toLowerCase() === "cross-site") return "refuse";',
    to: '  if (input.secFetchSite?.toLowerCase() === "cross-site-never") return "refuse";',
    expect: "...even with no Origin",
  },
  {
    name: "an Origin that is another site is accepted",
    file: LIB,
    from: '    if (from === null || !own.has(from)) return "refuse";',
    to: '    if (from === null) return "refuse";',
    expect: "a POST whose Origin is another site",
  },
  {
    name: "an opaque origin is accepted",
    file: LIB,
    from: '    if (from === null || !own.has(from)) return "refuse";',
    to: '    if (from !== null && !own.has(from)) return "refuse";',
    expect: "a POST from an opaque origin",
  },
  {
    name: "the published-site exception grows to every site route",
    file: LIB,
    from: "    pattern: /^\\/api\\/websites\\/[^/]+\\/submit-form$/,",
    to: "    pattern: /^\\/api\\/websites\\//,",
    expect: "...nor a site route that is not the form",
  },
  {
    name: "the middleware asks and lets it through",
    file: MW,
    from: '  ) {\n    return NextResponse.json({ ok: false, code: "cross_site_refused" }, { status: 403 });',
    to: '  ) {\n    void NextResponse;',
    expect: "...and refuses by code",
  },
  {
    name: "the sign-in reads any body again",
    file: LOGIN,
    from: '    if (requireJsonBody(request)) {\n      return NextResponse.json({ ok: false, code: "unsupported_media_type" }, { status: 415 });\n    }\n\n    let email: string;',
    to: "    let email: string;",
    expect: "src/app/api/auth/login/route.ts refuses anything but JSON, before it reads the body",
  },
  {
    name: "the signup reads any body again",
    file: SIGNUP,
    from: '    if (requireJsonBody(request)) {\n      return NextResponse.json({ ok: false, code: "unsupported_media_type" }, { status: 415 });\n    }\n\n    const ip = getClientIp(request);',
    to: "    const ip = getClientIp(request);",
    expect: "src/app/api/signup/route.ts refuses anything but JSON, before it reads the body",
  },
  {
    name: "a body with no content type counts as JSON",
    file: LIB,
    from: '  return type === "application/json" ? null : "unsupported_media_type";',
    to: '  return type === "application/json" || type === "" ? null : "unsupported_media_type";',
    expect: "no content type is refused",
  },
];

runMutations({ name: "cross-site-writes", gate: GATE, targets: [LIB, MW, LOGIN, SIGNUP], mutants: MUTANTS });
