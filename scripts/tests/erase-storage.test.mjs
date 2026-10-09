/*
 * ACCOUNT DELETION REMOVES EVERY FILE, THROUGH THE STORAGE API.
 *
 * src/lib/account/erase-storage.ts is run here against a stand-in that
 * answers as Supabase's Storage API does: one folder level per listing,
 * folders as entries with no id, pages of at most `limit`, removal by
 * exact path. A person with files in every bucket, folders three deep and
 * one folder of 2,500 files (more than two pages), next to another person
 * with the same layout.
 *
 * Then the route: the deletion calls this before it deletes anything
 * else, and no longer calls delete_user_storage_objects(), the SQL
 * function Supabase refuses since 2026-03. The same route is driven in a
 * built app by scripts/tests/delete-account.prodtest.mjs.
 *
 * Run: node scripts/tests/erase-storage.test.mjs
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const { eraseUserStorage, USER_BUCKETS } = await loadTs("src/lib/account/erase-storage.ts");

const U = "11111111-1111-4111-8111-111111111111";
const V = "22222222-2222-4222-8222-222222222222";

/** A Storage API stand-in: list one level, folders without id, pages. */
function makeStorage({ failRemoveIn = null, ignoreRemoveOf = null } = {}) {
  const buckets = new Map();
  const calls = { list: 0, remove: 0, removedPaths: [] };
  const put = (bucket, path) => {
    if (!buckets.has(bucket)) buckets.set(bucket, new Set());
    buckets.get(bucket).add(path);
  };
  const storage = {
    from(bucket) {
      if (!buckets.has(bucket)) buckets.set(bucket, new Set());
      const set = buckets.get(bucket);
      return {
        async list(path, { limit, offset }) {
          calls.list++;
          const prefix = path ? `${path}/` : "";
          const children = new Map();
          for (const key of set) {
            if (!key.startsWith(prefix)) continue;
            const rest = key.slice(prefix.length);
            const slash = rest.indexOf("/");
            if (slash === -1) children.set(rest, { name: rest, id: `id-${key}` });
            else children.set(rest.slice(0, slash), { name: rest.slice(0, slash), id: null });
          }
          const sorted = [...children.values()].sort((a, b) => a.name.localeCompare(b.name));
          return { data: sorted.slice(offset, offset + limit), error: null };
        },
        async remove(paths) {
          calls.remove++;
          if (failRemoveIn === bucket) return { data: null, error: { message: "storage is down" } };
          const done = [];
          for (const p of paths) {
            if (ignoreRemoveOf && p.includes(ignoreRemoveOf)) continue;
            if (set.delete(p)) done.push({ name: p });
            calls.removedPaths.push(`${bucket}:${p}`);
          }
          return { data: done, error: null };
        },
      };
    },
  };
  return { storage, buckets, put, calls };
}

function seed(st) {
  let count = 0;
  for (const who of [U, V]) {
    st.put("user-files", `${who}/contract.pdf`);
    st.put("user-files", `${who}/2026/october/payroll.pdf`);
    st.put("create-attachments", `${who}/chat/a1/photo.jpg`);
    st.put("create-attachments", `${who}/deck.png`);
    st.put("website-references", `${who}/site-1/hero.webp`);
    st.put("website-references", `${who}/site-1/derived/hero-small.webp`);
    st.put("ai-images", `${who}/img-1/1.png`);
    for (let i = 0; i < 2500; i++) st.put("ai-images", `${who}/bulk/${String(i).padStart(4, "0")}.png`);
    if (who === U) count = 2507;
  }
  return count;
}
const pathsOf = (st, who) => [...st.buckets.entries()].flatMap(([b, set]) => [...set].filter((p) => p.startsWith(`${who}/`)).map((p) => `${b}:${p}`));

console.log("erase-storage\n\n== 1. every file of one person, and nobody else's ==");
{
  const st = makeStorage();
  const total = seed(st);
  const beforeV = pathsOf(st, V).length;
  let out = { removed: -1, byBucket: {} };
  let threw = null;
  try { out = await eraseUserStorage(st.storage, U); } catch (e) { threw = e; }
  check("it finishes without an error", threw === null, String(threw));
  check(`all ${total} of the person's files are gone, from every bucket`, pathsOf(st, U).length === 0, pathsOf(st, U).slice(0, 5).join(", "));
  check("...including the ones three folders down", !st.buckets.get("user-files").has(`${U}/2026/october/payroll.pdf`));
  check("...and past the first two pages of a 2,500-file folder", !st.buckets.get("ai-images").has(`${U}/bulk/2499.png`));
  check(`the other person's ${beforeV} files are all still there`, pathsOf(st, V).length === beforeV);
  check(`it says how many it removed (${out.removed})`, out.removed === total, JSON.stringify(out));
  check("...per bucket", out.byBucket["ai-images"] === 2501 && out.byBucket["user-files"] === 2 && out.byBucket["create-attachments"] === 2 && out.byBucket["website-references"] === 2, JSON.stringify(out.byBucket));
  check("every bucket the application writes to is on the list", ["user-files", "create-attachments", "website-references", "ai-images"].every((b) => USER_BUCKETS.includes(b)));
}

console.log("\n== 2. a failure stops it, and says so ==");
{
  const st = makeStorage({ failRemoveIn: "create-attachments" });
  seed(st);
  let threw = null;
  try { await eraseUserStorage(st.storage, U); } catch (e) { threw = e; }
  check("a refused removal throws, naming the bucket and what the Storage API said", threw instanceof Error && /create-attachments/.test(threw.message) && /storage is down/.test(threw.message), String(threw));
  check("...and the buckets after it are not touched", st.buckets.get("ai-images").has(`${U}/img-1/1.png`));
}
{
  const st = makeStorage({ ignoreRemoveOf: "payroll" });
  seed(st);
  let threw = null;
  try { await eraseUserStorage(st.storage, U); } catch (e) { threw = e; }
  check("a file still there after removal is a failure, not a success", threw instanceof Error && /still there/.test(threw.message), String(threw));
}
{
  const st = makeStorage();
  seed(st);
  let threw = null;
  try { await eraseUserStorage(st.storage, "../" + U); } catch (e) { threw = e; }
  check("only a user id is accepted as the folder", threw instanceof Error && st.calls.list === 0, String(threw));
}
{
  const st = makeStorage();
  let deep = U;
  for (let i = 0; i < 12; i++) deep += `/d${i}`;
  st.put("user-files", `${deep}/x.txt`);
  let threw = null;
  try { await eraseUserStorage(st.storage, U); } catch (e) { threw = e; }
  check("folders deeper than the limit stop it instead of looping", threw instanceof Error && /deeper/.test(threw.message), String(threw));
}

console.log("\n== 3. the route deletes the files this way, first ==");
const route = stripComments(readFileSync("src/app/api/delete-account/confirm/route.ts", "utf8"));
const erase = route.indexOf("await eraseUserStorage(admin.storage, claimed.user_id)");
check("the deletion removes the files through the Storage API", erase > 0);
check("...and no longer through the SQL function Supabase refuses", !/delete_user_storage_objects/.test(route));
check("...before the error log is scrubbed", erase > 0 && erase < route.indexOf("forget_user_in_production_errors"));
check("...before the subscription is cancelled", erase > 0 && erase < route.indexOf("stripe.subscriptions.cancel"));
check("...and before the account itself is deleted", erase > 0 && erase < route.indexOf("admin.auth.admin.deleteUser"));
const fail = route.slice(erase, route.indexOf("forget_user_in_production_errors"));
check("a failure gives the link back, so the person can try again", /catch \(objectsError\)[\s\S]*\.update\(\{ used_at: null \}\)[\s\S]*Your link still works/.test(fail), fail.slice(0, 400));
check("...and returns before anything else is deleted", /catch \(objectsError\)[\s\S]*return NextResponse\.json/.test(fail));

console.log("\n== 4. what the page says, in the reader's language ==");
{
  const routeCodes = new Set([...route.matchAll(/code: "([a-z_]+)"/g)].map((m) => m[1]));
  const form = stripComments(readFileSync("src/app/delete-account/confirm/confirm-delete-account-form.tsx", "utf8"));
  const formCodes = new Set([...form.matchAll(/case "([a-z_]+)": return t\("errors\.\1"\);/g)].map((m) => m[1]));
  check(`every answer of the route carries a code (${routeCodes.size} codes)`, routeCodes.size >= 6 && !/ok: false, error:/.test(route.replace(/\s+/g, " ")));
  check("the page knows every code the route sends", [...routeCodes].every((c) => formCodes.has(c)), [...routeCodes].filter((c) => !formCodes.has(c)).join(", "));
  check("...and none it never sends", [...formCodes].every((c) => routeCodes.has(c)), [...formCodes].filter((c) => !routeCodes.has(c)).join(", "));
  check("the page shows its own words for a code, not the route's English", /setError\(deletionError\(data\.code\)\)/.test(form) && /default: return t\("confirmFailed"\)/.test(form) && !/data\.error/.test(form));
  for (const loc of ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"]) {
    const errs = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8")).auth?.deleteAccount?.errors ?? {};
    const missing = [...formCodes].filter((c) => typeof errs[c] !== "string" || errs[c].length < 10);
    check(`${loc}: every code has its sentence`, formCodes.size > 0 && missing.length === 0, missing.join(", "));
  }
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exitCode = failures.length ? 1 : 0;
