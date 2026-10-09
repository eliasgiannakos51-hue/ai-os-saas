import { PLANS } from "@/lib/billing/plans";

/**
 * HOW MANY REMEMBERED THINGS AN ACCOUNT READS AND WRITES: its plan's
 * `chatMemoryLimit` — and, for the owner, at least the most any plan keeps.
 *
 * THE OWNER IS EXEMPT FROM EVERY PLAN GATE, and memory was the one that
 * forgot it. lib/billing/capability-gate.ts opens each boolean capability
 * to ADMIN_EMAILS — the Memory page included (`aiMemory`) — but the memory
 * window is a number, read straight off the plan in every route that
 * remembers. So an owner whose own subscription_tier was free saw the
 * Memory page open and told "inactive", and package 6 (MASTER 16: «λέω στο
 * Chat το όνομα και τα χρώματα της επιχείρησής μου, και το Site τα
 * χρησιμοποιεί») did nothing on the one account its switch is opened to
 * first. Found 2026-10-08 by scripts/tests/brand-memory.prodtest.mjs.
 *
 * NOT FOR THE TEST ACCOUNT (TEST_ACCOUNT_EMAILS): it exists to see what a
 * customer on its plan sees, so it keeps its plan's window.
 */
export const OWNER_MEMORY_WINDOW = Math.max(...PLANS.map((p) => p.capabilities.chatMemoryLimit));

export function memoryWindowFor(planLimit: number, isOwner: boolean): number {
  return isOwner ? Math.max(planLimit, OWNER_MEMORY_WINDOW) : planLimit;
}
