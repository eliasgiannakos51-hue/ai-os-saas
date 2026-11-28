import type { FlowEdge } from "@/lib/automations/boxes";

/**
 * HOW A RUN WALKS A GRAPH (the runner calls these; scripts/tests/automation-graph.test.mjs holds them).
 *
 * A flow whose connections are a plain chain runs exactly as it always did:
 * the boxes in row order, each one's text handed to the next. Only a flow
 * whose connections BRANCH (a box feeds two) or JOIN (a box is fed by two)
 * is walked as a graph: in an order where every box comes after the boxes
 * that feed it, each box reading what its feeders produced and nothing else.
 */

/** True when some box feeds two boxes, or some box is fed by two. */
export function isBranching(edges: readonly FlowEdge[]): boolean {
  const out = new Map<string, number>();
  const into = new Map<string, number>();
  for (const e of edges) {
    out.set(e.from, (out.get(e.from) ?? 0) + 1);
    into.set(e.to, (into.get(e.to) ?? 0) + 1);
  }
  return [...out.values(), ...into.values()].some((n) => n > 1);
}

/**
 * The boxes in an order where every box follows the ones that feed it; ties
 * keep the row order, so the same flow always runs in the same order (a
 * resume reads the same index). Null when the connections hold a cycle.
 */
export function walkOrder(ids: readonly string[], edges: readonly FlowEdge[]): string[] | null {
  const known = new Set(ids);
  const use = edges.filter((e) => known.has(e.from) && known.has(e.to));
  const left = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const e of use) left.set(e.to, (left.get(e.to) ?? 0) + 1);
  const rank = new Map<string, number>(ids.map((id, i) => [id, i]));
  const ready = ids.filter((id) => left.get(id) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => (rank.get(a) as number) - (rank.get(b) as number));
    const id = ready.shift() as string;
    order.push(id);
    for (const e of use) {
      if (e.from !== id) continue;
      const n = (left.get(e.to) ?? 0) - 1;
      left.set(e.to, n);
      if (n === 0) ready.push(e.to);
    }
  }
  return order.length === ids.length ? order : null;
}

/** What a box reads: the outputs of the boxes that fed it through a connection that was taken, in the order they ran, blank ones left out. */
export function joinInputs(parentIds: readonly string[], outputs: ReadonlyMap<string, { text: string; readCount: number }>): { text: string; readCount: number } {
  const seen = new Set<string>();
  const parts: string[] = [];
  let readCount = -1;
  for (const id of parentIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const out = outputs.get(id);
    if (!out) continue;
    if (out.text.trim()) parts.push(out.text);
    readCount = Math.max(readCount, out.readCount);
  }
  return { text: parts.join("\n\n"), readCount };
}
