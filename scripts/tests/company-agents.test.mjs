// THE COMPANY'S OWN AGENTS: THE ROSTER TELLS THE TRUTH, AND THE TWO THAT RUN
// JUDGE CORRECTLY.
//
// Three things are held here, and each can go red:
//
//   1. THE ROSTER (src/lib/company-agents/roster.ts) is consistent: every
//      id unique, every `blocked` entry names a reason that exists, and
//      the entries marked `running` are EXACTLY the agents the runner
//      executes — both directions, so the roster cannot call an agent
//      running that nothing runs, nor leave one out that does run.
//   2. THE REASONS ARE STILL TRUE. Each blocker is a claim about the
//      repository ("no analytics package", "Gmail is read-only"). They are
//      checked against package.json, the migrations and the Gmail scopes,
//      so the day one stops being true this goes red and says which
//      entries to revisit, instead of the roster quietly going stale.
//   3. THE JUDGEMENT (agents.ts): every shape of input gets the right
//      word. Most important: a read that FAILED is "unverified", never
//      "ok", and an app that answers 503 or says ok:false is "fail".
//
// Source checks strip comments first. The question CLAUDE.md asks before
// writing a check is "if I deleted every comment in the target, would
// this still pass?", and this is the answer: it reads code only.
//
// Run: node scripts/tests/company-agents.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

/** Source with block comments and whole-line or trailing `//` comments removed. */
const code = (f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

const roster = await loadTs("src/lib/company-agents/roster.ts");
const agents = await loadTs("src/lib/company-agents/agents.ts");
const { ROSTER, BLOCKERS, DEPARTMENTS, RUNNING_AGENT_IDS } = roster;

console.log("== 1. the roster is consistent ==");
ok(`the roster was read (${ROSTER.length} agents)`, ROSTER.length >= 100);
const ids = ROSTER.map((a) => a.id);
ok("every id is unique", new Set(ids).size === ids.length, ids.filter((x, i) => ids.indexOf(x) !== i).join(", "));
ok("every department is a known one", ROSTER.every((a) => a.department in DEPARTMENTS));
ok("every status is one of the four", ROSTER.every((a) => ["running", "built", "blocked", "planned"].includes(a.status)));
ok("every autonomy is 1, 2 or 3", ROSTER.every((a) => [1, 2, 3].includes(a.autonomy)));
ok("every entry says what it does", ROSTER.every((a) => typeof a.mission === "string" && a.mission.length >= 20 && a.name.length > 0));
ok("a blocked entry names a reason that exists",
  ROSTER.filter((a) => a.status === "blocked").every((a) => a.blockedBy in BLOCKERS),
  ROSTER.filter((a) => a.status === "blocked" && !(a.blockedBy in BLOCKERS)).map((a) => a.id).join(", "));
ok("only a blocked entry names a reason", ROSTER.every((a) => (a.status === "blocked") === (a.blockedBy !== undefined)));
ok("every reason in BLOCKERS is used by somebody (no dead reasons)", Object.keys(BLOCKERS).every((k) => ROSTER.some((a) => a.blockedBy === k)));
ok("nothing is rated above autonomy 2 yet", ROSTER.every((a) => a.autonomy <= 2), "autonomy 3 is for reversible actions with no customer contact; none has earned it");
ok("anything touching customers' mail, money or contracts is rated 2 at most and never 3",
  ROSTER.filter((a) => /email|invoice|contract|billing|refund|discount|proposal|pricing/i.test(a.id)).every((a) => a.autonomy <= 2));

console.log("\n== 1b. `running` is exactly what the runner runs ==");
const runnerSrc = code("src/lib/company-agents/run.ts");
const runnerIds = [...runnerSrc.matchAll(/runOne\(\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
const rosterRunning = ROSTER.filter((a) => a.status === "running").map((a) => a.id).sort();
ok("the runner executes at least one agent", runnerIds.length >= 1);
ok("RUNNING_AGENT_IDS equals the ids the runner passes to runOne()", JSON.stringify([...RUNNING_AGENT_IDS].sort()) === JSON.stringify([...runnerIds].sort()), `${[...RUNNING_AGENT_IDS]} vs ${runnerIds}`);
ok("the roster's `running` entries equal RUNNING_AGENT_IDS", JSON.stringify(rosterRunning) === JSON.stringify([...RUNNING_AGENT_IDS].sort()), `${rosterRunning}`);
ok("every running agent is autonomy 1 (reads and reports)", ROSTER.filter((a) => a.status === "running").every((a) => a.autonomy === 1));
ok("each id the runner writes is on the roster", runnerIds.every((id) => ids.includes(id)));
ok("the runner's only write is the insert into company_agent_runs", (runnerSrc.match(/\.(insert|update|delete|upsert)\(/g) ?? []).length === 1 && /from\("company_agent_runs"\)\s*\.insert\(/.test(runnerSrc));

console.log("\n== 2. the reasons are still true ==");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const analyticsDeps = deps.filter((d) => /posthog|plausible|mixpanel|umami|amplitude/i.test(d));
const blockedByAnalytics = ROSTER.filter((a) => a.blockedBy === "analytics").length;
ok(`"analytics" blocks ${blockedByAnalytics} agent(s) only while no analytics package is installed`,
  analyticsDeps.length === 0,
  `${analyticsDeps.join(", ")} is installed now: revisit the ${blockedByAnalytics} roster entries blockedBy "analytics" and BLOCKERS.analytics`);
const migrations = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).map((f) => readFileSync(`supabase/migrations/${f}`, "utf8")).join("\n");
ok(`"crm" is stated correctly: public.leads exists`, /create table if not exists public\.leads\b/i.test(migrations));
ok(`"tickets" blocks only while no support-ticket table exists`, !/create table if not exists public\.(support_tickets|tickets)\b/i.test(migrations), "a tickets table exists now: revisit the roster entries blockedBy \"tickets\"");
const providers = readFileSync("src/lib/integrations/providers.ts", "utf8");
ok(`"gmail-send" blocks only while Gmail is read-only`, /gmail\.readonly/.test(providers) && !/gmail\.(send|modify|compose)/.test(providers), "Gmail has a write scope now: revisit the roster entries blockedBy \"gmail-send\"");

console.log("\n== 3a. the error analyst: every shape of input ==");
const row = (route, n, resolved = false) => ({ route, occurrenceCount: n, resolved });
const unread = agents.analyzeErrors(null);
ok("a failed read is unverified, never ok", unread.status === "unverified" && unread.status !== "ok");
ok("...and says nothing was checked", /nothing was checked/.test(unread.summary));
const none = agents.analyzeErrors([]);
ok("an empty table is ok", none.status === "ok" && none.evidence.open === 0);
const resolvedOnly = agents.analyzeErrors([row("/api/a", 9, true), row("/api/b", 4, true)]);
ok("only resolved rows is ok: resolved errors are not open", resolvedOnly.status === "ok");
const some = agents.analyzeErrors([row("/api/a", 3), row("/api/b", 11), row("/api/c", 2, true)]);
ok("open errors are a warning", some.status === "warn");
ok("...counted: 2 open, 14 occurrences", some.evidence.open === 2 && some.evidence.occurrences === 14, JSON.stringify(some.evidence));
ok("...naming the most frequent route", some.evidence.worstRoute === "/api/b" && /\/api\/b/.test(some.summary));
const capped = agents.analyzeErrors(Array.from({ length: 5 }, () => row("/x", 1, true)), 5);
ok("a read that hit its cap says older rows were not seen", capped.unverified.some((u) => /older rows/.test(u)));
ok("an uncapped read does not claim that", !none.unverified.some((u) => /older rows/.test(u)));
ok("every result says what it did not cover", [unread, none, some, capped].every((r) => Array.isArray(r.unverified) && r.unverified.length >= 1));

console.log("\n== 3b. the uptime monitor: every shape of input ==");
const probe = (over) => ({ reached: true, httpStatus: 200, ok: true, ms: 120, ...over });
ok("no address configured is unverified, not ok", agents.analyzeHealth(null).status === "unverified");
ok("an app that did not answer is a failure", agents.analyzeHealth(probe({ reached: false, httpStatus: null, ok: null })).status === "fail");
ok("HTTP 503 is a failure", agents.analyzeHealth(probe({ httpStatus: 503, ok: false })).status === "fail");
ok("a non-200 is a failure even when the body claims ok:true (the status is its own check)", agents.analyzeHealth(probe({ httpStatus: 500, ok: true })).status === "fail");
ok("...and the summary names the HTTP status it saw", /HTTP 500/.test(agents.analyzeHealth(probe({ httpStatus: 500, ok: true })).summary));
ok("HTTP 200 with ok:false is a failure", agents.analyzeHealth(probe({ ok: false })).status === "fail");
ok("HTTP 200 with no readable ok is a failure, not a pass", agents.analyzeHealth(probe({ ok: null })).status === "fail");
ok("HTTP 200 with ok:true is ok", agents.analyzeHealth(probe({})).status === "ok");
ok("an ok result still says it was one call and not a visit", agents.analyzeHealth(probe({})).unverified.some((u) => /not a visit|one call/.test(u)));

console.log("\n== 4. the wiring is real ==");
const cron = code("src/app/api/cron/company-agents/route.ts");
ok("the cron route calls checkCronAuth()", /\bcheckCronAuth\s*\(/.test(cron));
ok("...and refuses before it runs anything", cron.indexOf("checkCronAuth(") < cron.indexOf("runCompanyAgents("));
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
ok("the cron is scheduled in vercel.json", vercel.crons.some((c) => c.path === "/api/cron/company-agents" && typeof c.schedule === "string"));
const page = code("src/app/dashboard/system-health/page.tsx");
ok("system-health renders the section", /<CompanyAgents\b/.test(page));
ok("...behind the owner check that already 404s everyone else", page.indexOf("isAdminEmail(user.email)") !== -1 && page.indexOf("isAdminEmail(user.email)") < page.indexOf("company_agent_runs"));
ok("...and reads the table the runner writes", /from\("company_agent_runs"\)/.test(page));

console.log("\n== 5. the migration ==");
const sql = readFileSync("supabase/migrations/20261106000000_company_agent_runs.sql", "utf8");
const sqlCode = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
ok("it says how to undo itself", /^-- How to undo: .{20,}/m.test(sql));
ok("it creates the table with if not exists", /create table if not exists public\.company_agent_runs/.test(sqlCode));
ok("row level security is on", /alter table public\.company_agent_runs enable row level security/.test(sqlCode));
ok("it grants nothing to customers: revoked from anon and authenticated", /revoke all on public\.company_agent_runs from anon/.test(sqlCode) && /revoke all on public\.company_agent_runs from authenticated/.test(sqlCode));
ok("it creates no policy (service role only)", !/create policy/i.test(sqlCode));
ok("status can be unverified", /status in \('ok', 'warn', 'fail', 'unverified'\)/.test(sqlCode));
ok("it does not reuse the customer agents' table name agent_runs", !/public\.agent_runs\b/.test(sqlCode));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
