/**
 * The two failure counters, in a module with no imports at all.
 *
 * They lived in lib/agents/agent-limits.ts, which imports lib/billing/
 * plans.ts, which reaches lib/billing/addon-store.ts and its
 * `import "server-only"`. That was invisible until a CLIENT component
 * needed one of these numbers to say "3 of 5 runs failed" — and then the
 * build failed with a server-only error about a billing file, three hops
 * from anything the component asked for.
 *
 * Neither number has anything to do with plans: an agent retries three
 * times and gives up after five bad days on every tier. Re-exported from
 * agent-limits.ts so nothing that already imports them has to change.
 */

/** Attempts per scheduled execution: the first try plus two retries. */
export const AGENT_MAX_ATTEMPTS = 3;

/** Consecutive failed executions before the agent switches itself off. */
export const AGENT_MAX_CONSECUTIVE_FAILURES = 5;
