// THE COMPANY'S REPOSITORY AGENTS JUDGE CORRECTLY AND ARE NOT BLIND.
//
// scripts/company-agents/repo-agents.mjs holds five agents that read the
// checkout. Held here:
//
//   1. THE JUDGEMENT, for every shape of input. Above all: an empty or
//      unreadable input is "unverified", never "ok" — a scanner that read
//      nothing found nothing.
//   2. THE SECRET SCANNER DOES NOT ECHO what it finds (a report that prints
//      the secret becomes the leak) and an excused fixture that no longer
//      contains a credential is reported, so allowances cannot go stale.
//   3. THE GATHERING IS NOT EMPTY on this repository. A judge fed an empty
//      list says "unverified" (1 above), so the gather has its own floor:
//      the real run must have read the files, routes, migrations and
//      packages it claims to.
//
// Credential-shaped test inputs are assembled at run time ("sk-ant-" + ...)
// so this file does not itself contain one for the scanner to find.
//
// Run: node scripts/tests/repo-agents.test.mjs
import * as A from "../company-agents/repo-agents.mjs";
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

console.log("== 1a. secrets-scanner ==");
const fakeAnthropic = "sk-ant-" + "A1b2C3d4E5f6G7h8I9j0K1l2";
const fakeAws = "AKIA" + "ABCDEFGHIJKLMNOP";
const fakePem = "-----BEGIN " + "RSA PRIVATE KEY-----";
const f = (path, text) => ({ path, text });
ok("no files read is unverified, not ok", A.analyzeSecrets([]).status === "unverified" && A.analyzeSecrets(null).status === "unverified");
ok("clean files are ok", A.analyzeSecrets([f("a.ts", "const x = 1;\nconst y = 'hello';")], {}).status === "ok");
const hit = A.analyzeSecrets([f("src/lib/flags/flags.ts", `line1\nconst k = "${fakeAnthropic}";`)], {});
ok("an Anthropic-shaped key is a failure naming file and line", hit.status === "fail" && hit.evidence.hits[0].path === "src/lib/flags/flags.ts" && hit.evidence.hits[0].line === 2 && hit.evidence.hits[0].pattern === "anthropic_key");
ok("...and neither the summary nor the evidence contains the key", !JSON.stringify(hit).includes(fakeAnthropic));
ok("an AWS-shaped key is found", A.analyzeSecrets([f("b.ts", fakeAws)], {}).status === "fail");
ok("a private key block is found", A.analyzeSecrets([f("c.pem", fakePem)], {}).status === "fail");
ok("a word that merely starts like a prefix is not a hit", A.analyzeSecrets([f("d.md", "the sk-ant prefix and AKIA are documented")], {}).status === "ok");
ok("an excused fixture is not a failure", A.analyzeSecrets([f("t.mjs", fakeAnthropic)], { "t.mjs": "fixture" }).status === "ok");
ok("an excused fixture that no longer holds a credential is a warning that names it", (() => { const r = A.analyzeSecrets([f("t.mjs", "clean")], { "t.mjs": "fixture" }); return r.status === "warn" && /t\.mjs/.test(r.summary); })());
ok("a credential in a DIFFERENT file than the fixture still fails", A.analyzeSecrets([f("t.mjs", fakeAnthropic), f("real.ts", fakeAnthropic)], { "t.mjs": "fixture" }).status === "fail");

console.log("\n== 1b. cron-monitor ==");
const routes = ["src/app/api/cron/cost-alerts/route.ts", "src/app/api/cron/company-agents/route.ts", "src/app/api/weekly-digest/route.ts"];
const cronDir = routes.filter((r) => r.includes("/cron/"));
const good = [{ path: "/api/cron/cost-alerts", schedule: "0 1 * * *" }, { path: "/api/cron/company-agents", schedule: "5 2 * * 1" }, { path: "/api/weekly-digest", schedule: "0 8 * * 1" }];
ok("unreadable vercel.json is unverified", A.analyzeCrons(null, routes, cronDir).status === "unverified");
ok("an empty route list is unverified, not a pass", A.analyzeCrons(good, [], []).status === "unverified");
ok("all matching is ok", A.analyzeCrons(good, routes, cronDir).status === "ok");
ok("a cron with no route file fails and names it", (() => { const r = A.analyzeCrons([...good, { path: "/api/cron/ghost", schedule: "0 1 * * *" }], routes, cronDir); return r.status === "fail" && /ghost/.test(r.summary); })());
ok("a four-field schedule fails", A.analyzeCrons([{ path: "/api/cron/cost-alerts", schedule: "0 1 * *" }, good[1]], routes, cronDir).status === "fail");
ok("a route under /api/cron that is not scheduled warns", (() => { const r = A.analyzeCrons([good[0]], routes, cronDir); return r.status === "warn" && /\/api\/cron\/company-agents/.test(r.summary); })());
ok("the same path scheduled twice fails", A.analyzeCrons([good[0], good[0], good[1]], routes, cronDir).status === "fail");

console.log("\n== 1c. migration-ledger ==");
const m = (name, text) => ({ name, text });
ok("no files is unverified", A.analyzeMigrations([]).status === "unverified");
ok("old migrations need no undo note", A.analyzeMigrations([m("20260803000000_baseline.sql", "create table x();")]).status === "ok");
ok("a new migration with the note is ok", A.analyzeMigrations([m("20261106000000_x.sql", "-- How to undo: drop it.\ncreate table x();")]).status === "ok");
ok("a 'No undo:' note counts", A.analyzeMigrations([m("20261106000000_x.sql", "-- No undo: data is lost.\n")]).status === "ok");
ok("a new migration without a note fails and names it", (() => { const r = A.analyzeMigrations([m("20261106000000_x.sql", "create table x();")]); return r.status === "fail" && /20261106000000_x\.sql/.test(r.summary); })());
ok("the note must be a real comment line, not any mention", A.analyzeMigrations([m("20261106000000_x.sql", "select 'How to undo: nothing';")]).status === "fail");
ok("a name with no date warns", A.analyzeMigrations([m("fix.sql", "")]).status === "warn");
ok("two files with the same date prefix are fine", A.analyzeMigrations([m("20260808_a.sql", ""), m("20260808_b.sql", "")]).status === "ok");

console.log("\n== 1d. license-monitor ==");
ok("no packages is unverified", A.analyzeLicenses([]).status === "unverified");
ok("MIT and Apache are ok", A.analyzeLicenses([{ name: "a", license: "MIT" }, { name: "b", license: "Apache-2.0" }]).status === "ok");
ok("GPL is a failure naming the package", (() => { const r = A.analyzeLicenses([{ name: "evil", license: "GPL-3.0-only" }]); return r.status === "fail" && /evil/.test(r.summary); })());
ok("AGPL and SSPL fail too", A.analyzeLicenses([{ name: "a", license: "AGPL-3.0" }]).status === "fail" && A.analyzeLicenses([{ name: "a", license: "SSPL-1.0" }]).status === "fail");
ok("LGPL is a warning, not a failure", A.analyzeLicenses([{ name: "a", license: "LGPL-2.1" }]).status === "warn");
ok("an unreadable licence warns", A.analyzeLicenses([{ name: "a", license: null }]).status === "warn");
ok("a licence expression with GPL in an OR is still a failure (cannot assume the permissive side)", A.analyzeLicenses([{ name: "a", license: "(MIT OR GPL-3.0)" }]).status === "fail");

console.log("\n== 1e. vulnerability-scanner ==");
const au = (o) => ({ metadata: { vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, total: 0, ...o } } });
ok("no audit result is unverified", A.analyzeAudit(null).status === "unverified" && A.analyzeAudit({}).status === "unverified");
ok("none is ok", A.analyzeAudit(au({})).status === "ok");
ok("moderate only is still ok", A.analyzeAudit(au({ moderate: 9 })).status === "ok");
ok("high is a warning", A.analyzeAudit(au({ high: 1 })).status === "warn");
ok("critical is a failure and the summary carries the counts", (() => { const r = A.analyzeAudit(au({ critical: 1, high: 5 })); return r.status === "fail" && /1 critical, 5 high/.test(r.summary); })());

console.log("\n== 1f. gates-agent and testing-wrapper ==");
const goodWf = `on:
  push:
    branches: ["**"]
jobs:
  verify:
    steps:
      - name: gates
        run: npm run gates
      - name: mutation suites
        run: npm run test:mutation
      - name: database suites
        run: |
          npm run test:db
      - name: integration suites
        run: npm run test:integration
`;
const pkgS = { gates: "node x && npm run test:unit", "test:unit": "node scripts/tests/run-gates.mjs", "test:mutation": "x", "test:integration": "x", "test:db": "x" };
const runner = "const files = glob('*.test.mjs')";
ok("gates: an unreadable workflow is unverified", A.analyzeGateWiring(null, pkgS, runner, 200).status === "unverified" && A.analyzeGateWiring("", pkgS, runner, 200).status === "unverified");
ok("gates: a sound workflow is ok", A.analyzeGateWiring(goodWf, pkgS, runner, 200).status === "ok");
ok("gates: no step running the gates fails", A.analyzeGateWiring(goodWf.replace("npm run gates", "echo hi"), pkgS, runner, 200).status === "fail");
ok("gates: continue-on-error on the gates step fails", A.analyzeGateWiring(goodWf.replace("run: npm run gates", "continue-on-error: true\n        run: npm run gates"), pkgS, runner, 200).status === "fail");
ok("gates: continue-on-error on ANOTHER step does not fail the gates agent", A.analyzeGateWiring(goodWf.replace("run: npm run test:mutation", "continue-on-error: true\n        run: npm run test:mutation"), pkgS, runner, 200).status === "ok");
ok("gates: a commented-out gates step does not count", A.analyzeGateWiring(goodWf.replace("        run: npm run gates", "        # run: npm run gates"), pkgS, runner, 200).status === "fail");
ok("gates: a workflow not triggered on push fails", A.analyzeGateWiring(goodWf.replace("push:", "workflow_dispatch:"), pkgS, runner, 200).status === "fail");
ok("gates: a gates script that no longer runs test:unit fails", A.analyzeGateWiring(goodWf, { ...pkgS, gates: "node x" }, runner, 200).status === "fail");
ok("gates: a unit runner that never mentions the gate files warns", A.analyzeGateWiring(goodWf, pkgS, "nothing", 200).status === "warn");
ok("gates: a shrunken suite warns", A.analyzeGateWiring(goodWf, pkgS, runner, 40).status === "warn");
ok("suites: an unreadable workflow is unverified", A.analyzeSuiteWiring(null, pkgS).status === "unverified");
ok("suites: all three present is ok", A.analyzeSuiteWiring(goodWf, pkgS).status === "ok");
ok("suites: a dropped suite fails and names it", (() => { const r = A.analyzeSuiteWiring(goodWf.replace("npm run test:integration", "echo"), pkgS); return r.status === "fail" && /integration suites/.test(r.summary); })());
ok("suites: continue-on-error on a suite fails and names it", (() => { const r = A.analyzeSuiteWiring(goodWf.replace("run: npm run test:mutation", "continue-on-error: true\n        run: npm run test:mutation"), pkgS); return r.status === "fail" && /mutation suites/.test(r.summary); })());
ok("suites: a missing package.json script fails", A.analyzeSuiteWiring(goodWf, { ...pkgS, "test:db": undefined }).status === "fail");

console.log("\n== 1g. deployment-monitor ==");
const NOW = Date.parse("2026-11-08T12:00:00Z");
const dep = (minAgo, state, environment = "Production") => ({ environment, createdAt: new Date(NOW - minAgo * 60000).toISOString(), state });
ok("no answer from GitHub is unverified, never ok", A.analyzeDeployments(null, NOW).status === "unverified" && A.analyzeDeployments(undefined, NOW).status === "unverified");
ok("an empty list is unverified (Vercel may not report to GitHub), never ok", A.analyzeDeployments([], NOW).status === "unverified");
ok("preview deployments alone are not production", A.analyzeDeployments([dep(10, "success", "Preview")], NOW).status === "unverified");
ok("the environment name is matched case-insensitively", A.analyzeDeployments([dep(10, "success", "production")], NOW).status === "ok");
ok("a healthy history is ok and counts what it judged", (() => { const r = A.analyzeDeployments([dep(10, "success"), dep(100, "inactive"), dep(200, "inactive")], NOW); return r.status === "ok" && r.evidence.judged === 3 && r.evidence.failed === 0; })());
ok("a failed newest deployment is a failure", A.analyzeDeployments([dep(10, "failure"), dep(100, "success")], NOW).status === "fail");
ok("an errored newest deployment is a failure too", A.analyzeDeployments([dep(10, "error"), dep(100, "success")], NOW).status === "fail");
ok("the newest is picked by date, not by list order", A.analyzeDeployments([dep(500, "success"), dep(10, "failure")], NOW).status === "fail");
ok("an old failure under a newer success is not a failure", A.analyzeDeployments([dep(10, "success"), dep(100, "failure")], NOW).status === "ok");
ok("the newest with no status yet is unverified", A.analyzeDeployments([dep(10, null), dep(100, "success")], NOW).status === "unverified");
ok("three failures in the window warn even when the newest succeeded", A.analyzeDeployments([dep(10, "success"), dep(20, "failure"), dep(30, "error"), dep(40, "failure")], NOW).status === "warn");
ok("two failures in the window do not warn", A.analyzeDeployments([dep(10, "success"), dep(20, "failure"), dep(30, "failure")], NOW).status === "ok");
ok("only the newest ten are judged: a failure outside the window is ignored", (() => { const list = [...Array.from({ length: 10 }, (_, i) => dep(i + 1, "success")), dep(500, "failure"), dep(600, "failure"), dep(700, "failure")]; const r = A.analyzeDeployments(list, NOW); return r.status === "ok" && r.evidence.judged === 10 && r.evidence.failed === 0; })());
ok("an unfinished deployment is fine inside the hour and stuck after it", A.analyzeDeployments([dep(A.DEPLOY_STUCK_MINUTES - 1, "in_progress")], NOW).status === "ok" && A.analyzeDeployments([dep(A.DEPLOY_STUCK_MINUTES + 1, "in_progress")], NOW).status === "warn" && A.analyzeDeployments([dep(A.DEPLOY_STUCK_MINUTES + 1, "queued")], NOW).status === "warn");
ok("exactly the stuck limit is not yet stuck", A.analyzeDeployments([dep(A.DEPLOY_STUCK_MINUTES, "pending")], NOW).status === "ok");
ok("it says it does not test the live site", A.analyzeDeployments([dep(10, "success")], NOW).unverified.some((u) => /live site/.test(u)));
const wf = readFileSync(".github/workflows/verify.yml", "utf8");
const top = wf.slice(0, wf.indexOf("\njobs:"));
ok("the workflow grants deployments: read at the top, and read only", /^permissions:[\s\S]*?^  deployments: read$/m.test(top) && !/deployments: write/.test(wf));
ok("the agents step receives the token, and only that step", (() => { const step = wf.slice(wf.indexOf("- name: company agents (repository)")); const end = step.indexOf("\n      - name:", 10); const body = step.slice(0, end === -1 ? undefined : end); return /GH_TOKEN: \$\{\{ github\.token \}\}/.test(body) && (wf.match(/GH_TOKEN: \$\{\{ github\.token \}\}/g) ?? []).length === 1; })());
ok("the reader needs BOTH GH_TOKEN and GITHUB_REPOSITORY, so a laptop run is unverified, not a crash", (() => { const saved = { t: process.env.GH_TOKEN, r: process.env.GITHUB_REPOSITORY }; delete process.env.GH_TOKEN; process.env.GITHUB_REPOSITORY = "a/b"; const st = A.runAll({ files: [], vercel: null, routes: [], migrations: [], pkgs: [], audit: null })["deployment-monitor"].status; if (saved.t !== undefined) process.env.GH_TOKEN = saved.t; if (saved.r === undefined) delete process.env.GITHUB_REPOSITORY; else process.env.GITHUB_REPOSITORY = saved.r; return st === "unverified"; })());

console.log("\n== 2. the real repository is read, not an empty list ==");
const g = A.gather();
ok(`files read (${g.files.length})`, g.files.length > 1000);
ok(`routes found (${g.routes.length})`, g.routes.length > 50);
ok(`migrations read (${g.migrations.length})`, g.migrations.length > 50);
ok(`direct dependencies read with a licence (${g.pkgs.filter((p) => p.license).length})`, g.pkgs.filter((p) => p.license).length > 20);
ok("vercel.json crons read", Array.isArray(g.vercel?.crons) && g.vercel.crons.length >= 10);
const real = A.runAll(g);
ok(`all ${A.REPO_AGENT_IDS.length} agents answered`, Object.keys(real).sort().join() === [...A.REPO_AGENT_IDS].sort().join());
ok("the real secrets scan is not a failure (a real credential would be one)", real["secrets-scanner"].status === "ok", real["secrets-scanner"].summary);
ok("every real result says what it did not cover", Object.values(real).every((r) => r.unverified.length >= 1));
ok("the real CI workflow passes the gate-wiring and suite-wiring checks", real["gates-agent"].status === "ok" && real["testing-wrapper"].status === "ok", `${real["gates-agent"].summary} | ${real["testing-wrapper"].summary}`);
ok("the vulnerability scanner either ran or says it did not (never a silent ok)", real["vulnerability-scanner"].status !== "ok" || g.audit?.metadata?.vulnerabilities !== undefined);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
