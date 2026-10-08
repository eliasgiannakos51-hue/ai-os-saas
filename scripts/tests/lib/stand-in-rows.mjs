// TABLES THAT KEEP WHAT IS WRITTEN TO THEM, for the stand-in Supabase.
//
// scripts/lib/mock-supabase.mjs answers every table with the same rows
// whatever the filter, which is enough to draw a screen and not enough to
// walk one: a site that /api/websites/generate inserts has to be the row
// /api/websites/generate/process claims and /api/websites/status reads,
// and a memory /api/chat records has to be what the Site's worker loads.
// This is that, as a `handle` for startMockSupabase: the PostgREST filters
// the app's queries use, inserts, updates, deletes, counts, and the RPCs a
// test names. scripts/tests/automations.prodtest.mjs carries its own copy
// of the same idea; this one is shared by
// scripts/tests/brand-memory.prodtest.mjs and
// scripts/tests/chat-opens-tools-edges.prodtest.mjs.

let seq = 0;
export const standInId = () => `9${String(++seq).padStart(7, "0")}-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, "0")}`;

const IGNORED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

/** Whether one row passes the PostgREST filters in a query string. */
export function rowMatches(row, params) {
  for (const [key, raw] of params) {
    if (IGNORED.has(key) || key === "or" || key === "and") continue;
    const negate = raw.startsWith("not.");
    const expr = negate ? raw.slice(4) : raw;
    const dot = expr.indexOf(".");
    const op = expr.slice(0, dot);
    const value = expr.slice(dot + 1);
    const cell = row[key];
    let ok;
    if (op === "eq") ok = String(cell) === value;
    else if (op === "neq") ok = String(cell) !== value;
    else if (op === "gt") ok = cell !== null && cell !== undefined && String(cell) > value;
    else if (op === "gte") ok = cell !== null && cell !== undefined && String(cell) >= value;
    else if (op === "lt") ok = cell !== null && cell !== undefined && String(cell) < value;
    else if (op === "lte") ok = cell !== null && cell !== undefined && String(cell) <= value;
    else if (op === "is") ok = value === "null" ? cell === null || cell === undefined : String(cell) === value;
    else if (op === "in") ok = value.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, "")).includes(String(cell));
    else ok = true;
    if (negate ? ok : !ok) return false;
  }
  return true;
}

/**
 * @param {{ tables: Record<string, object[]>, defaults?: Record<string, () => object>, rpc?: Record<string, (args: object, store: Record<string, object[]>) => unknown>, failing?: Set<string> }} spec
 */
export function standInRows({ tables, defaults = {}, rpc = {}, failing = new Set() }) {
  const store = Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, [...rows]]));
  const writes = [];
  const calls = [];
  function handle({ req, res, url, body, json }) {
    if (!url.pathname.startsWith("/rest/v1/")) return false;
    const table = url.pathname.slice("/rest/v1/".length);
    if (table.startsWith("rpc/")) {
      const name = table.slice(4);
      if (!(name in rpc)) return false;
      let args = {};
      try { args = JSON.parse(body || "{}"); } catch {}
      calls.push({ name, args });
      if (failing.has(table)) return json(500, { code: "XX000", message: "the stand-in was told to fail" }), true;
      json(200, rpc[name](args, store) ?? null);
      return true;
    }
    if (!(table in store)) return false;
    if (failing.has(table)) return json(500, { code: "XX000", message: "the stand-in was told to fail", details: null, hint: null }), true;
    const rows = store[table];
    const hit = rows.filter((r) => rowMatches(r, url.searchParams));
    const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const prefer = req.headers.prefer ?? "";
    const answer = (list, status = 200) => {
      if (prefer.includes("count=")) {
        res.writeHead(status, { "Content-Type": "application/json", "Content-Range": list.length ? `0-${list.length - 1}/${list.length}` : "*/0" });
        res.end(req.method === "HEAD" ? "" : JSON.stringify(list));
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD" && !prefer.includes("return=representation")) {
        res.writeHead(status === 200 ? 204 : status);
        res.end();
        return;
      }
      if (single) return list[0] ? json(status, list[0]) : json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      json(status, list);
    };
    if (req.method === "GET" || req.method === "HEAD") {
      let list = [...hit];
      const order = url.searchParams.get("order");
      if (order) {
        const [col, dir] = order.split(",")[0].split(".");
        list.sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : String(a[col] ?? "") > String(b[col] ?? "") ? 1 : 0) * (dir === "desc" ? -1 : 1));
      }
      const offset = Number(url.searchParams.get("offset")) || 0;
      const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : Infinity;
      list = list.slice(offset, offset + limit);
      answer(list);
      return true;
    }
    if (req.method === "POST") {
      let input = [];
      try { input = JSON.parse(body || "[]"); } catch {}
      const conflict = url.searchParams.get("on_conflict");
      const made = [];
      for (const r of Array.isArray(input) ? input : [input]) {
        const existing = conflict ? rows.find((x) => conflict.split(",").every((c) => String(x[c]) === String(r[c]))) : null;
        if (existing && prefer.includes("merge-duplicates")) {
          Object.assign(existing, r);
          made.push(existing);
        } else {
          const row = { id: standInId(), created_at: new Date().toISOString(), ...(defaults[table]?.() ?? {}), ...r };
          rows.push(row);
          made.push(row);
        }
      }
      writes.push({ table, method: "POST", rows: made });
      answer(made, 201);
      return true;
    }
    if (req.method === "PATCH") {
      let patch = {};
      try { patch = JSON.parse(body || "{}"); } catch {}
      for (const r of hit) Object.assign(r, patch);
      writes.push({ table, method: "PATCH", patch, count: hit.length });
      answer(hit);
      return true;
    }
    if (req.method === "DELETE") {
      for (const r of hit) rows.splice(rows.indexOf(r), 1);
      writes.push({ table, method: "DELETE", count: hit.length });
      answer(hit);
      return true;
    }
    return false;
  }
  return { store, writes, calls, failing, handle };
}
