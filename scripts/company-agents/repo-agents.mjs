// THE COMPANY'S AGENTS THAT READ THE REPOSITORY, NOT THE DATABASE.
//
// Seven agents, all autonomy 1 (they read and report, they change nothing):
//
//   secrets-scanner         a credential-shaped string in a tracked file
//   cron-monitor            vercel.json and src/app/api/**/route.ts agree
//   migration-ledger        migration files: undo notes, names that order
//   license-monitor         licences of the packages package.json asks for
//   vulnerability-scanner   what `npm audit` says about the lockfile
//   gates-agent             the CI workflow still RUNS the gates, and can fail on them
//   testing-wrapper         the CI workflow still runs the mutation, database and
//                           integration suites, and none of them can fail silently
//
// WHY THEY LIVE HERE AND NOT IN src/lib/company-agents/run.ts. That runner
// is a Vercel function: it has a database and a network, but no checkout of
// the repository. These need the files, so they run where the files are:
// in .github/workflows/verify.yml on every push, and by hand with
//
//     node scripts/company-agents/repo-agents.mjs [--json]
//
// The judgement is in pure functions (exported, no I/O) so that
// scripts/tests/repo-agents.test.mjs can feed every shape of input; the
// gathering (git ls-files, readdir, npm audit) is in gather() below.
//
// THE RULE IS THE SAME AS FOR THE DATABASE AGENTS: a check that could not
// run says "unverified", never "ok". An empty file list is "unverified",
// not "no secrets found": a scanner that read nothing found nothing.
//
// THRESHOLDS ARE CHOSEN, NOT MEASURED (written 2026-11-07).
//
// Run: node scripts/company-agents/repo-agents.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, appendFileSync } from "node:fs";

/** The ids this file runs. company-agents.test.mjs holds that they equal CI_AGENT_IDS in roster.ts. */
export const REPO_AGENT_IDS = ["secrets-scanner", "cron-monitor", "migration-ledger", "license-monitor", "vulnerability-scanner", "gates-agent", "testing-wrapper", "deployment-monitor"];

const result = (status, summary, evidence, unverified) => ({ status, summary, evidence, unverified });

// ---------------------------------------------------------------------------
// secrets-scanner
// ---------------------------------------------------------------------------

/** Credential shapes. Each is a prefix real providers use, plus enough
 *  characters that a word in prose does not match. */
export const SECRET_PATTERNS = [
  ["anthropic_key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["aws_access_key", /AKIA[0-9A-Z]{16}/],
  ["private_key_block", /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ["stripe_live_key", /[sr]k_live_[0-9A-Za-z]{16,}/],
  ["github_token", /gh[pousr]_[A-Za-z0-9]{30,}/],
  ["slack_token", /xox[baprs]-[A-Za-z0-9-]{20,}/],
  ["jwt", /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ["resend_key", /\bre_[A-Za-z0-9]{24,}/],
];

/**
 * Files whose credential-shaped strings are known fixtures. Each carries
 * the reason, and analyzeSecrets reports an entry that matched NOTHING, so
 * an allowance cannot outlive the fixture it excused.
 */
export const SECRET_FIXTURES = {
  "scripts/tests/check-site-spelling.test.mjs": "a made-up key handed to a runner to prove it is not echoed",
  "scripts/tests/key-inventory.test.mjs": "a made-up key used to prove the inventory never prints a value",
  "scripts/tests/trading-journal.test.mjs": "a PEM header inside a string, to prove the journal redacts private keys",
};

/** files: [{ path, text }]. Never returns the matched text, only the file, line and pattern name. */
export function analyzeSecrets(files, fixtures = SECRET_FIXTURES) {
  const unverified = [
    "secrets that match none of the eight shapes (a database password, an unprefixed token)",
    "git history: only the files as they are now",
  ];
  if (!Array.isArray(files) || files.length === 0) {
    return result("unverified", "No files were read, so nothing was scanned.", { files: 0 }, ["every file: none were read", ...unverified]);
  }
  const hits = [];
  const excused = new Map();
  for (const f of files) {
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const [name, re] of SECRET_PATTERNS) {
        if (!re.test(lines[i])) continue;
        if (Object.hasOwn(fixtures, f.path)) excused.set(f.path, (excused.get(f.path) ?? 0) + 1);
        else hits.push({ path: f.path, line: i + 1, pattern: name });
      }
    }
  }
  const staleFixtures = Object.keys(fixtures).filter((p) => !excused.has(p));
  const evidence = { files: files.length, hits, excusedFixtures: Object.fromEntries(excused), staleFixtures };
  if (hits.length > 0) {
    return result("fail", `${hits.length} credential-shaped string(s): ${hits.slice(0, 5).map((h) => `${h.path}:${h.line} (${h.pattern})`).join("; ")}.`, evidence, unverified);
  }
  if (staleFixtures.length > 0) {
    return result("warn", `No credential found, but ${staleFixtures.length} allowed fixture(s) no longer contain one: ${staleFixtures.join(", ")}. Remove them from SECRET_FIXTURES.`, evidence, unverified);
  }
  return result("ok", `${files.length} files scanned, no credential-shaped string outside ${excused.size} known test fixture(s).`, evidence, unverified);
}

// ---------------------------------------------------------------------------
// cron-monitor
// ---------------------------------------------------------------------------

/** crons: vercel.json's list. routeFiles: repo paths of every src/app/api route.ts. cronDirRoutes: those under api/cron. */
export function analyzeCrons(crons, routeFiles, cronDirRoutes) {
  const unverified = [
    "whether a cron actually fired in production: this reads configuration, not Vercel's run log",
    "whether a route's work succeeds: the route is not called",
  ];
  if (!Array.isArray(crons) || !Array.isArray(routeFiles) || routeFiles.length === 0) {
    return result("unverified", "vercel.json or the route list could not be read, so nothing was checked.", {}, ["the cron configuration: unreadable", ...unverified]);
  }
  const problems = [];
  const scheduled = new Set();
  for (const c of crons) {
    scheduled.add(c.path);
    if (typeof c.path !== "string" || !c.path.startsWith("/api/")) { problems.push(`${c.path}: not an /api path`); continue; }
    const file = `src/app${c.path}/route.ts`;
    if (!routeFiles.includes(file)) problems.push(`${c.path}: no ${file}`);
    if (typeof c.schedule !== "string" || c.schedule.trim().split(/\s+/).length !== 5) problems.push(`${c.path}: schedule is not five fields`);
  }
  if (new Set(crons.map((c) => c.path)).size !== crons.length) problems.push("a path is scheduled twice");
  const unscheduled = cronDirRoutes
    .map((f) => f.replace(/^src\/app/, "").replace(/\/route\.ts$/, ""))
    .filter((p) => !scheduled.has(p));
  const evidence = { scheduled: crons.length, cronRoutes: cronDirRoutes.length, problems, unscheduled };
  if (problems.length > 0) return result("fail", `${problems.length} cron problem(s): ${problems.join("; ")}.`, evidence, unverified);
  if (unscheduled.length > 0) return result("warn", `${unscheduled.length} route(s) under /api/cron are not scheduled in vercel.json: ${unscheduled.join(", ")}.`, evidence, unverified);
  return result("ok", `${crons.length} scheduled crons, each with a route and a five-field schedule; every /api/cron route is scheduled.`, evidence, unverified);
}

// ---------------------------------------------------------------------------
// migration-ledger
// ---------------------------------------------------------------------------

/** From this version on, a migration must say how to undo itself (CLAUDE.md, 2026-10-05; gate migration-undo.test.mjs). */
export const UNDO_REQUIRED_FROM = "20261016000000";

/** files: [{ name, text }] for supabase/migrations/*.sql */
export function analyzeMigrations(files) {
  const unverified = [
    "which migrations have been applied to the database: only `npm run db:pending` can say, with DATABASE_URL",
    "whether the SQL is correct",
  ];
  if (!Array.isArray(files) || files.length === 0) {
    return result("unverified", "No migration files were read.", { files: 0 }, ["every migration: none were read", ...unverified]);
  }
  const version = (n) => n.split("_")[0];
  const names = files.map((f) => f.name).sort();
  // Several files may share a date prefix (20260808_a.sql, 20260808_b.sql) or
  // even a full timestamp: they are applied by hand, in name order, so the
  // prefix does not have to be unique. A name that does not start with a
  // date at all is the thing that could not be ordered.
  const badName = names.filter((n) => !/^\d{8}(\d{6})?_.+\.sql$/.test(n));
  const noUndo = files
    .filter((f) => version(f.name) >= UNDO_REQUIRED_FROM && /^\d{14}$/.test(version(f.name)) && !/^--\s*(How to undo|No undo):/m.test(f.text))
    .map((f) => f.name);
  const evidence = { files: files.length, newest: names[names.length - 1], badNames: badName, missingUndoNote: noUndo };
  if (noUndo.length > 0) return result("fail", `${noUndo.length} migration(s) from ${UNDO_REQUIRED_FROM} on have no undo note: ${noUndo.join(", ")}.`, evidence, unverified);
  if (badName.length > 0) return result("warn", `${badName.length} migration file name(s) do not start with a date, so their order is unclear: ${badName.join(", ")}.`, evidence, unverified);
  return result("ok", `${files.length} migration files; the newest is ${evidence.newest}; every one since ${UNDO_REQUIRED_FROM} has an undo note.`, evidence, unverified);
}

// ---------------------------------------------------------------------------
// license-monitor
// ---------------------------------------------------------------------------

// \b keeps LGPL out: there is no word boundary between the L and the G.
const COPYLEFT = /\b(AGPL|GPL|SSPL|BUSL|Commons Clause)\b/i;

/** pkgs: [{ name, license }] for the packages package.json asks for directly. license is null when unreadable. */
export function analyzeLicenses(pkgs) {
  const unverified = [
    "licences of packages pulled in indirectly: only the direct dependencies are read",
    "whether a licence is acceptable for this business: that is a legal call",
  ];
  if (!Array.isArray(pkgs) || pkgs.length === 0) {
    return result("unverified", "No packages were read, so no licence was checked.", { packages: 0 }, ["every package: none were read", ...unverified]);
  }
  const unknown = pkgs.filter((p) => !p.license).map((p) => p.name);
  // LGPL is a weak copyleft (fine when linked, not when copied), so it is a
  // warning to look at, where GPL/AGPL/SSPL are a failure.
  const strong = pkgs.filter((p) => p.license && COPYLEFT.test(p.license)).map((p) => `${p.name} (${p.license})`);
  const weak = pkgs.filter((p) => p.license && /\bLGPL\b/i.test(p.license)).map((p) => `${p.name} (${p.license})`);
  const evidence = { packages: pkgs.length, strongCopyleft: strong, weakCopyleft: weak, unknown };
  if (strong.length > 0) return result("fail", `Strong-copyleft licence in a direct dependency: ${strong.join(", ")}.`, evidence, unverified);
  if (weak.length > 0 || unknown.length > 0) {
    const parts = [];
    if (weak.length > 0) parts.push(`LGPL: ${weak.join(", ")}`);
    if (unknown.length > 0) parts.push(`licence not readable: ${unknown.join(", ")}`);
    return result("warn", parts.join("; ") + ".", evidence, unverified);
  }
  return result("ok", `${pkgs.length} direct dependencies, none with a copyleft licence.`, evidence, unverified);
}

// ---------------------------------------------------------------------------
// vulnerability-scanner
// ---------------------------------------------------------------------------

/** audit: the parsed output of `npm audit --json`, or null when it could not run. */
export function analyzeAudit(audit) {
  const unverified = [
    "vulnerabilities in code this project wrote: npm audit only knows published advisories",
    "whether a flagged package is reachable from this app's code paths",
  ];
  const v = audit?.metadata?.vulnerabilities;
  if (!v || typeof v !== "object") {
    return result("unverified", "npm audit did not return a result, so no advisory was checked.", {}, ["every dependency: the audit did not run", ...unverified]);
  }
  const n = (k) => Number(v[k] ?? 0);
  const evidence = { critical: n("critical"), high: n("high"), moderate: n("moderate"), low: n("low"), total: n("total") };
  const line = `${evidence.critical} critical, ${evidence.high} high, ${evidence.moderate} moderate, ${evidence.low} low`;
  if (evidence.critical > 0) return result("fail", `npm audit reports ${line}.`, evidence, unverified);
  if (evidence.high > 0) return result("warn", `npm audit reports ${line}.`, evidence, unverified);
  return result("ok", `npm audit reports ${line}; none high or critical.`, evidence, unverified);
}

// ---------------------------------------------------------------------------
// gates-agent and testing-wrapper
//
// WHAT THEY ARE NOT: they do not run the gates or the suites. CI already does
// that, on every push, and a second run inside a step that cannot fail the job
// would be a gate nobody listens to. What can go wrong QUIETLY is the wiring:
// someone adds `continue-on-error: true` to the gates step, renames the
// script, or drops a suite from the workflow, and every push goes green with
// the check gone. That is what these two read.
// ---------------------------------------------------------------------------

/** The workflow's steps, comments removed. A step starts at a `- name:`, `- uses:` or `- run:` line. */
export function workflowSteps(workflowText) {
  const text = String(workflowText ?? "").replace(/^\s*#.*$/gm, "");
  return text.split(/\n(?=\s*- (?:name|uses|run):)/).filter((b) => /\n?\s*- (?:name|uses|run):/.test(b));
}

const failsOpen = (step) => /continue-on-error:\s*true/.test(step);

/** workflow: text of .github/workflows/verify.yml. unitRunner: text of scripts/tests/run-gates.mjs. testFiles: number of scripts/tests/*.test.mjs. */
export function analyzeGateWiring(workflow, pkgScripts, unitRunner, testFiles) {
  const unverified = [
    "whether the gates PASS: the CI job reports that; this reads only that they are run and can fail the job",
    "branch protection: whether GitHub refuses to merge a red push is a repository setting this agent cannot see",
  ];
  if (typeof workflow !== "string" || workflow.trim() === "" || !pkgScripts || typeof pkgScripts !== "object") {
    return result("unverified", "The workflow or package.json could not be read, so the gate wiring was not checked.", {}, ["the wiring: unreadable", ...unverified]);
  }
  const steps = workflowSteps(workflow);
  const gateSteps = steps.filter((st) => /run:\s*npm run gates\b/.test(st));
  const problems = [];
  if (gateSteps.length === 0) problems.push("no workflow step runs `npm run gates`");
  if (gateSteps.some(failsOpen)) problems.push("the `npm run gates` step has continue-on-error: true, so a red gate cannot fail the job");
  if (!/\bon:[\s\S]{0,80}\bpush:/.test(workflow.replace(/^\s*#.*$/gm, ""))) problems.push("the workflow is not triggered on push");
  if (typeof pkgScripts.gates !== "string" || !/test:unit/.test(pkgScripts.gates)) problems.push("the `gates` script in package.json does not run test:unit");
  if (typeof pkgScripts["test:unit"] !== "string") problems.push("package.json has no `test:unit` script");
  const evidence = { gateSteps: gateSteps.length, testFiles, problems };
  if (problems.length > 0) return result("fail", `Gate wiring is broken: ${problems.join("; ")}.`, evidence, unverified);
  if (typeof unitRunner !== "string" || !/\.test\.mjs/.test(unitRunner)) {
    return result("warn", "The unit runner (scripts/tests/run-gates.mjs) does not mention *.test.mjs, so it is unclear it runs the gate files.", evidence, unverified);
  }
  if (!(testFiles >= 100)) {
    return result("warn", `Only ${testFiles} gate files were found; the suite has been larger. Check that gate files were not moved or deleted.`, evidence, unverified);
  }
  return result("ok", `The CI workflow runs \`npm run gates\` on push and cannot pass it silently; ${testFiles} gate files are present.`, evidence, unverified);
}

/** The suites CI is expected to run, each as: [label, pattern its step must run, script it needs in package.json or null]. */
export const EXPECTED_SUITES = [
  ["mutation suites", /npm run test:mutation\b/, "test:mutation"],
  ["integration suites", /npm run test:integration\b/, "test:integration"],
  ["database suites", /npm run test:db\b/, "test:db"],
];

export function analyzeSuiteWiring(workflow, pkgScripts) {
  const unverified = [
    "whether the suites PASS: the CI job reports that",
    "the nightly production browser tests and any suite that only runs on a schedule",
  ];
  if (typeof workflow !== "string" || workflow.trim() === "" || !pkgScripts || typeof pkgScripts !== "object") {
    return result("unverified", "The workflow or package.json could not be read, so the suite wiring was not checked.", {}, ["the wiring: unreadable", ...unverified]);
  }
  const steps = workflowSteps(workflow);
  const missing = [];
  const open = [];
  for (const [label, re, script] of EXPECTED_SUITES) {
    const found = steps.filter((st) => re.test(st));
    if (found.length === 0) missing.push(label);
    else if (found.some(failsOpen)) open.push(label);
    if (script && typeof pkgScripts[script] !== "string") missing.push(`${label} (no ${script} script in package.json)`);
  }
  const evidence = { expected: EXPECTED_SUITES.length, missing, failOpen: open };
  if (missing.length > 0 || open.length > 0) {
    const parts = [];
    if (missing.length > 0) parts.push(`not run by the workflow: ${missing.join(", ")}`);
    if (open.length > 0) parts.push(`cannot fail the job (continue-on-error): ${open.join(", ")}`);
    return result("fail", `Suite wiring is broken: ${parts.join("; ")}.`, evidence, unverified);
  }
  return result("ok", `The workflow runs all ${EXPECTED_SUITES.length} expected suites (${EXPECTED_SUITES.map((e) => e[0]).join(", ")}) and none can fail open.`, evidence, unverified);
}


// ---------------------------------------------------------------------------
// deployment-monitor: Vercel reports every deployment to GitHub (that is what
// the `deployment_status` trigger in verify.yml listens to), so the history is
// readable here with the workflow's own token and no Vercel credential. It
// judges what GitHub was TOLD, not whether the site answers: that is the
// uptime monitor's job, from the other side.
// ---------------------------------------------------------------------------

/** How many of the newest production deployments are judged. Chosen, not measured. */
export const DEPLOY_WINDOW = 10;
/** This many failures inside the window is a pattern, not an accident. Chosen, not measured. */
export const DEPLOY_FAILS_WARN = 3;
/** A deployment still unfinished after this long is stuck. Chosen, not measured. */
export const DEPLOY_STUCK_MINUTES = 60;

const DEPLOY_BAD = new Set(["failure", "error"]);
const DEPLOY_UNFINISHED = new Set(["pending", "queued", "in_progress"]);

/**
 * @param {{ environment: string, createdAt: string, state: string | null }[] | null} deployments
 *   newest first, each with the state of its LATEST status; null when GitHub could not be asked
 * @param {number} nowMs
 */
export function analyzeDeployments(deployments, nowMs) {
  const unverified = [
    "whether the live site answers: the uptime monitor asks it directly, this agent only reads what Vercel reported to GitHub",
    "deployments Vercel did not report to GitHub, and deployments older than the window",
  ];
  if (!Array.isArray(deployments)) {
    return result("unverified", "Could not read the deployment history from GitHub (no token, no network, or no access to deployments).", {}, ["every deployment: the read failed", ...unverified]);
  }
  const prod = deployments
    .filter((d) => typeof d.environment === "string" && d.environment.toLowerCase() === "production")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, DEPLOY_WINDOW);
  if (prod.length === 0) {
    return result("unverified", "GitHub lists no production deployment, so nothing was judged. Vercel may not report to GitHub for this repository.", { production: 0 }, unverified);
  }
  const newest = prod[0];
  const failed = prod.filter((d) => DEPLOY_BAD.has(d.state ?? "")).length;
  const evidence = { judged: prod.length, failed, newestState: newest.state, newestAt: newest.createdAt };
  if (newest.state === null) {
    return result("unverified", `The newest production deployment (${newest.createdAt}) has no status yet.`, evidence, unverified);
  }
  if (DEPLOY_BAD.has(newest.state)) {
    return result("fail", `The newest production deployment (${newest.createdAt}) ended in "${newest.state}". ${failed} of the last ${prod.length} failed.`, evidence, unverified);
  }
  const ageMin = (nowMs - Date.parse(newest.createdAt)) / 60000;
  if (DEPLOY_UNFINISHED.has(newest.state) && ageMin > DEPLOY_STUCK_MINUTES) {
    return result("warn", `The newest production deployment has been "${newest.state}" for ${Math.round(ageMin)} minutes.`, evidence, unverified);
  }
  if (failed >= DEPLOY_FAILS_WARN) {
    return result("warn", `${failed} of the last ${prod.length} production deployments failed, though the newest did not.`, evidence, unverified);
  }
  return result("ok", `Newest production deployment: "${newest.state}". ${failed} of the last ${prod.length} failed.`, evidence, unverified);
}

// ---------------------------------------------------------------------------
// gathering
// ---------------------------------------------------------------------------

const SKIP_EXT = /\.(png|jpe?g|gif|webp|avif|ico|pdf|woff2?|ttf|otf|mp4|mov|zip|gz|lockb?)$/i;

function listRouteFiles(dir = "src/app/api") {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

function tryJson(fn) {
  try { return JSON.parse(fn()); } catch { return null; }
}

/**
 * The newest deployments GitHub holds for this repository, each with the state
 * of its latest status. null when it cannot be asked: no GH_TOKEN, no
 * GITHUB_REPOSITORY (both exist on Actions, neither on a laptop), no `gh`, or
 * a refusal. The workflow grants `deployments: read` for this and nothing else.
 */
function readDeployments() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo || !process.env.GH_TOKEN) return null;
  const gh = (path) => tryJson(() => execFileSync("gh", ["api", path], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }));
  const list = gh(`repos/${repo}/deployments?per_page=30`);
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const d of list.filter((x) => String(x.environment).toLowerCase() === "production").slice(0, DEPLOY_WINDOW)) {
    const statuses = gh(`repos/${repo}/deployments/${d.id}/statuses?per_page=1`);
    if (!Array.isArray(statuses)) return null;
    out.push({ environment: d.environment, createdAt: d.created_at, state: statuses[0]?.state ?? null });
  }
  return out;
}

export function gather() {
  let tracked = null;
  try {
    tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
  } catch { /* leaves tracked null: the scanner then says unverified */ }

  const files = tracked === null ? [] : tracked
    .filter((p) => !SKIP_EXT.test(p) && existsSync(p) && statSync(p).size < 1_000_000)
    .map((p) => ({ path: p, text: readFileSync(p, "utf8") }));

  const vercel = tryJson(() => readFileSync("vercel.json", "utf8"));
  const routes = listRouteFiles();

  const migrations = existsSync("supabase/migrations")
    ? readdirSync("supabase/migrations").filter((n) => n.endsWith(".sql")).map((name) => ({ name, text: readFileSync(`supabase/migrations/${name}`, "utf8") }))
    : [];

  const pkg = tryJson(() => readFileSync("package.json", "utf8"));
  const direct = pkg ? Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }) : [];
  const pkgs = direct
    .map((name) => {
      const j = tryJson(() => readFileSync(`node_modules/${name}/package.json`, "utf8"));
      if (j === null) return null;
      const l = typeof j.license === "string" ? j.license : j.license?.type ?? (Array.isArray(j.licenses) ? j.licenses.map((x) => x.type).join(" OR ") : null);
      return { name, license: l || null };
    })
    .filter(Boolean);

  // npm audit exits non-zero when it FINDS something, so the output is read
  // from the thrown error as well; it is only "did not run" when there is no JSON.
  let audit = null;
  try {
    audit = JSON.parse(execFileSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }));
  } catch (err) {
    audit = tryJson(() => String(err?.stdout ?? ""));
  }

  const workflow = existsSync(".github/workflows/verify.yml") ? readFileSync(".github/workflows/verify.yml", "utf8") : null;
  const unitRunner = existsSync("scripts/tests/run-gates.mjs") ? readFileSync("scripts/tests/run-gates.mjs", "utf8") : null;
  const testFiles = (tracked ?? []).filter((p) => /^scripts\/tests\/[^/]+\.test\.mjs$/.test(p)).length;

  return { files, vercel, routes, migrations, pkgs, audit, workflow, pkgScripts: pkg?.scripts ?? null, unitRunner, testFiles, deployments: readDeployments() };
}

export function runAll(g = gather()) {
  const cronDir = g.routes.filter((f) => f.startsWith("src/app/api/cron/"));
  return {
    "secrets-scanner": analyzeSecrets(g.files),
    "cron-monitor": analyzeCrons(g.vercel?.crons ?? null, g.routes, cronDir),
    "migration-ledger": analyzeMigrations(g.migrations),
    "license-monitor": analyzeLicenses(g.pkgs),
    "vulnerability-scanner": analyzeAudit(g.audit),
    "gates-agent": analyzeGateWiring(g.workflow, g.pkgScripts, g.unitRunner, g.testFiles),
    "testing-wrapper": analyzeSuiteWiring(g.workflow, g.pkgScripts),
    "deployment-monitor": analyzeDeployments(g.deployments ?? null, Date.now()),
  };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const results = runAll();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const [id, r] of Object.entries(results)) console.log(`${r.status.toUpperCase().padEnd(10)} ${id.padEnd(22)} ${r.summary}`);
  }
  // On GitHub Actions, the same table goes on the job's summary page.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = Object.entries(results).map(([id, r]) => `| ${id} | ${r.status} | ${r.summary.replace(/\|/g, "\\|")} |`);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, ["### Company agents (repository)", "", "| agent | status | finding |", "|---|---|---|", ...rows, ""].join("\n"));
  }
  // Exit 0 always: these agents report, they do not decide whether a push may land.
}
