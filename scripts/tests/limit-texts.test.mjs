/*
 * A LIMIT SAYS HOW LONG IT LASTS, IN THE READER'S LANGUAGE (owner,
 * 2026-10-09: «Διόρθωσε τώρα όσα είναι κείμενα: το όριο που λέει "ένα
 * λεπτό" ενώ κρατά ώρες, και κάθε αγγλική πρόταση σε ελληνική οθόνη»).
 *
 * Found in a browser on 2026-10-08/09 (docs/PROGRESS.md): Chat's hourly
 * limit of AI requests said «wait about a minute», the platform's daily
 * limit «usually clears within a few minutes», the Site's 24-hour limit
 * on new sites «wait about a minute» again; the Site beside Chat and the
 * Site page said the server's English; a model that failed said «we
 * cannot confirm whether this was charged» while the route had said
 * nothing was; and the plan wall read «Το Εικόνα χρειάζεται…».
 *
 *   1. THE WORDS, in all ten languages: each limit names its own window,
 *      the numbers taken from the code that enforces them; no limit
 *      sentence anywhere promises «a minute»; the time a limit opens again
 *      renders today and tomorrow; «nothing was charged» says so.
 *   2. THE BREAKER, RUN (lib/ai-circuit-breaker.ts against a PostgREST
 *      stand-in in this process — fetch is replaced, no port): each refusal
 *      by its own code, and the instant it opens again, computed from the
 *      log the limit counts.
 *   3. EVERY ROUTE THAT REFUSES ON THE BREAKER passes the code and the
 *      instant on — the population is every file under src/ that calls
 *      checkAiCallAllowed, and each exception says why, checked both ways.
 *   4. THE SCREENS SAY THEM: the sentences built by the real
 *      lib/errors/failure-text.ts from the real messages; the Site's
 *      requests run against a replaced fetch; Chat, the Studio, the voice
 *      conversation, the Site beside Chat and the old Site page read the
 *      values, never the route's English.
 *   5. A TOOL'S NAME NEVER FOLLOWS A GREEK ARTICLE — every string in
 *      messages/el.json that takes one.
 *
 * In a browser: scripts/tests/all-tools-empty-chat-edges.prodtest.mjs,
 * scripts/tests/chat-opens-tools-edges.prodtest.mjs and
 * scripts/tests/first-task-edges.prodtest.mjs. Mutations:
 * scripts/tests/limit-texts.mutation.mjs.
 *
 * Run: node scripts/tests/limit-texts.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadTs, loadTsLinked } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

const require = createRequire(import.meta.url);
const IntlMessageFormat = require("intl-messageformat").default ?? require("intl-messageformat").IntlMessageFormat;

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
const code = (p) => stripComments(readFileSync(p, "utf8"));
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
const M = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const get = (o, key) => key.split(".").reduce((a, p) => a?.[p], o);
const render = (message, locale, values) => new IntlMessageFormat(message, locale).format(values);

// The windows, read from the code that enforces them.
const breakerSrc = readFileSync("src/lib/ai-circuit-breaker.ts", "utf8");
const constant = (src, name) => Number(src.match(new RegExp(`const ${name} = (\\d+);`))?.[1]);
const HOURLY_MINUTES = constant(breakerSrc, "USER_HOURLY_WINDOW_MINUTES");
const REPEAT_MINUTES = constant(breakerSrc, "IDENTICAL_CALL_WINDOW_MINUTES");
const limitsSrc = readFileSync("src/lib/website-generation-limits.ts", "utf8");
const SITE_WINDOW_HOURS = Number(limitsSrc.match(/FAIR_USE_WINDOW_MS = (\d+) \* 60 \* 60 \* 1000;/)?.[1]);
const MAX_SITES = Number(limitsSrc.match(/MAX_GENERATIONS_PER_DAY = (\d+);/)?.[1]);

console.log("limit-texts");

// ---------------------------------------------------------------------
console.log("\n== 1. the words, in all ten languages ==");
// ---------------------------------------------------------------------
check(`ten languages (${LOCALES.join(", ")})`, LOCALES.length === 10);
check(`the windows are read from the code: ${HOURLY_MINUTES} min, ${REPEAT_MINUTES} min, ${SITE_WINDOW_HOURS} h, ${MAX_SITES} sites`,
  [HOURLY_MINUTES, REPEAT_MINUTES, SITE_WINDOW_HOURS, MAX_SITES].every((n) => Number.isFinite(n) && n > 0));
const TIMED = { hourlyLimit: String(HOURLY_MINUTES), repeatLimit: String(REPEAT_MINUTES), siteDailyLimit: String(SITE_WINDOW_HOURS), platformLimit: "00:00" };
for (const [limit, window] of Object.entries(TIMED)) {
  const missing = LOCALES.filter((l) => {
    const what = get(M[l], `errors.codes.${limit}.what`);
    const next = get(M[l], `errors.codes.${limit}.next`);
    return typeof what !== "string" || !what || typeof next !== "string" || !`${what} ${next}`.includes(window);
  });
  check(`${limit}: said in every language, naming its window «${window}»`, missing.length === 0, missing.join(", "));
}
// «A minute», «shortly», «at once», in each language: no limit sentence
// may promise them. The windows are an hour, a quarter of an hour and a
// day — and every one of these said «wait about a minute», «try again
// shortly» or «too many requests at once» before 2026-10-14 (123 matches
// across the ten catalogues, counted that day against
// origin/claude/keen-turing-bv8gw4-checks; 0 after).
const SOON = {
  en: /\bminutes?\b|\bshortly\b|\bin a moment\b|\bat once\b/i,
  el: /λεπτ|σε λίγο\b|μαζί|λίγη ώρα/i,
  de: /minute|gleich|auf einmal|kurzer Zeit/i,
  fr: /minute|dans un instant|à la fois|peu de temps/i,
  es: /minuto|en un momento|a la vez|poco tiempo/i,
  it: /minut|tra poco|insieme|poco tempo/i,
  pt: /minuto|daqui a pouco|ao mesmo tempo|pouco tempo/i,
  ar: /دقيق|بعد قليل|في وقت واحد|دفعة واحدة|وقت قصير/,
  ja: /分|少し待って|集中|短時間|同時/,
  zh: /分钟|同时|短时间/,
};
const LIMIT_SENTENCES = [
  "errors.codes.rateLimited.what",
  "errors.codes.rateLimited.next",
  "errors.codes.platformLimit.next",
  "errors.codes.siteDailyLimit.next",
  "dashboard.documents.writer.errors.rateLimited",
  "presentations.errors.rateLimited",
  "posts.errors.rateLimited",
  "dashboard.images.errors.rateLimited",
  "dashboard.automations.errors.rateLimited",
  "dashboard.flows.errors.rateLimited",
  "dashboard.flows.stepErrors.rate_limited",
  "dashboard.games.errors.rateLimited",
  "dashboard.rebuild.errors.rateLimited",
  "dashboard.deepResearch.refused.rateLimited",
  "dashboard.files.askRateLimited",
  "dashboard.meetings.errors.rate_limited",
  "dashboard.translate.dailyLimit",
  "problem.rate_limited.what",
  "problem.rate_limited.next",
];
check("every one of those sentences exists in English", LIMIT_SENTENCES.every((k) => typeof get(M.en, k) === "string"), LIMIT_SENTENCES.filter((k) => typeof get(M.en, k) !== "string").join(", "));
for (const l of LOCALES) {
  const soon = SOON[l];
  const promising = LIMIT_SENTENCES.filter((k) => soon && soon.test(String(get(M[l], k) ?? "")));
  check(`${l}: no limit sentence says «a minute», «shortly» or «at once» (${LIMIT_SENTENCES.length} sentences)`, Boolean(soon) && promising.length === 0, promising.map((k) => `${k}: ${get(M[l], k)}`).join(" | "));
}
for (const l of LOCALES) {
  const message = get(M[l], "errors.retryAt");
  let today = "";
  let tomorrow = "";
  try {
    today = render(message, l, { day: "today", time: "T-ONE" });
    tomorrow = render(message, l, { day: "tomorrow", time: "T-TWO" });
  } catch (err) {
    today = String(err);
  }
  check(`${l}: when a limit opens again renders today and tomorrow, each with its time`,
    today.includes("T-ONE") && tomorrow.includes("T-TWO") && today.replace("T-ONE", "") !== tomorrow.replace("T-TWO", ""), `${today} | ${tomorrow}`);
}
check("«nothing was charged» says so when the route gave the hold back (en, el)",
  M.en.errors.credits.refunded === "Nothing was charged." && M.el.errors.credits.refunded === "Δεν χρεώθηκε τίποτα.",
  `${M.en.errors.credits.refunded} | ${M.el.errors.credits.refunded}`);
check("...and in every language it is not the «we cannot confirm» sentence",
  LOCALES.every((l) => M[l].errors.credits.refunded && M[l].errors.credits.refunded !== M[l].errors.credits.unverified && M[l].errors.credits.refunded !== M[l].errors.credits.charged));

// ---------------------------------------------------------------------
console.log("\n== 2. the breaker, run: each limit by its code, and when it opens ==");
// ---------------------------------------------------------------------
// A PostgREST stand-in, in this process: globalThis.fetch is replaced for
// the calls below and put back after. It answers the three things the
// breaker reads — today's platform count, the atomic limiter, the log —
// from `db`, and the error log's RPC with nothing.
const db = { totalCalls: 0, consume: {}, log: [] };
const realFetch = globalThis.fetch;
function standIn(input, init = {}) {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = (init.method ?? "GET").toUpperCase();
  const accept = String(new Headers(init.headers ?? {}).get("accept") ?? "");
  const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "daily_ai_spend_tracking" && method === "GET") {
    const row = { total_calls: db.totalCalls };
    return accept.includes("vnd.pgrst.object") ? json(200, row) : json(200, [row]);
  }
  if (table === "rpc/consume_rate_limit") {
    const args = JSON.parse(String(init.body ?? "{}"));
    return json(200, db.consume[args.p_scope] ?? true);
  }
  if (table === "rate_limit_log" && method === "GET") {
    const eq = (k) => url.searchParams.get(k)?.replace(/^eq\./, "");
    const since = Date.parse(String(url.searchParams.get("created_at") ?? "").replace(/^gte\./, ""));
    const rows = db.log
      .filter((r) => r.scope === eq("scope") && r.identifier === eq("identifier") && Date.parse(r.created_at) >= since)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? rows.length);
    return json(200, rows.slice(offset, offset + limit).map((r) => ({ created_at: r.created_at })));
  }
  return json(200, null);
}
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://stand-in.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stand-in";
process.env.MAX_DAILY_AI_CALLS = "100";
const quietError = console.error;
console.error = () => undefined;
globalThis.fetch = standIn;
const near = (iso, ms) => typeof iso === "string" && Math.abs(Date.parse(iso) - ms) < 5000;
const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
try {
  const breaker = await loadTsLinked("src/lib/ai-circuit-breaker.ts");
  const limiter = await loadTsLinked("src/lib/rate-limit.ts");
  const user = "user-1";

  db.totalCalls = 100;
  const platform = await breaker.checkAiCallAllowed(user, "chat", "fp");
  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  check("the platform's day: platformLimit, opening at the next 00:00 UTC",
    platform.allowed === false && platform.code === "platformLimit" && platform.retryAt === midnight.toISOString(), JSON.stringify(platform));

  db.totalCalls = 0;
  db.consume = { ai_hourly_user: false };
  db.log = Array.from({ length: 20 }, (_, i) => ({ scope: "ai_hourly_user", identifier: user, created_at: ago(50 - i * 2) }));
  const hourly = await breaker.checkAiCallAllowed(user, "chat", "fp");
  check(`the hour's AI requests: hourlyLimit, opening when the oldest of the 20 is ${HOURLY_MINUTES} minutes old (in 10 minutes)`,
    hourly.allowed === false && hourly.code === "hourlyLimit" && near(hourly.retryAt, Date.now() + 10 * 60_000), JSON.stringify(hourly));

  db.log = [];
  const unread = await breaker.checkAiCallAllowed(user, "chat", "fp");
  check("...and with no log to read, the code alone (the sentence then names the window)",
    unread.allowed === false && unread.code === "hourlyLimit" && unread.retryAt === undefined, JSON.stringify(unread));

  db.consume = { ai_identical_call: false };
  db.log = Array.from({ length: 10 }, (_, i) => ({ scope: "ai_identical_call", identifier: `${user}:chat:fp`, created_at: ago(12 - i) }));
  const repeat = await breaker.checkAiCallAllowed(user, "chat", "fp");
  check(`the same request repeated: repeatLimit, opening when the oldest of the 10 is ${REPEAT_MINUTES} minutes old (in 3 minutes)`,
    repeat.allowed === false && repeat.code === "repeatLimit" && near(repeat.retryAt, Date.now() + 3 * 60_000), JSON.stringify(repeat));

  db.consume = {};
  check("...and an account under every limit is let through", (await breaker.checkAiCallAllowed(user, "chat", "fp")).allowed === true);

  // More hits than the limit (the racy fallback can record them): the window
  // opens when the limit-th newest ages out, not the oldest.
  // Hits 11, 13, … 59 minutes ago: the 20th newest was 49 minutes ago, so
  // the window opens in 11 minutes (the oldest would say 1).
  db.log = Array.from({ length: 25 }, (_, i) => ({ scope: "s", identifier: "i", created_at: ago(59 - i * 2) }));
  const opens = await limiter.rateLimitOpensAt({ scope: "s", identifier: "i", maxAttempts: 20, windowMinutes: 60 });
  check("rateLimitOpensAt: the 20th newest of 25 hits, plus the window", near(opens, Date.now() + 11 * 60_000), String(opens));
} catch (err) {
  check("the breaker ran against the stand-in", false, String(err?.stack ?? err));
} finally {
  globalThis.fetch = realFetch;
  console.error = quietError;
}

// ---------------------------------------------------------------------
console.log("\n== 3. every route that refuses on the breaker passes the limit on ==");
// ---------------------------------------------------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
// The callers that say a refusal some other way, each with why. Held both
// ways: an exception must still call the breaker and must still not pass
// the instant on (one that starts to, comes off this list).
const SAID_ELSEWHERE = {
  "src/app/api/cron/scheduled-runs/route.ts": "a scheduled run: no screen waits on it, the refusal is the run's stored result",
  "src/app/api/transitions/detect/route.ts": "refused in silence: the suggestion is skipped and nothing is said",
  "src/app/api/websites/generate/process/route.ts": "the worker: the refusal is stored on the site, and each Site screen says a failed site in its own words",
  "src/app/api/automations/create/route.ts": "gates only the clarifying questions; a refusal skips them",
  "src/app/api/translate/route.ts": "its own code vocabulary (`rate_limited`), said by the translate button's own sentence (section 1)",
  "src/app/api/translate/text/route.ts": "its own code vocabulary (`rate_limited`), said by the standalone Translate tool's own sentence — same shape as its sibling, api/translate/route.ts, above",
  "src/app/api/translate/text/edit/route.ts": "its own code vocabulary (`rate_limited`), said by the standalone Translate tool's own sentence — same shape as its sibling, api/translate/text/route.ts, above",
  "src/app/api/documents/[id]/edit/route.ts": "its own code vocabulary, said by the Document tool's own sentence (section 1)",
  "src/app/api/documents/generate/route.ts": "its own code vocabulary, said by the Document tool's own sentence (section 1)",
  "src/app/api/meetings/[id]/analyse/route.ts": "its own code vocabulary, said by the Meetings sentence (section 1)",
  "src/app/api/meetings/[id]/ask/route.ts": "its own code vocabulary, said by the SAME Meetings sentence as analyse, above",
  "src/app/api/automations/flows/route.ts": "refuse(\"rate_limited\"), said by the Automations sentence (section 1)",
  "src/app/api/automations/flows/[id]/run/route.ts": "refuse(\"rate_limited\"), said by the Automations sentence (section 1)",
  "src/app/api/automations/flows/[id]/change/route.ts": "refuse(\"rate_limited\"), said by the Automations sentence (section 1)",
  "src/app/api/automations/events/route.ts": "refuse(\"rate_limited\"), said by the Automations sentence (section 1)",
  "src/app/api/automations/runs/[runId]/approve/route.ts": "refuse(\"rate_limited\"), said by the Automations sentence (section 1)",
  "src/lib/images/image-access.ts": "refuse(\"rate_limited\"), said by the Image tool's sentence (section 1)",
  "src/lib/games/charge.ts": "its own code vocabulary, said by the Games sentence (section 1)",
  "src/lib/rebuild/charge.ts": "its own code vocabulary (`rate_limited`), said by Rebuild's own sentence (section 1)",
  "src/lib/apps/charge.ts": "its own code vocabulary (`rate_limited`), said by the App builder's own sentence (section 1)",
  "src/lib/agents/execute-agent.ts": "an agent's run, refused as a run result, not a screen's request",
  "src/lib/automations/runner.ts": "a step of a running automation, recorded as the step's note",
};
const callers = walk("src").filter((p) => p !== path.join("src", "lib", "ai-circuit-breaker.ts") && /checkAiCallAllowed\(/.test(readFileSync(p, "utf8")));
check(`the population: every file under src/ that calls checkAiCallAllowed (${callers.length})`, callers.length >= 30, String(callers.length));
const silent = [];
for (const file of callers) {
  const body = code(file);
  const names = [...body.matchAll(/const (\w+) = await checkAiCallAllowed\(/g)].map((m) => m[1]);
  const passes = names.length > 0 && names.every((n) => body.includes(`code: ${n}.code, retryAt: ${n}.retryAt`));
  const key = file.split(path.sep).join("/");
  if (SAID_ELSEWHERE[key]) {
    check(`${key}: said elsewhere — ${SAID_ELSEWHERE[key]}`, !passes);
  } else if (!passes) {
    silent.push(key);
  }
}
check(`every other caller passes the code and the instant it opens on (${callers.length - Object.keys(SAID_ELSEWHERE).length})`, silent.length === 0, silent.join(", "));
const stale = Object.keys(SAID_ELSEWHERE).filter((k) => !callers.map((p) => p.split(path.sep).join("/")).includes(k));
check("...and every exception is still a caller", stale.length === 0, stale.join(", "));
{
  const generate = code("src/app/api/websites/generate/route.ts");
  check(`the Site's ${SITE_WINDOW_HOURS}-hour limit on new sites is named, with when it opens`,
    /rateLimited: true,\s*code: "siteDailyLimit",\s*retryAt: /.test(generate) &&
      /\.range\(MAX_GENERATIONS_PER_DAY - 1, MAX_GENERATIONS_PER_DAY - 1\)/.test(generate) &&
      /const opensAt = countedAt \+ FAIR_USE_WINDOW_MS;/.test(generate));
}

// ---------------------------------------------------------------------
console.log("\n== 4. the screens say them ==");
// ---------------------------------------------------------------------
const codes = await loadTs("src/lib/errors/error-codes.ts");
const text = await loadTs("src/lib/errors/failure-text.ts");
const apiError = await loadTs("src/lib/errors/api-error.ts");
{
  const now = new Date(2026, 9, 14, 14, 0, 0);
  const at = new Date(2026, 9, 14, 14, 5, 37);
  const shown = codes.retryTime(at.toISOString(), "el", now);
  const expected = "14:06";
  check(`the time is the reader's clock, rounded UP to the minute (14:05:37 is said as ${expected})`, shown?.time === expected && shown?.day === "today", JSON.stringify(shown));
  const later = codes.retryTime(new Date(2026, 9, 15, 3, 0, 0).toISOString(), "en", now);
  check("...past midnight it says tomorrow", later?.day === "tomorrow", JSON.stringify(later));
  check("...and English keeps its own 12-hour clock", codes.retryTime(at.toISOString(), "en", now)?.time === new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(new Date(2026, 9, 14, 14, 6, 0)));
  const sentence = render(M.el.errors.retryAt, "el", { day: "today", time: shown?.time ?? "" });
  check(`...and the Greek sentence ends in one full stop: «${sentence}»`, sentence.endsWith("14:06.") && !sentence.includes(".."));
  check("...and anything later than tomorrow is not said as a time", codes.retryTime(new Date(2026, 9, 17, 3, 0, 0).toISOString(), "en", now) === null);
  const soon = new Date(Date.now() + 30 * 60_000).toISOString();
  check("a route's instant is kept when it is ahead and within a day; a past one or one days away is dropped",
    new apiError.ApiError(429, { code: "hourlyLimit", retryAt: soon }).retryAt === soon &&
      new apiError.ApiError(429, { code: "hourlyLimit", retryAt: ago(1) }).retryAt === undefined &&
      new apiError.ApiError(429, { code: "hourlyLimit", retryAt: new Date(Date.now() + 3 * 86400_000).toISOString() }).retryAt === undefined);
}
for (const locale of ["el", "en"]) {
  const t = (key, values) => render(get(M[locale].errors, key), locale, values);
  const soon = new Date(Date.now() + 30 * 60_000);
  const withTime = text.failureParts(t, "hourlyLimit", 429, undefined, soon.toISOString(), locale);
  const at = codes.retryTime(soon.toISOString(), locale);
  check(`${locale}: an hourly limit the route timed says the time it opens: «${withTime.text}»`,
    withTime.what === M[locale].errors.codes.hourlyLimit.what && withTime.next === t("retryAt", at) && withTime.credits === M[locale].errors.credits.notCharged);
  const without = text.failureParts(t, "hourlyLimit", 429, undefined, undefined, locale);
  check(`${locale}: ...without the time, its window`, without.next === M[locale].errors.codes.hourlyLimit.next);
  const site = text.failureParts(t, "siteDailyLimit", 429, undefined, undefined, locale);
  check(`${locale}: the Site's limit on new sites: «${site.what}»`, site.what === M[locale].errors.codes.siteDailyLimit.what && site.next === M[locale].errors.codes.siteDailyLimit.next);
  const generic = text.failureParts(t, "rateLimited", 429, undefined, soon.toISOString(), locale);
  check(`${locale}: a limit that is not named keeps its own sentence, time or not`, generic.next === M[locale].errors.codes.rateLimited.next);
  const failed = text.failureParts(t, "upstreamUnavailable", 503, true, undefined, locale);
  check(`${locale}: a model that failed, with the hold given back, says nothing was charged: «${failed.credits}»`, failed.credits === M[locale].errors.credits.refunded && !failed.showCreditHistory);
}
{
  const live = await loadTsLinked("src/lib/website-builder/site-requests.ts");
  const soon = new Date(Date.now() + 5 * 3600_000).toISOString();
  const day = live.refusedBeforeWork({ rateLimited: true, code: "siteDailyLimit", retryAt: soon, message: "English" });
  check("the Site's requests keep the limit's own code and the instant", day.status === 429 && day.code === "siteDailyLimit" && day.retryAt === soon);
  check("...credits stay the credits, and an unnamed limit stays a limit",
    live.refusedBeforeWork({ code: "insufficientCredits" }).status === 402 && live.refusedBeforeWork({ rateLimited: true }).code === "rateLimited");
  const realFetch2 = globalThis.fetch;
  const answer = (status, body) => {
    globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  try {
    answer(200, { ok: true, generated: false, rateLimited: true, code: "siteDailyLimit", retryAt: soon, message: "You've reached the limit…" });
    const started = await live.startSiteGeneration({ name: "n", description: "d", skipClarification: true });
    check("a new site refused for the 24 hours is a refusal with that code, not «try in a minute»", started.kind === "refused" && started.error.code === "siteDailyLimit" && started.error.retryAt === soon);
    answer(200, { ok: true, edited: false, rateLimited: true, code: "hourlyLimit", message: "…" });
    const changed = await live.requestSiteChange({ websiteId: "w", changeRequest: "c" });
    check("a change refused for the hour's AI requests says that limit", changed.kind === "refused" && changed.reason === "other" && changed.error.code === "hourlyLimit");
    answer(200, { ok: true, edited: false, busy: true, message: "A generation is already in progress…" });
    check("a change asked while another runs is «busy»", (await live.requestSiteChange({ websiteId: "w", changeRequest: "c" })).reason === "busy");
  } finally {
    globalThis.fetch = realFetch2;
  }
}
{
  const ws = code("src/components/chat/chat-workspace.tsx");
  check("Chat: a refusal and a failed stream are said by the shared words, never the route's message",
    /setError\(chatFailure\.refusal\(429, data\)\)/.test(ws) && /streamError = chatFailure\.streamError\(event\);/.test(ws) && !/data\.message|event\.error\b/.test(ws));
  const words = code("src/components/chat/use-chat-failure-words.ts");
  check("...which pass the route's code, the instant and «given back» on to the shared sentences",
    /code: isErrorCode\(value\?\.code\) \? value\.code : undefined,/.test(words) &&
      /creditsRefunded: value\?\.creditsRefunded === true \? true : undefined,/.test(words) &&
      /retryAt: typeof value\?\.retryAt === "string" \? value\.retryAt : undefined,/.test(words) &&
      /if \(event\.outOfCredits === true\) return outOfCredits\(event\.available, event\.needed\);/.test(words));
  const route = code("src/app/api/chat/route.ts");
  check("Chat route: a hold that could not be taken says nothing was charged",
    /: \{ code: "serverError", creditsRefunded: true \}\),/.test(route));
  const studio = code("src/components/create/studio-chat.tsx");
  check("the Studio's conversation says them the same way (it showed the route's English)",
    /setError\(chatFailure\.refusal\(res\.status, data\)\);/.test(studio) && /streamError = chatFailure\.streamError\(event\);/.test(studio) && !/getErrorMessage|event\.error\b/.test(studio));
  const voice = code("src/components/voice/voice-conversation.tsx");
  check("the voice conversation too: a refusal is read as one, not as an empty stream",
    /addToast\(chatFailure\.refusal\(chatResponse\.status, data\), "error"\);/.test(voice) &&
      /includes\("application\/x-ndjson"\)/.test(voice) &&
      /addToast\(chatFailure\.streamError\(event\), "error"\);/.test(voice) && !/addToast\(event\.error/.test(voice));
  const pane = code("src/components/chat/site-pane.tsx");
  check("the Site beside Chat: every refusal from its code, on every screen",
    (pane.match(/describe\(outcome\.error\)\.text/g) ?? []).length === 2 && !/serverSaid|getErrorMessage|outcome\.message/.test(pane));
  check("...a change the safety review held, or asked while another runs, by what it is",
    /outcome\.reason === "held"\s*\? `\$\{tShell\("site\.held"\)\} \$\{tErrors\("credits\.notCharged"\)\}`/.test(pane) &&
      /outcome\.reason === "busy"\s*\? `\$\{tShell\("site\.busy"\)\} \$\{tErrors\("credits\.notCharged"\)\}`/.test(pane));
  const page = code("src/components/website-builder/website-builder-workspace.tsx");
  check("the old Site page: no stored English, no route message, no English of its own",
    !/error_message \?\?|data\.message|getErrorMessage|"Could not|"Network error|"Not authenticated\./.test(page) &&
      (page.match(/failedLine\((record|previewWebsite)\)/g) ?? []).length === 2 &&
      /const refused = siteChangeRefusal\(res, data\);/.test(page) &&
      /data\.rateLimited \? describe\(refusedBeforeWork\(data\)\)\.text/.test(page));
  const onboarding = code("src/components/onboarding/onboarding-flow.tsx");
  check("the first minutes (onboarding): no route's English, a limit with its time",
    !/data\.error|getErrorMessage/.test(onboarding) && (onboarding.match(/refused\(response\.status, data, t\(/g) ?? []).length === 4);
  for (const file of [
    "src/components/mission/mission-form.tsx",
    "src/components/product-workflow/product-mission-button.tsx",
    "src/components/trading-workflow/trading-mission-button.tsx",
    "src/components/mission/mission-detail.tsx",
    "src/components/reflection/reflection-generator.tsx",
    "src/components/records/ask-ai-modal.tsx",
    "src/components/create/create-studio.tsx",
    "src/components/text-actions/text-actions-textarea.tsx",
    "src/components/agents/agents-workspace.tsx",
    "src/components/marketplace/template-browser.tsx",
  ]) {
    check(`${file}: a limit is said with its time before anything the route wrote`, /limitText\(data\) \?\?/.test(code(file)));
  }
  const files = code("src/components/files/failure-words.ts");
  const research = code("src/components/research/failure-words.ts");
  check("Files and Research: an AI limit by its own name and time",
    /isTimedLimitCode\(outcome\.body\?\.code\)\s*\? describe\(new ApiError\(429, outcome\.body as ApiErrorPayload\)\)\.text/.test(files) &&
      /isTimedLimitCode\(body\?\.code\)\s*\? describe\(new ApiError\(429, body as ApiErrorPayload\)\)\.text/.test(research));
}

// ---------------------------------------------------------------------
console.log("\n== 5. a tool's name never follows a Greek article ==");
// ---------------------------------------------------------------------
{
  const strings = [];
  const collect = (o, p) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") strings.push([`${p}${k}`, v]);
      else if (v && typeof v === "object") collect(v, `${p}${k}.`);
    }
  };
  collect(M.el, "");
  const NAMES = /\{(feature|featureName|tool|toolName)\}/;
  const named = strings.filter(([, v]) => NAMES.test(v));
  const ARTICLE = /(?<![\p{L}])(Το|το|Η|η|Ο|ο|Τα|τα|Οι|οι|Του|του|Της|της|Των|των|Τον|τον|Την|την|Στο|στο|Στη|στη|Στην|στην|Στον|στον)\s+\{(feature|featureName|tool|toolName)\}/u;
  const wrong = named.filter(([, v]) => ARTICLE.test(v));
  check(`the Greek strings that take a tool's or feature's name (${named.length}) never put an article before it`, named.length >= 3 && wrong.length === 0, wrong.map(([k, v]) => `${k}: ${v}`).join(" | "));
  check("...the plan wall names it in quotes after «Η λειτουργία»", M.el.common.upgradeRequired.body.includes("«{feature}»"));
}

console.log("\n== a read that cannot charge says so, and a write that might does not ==");
// «Δεν μπορούμε να επιβεβαιώσουμε αν χρεώθηκε» is the right answer for a
// request that might have spent before it failed. For a read — listing a
// site's versions — it is a false worry about an action with no price, so
// those call sites pass `spends: false` (2026-10-14, found by review).
{
  const outcome = (status, refunded, spends) => codes.creditOutcomeForStatus(status, refunded, spends);
  check("a failed read is told plainly that nothing was charged", outcome(500, undefined, false) === "notCharged");
  check("...and so is a read that never reached the server", outcome(0, undefined, false) === "notCharged");
  check("a write that may have spent still says it cannot be confirmed", outcome(500, undefined, true) === "unverified");
  check("...and the default, with nothing passed, is the careful one", codes.creditOutcomeForStatus(500, undefined) === "unverified");
  check("a route that says it gave the credits back still wins", outcome(500, true, false) === "refunded" && outcome(500, false, true) === "charged");
  const history = stripComments(readFileSync("src/components/website-builder/site-history.tsx", "utf8"));
  check("the version list, which only reads, asks for that answer",
    /describe\(new ApiError\(500, null\), \{ spends: false \}\)/.test(history));
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
