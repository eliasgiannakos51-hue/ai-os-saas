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
const { ROSTER, BLOCKERS, DEPARTMENTS, RUNNING_AGENT_IDS, CI_AGENT_IDS } = roster;
const drafting = await loadTs("src/lib/company-agents/drafting.ts");
const repoAgents = await import("../company-agents/repo-agents.mjs");

const page0 = code("src/app/dashboard/system-health/page.tsx");
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
ok("the roster's `running` entries equal RUNNING_AGENT_IDS plus CI_AGENT_IDS", JSON.stringify(rosterRunning) === JSON.stringify([...RUNNING_AGENT_IDS, ...CI_AGENT_IDS].sort()), `${rosterRunning}`);
ok("CI_AGENT_IDS equals the ids repo-agents.mjs runs, both ways", JSON.stringify([...CI_AGENT_IDS].sort()) === JSON.stringify([...repoAgents.REPO_AGENT_IDS].sort()) && Object.keys(repoAgents.runAll({ files: [], vercel: null, routes: [], migrations: [], pkgs: [], audit: null })).sort().join() === [...CI_AGENT_IDS].sort().join());
ok("no agent is in both the runner and CI", RUNNING_AGENT_IDS.every((id) => !CI_AGENT_IDS.includes(id)));
const workflow = readFileSync(".github/workflows/verify.yml", "utf8").replace(/^\s*#.*$/gm, "");
ok("the CI workflow runs repo-agents.mjs", /run:\s*node scripts\/company-agents\/repo-agents\.mjs/.test(workflow));
ok("...and the step cannot turn the job red", /name: company agents \(repository\)[\s\S]{0,120}continue-on-error: true/.test(workflow));
ok("every running agent is autonomy 1 (reads and reports)", ROSTER.filter((a) => a.status === "running").every((a) => a.autonomy === 1));
ok("each id the runner writes is on the roster", runnerIds.every((id) => ids.includes(id)));
ok("the runner's only write is the insert into company_agent_runs", (runnerSrc.match(/\.(insert|update|delete|upsert)\(/g) ?? []).length === 1 && /from\("company_agent_runs"\)\s*\.insert\(/.test(runnerSrc));

console.log("\n== 2. the reasons are still true ==");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
ok(`package.json was read (${deps.length} dependencies), so "no analytics package" is a finding and not an empty read`, deps.length >= 20 && deps.includes("next"));
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

const opsSrc = [readFileSync("docs/api-keys.md", "utf8"), ...readdirSync("src/lib", { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => readFileSync(`src/lib/${f}`, "utf8"))].join("\n");
ok(`"ops-tokens" holds only while neither a Vercel nor a Supabase management token is used`, !/VERCEL_API_TOKEN|VERCEL_TOKEN|SUPABASE_ACCESS_TOKEN/.test(opsSrc), "a token is referenced now: revisit backup-verifier, deployment-monitor and BLOCKERS['ops-tokens']");

console.log("\n== 2b. the writing agents (drafting.ts) ==");
const D = drafting.DRAFT_AGENTS;
ok(`the table was read (${D.length} writing agents)`, D.length >= 40);
ok("every writing agent id is unique", new Set(D.map((x) => x.id)).size === D.length);
ok("every writing agent is on the roster", D.every((x) => ids.includes(x.id)));
ok("the roster's `built` entries are exactly the writing agents plus final-approval, both ways", JSON.stringify(ROSTER.filter((a) => a.status === "built").map((a) => a.id).sort()) === JSON.stringify([...D.map((x) => x.id), "final-approval"].sort()), ROSTER.filter((a) => a.status === "built").map((a) => a.id).filter((i) => !D.some((x) => x.id === i) && i !== "final-approval").join(", "));
ok("no writing agent is rated above autonomy 2", D.every((x) => ROSTER.find((a) => a.id === x.id).autonomy <= 2));
ok("every writing agent has a real job and a brief hint", D.every((x) => x.job.length >= 40 && x.brief.length >= 15));
ok("the review roles are told they saw only what was pasted", ["code-review", "bug-detection", "accessibility", "performance", "auth-auditor", "authorization-auditor", "idor-checker", "privacy-checker"].every((id) => /ONLY the material pasted/.test(D.find((x) => x.id === id).job)));
ok("every agent whose job is to report on the outside world searches the web", ["market-research", "competitor-tracker", "technology-research", "trend-detector", "opportunity-finder", "fact-checker", "research-report", "reputation-monitor", "terms-monitor", "recruitment-research", "product-research"].every((id) => D.find((x) => x.id === id).web === true));
ok("no agent that only reshapes the brief searches the web", ["meeting-summary", "task-manager", "content-writer", "documentation", "job-description"].every((id) => D.find((x) => x.id === id).web === false));
const sys = (id) => drafting.systemPromptFor(D.find((x) => x.id === id));
ok("every prompt forbids inventing numbers and asks for a 'Not checked' section", D.every((x) => /Never invent a number/.test(drafting.systemPromptFor(x)) && /Not checked/.test(drafting.systemPromptFor(x))));
ok("web rules are in a web agent's prompt and only there", /web search tool/.test(sys("research-report")) && !/web search tool/.test(sys("content-writer")));
ok("a code-writing agent must say its code was not run", ["frontend-dev", "backend-dev", "database-dev", "bug-fix"].every((id) => /has not been run/.test(D.find((x) => x.id === id).job)));
ok("brief: too short is refused", drafting.checkBrief("hi").ok === false && drafting.checkBrief(undefined).ok === false);
ok("brief: too long is refused", drafting.checkBrief("x".repeat(drafting.MAX_BRIEF_CHARS + 1)).ok === false);
ok("brief: exactly the limits are accepted and trimmed", drafting.checkBrief("  " + "x".repeat(drafting.MIN_BRIEF_CHARS) + "  ").ok === true && drafting.checkBrief("x".repeat(drafting.MAX_BRIEF_CHARS)).ok === true && drafting.checkBrief("  " + "x".repeat(drafting.MIN_BRIEF_CHARS) + "  ").brief.length === drafting.MIN_BRIEF_CHARS);
ok("daily limit: the Nth draft is allowed, the N+1th is not", drafting.dailyLimitReached(drafting.DAILY_DRAFT_LIMIT - 1) === false && drafting.dailyLimitReached(drafting.DAILY_DRAFT_LIMIT) === true);
const gen = code("src/lib/company-agents/generate.ts");
const postRoute = code("src/app/api/company-agents/drafts/route.ts");
const decideRoute = code("src/app/api/company-agents/drafts/[id]/route.ts");
ok("the create route checks the owner BEFORE it generates", postRoute.indexOf("isAdminEmail(user.email)") !== -1 && postRoute.indexOf("isAdminEmail(user.email)") < postRoute.indexOf("generateDraft("));
ok("...and answers a non-owner with 404, as if the route did not exist", /return new NextResponse\(null, \{ status: 404 \}\)/.test(postRoute));
ok("the decide route checks the owner, and only a pending draft can be decided", decideRoute.indexOf("isAdminEmail(user.email)") !== -1 && /\.eq\("status", "pending"\)/.test(decideRoute));
ok("the decide route changes only status and decided_at", /\.update\(\{ status: decision, decided_at: [^}]*\}\)/.test(decideRoute));
const insertBlock = (gen.match(/\.insert\(\{[\s\S]*?\}\)/) ?? [""])[0];
ok("the generator saves nothing but a pending draft (the insert writes no status, so the table default `pending` applies)", insertBlock.length > 40 && /agent_id/.test(insertBlock) && !/status/.test(insertBlock), insertBlock);
ok("the generator refuses a web draft whose provider reported no sources", /agent\.web && outcome\.citations === undefined/.test(gen));
ok("the generator checks the day's limit before it calls the model", gen.indexOf("dailyLimitReached(") !== -1 && gen.indexOf("dailyLimitReached(") < gen.indexOf("runCompletion("));
ok("the generator saves the cut-off flag with the draft", /modelTextFrom\(/.test(gen) && /truncated: text\.truncated/.test(insertBlock));
ok("the generator has no way to send anything (no mail, no fetch)", !/\bfetch\(|resend|sendMail|nodemailer/i.test(gen));
const draftSql = readFileSync("supabase/migrations/20261107000000_company_agent_drafts.sql", "utf8");
const draftSqlCode = draftSql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
ok("DOC, not behaviour: the drafts migration header says how to undo itself", /^-- How to undo: .{20,}/m.test(draftSql));
ok("drafts table: RLS on, no policy, revoked from anon and authenticated", /enable row level security/.test(draftSqlCode) && !/create policy/i.test(draftSqlCode) && /revoke all on public\.company_agent_drafts from anon/.test(draftSqlCode) && /revoke all on public\.company_agent_drafts from authenticated/.test(draftSqlCode));
ok("drafts table: a draft starts pending and status is limited to three values", /default 'pending'/.test(draftSqlCode) && /status in \('pending', 'approved', 'rejected'\)/.test(draftSqlCode));
ok("the page renders the draft desk behind the owner check", /<DraftDesk\b/.test(page0) && page0.indexOf("isAdminEmail(user.email)") < page0.indexOf("company_agent_drafts"));

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

console.log("\n== 3c. second batch: every shape of input ==");
const NOW = Date.parse("2026-11-07T12:00:00Z");
const hr = (hoursAgo, eur) => ({ hour: new Date(NOW - hoursAgo * 3600_000).toISOString(), calls: 1, costEur: eur });
const ex = (k, okv) => ({ checkKey: k, found: okv ? 0 : 2, expected: 0, ok: okv });
ok("database: a failed read is unverified", agents.analyzeDatabase(null).status === "unverified");
ok("database: an empty report is unverified, not ok", agents.analyzeDatabase([]).status === "unverified");
ok("database: all checks passing is ok", agents.analyzeDatabase([ex("a", true), ex("b", true)]).status === "ok");
const dbBad = agents.analyzeDatabase([ex("a", true), ex("tables_without_rls", false)]);
ok("database: a failing check is a failure that names it", dbBad.status === "fail" && /tables_without_rls/.test(dbBad.summary) && dbBad.evidence.failing === 1);
ok("cost: a failed read is unverified", agents.analyzeCost(null, NOW).status === "unverified");
ok("cost: no spend at all is ok", agents.analyzeCost([], NOW).status === "ok");
ok("cost: spend with no earlier week is unverified, not ok", agents.analyzeCost([hr(2, 5)], NOW).status === "unverified");
const week = Array.from({ length: 7 }, (_, d) => hr(24 * (d + 2), 2));
ok("cost: a steady day is ok", agents.analyzeCost([...week, hr(3, 2)], NOW).status === "ok");
const spike = agents.analyzeCost([...week, hr(3, 9)], NOW);
ok("cost: 4.5x the weekly average and 7 euro above it is a warning", spike.status === "warn" && /4\.5x/.test(spike.summary), spike.summary);
ok("cost: 3x but under 1 euro above is NOT a warning (noise floor)", agents.analyzeCost([...Array.from({ length: 7 }, (_, d) => hr(24 * (d + 2), 0.1)), hr(3, 0.3)], NOW).status === "ok");
ok("cost: spend older than 8 days is ignored", agents.analyzeCost([hr(24 * 9, 500)], NOW).status === "ok");
ok("revenue: a failed read is unverified", agents.analyzeRevenue(null).status === "unverified");
ok("revenue: complete figure is ok and carries the number", (() => { const r = agents.analyzeRevenue({ eur: 120, complete: true, unpricedSubscribers: 0, unpricedTiers: [] }); return r.status === "ok" && r.evidence.mrrEur === 120 && /120/.test(r.summary); })());
ok("revenue: an unpriced tier is a warning that says the figure is a floor", (() => { const r = agents.analyzeRevenue({ eur: 120, complete: false, unpricedSubscribers: 2, unpricedTiers: ["enterprise"] }); return r.status === "warn" && /at least/.test(r.summary) && /enterprise/.test(r.summary); })());
const goodH = { "Strict-Transport-Security": "max-age=1", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "origin", "Content-Security-Policy": "default-src 'self'" };
const hp = (headers, over) => ({ reached: true, httpStatus: 200, headers, ...over });
ok("headers: no address is unverified", agents.analyzeHeaders(null).status === "unverified");
ok("headers: an unreachable page is unverified (uptime reports the outage)", agents.analyzeHeaders(hp({}, { reached: false, httpStatus: null })).status === "unverified");
ok("headers: all present (any letter case) is ok", agents.analyzeHeaders(hp(goodH)).status === "ok");
ok("headers: X-Frame-Options can stand in for CSP", agents.analyzeHeaders(hp({ ...goodH, "Content-Security-Policy": undefined, "X-Frame-Options": "DENY" })).status === "ok");
ok("headers: missing HSTS warns and names it", (() => { const h = { ...goodH }; delete h["Strict-Transport-Security"]; const r = agents.analyzeHeaders(hp(h)); return r.status === "warn" && /Strict-Transport-Security/.test(r.summary); })());
ok("headers: nosniff must be the value, not just the header", agents.analyzeHeaders(hp({ ...goodH, "X-Content-Type-Options": "other" })).status === "warn");
ok("headers: neither CSP nor X-Frame-Options warns", agents.analyzeHeaders(hp({ ...goodH, "Content-Security-Policy": undefined })).status === "warn");
const ago = (h) => new Date(NOW - h * 3600_000).toISOString();
ok("auditor: a failed read is unverified", agents.analyzeStaleness(null, ["a"], NOW).status === "unverified");
ok("auditor: every agent recent is ok", agents.analyzeStaleness([{ agentId: "a", ranAt: ago(20) }, { agentId: "b", ranAt: ago(30) }], ["a", "b"], NOW).status === "ok");
ok("auditor: an agent silent for 40h is a warning that names it", (() => { const r = agents.analyzeStaleness([{ agentId: "a", ranAt: ago(20) }, { agentId: "b", ranAt: ago(40) }], ["a", "b"], NOW); return r.status === "warn" && /\bb\b/.test(r.summary) && r.evidence.stale[0] === "b"; })());
ok("auditor: an agent with no earlier row is unverified, not stale and not ok", (() => { const r = agents.analyzeStaleness([{ agentId: "a", ranAt: ago(2) }], ["a", "new"], NOW); return r.status === "unverified" && r.evidence.neverRun[0] === "new"; })());
ok("auditor: the newest row decides, not the oldest", agents.analyzeStaleness([{ agentId: "a", ranAt: ago(100) }, { agentId: "a", ranAt: ago(1) }], ["a"], NOW).status === "ok");
const R = (id, status) => ({ agentId: id, result: { status, summary: "", evidence: {}, unverified: [] } });
ok("reporter: nothing to report is unverified", agents.summarizeRun([]).status === "unverified");
ok("reporter: all ok is ok", agents.summarizeRun([R("a", "ok"), R("b", "ok")]).status === "ok");
ok("reporter: one warn makes it warn and names the agent", (() => { const r = agents.summarizeRun([R("a", "ok"), R("b", "warn")]); return r.status === "warn" && /b: warn/.test(r.summary); })());
ok("reporter: a failure outranks a warning", agents.summarizeRun([R("a", "warn"), R("b", "fail")]).status === "fail");
ok("reporter: an unverified agent keeps the whole report from being ok", agents.summarizeRun([R("a", "ok"), R("b", "unverified")]).status === "unverified");
ok("reporter: counts add up", (() => { const r = agents.summarizeRun([R("a", "ok"), R("b", "warn"), R("c", "fail"), R("d", "unverified")]); return r.evidence.ok + r.evidence.warn + r.evidence.fail + r.evidence.unverified === 4; })());
ok("the reporter runs last in the runner", runnerIds[runnerIds.length - 1] === "daily-reporter");

console.log("\n== 3d. third batch: every shape of input ==");
const job = (minAgo) => ({ status: "running", updatedAt: new Date(NOW - minAgo * 60_000).toISOString() });
ok("queue: a failed read is unverified", agents.analyzeQueue(null, 0, NOW).status === "unverified");
ok("queue: no open jobs is ok", agents.analyzeQueue([], 0, NOW).status === "ok");
ok("queue: a job moving 5 minutes ago is ok", agents.analyzeQueue([job(5)], 0, NOW).status === "ok");
ok("queue: a job silent 45 minutes is a warning", (() => { const r = agents.analyzeQueue([job(5), job(45)], 2, NOW); return r.status === "warn" && r.evidence.stuck === 1 && /2 job\(s\) failed/.test(r.summary); })());
ok("queue: an unreadable failure count never reads as zero", agents.analyzeQueue([], null, NOW).unverified.some((u) => /failed jobs/.test(u)));
ok("budget: a failed read is unverified", agents.analyzeBudget(null, 5000).status === "unverified");
ok("budget: 10% is ok", agents.analyzeBudget(500, 5000).status === "ok");
ok("budget: 80% is a warning", agents.analyzeBudget(4000, 5000).status === "warn");
ok("budget: 79% is still ok", agents.analyzeBudget(3950, 5000).status === "ok");
ok("budget: reaching the cap is a failure", agents.analyzeBudget(5000, 5000).status === "fail");
ok("budget: a zero cap is unverified, never a divide-by-zero verdict", agents.analyzeBudget(10, 0).status === "unverified");
const u = (id, eur) => ({ userId: id, costEur: eur, calls: 1 });
ok("concentration: a failed read is unverified", agents.analyzeConcentration(null).status === "unverified");
ok("concentration: no spend is ok", agents.analyzeConcentration([]).status === "ok");
ok("concentration: one account at 90% and 9 euro warns, naming 8 chars of it", (() => { const r = agents.analyzeConcentration([u("abcdef123456", 9), u("zzzzzzzz", 1)]); return r.status === "warn" && /abcdef12/.test(r.summary) && !/abcdef123456/.test(r.summary); })());
ok("concentration: 90% but under 2 euro is ok (noise floor)", agents.analyzeConcentration([u("a", 0.9), u("b", 0.1)]).status === "ok");
ok("concentration: a single account alone is not 'concentration'", agents.analyzeConcentration([u("a", 50)]).status === "ok");
ok("concentration: an even spread is ok", agents.analyzeConcentration([u("a", 3), u("b", 3), u("c", 3)]).status === "ok");
const f = (feature, eur, calls, credits) => ({ feature, costEur: eur, calls, creditsCharged: credits });
ok("features: a failed read is unverified", agents.analyzeFeatureCosts(null).status === "unverified");
ok("features: no cost is ok", agents.analyzeFeatureCosts([]).status === "ok");
ok("features: names the top three by cost", (() => { const r = agents.analyzeFeatureCosts([f("a", 1, 30, 9), f("b", 5, 30, 9), f("c", 3, 30, 9), f("d", 2, 30, 9)]); return r.evidence.top3[0].startsWith("b ") && r.evidence.top3.length === 3; })());
ok("features: cost with no credits charged (20+ calls) warns", (() => { const r = agents.analyzeFeatureCosts([f("free-thing", 4, 25, 0), f("paid", 1, 30, 9)]); return r.status === "warn" && /free-thing/.test(r.summary); })());
ok("features: uncharged but under 20 calls does not warn", agents.analyzeFeatureCosts([f("x", 4, 5, 0)]).status === "ok");
const dc = (daysAgo, eur) => ({ day: new Date(NOW - daysAgo * 86400_000).toISOString().slice(0, 10), costEur: eur, calls: 1 });
ok("expenses: a failed read is unverified", agents.analyzeExpenses(null, NOW).status === "unverified");
ok("expenses: sums the last 7 days and the 7 before separately", (() => { const r = agents.analyzeExpenses([dc(1, 2), dc(3, 3), dc(8, 10), dc(20, 99)], NOW); return r.evidence.last7Eur === 5 && r.evidence.prev7Eur === 10; })());
ok("expenses: says it does not judge the trend", agents.analyzeExpenses([], NOW).unverified.some((x) => /does not judge/.test(x)));

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
ok("DOC, not behaviour: the migration header says how to undo itself", /^-- How to undo: .{20,}/m.test(sql));
ok("it creates the table with if not exists", /create table if not exists public\.company_agent_runs/.test(sqlCode));
ok("row level security is on", /alter table public\.company_agent_runs enable row level security/.test(sqlCode));
ok("it grants nothing to customers: revoked from anon and authenticated", /revoke all on public\.company_agent_runs from anon/.test(sqlCode) && /revoke all on public\.company_agent_runs from authenticated/.test(sqlCode));
ok("it creates no policy (service role only)", !/create policy/i.test(sqlCode));
ok("status can be unverified", /status in \('ok', 'warn', 'fail', 'unverified'\)/.test(sqlCode));
ok("it does not reuse the customer agents' table name agent_runs", !/public\.agent_runs\b/.test(sqlCode));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
