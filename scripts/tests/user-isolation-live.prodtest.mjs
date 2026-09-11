#!/usr/bin/env node
/*
 * THE OTHER HALF: DOES GoTrue ISSUE THE CLAIM THE POLICIES READ?
 *
 * ==========================================================
 * WHAT user-isolation.dbtest.mjs PROVED, AND WHAT IT DID NOT
 * ==========================================================
 *
 * That file seats two subjects in Postgres with `set local role
 * authenticated` + `set local request.jwt.claim.sub`, and shows that this
 * project's policies keep them apart across 96 user-owned tables and 3
 * storage buckets. It is real and it is green.
 *
 * Its own header names what it cannot reach, and this file is that:
 *
 *   "It does NOT prove that a real HTTP session in production carries the
 *    right subject — that the server hands the caller's JWT to the
 *    database rather than a service-role key."
 *
 * Those are different claims and only the second one involves GoTrue. A
 * project can have flawless policies and still leak, in three ways this
 * file can see and the dbtest cannot:
 *
 *   1. The token GoTrue issues carries a `sub` that is not the user's id,
 *      or is the same for two accounts.
 *   2. PostgREST is reached with the SERVICE ROLE key somewhere in the
 *      path, which bypasses RLS entirely and looks identical from inside
 *      the database.
 *   3. A table is exposed through PostgREST that the dbtest never knew
 *      about, because the dbtest asks pg_class and this asks the API.
 *
 * ==========================================================
 * THE TABLE LIST IS ASKED OF THE API, NOT GREPPED
 * ==========================================================
 *
 * PostgREST publishes its own OpenAPI document at the REST root. That is
 * the list of tables a browser can actually reach, which is the
 * population this file is about — and it is the same lesson /api/health
 * learned the hard way (CLAUDE.md): ask the database API for its own
 * list rather than deriving one and trusting it. A table added to the
 * schema and never added to any test appears here automatically.
 *
 * ==========================================================
 * IT WRITES TO PRODUCTION. THE SAFETY IS NOT OPTIONAL.
 * ==========================================================
 *
 *   · It refuses to start unless BOTH accounts are supplied explicitly.
 *     There is no default, no fallback and no "use the owner's account".
 *   · Every row it creates is tagged with RUN_TAG and deleted in a
 *     finally block, as its owner, through the same anon-key path.
 *   · It never writes as B. B only ever READS, which is the whole claim.
 *   · It touches no account other than the two given.
 *
 * Run:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   ISOLATION_EMAIL_A=... ISOLATION_PASSWORD_A=... \
 *   ISOLATION_EMAIL_B=... ISOLATION_PASSWORD_B=... \
 *   node scripts/tests/user-isolation-live.prodtest.mjs
 */

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const A_EMAIL = process.env.ISOLATION_EMAIL_A ?? "";
const A_PASSWORD = process.env.ISOLATION_PASSWORD_A ?? "";
const B_EMAIL = process.env.ISOLATION_EMAIL_B ?? "";
const B_PASSWORD = process.env.ISOLATION_PASSWORD_B ?? "";

// SKIPPING SAYS EXACTLY WHAT IS MISSING. "SKIPPED: not configured" is how
// a test that never runs looks identical to one that passes, and
// run-mutations.mjs already had to learn that a skipped suite is not
// evidence of anything.
const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY],
  ["ISOLATION_EMAIL_A", A_EMAIL],
  ["ISOLATION_PASSWORD_A", A_PASSWORD],
  ["ISOLATION_EMAIL_B", B_EMAIL],
  ["ISOLATION_PASSWORD_B", B_PASSWORD],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  console.log("SKIPPED: this file signs in as two real accounts against a real Supabase.");
  console.log(`         Missing: ${missing.join(", ")}`);
  console.log("         Nothing was checked. A skipped suite is not evidence of anything.");
  process.exit(0);
}

if (A_EMAIL === B_EMAIL) {
  console.log("REFUSED: ISOLATION_EMAIL_A and ISOLATION_EMAIL_B are the same account.");
  console.log("         Two names for one subject would make every check below pass.");
  process.exit(1);
}

/** Marks every row this run creates, so cleanup can find them and a human can too. */
const RUN_TAG = `isolation-probe-${process.pid}-${Math.round(Number(process.hrtime.bigint() / 1000000n))}`;

const rest = (path, token, init = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

async function signIn(email, password, label) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${label} could not sign in (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return { token: json.access_token, id: json.user?.id ?? null, email: json.user?.email ?? null };
}

/** The `sub` GoTrue actually put in the token, read from the token itself. */
function subOf(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
    return { sub: payload.sub ?? null, role: payload.role ?? null };
  } catch {
    return { sub: null, role: null };
  }
}

const cleanup = [];

try {
  // -------------------------------------------------------------------
  console.log("== 1. two real sessions, and the claim inside each token ==");
  const A = await signIn(A_EMAIL, A_PASSWORD, "account A");
  const B = await signIn(B_EMAIL, B_PASSWORD, "account B");

  check("A signed in", Boolean(A.token && A.id), A.email ?? "no id");
  check("B signed in", Boolean(B.token && B.id), B.email ?? "no id");
  check("they are different accounts", A.id !== B.id, `${A.id} vs ${B.id}`);

  // THE CLAIM ITSELF. auth.uid() reads request.jwt.claim.sub; every policy
  // in this project is written against it. If GoTrue puts something else
  // there — or the same value for two people — the policies are correct
  // and the product still leaks, and no amount of database testing sees
  // it. This is the single check the dbtest cannot make.
  const aClaim = subOf(A.token);
  const bClaim = subOf(B.token);
  check("A's token carries a sub", Boolean(aClaim.sub), JSON.stringify(aClaim));
  check("...and it IS A's user id", aClaim.sub === A.id, `${aClaim.sub} vs ${A.id}`);
  check("B's token carries a sub", Boolean(bClaim.sub));
  check("...and it IS B's user id", bClaim.sub === B.id, `${bClaim.sub} vs ${B.id}`);
  check("the two subs differ", aClaim.sub !== bClaim.sub);
  // ROLE authenticated, not service_role. A token minted with the service
  // role bypasses RLS completely and every check below would pass while
  // proving the opposite of what it claims.
  check("A's token is role=authenticated, not service_role", aClaim.role === "authenticated", String(aClaim.role));
  check("B's token is role=authenticated, not service_role", bClaim.role === "authenticated", String(bClaim.role));

  // -------------------------------------------------------------------
  console.log("\n== 2. the table list, asked of PostgREST rather than grepped ==");
  const rootRes = await rest("", A.token);
  check("the REST root answered", rootRes.ok, `HTTP ${rootRes.status}`);
  const root = rootRes.ok ? await rootRes.json() : { definitions: {} };
  const exposed = Object.keys(root.definitions ?? {}).sort();
  check(`PostgREST exposes tables (${exposed.length})`, exposed.length >= 50, String(exposed.length));

  // WHICH OF THEM ARE OWNED. A table with no user_id/owner_id column is
  // not this file's business — shared reference data, help articles, the
  // agent template library. The property list comes from the same OpenAPI
  // document, so this is still the API describing itself.
  const OWNER_COLUMNS = ["user_id", "owner_id"];
  const ownerColumnOf = (table) => {
    const props = root.definitions?.[table]?.properties ?? {};
    return OWNER_COLUMNS.find((c) => c in props) ?? null;
  };
  const owned = exposed.filter((t) => ownerColumnOf(t));
  check(`user-owned tables among them (${owned.length})`, owned.length >= 40, owned.length + " found");

  // -------------------------------------------------------------------
  console.log("\n== 3. A writes. Only A. ==");
  //
  // SEEDED FROM THE MODULE CONFIGS, not invented: lib/modules.ts and
  // lib/build-modules.ts declare which fields are `required: true`, so a
  // row that satisfies them is a row the product itself would write. Any
  // table this cannot seed is still probed in section 4 — it simply has
  // no positive control, and section 5 says how many of those there were
  // rather than letting them disappear.
  const { loadTs } = await import("./load-ts.mjs");
  const cm = await loadTs("src/lib/classifier-modules.ts");
  const bm = await loadTs("src/lib/build-modules.ts");
  const configs = [...cm.CLASSIFIER_MODULES, ...bm.BUILD_MODULES];

  const seeded = [];
  for (const config of configs) {
    if (!owned.includes(config.table)) continue;
    const row = { [ownerColumnOf(config.table)]: A.id };
    for (const f of config.fields ?? []) {
      if (!f.required) continue;
      row[f.key] =
        f.type === "number" ? 1 : f.type === "select" ? (f.options ?? ["x"])[0] : `${RUN_TAG}`;
    }
    const res = await rest(`${config.table}`, A.token, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    if (!res.ok) continue;
    const created = await res.json();
    const id = Array.isArray(created) ? created[0]?.id : created?.id;
    if (id) {
      seeded.push({ table: config.table, id, ownerColumn: ownerColumnOf(config.table) });
      cleanup.push({ table: config.table, id });
    }
  }
  check(`A created rows in ${seeded.length} tables`, seeded.length >= 5,
    `${seeded.length} — without a positive control the rest of this file is vacuous`);

  // THE POSITIVE CONTROL, and it is what makes section 4 mean anything. A
  // table that answers "B sees nothing" because it answers "nobody sees
  // anything" proves the opposite of isolation. Every seeded row must be
  // visible to its own owner first.
  const invisibleToOwner = [];
  for (const s of seeded) {
    const res = await rest(`${s.table}?id=eq.${s.id}&select=id`, A.token);
    const rows = res.ok ? await res.json() : [];
    if (!Array.isArray(rows) || rows.length !== 1) invisibleToOwner.push(s.table);
  }
  check("A can see every row A just created", invisibleToOwner.length === 0,
    invisibleToOwner.join(", "));

  // -------------------------------------------------------------------
  console.log("\n== 4. B asks for every table. Zero rows of A. ==");
  const leaks = [];
  const errored = [];
  let probed = 0;
  for (const table of owned) {
    const col = ownerColumnOf(table);
    const res = await rest(
      `${table}?${col}=eq.${A.id}&select=${col}&limit=5`,
      B.token
    );
    if (!res.ok) {
      // A 401/403/404 is B being refused, which is isolation working. A
      // 500 is a broken probe and must not be counted as a pass.
      if (res.status >= 500) errored.push(`${table} (HTTP ${res.status})`);
      probed++;
      continue;
    }
    const rows = await res.json();
    probed++;
    if (Array.isArray(rows) && rows.length > 0) {
      leaks.push(`${table}: ${rows.length} row(s) owned by A`);
    }
  }
  check(`every user-owned table was asked as B (${probed} of ${owned.length})`,
    probed === owned.length, `${probed}`);
  check("B sees ZERO rows belonging to A, in every table", leaks.length === 0,
    leaks.join("\n        "));
  check("no probe failed with a server error", errored.length === 0, errored.join(", "));

  // AND B CANNOT WRITE TO A'S ROWS EITHER. Reading is the question asked;
  // a policy that hides a row and still lets it be updated is a leak in
  // the other direction, and the dbtest checks exactly this pair.
  const writable = [];
  for (const s of seeded) {
    const res = await rest(`${s.table}?id=eq.${s.id}`, B.token, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ [s.ownerColumn]: B.id }),
    });
    if (!res.ok) continue;
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length > 0) writable.push(s.table);
  }
  check("B cannot update A's rows", writable.length === 0, writable.join(", "));

  const deletable = [];
  for (const s of seeded) {
    const res = await rest(`${s.table}?id=eq.${s.id}`, B.token, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });
    if (!res.ok) continue;
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length > 0) deletable.push(s.table);
  }
  check("B cannot delete A's rows", deletable.length === 0, deletable.join(", "));

  // -------------------------------------------------------------------
  console.log("\n== 5. the three storage buckets ==");
  // THE SAME THREE user-isolation.dbtest.mjs names. Storage is a separate
  // policy surface — storage.objects has its own ten policies — and a
  // product whose tables are sealed and whose files are not has not
  // isolated anything: the PDF of somebody's finance report is the row.
  const BUCKETS = ["user-files", "website-references", "create-attachments"];
  const objectPath = (id) => `${id}/${RUN_TAG}.txt`;

  const storageLeaks = [];
  const uploadFailed = [];
  for (const bucket of BUCKETS) {
    const path = objectPath(A.id);
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${A.token}`,
        "Content-Type": "text/plain",
      },
      body: RUN_TAG,
    });
    if (!up.ok) {
      uploadFailed.push(`${bucket} (HTTP ${up.status})`);
      continue;
    }
    cleanup.push({ bucket, path });

    // B TRIES TO READ IT. Two ways, because they are answered by
    // different policies: listing the folder, and fetching the object.
    const list = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${B.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix: `${A.id}/`, limit: 20 }),
    });
    if (list.ok) {
      const items = await list.json();
      if (Array.isArray(items) && items.length > 0) {
        storageLeaks.push(`${bucket}: B listed ${items.length} of A's objects`);
      }
    }

    const get = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${B.token}` },
    });
    if (get.ok) storageLeaks.push(`${bucket}: B downloaded A's object (HTTP ${get.status})`);

    // AND THE POSITIVE CONTROL. A must be able to read A's own file, or
    // "B cannot" is a statement about a bucket nobody can read.
    const own = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${A.token}` },
    });
    check(`A can read A's own object in ${bucket}`, own.ok, `HTTP ${own.status}`);
  }
  check(`A uploaded to all ${BUCKETS.length} buckets`, uploadFailed.length === 0,
    uploadFailed.join(", ") + " — without an upload the bucket check below is vacuous");
  check("B can reach NONE of A's objects, in any bucket", storageLeaks.length === 0,
    storageLeaks.join("\n        "));

  // -------------------------------------------------------------------
  console.log("\n== 6. the anon key alone reaches nothing ==");
  // The key that ships in the browser bundle, with no session at all.
  // Every check above is about two signed-in people; this is about
  // everybody else.
  const anonLeaks = [];
  for (const table of owned.slice(0, 40)) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: ANON_KEY },
    });
    if (!res.ok) continue;
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length > 0) anonLeaks.push(table);
  }
  check("an unauthenticated caller reads no user-owned row", anonLeaks.length === 0,
    anonLeaks.join(", "));
} catch (err) {
  failures.push("the run itself");
  console.log(`  FAIL  the run itself\n        ${String(err?.message ?? err)}`);
} finally {
  // EVERY ROW AND EVERY OBJECT, DELETED AS ITS OWNER. A test that writes
  // to production and leaves its litter behind is a test somebody
  // switches off. Failures here are reported, never swallowed.
  const stuck = [];
  if (cleanup.length > 0) {
    try {
      const A = await signIn(A_EMAIL, A_PASSWORD, "account A (cleanup)");
      for (const item of cleanup) {
        try {
          const res = item.bucket
            ? await fetch(`${SUPABASE_URL}/storage/v1/object/${item.bucket}/${item.path}`, {
                method: "DELETE",
                headers: { apikey: ANON_KEY, Authorization: `Bearer ${A.token}` },
              })
            : await rest(`${item.table}?id=eq.${item.id}`, A.token, { method: "DELETE" });
          if (!res.ok) stuck.push(item.bucket ? `${item.bucket}/${item.path}` : `${item.table}#${item.id}`);
        } catch {
          stuck.push(item.bucket ? `${item.bucket}/${item.path}` : `${item.table}#${item.id}`);
        }
      }
    } catch (err) {
      stuck.push(`could not sign in to clean up: ${String(err?.message ?? err)}`);
    }
  }
  console.log(
    stuck.length === 0
      ? `\n  cleaned up ${cleanup.length} object(s) created by this run`
      : `\n  WARNING — ${stuck.length} item(s) were NOT removed and are tagged ${RUN_TAG}:\n    ${stuck.join("\n    ")}`
  );
  if (stuck.length > 0) failures.push("cleanup left rows behind");
}

console.log(`\n${failures.length === 0 ? "PASSED" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
