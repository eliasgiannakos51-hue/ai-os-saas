#!/usr/bin/env node
/*
 * CAN message-content.test.mjs SEE A CHAT ANSWER LOAD AN IMAGE FROM
 * ANYWHERE IT WANTS (ΑΣ2-3.1)?
 *
 * The ways the guard quietly stops guarding: the protocol-relative
 * bypass this same file's own test caught once already before it
 * shipped (`//evil.example/...` starts with "/", so a predicate that
 * only checked that prefix let it through — fixed, kept here so it
 * cannot come back unnoticed); the guard removed from the `img`
 * component entirely; and the allowlist widened to bare `https:`,
 * which is the published-sites' own CSP precedent and exactly the hole
 * this fix exists to close for chat. A fourth (hardening, 2026-11-05):
 * the same protocol-relative address spelled with a backslash.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal.
 *
 * Run: node scripts/tests/message-content.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/message-content.test.mjs";
const SOURCE = "src/components/chat/message-content.tsx";

const MUTANTS = [
  {
    name: "a protocol-relative URL (//host/...) is allowed again",
    file: SOURCE,
    from: '  if (src.startsWith("//")) return false;\n',
    to: "",
    expect: "a protocol-relative URL is refused",
  },
  {
    name: "the backslash spelling of a protocol-relative URL is allowed again",
    file: SOURCE,
    from: '  if (src.startsWith("/\\\\")) return false;\n',
    to: "",
    expect: "...and so is the same address written with a backslash",
  },
  {
    name: "the img component stops calling the guard at all",
    file: SOURCE,
    from: 'img: ({ src, alt }) => (isAllowedChatImageSrc(src) ? <img src={src as string} alt={alt ?? ""} className="max-w-full rounded-item" /> : null),',
    to: 'img: ({ src, alt }) => <img src={src as string} alt={alt ?? ""} className="max-w-full rounded-item" />,',
    expect: "the img component calls the guard and renders nothing when it refuses",
  },
  {
    name: "the allowlist is widened to any https: origin, reopening the exfiltration channel",
    file: SOURCE,
    from: 'return src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/");',
    to: 'return src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/") || src.startsWith("https:");',
    expect: "https to an arbitrary host is refused",
  },
];

runMutations({ name: "message-content", gate: GATE, targets: [SOURCE], mutants: MUTANTS });
