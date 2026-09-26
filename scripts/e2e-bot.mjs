#!/usr/bin/env node
/**
 * THE BOT THAT SIGNS IN AND TRIES THINGS, AND WRITES DOWN WHAT HAPPENED.
 *
 * Run: node scripts/e2e-bot.mjs [checks/basic.md ...] [--allow-cost] [--base URL]
 *
 * Every other instrument in this repository reads the code. This one uses
 * the product: a real browser, a real session, a real server. It exists
 * because ten rounds of "the gates are green" sat beside a production that
 * had not moved in six days, and no gate could tell the difference.
 *
 * WHAT IT ANSWERS AND WHAT IT DOES NOT.
 *
 *   It answers:      does this load, does it reply, does it save, does it
 *                    stay standing.
 *   It cannot answer: is it any good, would anyone want it, is the wording
 *                    right. Those need a person, and a bot that scores them
 *                    would be inventing a number.
 *
 * THREE OUTCOMES, NOT TWO — the rule this whole repository is built on.
 * A check is WORKS, BROKEN, or NOT RUN, and the third is not a quiet
 * version of the first. If the login fails, every check below it is NOT
 * RUN and says so; reporting them as broken would blame the product for
 * the harness, and reporting them as fine would be a lie with a green tick
 * on it.
 *
 * THE CREDENTIALS ARE NEVER IN THE TREE. BOT_EMAIL and BOT_PASSWORD come
 * from the environment, the password is redacted from every line this
 * writes, and the account must be a bot's own — never the owner's, because
 * this thing deletes what it creates.
 *
 * WHAT IT SPENDS. A check marked `COSTS CREDITS` calls a paid model. Those
 * run only with --allow-cost, at most BOT_COST_LIMIT of them per run
 * (default 1), and never in a loop. A test harness that can empty an
 * account overnight is a bug, not a feature.
 *
 * WHAT IT LEAVES BEHIND. Everything it creates is named with the run
 * marker (see RUN_MARKER), and a check that creates something must say how
 * to remove it. A failed cleanup is reported in broken.md — never swallowed,
 * because the alternative is a database that fills with test rows nobody
 * can tell from real ones.
 *
 * HOW TO WRITE A CHECK: checks/README.md, and checks/basic.md is the
 * worked example.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------
// arguments and environment
// ---------------------------------------------------------------------
const argv = process.argv.slice(2);
const ALLOW_COST = argv.includes("--allow-cost");
const BASE =
  (argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : null) ??
  process.env.BOT_BASE_URL ??
  "https://ai-os-saas-five.vercel.app";
const HEADFUL = argv.includes("--headful");
const files = argv.filter((a) => a.endsWith(".md"));
const COST_LIMIT = Number(process.env.BOT_COST_LIMIT ?? 1);

const EMAIL = process.env.BOT_EMAIL ?? "";
const PASSWORD = process.env.BOT_PASSWORD ?? "";

// The marker every created thing carries, so cleanup can find its own work
// and only its own. The clock is in it because two runs must not collide.
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const RUN_MARKER = `e2ebot-${RUN_ID}`;

const OUT_DIR = "bot-report";
const SHOT_DIR = join(OUT_DIR, "shots");

// NEVER LET THE PASSWORD REACH A FILE. Everything written out goes through
// this, including error messages, which is where a credential most often
// escapes: a failed fill() prints the value it tried.
const redact = (s) => {
  let out = String(s ?? "");
  if (PASSWORD) out = out.split(PASSWORD).join("«BOT_PASSWORD»");
  if (EMAIL) out = out.split(EMAIL).join("«BOT_EMAIL»");
  return out;
};

// ---------------------------------------------------------------------
// the check language
// ---------------------------------------------------------------------
/**
 * A LINE-ORIENTED LANGUAGE ON PURPOSE, and small on purpose.
 *
 * The temptation is a language that can express anything, which ends as a
 * second programming language nobody can read. This one has eleven verbs.
 * Anything it cannot say is a sign that the check wants to be a prodtest
 * instead — those live in scripts/tests/*.prodtest.mjs and have all of
 * JavaScript.
 *
 * WHERE A COMMAND LIVES, and why the rule has to be sharp. A check file is
 * a document a person reads, so it has prose in it — and the first version
 * of this parser called every sentence in checks/basic.md a syntax error.
 * Loosening it to "skip anything that does not start with a verb" would
 * have been worse: a mistyped OPEM would then be silently dropped and the
 * check would report on a page it never visited.
 *
 * So: a command is a line inside a CODE BLOCK — indented four spaces, or
 * fenced. Everything outside one is prose and is ignored. Inside one, a
 * line that is not a verb is a PARSE ERROR that stops the whole run before
 * the browser starts. The distinction is positional, so neither prose nor
 * a typo can be mistaken for the other.
 */
const VERBS = [
  "CHECK", "ALIAS", "OPEN", "TYPE", "CLICK", "WAIT",
  "EXPECT", "SHOT", "COSTS", "CLEANUP", "NOTE",
];

function parseChecks(text, file) {
  const checks = [];
  const aliases = new Map();
  let current = null;
  const lines = text.split("\n");
  const errors = [];

  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (/^```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    // THE POSITIONAL RULE. Four spaces of indent, or inside a fence.
    // Prose sits at the margin and is never read as a command; a command
    // sits in a block and is always read as one.
    const inBlock = fenced || /^ {4,}\S/.test(raw) || /^\t/.test(raw);
    if (!inBlock) continue;
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;

    const verb = line.split(/\s+/)[0];
    if (!VERBS.includes(verb)) {
      errors.push(`${file}:${i + 1}  not a command: ${line.slice(0, 80)}`);
      continue;
    }
    const rest = line.slice(verb.length).trim();

    if (verb === "ALIAS") {
      const m = rest.match(/^(\S+)\s+(.+)$/);
      if (!m) errors.push(`${file}:${i + 1}  ALIAS needs a name and a selector`);
      else aliases.set(m[1], m[2]);
      continue;
    }
    if (verb === "CHECK") {
      current = { name: rest, file, line: i + 1, steps: [], costs: false, cleanup: [] };
      checks.push(current);
      continue;
    }
    if (!current) {
      errors.push(`${file}:${i + 1}  ${verb} before any CHECK`);
      continue;
    }
    if (verb === "COSTS") {
      current.costs = true;
      continue;
    }
    if (verb === "CLEANUP") {
      current.cleanup.push({ rest, line: i + 1 });
      continue;
    }
    if (verb === "NOTE") {
      current.note = rest;
      continue;
    }
    current.steps.push({ verb, rest, line: i + 1 });
  }
  return { checks, aliases, errors };
}

// ---------------------------------------------------------------------
// resolving a target
// ---------------------------------------------------------------------
/**
 * `IN chat` has to become a Playwright locator without this file holding a
 * copy of the application's DOM. A check file declares its own aliases, so
 * when a class name changes the CHECK changes — not this runner.
 */
function locate(page, target, aliases) {
  const resolved = aliases.get(target) ?? target;
  if (resolved.startsWith("css=")) return page.locator(resolved.slice(4));
  if (resolved.startsWith("text=")) return page.locator(`text=${resolved.slice(5)}`);
  if (resolved.startsWith("testid=")) return page.getByTestId(resolved.slice(7));
  if (resolved.startsWith("role=")) {
    const [role, name] = resolved.slice(5).split(":");
    return name ? page.getByRole(role, { name }) : page.getByRole(role);
  }
  if (resolved.startsWith("label=")) return page.getByLabel(resolved.slice(6));
  if (resolved.startsWith("placeholder=")) return page.getByPlaceholder(resolved.slice(12));
  return page.locator(resolved);
}

const quoted = (s) => {
  const m = s.match(/^"([^"]*)"/);
  return m ? m[1] : null;
};
const secondsIn = (s) => {
  const m = s.match(/WITHIN\s+(\d+)\s*s/i);
  return m ? Number(m[1]) * 1000 : 10000;
};

// ---------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------
const results = [];
let costSpent = 0;

function record(check, status, detail) {
  results.push({ ...detail, name: check.name, file: check.file, status, costs: check.costs });
}

async function shot(page, label) {
  mkdirSync(SHOT_DIR, { recursive: true });
  const safe = label.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60);
  const path = join(SHOT_DIR, `${safe}.png`);
  try {
    await page.screenshot({ path, fullPage: false });
    return path;
  } catch {
    return null;
  }
}

async function runStep(page, step, aliases, ctx) {
  const { verb, rest } = step;

  if (verb === "OPEN") {
    const path = rest.split(/\s+/)[0];
    const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
    ctx.lastStatus = res ? res.status() : null;
    return `opened ${path} (HTTP ${ctx.lastStatus})`;
  }

  if (verb === "TYPE") {
    const text = quoted(rest);
    if (text === null) throw new Error('TYPE needs "quoted text"');
    const m = rest.match(/\bIN\s+(\S+)/);
    if (!m) throw new Error("TYPE needs IN <target>");
    // The run marker goes into anything the bot names, so cleanup can find
    // its own rows and nothing else.
    const withMarker = text.replace(/\{MARKER\}/g, RUN_MARKER);
    await locate(page, m[1], aliases).first().fill(withMarker, { timeout: 20000 });
    return `typed into ${m[1]}`;
  }

  if (verb === "CLICK") {
    const target = rest.split(/\s+/)[0];
    await locate(page, target, aliases).first().click({ timeout: 20000 });
    return `clicked ${target}`;
  }

  if (verb === "WAIT") {
    const n = Number(rest.match(/(\d+)/)?.[1] ?? 1);
    await page.waitForTimeout(n * 1000);
    return `waited ${n}s`;
  }

  if (verb === "SHOT") {
    const p = await shot(page, `${ctx.slug}-${rest || "shot"}`);
    if (p) ctx.shots.push(p);
    return `screenshot ${p ?? "failed"}`;
  }

  if (verb === "EXPECT") {
    const deadline = secondsIn(rest);

    if (/^URL\b/i.test(rest)) {
      const want = rest.replace(/^URL\s+/i, "").replace(/\s+WITHIN.*$/i, "").trim();
      await page.waitForURL((u) => new URL(u).pathname === want, { timeout: deadline });
      return `url is ${want}`;
    }

    if (/^STATUS\b/i.test(rest)) {
      const want = Number(rest.match(/(\d+)/)?.[1]);
      if (ctx.lastStatus !== want) throw new Error(`HTTP ${ctx.lastStatus}, expected ${want}`);
      return `HTTP ${want}`;
    }

    if (/^NO\s+TEXT\b/i.test(rest)) {
      const needle = quoted(rest.replace(/^NO\s+TEXT\s+/i, ""));
      if (needle === null) throw new Error('EXPECT NO TEXT needs "quoted text"');
      const n = await page.locator(`text=${needle}`).count();
      if (n > 0) throw new Error(`found "${needle}" ${n} time(s) and should not have`);
      return `no "${needle}"`;
    }

    if (/^TEXT\b/i.test(rest)) {
      const needle = quoted(rest.replace(/^TEXT\s+/i, ""));
      if (needle === null) throw new Error('EXPECT TEXT needs "quoted text"');
      await page.locator(`text=${needle}`).first().waitFor({ state: "visible", timeout: deadline });
      return `saw "${needle}"`;
    }

    if (/^VISIBLE\b/i.test(rest)) {
      const target = rest.replace(/^VISIBLE\s+/i, "").replace(/\s+WITHIN.*$/i, "").trim();
      await locate(page, target, aliases).first().waitFor({ state: "visible", timeout: deadline });
      return `${target} is visible`;
    }

    // EXPECT GROWING TEXT IN <target> WITHIN <n>s
    //
    // "readable while it streams" as something a machine can decide: the
    // text has to GET LONGER between samples and be non-empty at each one.
    // A reply that appears all at once at the end fails this, and so does
    // one that blanks the box while it thinks — which is the actual
    // complaint behind the words.
    if (/^GROWING\s+TEXT\b/i.test(rest)) {
      const m = rest.match(/\bIN\s+(\S+)/);
      if (!m) throw new Error("EXPECT GROWING TEXT needs IN <target>");
      const loc = locate(page, m[1], aliases).first();
      const started = Date.now();
      let last = -1;
      let grew = 0;
      let blanked = false;
      while (Date.now() - started < deadline) {
        let len = 0;
        try {
          len = ((await loc.innerText()) ?? "").trim().length;
        } catch {
          len = 0;
        }
        if (last >= 0) {
          if (len > last) grew++;
          if (last > 0 && len === 0) blanked = true;
        }
        last = len;
        if (grew >= 2 && len > 20) break;
        await page.waitForTimeout(400);
      }
      if (blanked) throw new Error("the text went empty part-way through");
      if (grew < 2) throw new Error(`text grew ${grew} time(s) in ${deadline / 1000}s — not visibly streaming`);
      return `text grew ${grew} times, ended at ${last} chars`;
    }

    if (/^NO\s+CONSOLE\s+ERROR/i.test(rest)) {
      if (ctx.consoleErrors.length) {
        throw new Error(`${ctx.consoleErrors.length} console error(s): ${redact(ctx.consoleErrors[0]).slice(0, 200)}`);
      }
      return "no console errors";
    }

    throw new Error(`EXPECT does not understand: ${rest.slice(0, 60)}`);
  }

  throw new Error(`unknown verb ${verb}`);
}

// ---------------------------------------------------------------------
// main
// ---------------------------------------------------------------------
const checkFiles = files.length
  ? files
  : existsSync("checks")
    ? readdirSync("checks").filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => join("checks", f))
    : [];

if (checkFiles.length === 0) {
  console.log("No check files. Write one in checks/ — see checks/README.md.");
  process.exit(2);
}

let allChecks = [];
const aliases = new Map();
const parseErrors = [];
for (const f of checkFiles) {
  const p = parseChecks(readFileSync(f, "utf8"), f);
  allChecks = allChecks.concat(p.checks);
  for (const [k, v] of p.aliases) aliases.set(k, v);
  parseErrors.push(...p.errors);
}

if (parseErrors.length) {
  console.log("The check files did not parse, so NOTHING was run:");
  for (const e of parseErrors) console.log("  " + e);
  process.exit(2);
}

console.log(`e2e-bot: ${allChecks.length} check(s) from ${checkFiles.length} file(s)`);
console.log(`  target : ${BASE}`);
console.log(`  marker : ${RUN_MARKER}`);
console.log(`  cost   : ${ALLOW_COST ? `allowed, at most ${COST_LIMIT}` : "NOT allowed — billable checks are NOT RUN"}\n`);

// THE HARNESS'S OWN PRECONDITION, checked before the browser starts. A run
// with no credentials is not a run that found nothing; it is a run that did
// not happen, and it says so and exits 2.
if (!EMAIL || !PASSWORD) {
  console.log("BOT_EMAIL and BOT_PASSWORD are not set, so the bot cannot sign in.");
  console.log("NOTHING WAS CHECKED — this is not a result about the product.");
  console.log("  BOT_EMAIL=... BOT_PASSWORD=... node scripts/e2e-bot.mjs");
  process.exit(2);
}

const { chromium } = await import("playwright");
const browser = await chromium.launch({
  headless: !HEADFUL,
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  // TLS 1.2: the proxy in front of this container negotiates no higher,
  // and without it every navigation fails in a way that reads like the
  // site being down.
  args: ["--ssl-version-max=tls1.2"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "el-GR" });
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e.message ?? e)));

// --- sign in, once, and hold the session for every check ---------------
let loggedIn = false;
let loginDetail = "";
const loginStarted = Date.now();
try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.getByLabel(/email/i).or(page.locator('input[type="email"]')).first().fill(EMAIL, { timeout: 20000 });
  await page.locator('input[type="password"]').first().fill(PASSWORD, { timeout: 20000 });
  await page.locator('button[type="submit"]').first().click({ timeout: 20000 });
  // SIGNED IN MEANS OFF THE LOGIN PAGE, not "the click did not throw". A
  // failed password leaves you on /login with a message, and a harness that
  // does not check would run every check below against the login screen and
  // report ten failures against the product.
  await page.waitForURL((u) => !new URL(u).pathname.startsWith("/login"), { timeout: 45000 });
  loggedIn = true;
  loginDetail = `signed in, landed on ${new URL(page.url()).pathname}`;
} catch (e) {
  loginDetail = redact(String(e.message ?? e)).slice(0, 300);
}
const loginMs = Date.now() - loginStarted;
const loginShot = await shot(page, "login");
console.log(loggedIn ? `  login  : OK (${loginMs} ms)` : `  login  : FAILED — ${loginDetail}`);
console.log("");

for (const check of allChecks) {
  const slug = check.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 48);
  const ctx = { slug, shots: [], consoleErrors: [], lastStatus: null };
  const started = Date.now();

  if (!loggedIn) {
    record(check, "NOT RUN", { why: "the bot could not sign in", detail: loginDetail, ms: 0, shots: [] });
    console.log(`  NOT RUN  ${check.name}`);
    continue;
  }
  if (check.costs && !ALLOW_COST) {
    record(check, "NOT RUN", { why: "this check spends credits and --allow-cost was not given", ms: 0, shots: [] });
    console.log(`  NOT RUN  ${check.name}  (costs credits)`);
    continue;
  }
  if (check.costs && costSpent >= COST_LIMIT) {
    record(check, "NOT RUN", { why: `the per-run limit of ${COST_LIMIT} billable check(s) was reached`, ms: 0, shots: [] });
    console.log(`  NOT RUN  ${check.name}  (cost limit)`);
    continue;
  }
  if (check.costs) costSpent++;

  consoleErrors.length = 0;
  const done = [];
  let failedAt = null;
  try {
    for (const step of check.steps) {
      ctx.consoleErrors = consoleErrors;
      const said = await runStep(page, step, aliases, ctx);
      done.push(`${step.verb} — ${said}`);
    }
  } catch (e) {
    failedAt = { step: check.steps[done.length], error: redact(String(e.message ?? e)).slice(0, 400) };
  }
  const ms = Date.now() - started;
  const proof = await shot(page, `${slug}-${failedAt ? "broken" : "works"}`);
  if (proof) ctx.shots.push(proof);

  // Cleanup runs whether the check passed or failed — a half-finished
  // check is exactly the one that left something behind.
  const cleanupProblems = [];
  for (const c of check.cleanup) {
    try {
      // Indented, because parseChecks only reads commands inside a block.
      const steps = parseChecks(`    CHECK cleanup\n    ${c.rest}`, check.file).checks[0]?.steps ?? [];
      for (const s of steps) await runStep(page, s, aliases, ctx);
    } catch (e) {
      cleanupProblems.push(redact(String(e.message ?? e)).slice(0, 200));
    }
  }

  if (failedAt) {
    record(check, "BROKEN", {
      expected: failedAt.step ? `${failedAt.step.verb} ${failedAt.step.rest}` : "(no step)",
      happened: failedAt.error,
      ms,
      shots: ctx.shots,
      done,
      cleanupProblems,
    });
    console.log(`  BROKEN   ${check.name}  (${ms} ms)\n           ${failedAt.error.slice(0, 160)}`);
  } else {
    record(check, "WORKS", { ms, shots: ctx.shots, done, cleanupProblems });
    console.log(`  WORKS    ${check.name}  (${ms} ms)`);
  }
  if (cleanupProblems.length) console.log(`           CLEANUP FAILED: ${cleanupProblems[0]}`);
}

await browser.close();

// ---------------------------------------------------------------------
// the two files
// ---------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const when = new Date().toISOString();
const works = results.filter((r) => r.status === "WORKS");
const broken = results.filter((r) => r.status === "BROKEN");
const notRun = results.filter((r) => r.status === "NOT RUN");

const head = (title) =>
  `# ${title}\n\n` +
  `Run ${RUN_MARKER}, ${when}\n\n` +
  `Target: ${BASE}\n\n` +
  `${works.length} works · ${broken.length} broken · ${notRun.length} not run\n\n` +
  `**NOT RUN is not a pass.** A check that did not run says nothing about the\n` +
  `product, and is listed at the foot of broken.md so it cannot be mistaken\n` +
  `for a clean result.\n\n`;

writeFileSync(
  join(OUT_DIR, "works.md"),
  head("What works") +
    (works.length
      ? "| Check | Result | Time | Screenshot |\n|---|---|---|---|\n" +
        works
          .map((r) => `| ${r.name} | ${r.done.length} step(s), all passed | ${r.ms} ms | ${r.shots[0] ?? "—"} |`)
          .join("\n") +
        "\n"
      : "Nothing passed.\n") +
    `\n---\n\nThis file answers "does it work technically". It does not answer\n"is it good" — that is a person's judgement and no bot should print a\nnumber for it.\n`
);

writeFileSync(
  join(OUT_DIR, "broken.md"),
  head("What is broken") +
    (broken.length
      ? "| Check | Expected | What happened | Screenshot |\n|---|---|---|---|\n" +
        broken
          .map(
            (r) =>
              `| ${r.name} | \`${r.expected}\` | ${r.happened.replace(/\|/g, "\\|")} | ${r.shots[0] ?? "—"} |`
          )
          .join("\n") +
        "\n"
      : "Nothing failed.\n") +
    (notRun.length
      ? `\n## Not run — ${notRun.length}\n\n` +
        "| Check | Why |\n|---|---|\n" +
        notRun.map((r) => `| ${r.name} | ${r.why} |`).join("\n") +
        "\n"
      : "") +
    (results.some((r) => r.cleanupProblems?.length)
      ? `\n## Cleanup that did not finish\n\n` +
        "These left something behind in the database. Remove it by hand, and\n" +
        "fix the CLEANUP line — a harness that quietly litters is worse than\n" +
        "one that fails loudly.\n\n" +
        results
          .filter((r) => r.cleanupProblems?.length)
          .map((r) => `- **${r.name}** — ${r.cleanupProblems[0]} (marker \`${RUN_MARKER}\`)`)
          .join("\n") +
        "\n"
      : "")
);

console.log(`\n${works.length} works · ${broken.length} broken · ${notRun.length} not run`);
console.log(`wrote ${OUT_DIR}/works.md and ${OUT_DIR}/broken.md`);
if (!loggedIn) {
  console.log("\nTHE BOT NEVER SIGNED IN, so nothing above is a statement about the product.");
  process.exit(2);
}
// A broken check is a finding, not a harness failure: exit 0 so this can be
// read rather than swallowed by a shell that stops on error. The files are
// the output.
process.exit(0);
