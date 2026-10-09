// Tables that REMEMBER, for scripts/lib/mock-supabase.mjs's `handle` hook.
//
// The stand-in answers every read of a table with all of its rows and
// keeps no write. That is enough for a screen that only reads; it is not
// enough for a route that writes a row and reads it back (a job, an upload,
// a deck), where the second read must see the first write, filtered the
// way PostgREST filters it. scripts/tests/flows.prodtest.mjs grew its own
// copy of this; the package checks of 2026-10-08
// (research-slides.prodtest.mjs, file-pages.prodtest.mjs) share this one.
//
// What it does: eq / neq / is.null / in / gte / lte / gt / lt filters, order
// and limit, the count header, a single object (or 406 PGRST116) when
// .single() asks for one, insert (POST), update (PATCH) and delete, and
// the RPCs a test names. Tables it is not given fall through to the
// stand-in, unchanged.
import { randomUUID } from "node:crypto";

function matches(row, url) {
  for (const [key, raw] of url.searchParams) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const value = rest.join(".");
    const cell = row[key];
    if (op === "eq" && String(cell) !== value) return false;
    if (op === "neq" && String(cell) === value) return false;
    if (op === "is" && value === "null" && cell !== null && cell !== undefined) return false;
    if (op === "in") {
      const set = value.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, ""));
      if (!set.includes(String(cell))) return false;
    }
    if (op === "gte" && !(String(cell) >= value)) return false;
    if (op === "lte" && !(String(cell) <= value)) return false;
    if (op === "gt" && !(String(cell) > value)) return false;
    if (op === "lt" && !(String(cell) < value)) return false;
  }
  return true;
}

/**
 * @param {Record<string, object[]>} store  table -> its rows, kept and changed in place
 * @param {{ rpc?: Record<string, (args: object) => unknown>, defaults?: Record<string, object> }} [options]
 *   `defaults`: a table's column defaults, as the database fills them on
 *   insert (a job's `running = false`, which its claim filters on).
 * @returns the `handle` for startMockSupabase, with `writes` (every insert,
 *   update and delete, in order) and `rpcCalls` (every RPC, with its args).
 */
export function statefulTables(store, { rpc = {}, defaults = {} } = {}) {
  const writes = [];
  const rpcCalls = [];
  function handle({ req, res, url, body, json }) {
    if (!url.pathname.startsWith("/rest/v1/")) return false;
    const table = url.pathname.slice("/rest/v1/".length);
    if (table.startsWith("rpc/")) {
      const name = table.slice(4);
      if (!(name in rpc)) return false;
      let args = {};
      try { args = JSON.parse(body || "{}"); } catch {}
      rpcCalls.push({ name, args });
      json(200, rpc[name](args) ?? null);
      return true;
    }
    if (!(table in store)) return false;
    const rows = store[table];
    const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const answer = (list) => {
      if ((req.headers.prefer ?? "").includes("count=")) {
        res.writeHead(200, { "Content-Type": "application/json", "Content-Range": list.length ? `0-${list.length - 1}/${list.length}` : "*/0" });
        res.end(req.method === "HEAD" ? "" : JSON.stringify(list));
        return true;
      }
      if (single) return list[0] ? json(200, list[0]) : json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows", hint: null }), true;
      json(200, list);
      return true;
    };
    const hit = rows.filter((r) => matches(r, url));
    if (req.method === "GET" || req.method === "HEAD") {
      let list = [...hit];
      const order = url.searchParams.get("order");
      if (order) {
        const [col, dir] = order.split(",")[0].split(".");
        list.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (dir === "desc" ? -1 : 1));
      }
      const limit = Number(url.searchParams.get("limit"));
      if (limit) list = list.slice(0, limit);
      return answer(list);
    }
    if (req.method === "POST") {
      let input = [];
      try { input = JSON.parse(body || "[]"); } catch {}
      const now = new Date().toISOString();
      const made = (Array.isArray(input) ? input : [input]).map((r) => ({ id: randomUUID(), created_at: now, updated_at: now, ...structuredClone(defaults[table] ?? {}), ...r }));
      rows.push(...made);
      writes.push({ table, method: "POST", rows: made });
      return answer(made);
    }
    if (req.method === "PATCH") {
      let patch = {};
      try { patch = JSON.parse(body || "{}"); } catch {}
      for (const r of hit) Object.assign(r, patch, { updated_at: new Date().toISOString() });
      writes.push({ table, method: "PATCH", patch, count: hit.length });
      return answer(hit);
    }
    if (req.method === "DELETE") {
      for (const r of hit) rows.splice(rows.indexOf(r), 1);
      writes.push({ table, method: "DELETE", count: hit.length });
      return answer(hit);
    }
    return false;
  }
  handle.writes = writes;
  handle.rpcCalls = rpcCalls;
  return handle;
}
