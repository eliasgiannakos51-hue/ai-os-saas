#!/usr/bin/env node
/*
 * DOES THE LIVE ISOLATION PROBE ACTUALLY CATCH A LEAK?
 *
 * user-isolation-live.prodtest.mjs cannot run until two real accounts
 * exist. That is a fine reason for it not to have run and a terrible
 * reason to believe it works: a probe nobody has seen go red is a probe
 * with no evidence behind it, and this repository has shipped three of
 * those (CLAUDE.md names them).
 *
 * So this file stands up a Supabase-shaped server — GoTrue's token
 * endpoint, PostgREST's OpenAPI root and table routes, Storage's object
 * routes — and runs the real prodtest against it as a child process,
 * once per scenario:
 *
 *   SEALED    everything behaves. The probe must report PASSED.
 *   Six LEAKS each one thing wrong. The probe must report FAILED, and on
 *             the CHECK THAT NAMES THAT LEAK — not merely fail, which a
 *             probe that crashes also does.
 *
 * That last clause is the one that matters. A test asserting only "it
 * went red" passes for a probe that is red for every input, which is the
 * vacuous-assertion shape in its most flattering disguise.
 *
 * WHAT THIS DOES NOT PROVE. That production is isolated — only two real
 * accounts against the real deployment can say that. It proves the
 * INSTRUMENT works, which is the half that can be established now.
 *
 * AN .itest, NOT A .test, AND THAT IS A RULE RATHER THAN A PREFERENCE.
 * Every *.test.mjs runs inside `next build`; this file binds a port, and
 * billing-coverage.test.mjs forbids that for a reason it states plainly —
 * "a gate that needs a working network is not a gate, it is a coin flip".
 * A deploy has already broken that way. Integration tests run under
 * `npm run test:integration`, which is where a suite with a server
 * belongs.
 *
 * Run: node scripts/tests/isolation-probe-honesty.itest.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

const A_ID = "11111111-1111-4111-8111-111111111111";
const B_ID = "22222222-2222-4222-8222-222222222222";

const cm = await loadTs("src/lib/classifier-modules.ts");
const bm = await loadTs("src/lib/build-modules.ts");
const MODULE_TABLES = [...cm.CLASSIFIER_MODULES, ...bm.BUILD_MODULES].map((m) => m.table);

// The probe requires a realistic population before it will believe the
// answer — >= 50 exposed and >= 40 owned. Filler tables carry a user_id
// and no rows, which is what most of production's owned tables look like
// from B's side anyway.
const OWNED = [...new Set([...MODULE_TABLES, ...Array.from({ length: 60 }, (_, i) => `filler_${i}`)])];

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function jwt(sub, role) {
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({ sub, role })}.sig`;
}

/**
 * @param {object} leak which single thing is wrong. Exactly one at a time:
 *   sameSub        both tokens carry A's sub
 *   serviceRole    tokens are minted role=service_role
 *   readRows       B's reads return A's rows
 *   anonRows       the anon key reads rows
 *   storageGet     B can download A's object
 *   ownerBlind     A cannot see A's own row (the positive control fails)
 */
function startStub(leak = {}) {
  /** table -> rows */
  const store = new Map();
  /** "bucket/path" -> body */
  const objects = new Map();
  let nextId = 1;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const path = url.pathname;
    const auth = req.headers.authorization ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const claim = (() => {
      try {
        return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      } catch {
        return {};
      }
    })();
    const caller = claim.sub ?? null;

    const send = (code, body) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };

    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      // ---- GoTrue -------------------------------------------------
      if (path === "/auth/v1/token") {
        const { email } = JSON.parse(raw || "{}");
        const isA = String(email).includes("a@");
        const id = isA ? A_ID : B_ID;
        const sub = leak.sameSub ? A_ID : id;
        const role = leak.serviceRole ? "service_role" : "authenticated";
        return send(200, { access_token: jwt(sub, role), user: { id, email } });
      }

      // ---- PostgREST OpenAPI root ---------------------------------
      if (path === "/rest/v1/" || path === "/rest/v1") {
        const definitions = {};
        for (const t of OWNED) {
          definitions[t] = { properties: { id: {}, user_id: {}, name: {}, title: {} } };
        }
        // A few unowned tables, so the probe's "which are owned" split is
        // exercised rather than trivially true.
        definitions.help_articles = { properties: { id: {}, slug: {}, title: {} } };
        definitions.agent_templates = { properties: { id: {}, name: {} } };
        return send(200, { definitions });
      }

      // ---- Storage -------------------------------------------------
      if (path.startsWith("/storage/v1/object/list/")) {
        const bucket = path.slice("/storage/v1/object/list/".length);
        const { prefix } = JSON.parse(raw || "{}");
        const mine = [...objects.keys()].filter((k) => k.startsWith(`${bucket}/${prefix}`));
        // Sealed: only the caller's own folder is listable.
        const allowed = mine.filter((k) => k.includes(`/${caller}/`) || leak.storageGet);
        return send(200, allowed.map((k) => ({ name: k })));
      }
      if (path.startsWith("/storage/v1/object/")) {
        const rest = path.slice("/storage/v1/object/".length);
        const [bucket, ...restPath] = rest.split("/");
        const key = `${bucket}/${restPath.join("/")}`;
        const owner = restPath[0];
        if (req.method === "POST") {
          objects.set(key, raw);
          return send(200, { Key: key });
        }
        if (req.method === "DELETE") {
          objects.delete(key);
          return send(200, {});
        }
        if (!objects.has(key)) return send(404, { message: "not found" });
        if (owner !== caller && !leak.storageGet) return send(403, { message: "denied" });
        return send(200, objects.get(key) ?? "");
      }

      // ---- PostgREST tables ---------------------------------------
      const m = path.match(/^\/rest\/v1\/([a-z0-9_]+)$/);
      if (!m) return send(404, { message: "no route" });
      const table = m[1];
      const rows = store.get(table) ?? [];

      if (req.method === "POST") {
        if (!caller) return send(401, { message: "no session" });
        const row = { id: `row-${nextId++}`, ...JSON.parse(raw || "{}") };
        store.set(table, [...rows, row]);
        return send(201, [row]);
      }

      // Every read and write below is filtered by the caller, which is
      // what RLS does in production. `leak.readRows` removes that filter
      // for reads only, which is the commonest real leak.
      const idEq = url.searchParams.get("id")?.replace(/^eq\./, "");
      const userEq = url.searchParams.get("user_id")?.replace(/^eq\./, "");
      let visible = rows;
      if (!caller) visible = leak.anonRows ? rows : [];
      else if (!leak.readRows) visible = rows.filter((r) => r.user_id === caller);
      if (idEq) visible = visible.filter((r) => r.id === idEq);
      if (userEq) visible = visible.filter((r) => r.user_id === userEq);
      if (leak.ownerBlind && caller === A_ID && idEq) visible = [];

      if (req.method === "GET") return send(200, visible);
      if (req.method === "PATCH" || req.method === "DELETE") {
        // Writes are ALWAYS owner-filtered here: the leaks this file
        // models are read leaks, and a write leak would make several
        // checks red at once and blur which clause caught what.
        const mine = visible.filter((r) => r.user_id === caller);
        if (req.method === "DELETE") {
          store.set(table, rows.filter((r) => !mine.includes(r)));
        }
        return send(200, mine);
      }
      return send(405, { message: "no" });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, stop: () => server.close() });
    });
  });
}

/**
 * SPAWNED, NOT execFileSync, and this cost an afternoon.
 *
 * The stub server lives in THIS process. execFileSync blocks this
 * process's event loop until the child exits — so the child's very first
 * HTTP request to the stub could never be answered, and both sides waited
 * for each other forever. The symptom was a test that produced no output
 * at all, which reads like a hang in the code under test rather than a
 * deadlock between the harness and its own fixture.
 *
 * An async spawn keeps the loop free to serve the stub while the child
 * runs, which is the only arrangement that works when the fixture and the
 * runner share a process.
 */
function runProbe(url, overrides = {}) {
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-for-the-stub",
    ISOLATION_EMAIL_A: "a@example.test",
    ISOLATION_PASSWORD_A: "pw-a",
    ISOLATION_EMAIL_B: "b@example.test",
    ISOLATION_PASSWORD_B: "pw-b",
  };
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/tests/user-isolation-live.prodtest.mjs"], {
      env: { ...env, ...overrides },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    // A CEILING, so a probe that genuinely hangs is reported as a hang
    // rather than hanging this file too.
    const timer = setTimeout(() => child.kill("SIGKILL"), 90_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        green: code === 0,
        out,
        failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((x) => x[1].trim()),
      });
    });
  });
}

// ---------------------------------------------------------------------
console.log("== 1. a sealed deployment: the probe must go GREEN ==");
{
  const stub = await startStub();
  const r = await runProbe(stub.url);
  stub.stop();
  ok("the probe passes against a correctly isolated stub", r.green,
    (r.failed ?? []).join(" | ") || r.out.slice(-600));
  ok("...and it actually checked things", /PASSED: \d+ passed/.test(r.out) && !/SKIPPED/.test(r.out),
    r.out.slice(-300));
  // WITHOUT THIS the whole file could pass with a probe that is red for
  // everything: six leaks caught and no green baseline is not evidence of
  // discrimination, it is evidence of a stuck needle.
}

// ---------------------------------------------------------------------
console.log("\n== 2. six leaks, each caught by the clause that names it ==");
const LEAKS = [
  {
    name: "B's reads return A's rows",
    leak: { readRows: true },
    expect: "B sees ZERO rows belonging to A",
  },
  {
    name: "GoTrue issues the same sub for both accounts",
    leak: { sameSub: true },
    expect: "the two subs differ",
  },
  {
    name: "tokens are minted with role=service_role",
    leak: { serviceRole: true },
    expect: "role=authenticated, not service_role",
  },
  {
    name: "the anon key alone reads user rows",
    leak: { anonRows: true },
    expect: "an unauthenticated caller reads no user-owned row",
  },
  {
    name: "B can download A's stored object",
    leak: { storageGet: true },
    expect: "B can reach NONE of A's objects",
  },
  {
    // THE VACUOUS CASE, and it is the one worth most. A deployment where
    // nobody can read anything answers "B sees nothing" perfectly. The
    // positive control is the only thing that tells the two apart.
    name: "nobody can read anything, including A",
    leak: { ownerBlind: true },
    expect: "A can see every row A just created",
  },
];

for (const c of LEAKS) {
  const stub = await startStub(c.leak);
  const r = await runProbe(stub.url);
  stub.stop();
  ok(`RED: ${c.name}`, !r.green, "the probe stayed green");
  ok(`...caught by the right clause ("${c.expect}")`,
    !r.green && (r.failed ?? []).some((f) => f.includes(c.expect)),
    (r.failed ?? []).slice(0, 4).join(" | "));
}

// ---------------------------------------------------------------------
console.log("\n== 3. the probe refuses the two ways it could lie ==");
{
  // ONE ACCOUNT TWICE would make every isolation check pass trivially.
  const stub = await startStub();
  const same = await runProbe(stub.url, {
    ISOLATION_EMAIL_A: "same@example.test",
    ISOLATION_EMAIL_B: "same@example.test",
  });
  ok("it refuses when both accounts are the same address",
    /REFUSED/.test(same.out), same.out.slice(0, 300));

  // AND MISSING CREDENTIALS SKIP LOUDLY, naming every variable. A skip
  // that says "not configured" is how a test nobody can run looks
  // identical to one that passes.
  const blank = await runProbe(stub.url, {
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    ISOLATION_EMAIL_A: "", ISOLATION_PASSWORD_A: "",
    ISOLATION_EMAIL_B: "", ISOLATION_PASSWORD_B: "",
  });
  stub.stop();
  ok("a missing configuration skips and names every variable",
    /SKIPPED/.test(blank.out) &&
      ["ISOLATION_EMAIL_A", "ISOLATION_PASSWORD_B", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]
        .every((v) => blank.out.includes(v)),
    blank.out.slice(0, 300));
  ok("...and says plainly that nothing was checked",
    /not evidence of anything/.test(blank.out));
}

console.log(`\n${failures.length === 0 ? "PASSED" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
