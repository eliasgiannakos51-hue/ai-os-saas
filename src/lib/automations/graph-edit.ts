import type { FlowEdge, NodePosition } from "@/lib/automations/boxes";

/**
 * WHAT A PERSON MAY DO TO THE GRAPH OF AN AUTOMATION, as pure functions
 * (the routes call them, scripts/tests/automation-graph.test.mjs holds them).
 *
 * Until 2026-11-28 nothing in this repository wrote `automation_flows.edges`
 * and nothing read it back on a run or on the screen, so every flow was a
 * straight line whatever the canvas drew. These three functions are the
 * write side: what an edit may say (validateEdges, validateLayout) and what
 * happens to the connections when the boxes change under them (reconcileEdges).
 *
 * A connection set is a DAG on purpose: the runner walks edges until none
 * is left, and a cycle would walk them for ever. The loop box repeats
 * itself on its own counter (runner.ts pickNextBoxes), not through a cycle.
 */
export const MAX_EDGES = 2000;
const MAX_ID = 80;
const MAX_PORT = 40;
const MAX_COORD = 100000;

export type EdgeVerdict = { ok: true; edges: FlowEdge[] } | { ok: false; reason: string };

export function validateEdges(raw: unknown, boxIds: ReadonlySet<string>): EdgeVerdict {
  if (!Array.isArray(raw)) return { ok: false, reason: "not_a_list" };
  if (raw.length > MAX_EDGES) return { ok: false, reason: "too_many" };
  const edges: FlowEdge[] = [];
  const ids = new Set<string>();
  const pairs = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") return { ok: false, reason: "bad_edge" };
    const e = item as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id || e.id.length > MAX_ID) return { ok: false, reason: "bad_id" };
    if (typeof e.from !== "string" || typeof e.to !== "string") return { ok: false, reason: "bad_edge" };
    if (!boxIds.has(e.from) || !boxIds.has(e.to)) return { ok: false, reason: "unknown_box" };
    if (e.from === e.to) return { ok: false, reason: "self_loop" };
    const fromPort = e.fromPort === undefined ? "main" : e.fromPort;
    const toPort = e.toPort === undefined ? "main" : e.toPort;
    if (typeof fromPort !== "string" || typeof toPort !== "string" || !fromPort || !toPort || fromPort.length > MAX_PORT || toPort.length > MAX_PORT) return { ok: false, reason: "bad_port" };
    if (ids.has(e.id)) return { ok: false, reason: "duplicate_id" };
    const pair = `${e.from}\u0000${fromPort}\u0000${e.to}\u0000${toPort}`;
    if (pairs.has(pair)) return { ok: false, reason: "duplicate_edge" };
    ids.add(e.id);
    pairs.add(pair);
    edges.push({ id: e.id, from: e.from, fromPort, to: e.to, toPort });
  }
  if (hasCycle(edges)) return { ok: false, reason: "cycle" };
  return { ok: true, edges };
}

/** Kahn's algorithm: whatever cannot be taken off the front is in a cycle. */
export function hasCycle(edges: readonly FlowEdge[]): boolean {
  const indegree = new Map<string, number>();
  const next = new Map<string, string[]>();
  for (const e of edges) {
    indegree.set(e.from, indegree.get(e.from) ?? 0);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
    next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
  }
  const queue = [...indegree].filter(([, n]) => n === 0).map(([id]) => id);
  let taken = 0;
  while (queue.length > 0) {
    const id = queue.pop() as string;
    taken++;
    for (const to of next.get(id) ?? []) {
      const left = (indegree.get(to) ?? 0) - 1;
      indegree.set(to, left);
      if (left === 0) queue.push(to);
    }
  }
  return taken < indegree.size;
}

export type LayoutVerdict = { ok: true; layout: Record<string, NodePosition> } | { ok: false; reason: string };

export function validateLayout(raw: unknown, boxIds: ReadonlySet<string>): LayoutVerdict {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "not_an_object" };
  const layout: Record<string, NodePosition> = {};
  for (const [id, pos] of Object.entries(raw as Record<string, unknown>)) {
    if (!boxIds.has(id)) continue; // a box that is gone leaves no position behind
    const p = pos as { x?: unknown; y?: unknown } | null;
    if (!p || typeof p.x !== "number" || typeof p.y !== "number" || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return { ok: false, reason: "bad_position" };
    if (Math.abs(p.x) > MAX_COORD || Math.abs(p.y) > MAX_COORD) return { ok: false, reason: "out_of_range" };
    layout[id] = { x: Math.round(p.x), y: Math.round(p.y) };
  }
  return { ok: true, layout };
}

/**
 * The boxes changed (one added, one removed) under connections the person
 * drew. A removed box takes its connections with it, and its neighbours
 * are joined (every box that fed it to every box it fed, the way n8n
 * reconnects on delete); a new box is hung after the box before it in the
 * row, with nothing else changed. Never produces a cycle or a dangling end.
 */
export function reconcileEdges(oldIds: readonly string[], newIds: readonly string[], edges: readonly FlowEdge[]): FlowEdge[] {
  const kept = new Set(newIds);
  const gone = oldIds.filter((id) => !kept.has(id));
  let out = edges.filter((e) => kept.has(e.from) && kept.has(e.to));
  for (const id of gone) {
    const before = edges.filter((e) => e.to === id && kept.has(e.from));
    const after = edges.filter((e) => e.from === id && kept.has(e.to));
    for (const a of before) {
      for (const b of after) {
        if (a.from === b.to) continue;
        if (out.some((e) => e.from === a.from && e.to === b.to && e.fromPort === a.fromPort && e.toPort === b.toPort)) continue;
        out = [...out, { id: `e-${a.from}-${b.to}-${out.length}`, from: a.from, fromPort: a.fromPort, to: b.to, toPort: b.toPort }];
      }
    }
  }
  const known = new Set(oldIds);
  newIds.forEach((id, i) => {
    if (known.has(id) || i === 0) return;
    const prev = newIds[i - 1];
    out = [...out, { id: `e-${prev}-${id}`, from: prev, fromPort: "main", to: id, toPort: "main" }];
  });
  return hasCycle(out) ? edges.filter((e) => kept.has(e.from) && kept.has(e.to)) : out;
}
