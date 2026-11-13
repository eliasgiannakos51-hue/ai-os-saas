// A SUPABASE PROJECT THAT ANSWERS AT MOST max_rows ROWS PER REQUEST.
//
// scripts/lib/mock-supabase.mjs answers every read with every row it
// holds, whatever the limit, the order or the filter. A hosted Supabase
// project does not: PostgREST caps every response at `max_rows` (1,000
// unless the project raised it), says nothing when it does, and applies
// the cap to `.limit(50_000)` exactly as it would to no limit at all. A
// stand-in without that cap cannot tell a read that pages from one that
// stops at row 1,000 — which is the defect
// scripts/tests/storage-cleanup.test.mjs exists for.
//
// So this is a `fetch` for the REAL @supabase/supabase-js client
// (`createClient(url, key, { global: { fetch } })`). Nothing binds a port
// — scripts/tests/billing-coverage.test.mjs forbids that in a build gate
// — and the request the app's own code builds (`order=id.asc`,
// `id=gt.…`, `limit=…`, `Prefer: count=exact`, a HEAD) is what is parsed,
// so a query the client spells differently from what this expects fails
// here rather than passing on an assumption.
//
// What it answers: GET and HEAD on /rest/v1/<table> with select, order
// (one column), eq/gt/lt filters, limit and offset, and the count header;
// POST /storage/v1/object/list/<bucket> one level at a time (folders as
// entries with no id and no metadata, as Storage lists them); DELETE
// /storage/v1/object/<bucket>. Without an `order`, rows come back in the
// order they were inserted — PostgREST's physical order, which is not the
// primary key's.
//
// `onRequest({ kind, table, bucket, page, url, tables, files })` runs
// before each answer: return a Response to answer instead (a failure),
// or change `tables` / `files` in place (a row inserted mid-read).

const json = (status, body, headers = {}) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

function applyFilters(rows, params) {
  let out = rows;
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    const dot = raw.indexOf(".");
    const op = raw.slice(0, dot);
    const value = raw.slice(dot + 1);
    if (op === "eq") out = out.filter((r) => String(r[key]) === value);
    else if (op === "gt") out = out.filter((r) => String(r[key]) > value);
    else if (op === "lt") out = out.filter((r) => String(r[key]) < value);
    // A FILTER THIS CANNOT EXPRESS IS A FAILURE, not "every row": a
    // stand-in that ignored it would answer more than the real database.
    else throw new Error(`postgrest-max-rows: no support for ${key}=${raw}`);
  }
  return out;
}

function project(row, select) {
  if (!select || select === "*") return { ...row };
  const out = {};
  for (const col of select.split(",").map((c) => c.trim()).filter(Boolean)) out[col] = row[col] ?? null;
  return out;
}

/**
 * @param {object} opts
 * @param {Record<string, object[]>} opts.tables rows per table, in insertion order
 * @param {{ path: string, created_at: string }[]} opts.files objects in the bucket
 * @param {number} [opts.maxRows] PostgREST's max_rows
 */
export function postgrestMaxRows({ tables, files, maxRows = 1000, onRequest = null }) {
  const pageOf = new Map();
  const removed = [];
  const requests = [];

  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers ?? {});

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const page = (pageOf.get(table) ?? 0) + (method === "HEAD" ? 0 : 1);
      if (method !== "HEAD") pageOf.set(table, page);
      requests.push(`${method} ${table}?${url.searchParams}`);
      const override = onRequest?.({ kind: method === "HEAD" ? "count" : "read", table, page, url, tables, files });
      if (override instanceof Response) return override;
      if (!Object.hasOwn(tables, table)) return json(404, { code: "42P01", message: `relation "public.${table}" does not exist` });

      let rows = applyFilters(tables[table], url.searchParams);
      const order = url.searchParams.get("order");
      if (order) {
        const [col, dir = "asc"] = order.split(".");
        rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0));
        if (dir === "desc") rows.reverse();
      }
      const total = rows.length;
      const counting = /count=exact/.test(headers.get("Prefer") ?? "");
      if (method === "HEAD") {
        return new Response(null, { status: 200, headers: { "Content-Range": `*/${counting ? total : "*"}` } });
      }
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const asked = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : Infinity;
      // THE CAP. Silent, as PostgREST's is: no error, and the range says
      // only what was sent.
      const slice = rows.slice(offset, offset + Math.min(asked, maxRows));
      const range = slice.length ? `${offset}-${offset + slice.length - 1}` : "*";
      return json(200, slice.map((r) => project(r, url.searchParams.get("select"))), {
        "Content-Range": `${range}/${counting ? total : "*"}`,
      });
    }

    const list = url.pathname.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
    if (list && method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}"));
      const prefix = String(body.prefix ?? "");
      requests.push(`LIST ${list[1]}/${prefix} @${body.offset}`);
      const override = onRequest?.({ kind: "list", bucket: list[1], prefix, url, tables, files });
      if (override instanceof Response) return override;
      const entries = new Map();
      for (const f of files) {
        if (prefix && !f.path.startsWith(`${prefix}/`)) continue;
        const rest = prefix ? f.path.slice(prefix.length + 1) : f.path;
        const [head, ...tail] = rest.split("/");
        if (tail.length > 0) {
          if (!entries.has(head)) entries.set(head, { name: head, id: null, metadata: null, created_at: null });
        } else {
          entries.set(head, { name: head, id: `obj-${f.path}`, metadata: { size: 1 }, created_at: f.created_at });
        }
      }
      const sorted = [...entries.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      const offset = Number(body.offset ?? 0);
      return json(200, sorted.slice(offset, offset + Number(body.limit ?? 100)));
    }

    const del = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)$/);
    if (del && method === "DELETE") {
      const { prefixes = [] } = JSON.parse(String(init.body ?? "{}"));
      requests.push(`REMOVE ${del[1]} x${prefixes.length}`);
      const override = onRequest?.({ kind: "remove", bucket: del[1], url, tables, files });
      if (override instanceof Response) return override;
      const gone = [];
      for (const p of prefixes) {
        const at = files.findIndex((f) => f.path === p);
        if (at !== -1) {
          gone.push({ name: p });
          files.splice(at, 1);
          removed.push(p);
        }
      }
      return json(200, gone);
    }

    return json(404, { message: `postgrest-max-rows: nothing answers ${method} ${url.pathname}` });
  };

  return { fetch, removed, requests };
}
