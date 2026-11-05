#!/usr/bin/env node
/*
 * CAN email-confirmation.test.mjs SEE THE ADDRESS CHECK COME UNDONE?
 *
 * One mutant per wall: the link that may point at another host (three
 * ways: another origin, a character the parser rewrites, a collapsed dot
 * segment), the OAuth callback with its own weaker test, the
 * landing that trusts the request's own redirect, the middleware that lets
 * an unproved session in, and the two resend paths without their bound.
 *
 * Run: node scripts/tests/email-confirmation.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/email-confirmation.test.mjs";
const LIB = "src/lib/auth/confirm-email.ts";
const CONFIRM = "src/app/auth/confirm/route.ts";
const CALLBACK = "src/app/auth/callback/route.ts";
const MW = "src/proxy.ts";
const LOGIN = "src/app/api/auth/login/route.ts";
const RESEND = "src/app/api/auth/resend-confirmation/route.ts";

const MUTANTS = [
  {
    name: "a next that resolves to another origin is accepted",
    file: LIB,
    from: "  if (resolved.origin !== NEXT_PATH_BASE) return fallback;",
    to: "  if (resolved.origin === null) return fallback;",
    expect: 'safeNextPath("//evil.example")',
  },
  {
    name: "control characters and backslashes reach the parser",
    file: LIB,
    from: "  if (NEXT_PATH_UNSAFE.test(raw)) return fallback;",
    to: "  if (raw === NEXT_PATH_BASE) return fallback;",
    expect: 'safeNextPath("/dash\\nboard")',
  },
  {
    name: "a dot segment collapsing into a double slash is followed",
    file: LIB,
    from: '  return path.startsWith("//") ? fallback : path;',
    to: "  return path;",
    expect: 'safeNextPath("/.//evil.example")',
  },
  {
    name: "the OAuth callback keeps a prefix test of its own",
    file: CALLBACK,
    from: '  const next = safeNextPath(url.searchParams.get("next"));',
    to: '  const next = (url.searchParams.get("next") ?? "").startsWith("/") ? (url.searchParams.get("next") as string) : "/dashboard/overview";',
    expect: "src/app/auth/callback/route.ts passes its next through safeNextPath",
  },
  {
    name: "the landing redirects wherever the link says",
    file: CONFIRM,
    from: '  const next = safeNextPath(url.searchParams.get("next"));',
    to: '  const next = url.searchParams.get("next") ?? "/dashboard/overview";',
    expect: "its redirect target is kept on this site",
  },
  {
    name: "an unproved session walks into the dashboard",
    file: MW,
    from: "  if (user && !user.email_confirmed_at) {",
    to: "  if (false && user && !user.email_confirmed_at) {",
    expect: "the middleware asks whether the address is proved",
  },
  {
    name: "login sends a link on every attempt",
    file: LOGIN,
    from: "      if (!limit.allowed) {",
    to: "      if (false && !limit.allowed) {",
    expect: "sends at most three links an hour",
  },
  {
    name: "the resend button sends without a bound",
    file: RESEND,
    from: "  if (!limit.allowed) return",
    to: "  if (false) return",
    expect: "three an hour",
  },
];

runMutations({ name: "email-confirmation", gate: GATE, targets: [LIB, CONFIRM, CALLBACK, MW, LOGIN, RESEND], mutants: MUTANTS });
