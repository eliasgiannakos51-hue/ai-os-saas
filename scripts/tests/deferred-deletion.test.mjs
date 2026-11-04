/*
 * A SCHEDULED DELETION: ONE PER ACCOUNT, EVERY LINK STOPS IT, AND IT
 * LEAVES A RECORD WHEN IT RUNS.
 *
 * Three defects found on 2026-11-04 (docs/NEEDS-FROM-ELIAS.md had them),
 * each held here so it cannot come back:
 *
 *  1. Two confirmations wrote two schedules, and the cancel link of one
 *     email stopped only its own — the cron deleted the account with the
 *     other. Settings stopped both and answered «not found».
 *  2. An executed deletion left no row: the foreign key cascaded, and
 *     markExecuted ran after deleteUser, on a row already gone.
 *  3. A schedule that failed to write left the confirmation link spent.
 *
 * Section 1 RUNS src/lib/account/pending-deletion.ts against a stand-in of
 * the pending_deletions table that answers the way PostgREST and
 * supabase-js do — including the part that hid defect 1's second half:
 * .maybeSingle() on an update counts the rows AFTER the update has run —
 * twice: as the table is before
 * supabase/migrations/20261112000000_pending_deletions_one_open.sql
 * (no index, no previous_cancel_token_hashes) and after it (the
 * one-open-row index answers 23505). Every await yields, so two calls
 * started together interleave the way two requests do.
 *
 * Sections 2-4 hold the cron, the confirm route and the migration to the
 * order and the writes that make the fixes true. The migration itself is
 * run against a real Postgres by scripts/tests/pending-deletions.dbtest.mjs.
 *
 * Run: node scripts/tests/deferred-deletion.test.mjs
 */
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (typeof cond !== "boolean") {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        check() takes a BOOLEAN; got ${typeof cond}`);
    return;
  }
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const P = await loadTs("src/lib/account/pending-deletion.ts");
const sha = (t) => createHash("sha256").update(t).digest("hex");
const tick = () => new Promise((r) => setImmediate(r));
const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------
// The stand-in. One table, the filters and modifiers the helpers use, and
// the three answers that matter: 23505 from the one-open index, PGRST204 /
// 42703 for a column the database does not have yet, PGRST116 from
// .single() / .maybeSingle() when the row count is wrong — after a write
// has already been applied, as supabase-js does it.
// ---------------------------------------------------------------------
function makeTable({ migrated }) {
  const COLUMNS = ["id", "user_id", "delete_after", "cancel_token_hash", "cancelled_at", "executed_at", "created_at"];
  if (migrated) COLUMNS.push("previous_cancel_token_hashes");
  const known = new Set(COLUMNS);
  const rows = [];
  const writes = [];
  let clock = Date.now();
  const stamp = () => new Date(++clock).toISOString();

  const missingColumn = (c, where) =>
    where === "write"
      ? { code: "PGRST204", message: `Could not find the '${c}' column of 'pending_deletions' in the schema cache` }
      : { code: "42703", message: `column pending_deletions.${c} does not exist` };
  const isOpen = (r) => r.cancelled_at == null && r.executed_at == null;
  function violates(state) {
    for (const r of state) {
      if (!migrated && (r.user_id == null || r.cancel_token_hash == null)) return { code: "23502", message: "null value violates not-null constraint" };
      if (migrated && r.user_id != null && r.cancel_token_hash == null) return { code: "23514", message: "violates check constraint pending_deletions_token_while_owned" };
    }
    if (migrated) {
      const seen = new Set();
      for (const r of state.filter((r) => isOpen(r) && r.user_id != null)) {
        if (seen.has(r.user_id)) return { code: "23505", message: 'duplicate key value violates unique constraint "pending_deletions_one_open_per_user"' };
        seen.add(r.user_id);
      }
    }
    return null;
  }
  function matches(row, f) {
    const cell = row[f.c];
    switch (f.op) {
      case "eq": return f.v !== null && cell === f.v;
      case "is": return cell == null;
      case "not.is": return cell != null;
      case "lt": return cell != null && String(cell) < String(f.v);
      case "cs": return Array.isArray(cell) && f.v.every((x) => cell.includes(x));
      default: throw new Error(`stand-in: no filter ${f.op}`);
    }
  }
  function project(r, cols) {
    if (cols === "*") return Object.fromEntries(COLUMNS.map((c) => [c, structuredClone(r[c])]));
    return Object.fromEntries(cols.split(",").map((c) => c.trim()).map((c) => [c, structuredClone(r[c])]));
  }

  class Query {
    constructor() { this.op = "select"; this.filters = []; this.cols = "*"; this.ret = false; this.mode = null; this.sort = null; this.max = null; }
    select(cols = "*") { this.cols = cols; if (this.op !== "select") this.ret = true; return this; }
    insert(v) { this.op = "insert"; this.values = v; return this; }
    update(v) { this.op = "update"; this.values = v; return this; }
    eq(c, v) { this.filters.push({ c, op: "eq", v }); return this; }
    is(c, v) { if (v !== null) throw new Error("stand-in: is() only with null"); this.filters.push({ c, op: "is" }); return this; }
    not(c, op, v) { if (op !== "is" || v !== null) throw new Error("stand-in: not() only as is-null"); this.filters.push({ c, op: "not.is" }); return this; }
    lt(c, v) { this.filters.push({ c, op: "lt", v }); return this; }
    contains(c, v) { this.filters.push({ c, op: "cs", v }); return this; }
    order(c, { ascending = true } = {}) { this.sort = { c, ascending }; return this; }
    limit(n) { this.max = n; return this; }
    single() { this.mode = "single"; return this; }
    maybeSingle() { this.mode = "maybeSingle"; return this; }
    then(ok, bad) { return this.run().then(ok, bad); }
    shape(list) {
      if (this.op !== "select" && !this.ret) return { data: null, error: null };
      if (this.mode === "single") return list.length === 1 ? { data: list[0], error: null } : { data: null, error: { code: "PGRST116", message: `JSON object requested, ${list.length} rows returned` } };
      if (this.mode === "maybeSingle") return list.length <= 1 ? { data: list[0] ?? null, error: null } : { data: null, error: { code: "PGRST116", message: `JSON object requested, multiple (${list.length}) rows returned` } };
      return { data: list, error: null };
    }
    async run() {
      await tick();
      for (const f of this.filters) if (!known.has(f.c)) return { data: null, error: missingColumn(f.c, "read") };
      if (this.cols !== "*") for (const c of this.cols.split(",").map((s) => s.trim())) if (!known.has(c)) return { data: null, error: missingColumn(c, "read") };
      if (this.op === "insert") {
        for (const c of Object.keys(this.values)) if (!known.has(c)) return { data: null, error: missingColumn(c, "write") };
        const row = { id: randomUUID(), cancelled_at: null, executed_at: null, created_at: stamp(), ...(migrated ? { previous_cancel_token_hashes: [] } : {}), ...structuredClone(this.values) };
        const err = violates([...rows, row]);
        if (err) return { data: null, error: err };
        rows.push(row);
        writes.push({ op: "insert", row: structuredClone(row) });
        return this.shape([project(row, this.cols)]);
      }
      let hit = rows.filter((r) => this.filters.every((f) => matches(r, f)));
      if (this.op === "update") {
        for (const c of Object.keys(this.values)) if (!known.has(c)) return { data: null, error: missingColumn(c, "write") };
        const next = rows.map((r) => (hit.includes(r) ? { ...r, ...structuredClone(this.values) } : r));
        const err = violates(next);
        if (err) return { data: null, error: err };
        for (const r of hit) Object.assign(r, structuredClone(this.values));
        writes.push({ op: "update", ids: hit.map((r) => r.id), values: structuredClone(this.values) });
        return this.shape(hit.map((r) => project(r, this.cols)));
      }
      if (this.sort) {
        const { c, ascending } = this.sort;
        hit = [...hit].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0) * (ascending ? 1 : -1));
      }
      if (this.max != null) hit = hit.slice(0, this.max);
      return this.shape(hit.map((r) => project(r, this.cols)));
    }
  }

  return {
    rows,
    writes,
    open: (userId) => rows.filter((r) => r.user_id === userId && isOpen(r)),
    client: { from: (t) => { if (t !== "pending_deletions") throw new Error(`stand-in: ${t}`); return new Query(); } },
    /** What deleting the auth user does to this table, before and after the migration. */
    deleteUser(userId) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].user_id !== userId) continue;
        if (!migrated) rows.splice(i, 1);
        else Object.assign(rows[i], { user_id: null, cancel_token_hash: null, previous_cancel_token_hashes: [] });
      }
    },
    /** A row as the code before this fix wrote it: a plain insert, any date. */
    seed(values) {
      const row = { id: randomUUID(), cancelled_at: null, executed_at: null, created_at: stamp(), ...(migrated ? { previous_cancel_token_hashes: [] } : {}), ...values };
      rows.push(row);
      return row;
    },
  };
}

const U = "11111111-1111-4111-8111-111111111111";
const V = "22222222-2222-4222-8222-222222222222";
const SCHEMAS = [
  ["before 20261112000000", false],
  ["after 20261112000000", true],
];

console.log("== 1. the helpers, run ==");
for (const [label, migrated] of SCHEMAS) {
  console.log(`\n-- ${label} --`);

  // ONE SCHEDULE, AND A SECOND CONFIRMATION JOINS IT.
  {
    const db = makeTable({ migrated });
    const first = await P.scheduleDeletion(db.client, U);
    check(`[${label}] a first confirmation schedules (${first ? "row " + first.row.id.slice(0, 8) : "null"})`, first !== null && first.joined === false);
    const days = first ? (Date.parse(first.row.delete_after) - Date.now()) / DAY : 0;
    check(`[${label}] ...${P.DELETION_GRACE_DAYS} days out (${days.toFixed(2)})`, Math.abs(days - P.DELETION_GRACE_DAYS) < 0.01);
    check(`[${label}] ...and stores only the SHA-256 of its link`, first !== null && db.rows[0]?.cancel_token_hash === sha(first.cancelToken) && !JSON.stringify(db.rows).includes(first.cancelToken));

    // The first confirmation was twenty days ago: its date is EARLIER
    // than anything a new confirmation would compute.
    const earlier = new Date(Date.now() + 10 * DAY).toISOString();
    if (db.rows[0]) db.rows[0].delete_after = earlier;
    const second = await P.scheduleDeletion(db.client, U);
    check(`[${label}] a second confirmation succeeds and says it joined`, second !== null && second.joined === true);
    check(`[${label}] ...keeping the EARLIER date, never moving it`, second?.row.delete_after === earlier && db.open(U).every((r) => r.delete_after === earlier), `${second?.row.delete_after} vs ${earlier}`);
    check(`[${label}] ...with a link of its own`, second !== null && first !== null && second.cancelToken !== first.cancelToken);
    if (migrated) {
      check(`[${label}] ...and NO second row`, db.rows.length === 1 && db.writes.filter((w) => w.op === "insert").length === 1, `${db.rows.length} rows`);
    } else {
      check(`[${label}] ...as a second row with the same date — the one way to keep both links before the column exists`, db.open(U).length === 2);
    }

    // EITHER LINK STOPS THE WHOLE ACCOUNT'S DELETION.
    const viaOld = await P.cancelDeletion(db.client, first?.cancelToken ?? "x");
    check(`[${label}] the FIRST email's link still cancels (${viaOld ? viaOld.cancelled + " row(s)" : "null"})`, viaOld !== null && viaOld.userId === U);
    check(`[${label}] ...and nothing of the account is left open`, db.open(U).length === 0, `${db.open(U).length} open`);
    check(`[${label}] ...and the second link has nothing left to stop`, (await P.cancelDeletion(db.client, second?.cancelToken ?? "x")) === null);
  }

  // THE NEWER LINK, ON ITS OWN.
  {
    const db = makeTable({ migrated });
    await P.scheduleDeletion(db.client, U);
    const second = await P.scheduleDeletion(db.client, U);
    const viaNew = await P.cancelDeletion(db.client, second?.cancelToken ?? "x");
    check(`[${label}] the SECOND email's link cancels too, and the account has nothing open`, viaNew !== null && db.open(U).length === 0);
  }

  // DEFECT 1 AS IT WAS: two rows the old code wrote, two dates. Only a
  // database without the index can hold them.
  if (!migrated) {
    const db = makeTable({ migrated: false });
    const t1 = "a".repeat(64), t2 = "b".repeat(64);
    db.seed({ user_id: U, delete_after: new Date(Date.now() + 25 * DAY).toISOString(), cancel_token_hash: sha(t1) });
    db.seed({ user_id: U, delete_after: new Date(Date.now() + 30 * DAY).toISOString(), cancel_token_hash: sha(t2) });
    db.seed({ user_id: V, delete_after: new Date(Date.now() + 30 * DAY).toISOString(), cancel_token_hash: sha("c".repeat(64)) });
    const active = await P.getActivePendingDeletion(db.client, U);
    check(`[${label}] Settings shows the date that will actually run — the earlier of two`, active?.cancel_token_hash === undefined && active?.delete_after === db.rows[0].delete_after, active?.delete_after);
    const r = await P.cancelDeletion(db.client, t2);
    check(`[${label}] the later email's link stops BOTH schedules (${r?.cancelled ?? 0})`, r?.cancelled === 2 && db.open(U).length === 0);
    check(`[${label}] ...and nobody else's`, db.open(V).length === 1);
  }

  // SETTINGS: every open row, and success when at least one stopped.
  {
    const db = makeTable({ migrated });
    db.seed({ user_id: U, delete_after: new Date(Date.now() + 5 * DAY).toISOString(), cancel_token_hash: sha("d") });
    if (!migrated) db.seed({ user_id: U, delete_after: new Date(Date.now() + 9 * DAY).toISOString(), cancel_token_hash: sha("e") });
    const expected = migrated ? 1 : 2;
    const n = await P.cancelDeletionByUserId(db.client, U);
    check(`[${label}] Settings cancels every open schedule (${expected}) and reports it, not «not found» (${n})`, n === expected && db.open(U).length === 0);
    check(`[${label}] ...and with nothing open reports 0, which the route answers 404`, (await P.cancelDeletionByUserId(db.client, U)) === 0);
  }

  // AN OLD EMAIL NEVER STOPS A LATER DELETION.
  {
    const db = makeTable({ migrated });
    const before = await P.scheduleDeletion(db.client, U);
    await P.cancelDeletion(db.client, before?.cancelToken ?? "x");
    const again = await P.scheduleDeletion(db.client, U);
    check(`[${label}] a deletion asked for again after a cancel is a new schedule`, again !== null && again.joined === false && db.open(U).length === 1);
    check(`[${label}] ...which the link from the cancelled one cannot stop`, (await P.cancelDeletion(db.client, before?.cancelToken ?? "x")) === null && db.open(U).length === 1);
    check(`[${label}] ...and a link that was never sent stops nothing`, (await P.cancelDeletion(db.client, "f".repeat(64))) === null && db.open(U).length === 1);
  }

  // THE CRON'S HALF: the record is claimed first, released on failure,
  // and kept once the account is gone.
  {
    const db = makeTable({ migrated });
    const past = new Date(Date.now() - DAY).toISOString();
    const due = db.seed({ user_id: U, delete_after: past, cancel_token_hash: sha("g") });
    const future = db.seed({ user_id: V, delete_after: new Date(Date.now() + DAY).toISOString(), cancel_token_hash: sha("h") });
    const list = await P.getActionableDeletions(db.client);
    check(`[${label}] the cron finds the row past its date, and only it (${list.length})`, list.length === 1 && list[0].id === due.id && future.id !== list[0].id);
    check(`[${label}] ...without handing the link digest around`, list.length === 1 && !("cancel_token_hash" in list[0]));
    check(`[${label}] claiming it writes executed_at`, (await P.claimExecution(db.client, due.id)) === "claimed" && due.executed_at !== null);
    check(`[${label}] a claimed row is no longer open — its links stop nothing`, (await P.cancelDeletion(db.client, "g")) === null);
    check(`[${label}] a claimed row whose account is still there is picked up again (a run that stopped half-way)`,
      (await P.getActionableDeletions(db.client)).some((r) => r.id === due.id));
    check(`[${label}] releasing a claim reopens it while the account exists`, (await P.releaseExecution(db.client, due.id)) === true && due.executed_at === null);
    check(`[${label}] ...so its link works again`, (await P.cancelDeletion(db.client, "g")) !== null && due.cancelled_at !== null);

    // What the foreign key does to the row is the database's half, measured
    // by pending-deletions.dbtest.mjs; what is asked here is what the
    // helpers do with the row it leaves.
    if (migrated) {
      const db2 = makeTable({ migrated });
      const row = db2.seed({ user_id: U, delete_after: past, cancel_token_hash: sha("k") });
      await P.claimExecution(db2.client, row.id);
      db2.deleteUser(U);
      await P.releaseExecution(db2.client, row.id);
      check(`[${label}] a release after a deleteUser that reported an error but did delete leaves the row saying it ran`, row.executed_at !== null && row.user_id === null);
      check(`[${label}] ...and the cron never picks up a row with no account`, (await P.getActionableDeletions(db2.client)).length === 0);
      check(`[${label}] ...nor can it be claimed again`, (await P.claimExecution(db2.client, row.id)) === "not_open");
    }

    const db3 = makeTable({ migrated });
    const gone = db3.seed({ user_id: U, delete_after: past, cancel_token_hash: sha("m") });
    await P.cancelDeletionByUserId(db3.client, U);
    check(`[${label}] a deletion cancelled while the run was under way is not claimed`, (await P.claimExecution(db3.client, gone.id)) === "not_open" && gone.executed_at === null);
  }
}

console.log("\n-- after 20261112000000, only --");
// TWO CONFIRMATIONS AT THE SAME MOMENT: the index answers 23505 to one,
// and that one joins instead of failing.
{
  const db = makeTable({ migrated: true });
  const [a, b] = await Promise.all([P.scheduleDeletion(db.client, U), P.scheduleDeletion(db.client, U)]);
  check("two confirmations racing both succeed", a !== null && b !== null, `${a === null ? "first null " : ""}${b === null ? "second null" : ""}`);
  check("...with one open row between them", db.open(U).length === 1 && db.rows.length === 1, `${db.rows.length} rows`);
  check("...one of them joined", (a?.joined ?? false) !== (b?.joined ?? false));
  const loser = a?.joined ? b : a;
  check("...and the link of the one that lost the race still cancels", (await P.cancelDeletion(db.client, loser?.cancelToken ?? "x")) !== null && db.open(U).length === 0);
}
// THE LINKS THE MIGRATION FOLDED: a duplicate's digest was moved into the
// kept row's previous_cancel_token_hashes, and its email keeps working.
{
  const db = makeTable({ migrated: true });
  const folded = "9".repeat(64);
  db.seed({ user_id: U, delete_after: new Date(Date.now() + 3 * DAY).toISOString(), cancel_token_hash: sha("kept"), previous_cancel_token_hashes: [sha(folded)] });
  check("a link folded into the kept row by the migration cancels it", (await P.cancelDeletion(db.client, folded)) !== null && db.open(U).length === 0);
}

// ---------------------------------------------------------------------
console.log("\n== 2. the cron writes the record first, and gives a claim back on every failure ==");
{
  const cron = stripComments(readFileSync("src/app/api/cron/execute-deletions/route.ts", "utf8"));
  const claimAt = cron.indexOf("await claimExecution(admin, row.id)");
  const eraseAt = cron.indexOf("eraseUserStorage(admin.storage, row.user_id)");
  const deleteAt = cron.indexOf("admin.auth.admin.deleteUser(row.user_id)");
  check("the cron claims each row", claimAt > 0);
  check("...before it erases a single file", claimAt > 0 && eraseAt > claimAt, `claim at ${claimAt}, erase at ${eraseAt}`);
  check("...and so before the account is deleted — executed_at exists when user_id goes null", claimAt > 0 && deleteAt > claimAt);
  check("nothing marks a row after deleteUser any more", !/markExecuted/.test(cron));
  check("a row cancelled meanwhile is left alone", /if \(claim === "not_open"\) \{\s*skipped\+\+;\s*continue;\s*\}/.test(cron));
  check("...and one the claim could not write is not erased", /if \(claim === "error"\) \{[\s\S]{0,200}?continue;/.test(cron));
  // EVERY STEP THAT CAN FAIL AFTER THE CLAIM, by the stage it reports.
  const stages = [...cron.matchAll(/stage: "([a-z_A-Z]+)", message:[\s\S]*?continue;/g)].map((m) => [m[1], m[0]]);
  const after = stages.filter(([s]) => s !== "claim");
  check(`the failure paths after the claim were found (${after.map(([s]) => s).join(", ")})`, after.length >= 4);
  for (const [stage, body] of after) {
    check(`...${stage}: gives the claim back before moving on`, /await giveBack\(admin, row\);/.test(body));
  }
  check("...and so does an unexpected throw", /catch \(err\) \{[\s\S]*?stage: "unhandled"[\s\S]*?await giveBack\(admin, row\);/.test(cron));
  check("giving back is releaseExecution, which never reopens a row whose account is gone", /await releaseExecution\(admin, row\.id\)/.test(cron));
}

// ---------------------------------------------------------------------
console.log("\n== 3. a schedule that did not land gives the confirmation link back ==");
{
  const route = stripComments(readFileSync("src/app/api/delete-account/confirm/route.ts", "utf8"));
  const start = route.indexOf("if (deferredOn) {");
  const end = route.indexOf("sendDeletionScheduledEmail(", start);
  const branch = start >= 0 && end > start ? route.slice(start, end) : "";
  check("the deferred branch was found", branch.length > 0);
  check("a throw from scheduleDeletion is caught, not left to spend the link", /try \{\s*result = await scheduleDeletion\(admin, claimed\.user_id\);\s*\} catch/.test(branch));
  const failed = branch.slice(branch.indexOf("if (!result) {"));
  check("when nothing was scheduled, used_at goes back to null on this request's token",
    /const \{ error: giveBackError \} = await admin\s*\.from\("account_deletion_requests"\)\s*\.update\(\{ used_at: null \}\)\s*\.eq\("token_hash", tokenHash\);/.test(failed));
  check("...BEFORE the answer that says to try again",
    failed.indexOf("used_at: null") > 0 && failed.indexOf('code: "retry"') > failed.indexOf("used_at: null"));
  check("...and a give-back that failed says contact support, not try again",
    /if \(giveBackError\) \{[\s\S]{0,400}?code: "contact_support"[\s\S]{0,80}?status: 500/.test(failed));
}

// ---------------------------------------------------------------------
console.log("\n== 4. Settings answers what happened ==");
{
  const status = stripComments(readFileSync("src/app/api/delete-account/status/route.ts", "utf8"));
  check("a failed write is a 500, not «not found»", /if \(cancelled === null\) \{[\s\S]{0,200}?status: 500/.test(status));
  check("...«not found» only when there was nothing open", /if \(cancelled === 0\) \{[\s\S]{0,200}?status: 404/.test(status));
}

// ---------------------------------------------------------------------
console.log("\n== 5. the migration: fold, then the index, then the record ==");
{
  const FILE = "supabase/migrations/20261112000000_pending_deletions_one_open.sql";
  const sql = readFileSync(FILE, "utf8").replace(/--[^\n]*/g, "");
  const index = sql.search(/create unique index if not exists pending_deletions_one_open_per_user\s+on public\.pending_deletions \(user_id\)\s+where cancelled_at is null and executed_at is null;/i);
  const foldLinks = sql.search(/set previous_cancel_token_hashes = p\.previous_cancel_token_hashes \|\| folded\.hashes/i);
  const foldCancel = sql.search(/set cancelled_at = now\(\)\s+from ranked\s+where p\.id = ranked\.id\s+and ranked\.rn > 1;/i);
  check("one open row per account: a UNIQUE index on user_id, partial on cancelled_at and executed_at", index > 0);
  check("the duplicates are folded BEFORE it, or it could not be built", foldLinks > 0 && foldCancel > 0 && foldLinks < index && foldCancel < index);
  check("...keeping the earliest delete_after open", (sql.match(/partition by user_id\s+order by delete_after asc, created_at asc, id asc/gi) ?? []).length === 2);
  check("...their links carried into the kept row before they are cancelled", foldLinks < foldCancel);
  check("...and nothing deleted", !/delete\s+from\s+public\.pending_deletions/i.test(sql));
  check("the account's deletion detaches the row instead of removing it",
    /drop constraint if exists pending_deletions_user_id_fkey;[\s\S]*foreign key \(user_id\) references auth\.users\(id\) on delete set null;/i.test(sql) &&
      /alter column user_id drop not null/i.test(sql));
  check("the header says how to undo it", /^-- How to undo: /m.test(readFileSync(FILE, "utf8")));
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
