// A ROUTE THAT SPENDS AND IS NOT IN THE BILLING SYSTEM AT ALL.
//
// WHY THIS IS NOT billing-coverage.test.mjs. That file inventories every
// messages.create / messages.stream in the tree and fails on one that does
// not say how it bills. It is a good gate and it caught real things. But
// the question it asks is "do you settle correctly", and a route that does
// not settle at all is not asked it — it is not a participant. The gate
// covers the ones who showed up.
//
// Measured on 2026-09-16, that blind spot held five routes. Every one of
// them was outside the set billing-coverage iterates, so no assertion in
// that file had an opinion about any of them, and it passed at full
// strength throughout:
//
//   mission/[id]/pdf, research/[id]/pdf, presentations/[id]/pdf and
//   presentations/[id]/pptx rendered a document server-side, per request,
//   with no reservation, no rate limit and no cache — and the .pptx one
//   downloads every slide photo first (lib/presentations/images.ts).
//
//   POST /api/notifications/channels sent a message to an address the
//   CALLER supplies, unbounded, while /api/delivery-channels — the same
//   action, one directory away — had been rate limited on scope
//   delivery_channel_test since it was written. Nothing compared them.
//
// SO THIS GATE ASKS THE OTHER QUESTION: of every route that spends
// ANYTHING — a model call, a paid third-party API, egress, or CPU that
// scales with the input — which ones enter the billing system, and for
// the ones that do not, is the reason written down?
//
// HOW A ROUTE SATISFIES IT. Either reserveCredits/settleReservation is
// reachable from it within one import hop, in which case it is settled and
// needs no entry here; or it is DECLARED below with a bound and a reason.
// A declared bound is VERIFIED, not taken: "limited" fails if the
// checkRateLimit disappears.
//
// Run: node scripts/tests/route-spend-inventory.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail) console.log(`        ${detail}`);
}

// ---------------------------------------------------------------------
// The module graph. Routes delegate, so a marker in the route file alone
// would miss every feature whose spending lives one import away — which
// is most of them.
// ---------------------------------------------------------------------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path.relative(ROOT, p));
  }
  return out;
}
const FILES = walk(path.join(ROOT, "src"));
const KNOWN = new Set(FILES);
const SOURCE = new Map(FILES.map((f) => [f, readFileSync(path.join(ROOT, f), "utf8")]));

function resolveLocal(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.normalize(path.join(path.dirname(fromFile), spec));
  else return null;
  for (const candidate of [base + ".ts", base + ".tsx", path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (KNOWN.has(candidate)) return candidate;
  }
  return null;
}

const IMPORT_SPEC =
  /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
const DEPS = new Map();
for (const f of FILES) {
  const found = new Set();
  for (const m of SOURCE.get(f).matchAll(IMPORT_SPEC)) {
    const resolved = resolveLocal(f, m[1] || m[2]);
    if (resolved) found.add(resolved);
  }
  DEPS.set(f, [...found]);
}

// EVERY route imports logApiError, which alerts the operator by email when
// something throws. Left in the graph it makes 71 of 136 routes look like
// third-party-API spenders at depth 3, which is a precision of about zero.
// It is a cost on the ERROR path, not work anyone asked for.
const OPERATIONAL = new Set([
  "src/lib/log-error.ts",
  "src/lib/email/error-alert.ts",
  "src/lib/resend.ts",
  "src/lib/diag.ts",
]);

const MAX_DEPTH = 3;
function reachableFrom(entry) {
  const depthOf = new Map([[entry, 0]]);
  const queue = [[entry, 0]];
  while (queue.length) {
    const [file, depth] = queue.shift();
    if (depth >= MAX_DEPTH) continue;
    for (const next of DEPS.get(file) || []) {
      if (OPERATIONAL.has(next)) continue;
      if (!depthOf.has(next)) {
        depthOf.set(next, depth + 1);
        queue.push([next, depth + 1]);
      }
    }
  }
  return depthOf;
}

// ---------------------------------------------------------------------
// THE CLASSIFIER. One copy. The positive controls at the bottom drive
// THIS function rather than re-stating its regexes, because a control that
// re-implements the thing it is controlling passes while the real one is
// broken — measured on charge-sees-input.test.mjs, 2026-09-14.
// ---------------------------------------------------------------------
const SPEND_KINDS = {
  // Tokens. Anthropic through the SDK, or another provider over HTTP.
  model: /\bmessages\s*\.\s*(create|stream)\s*\(|generativelanguage\.googleapis\.com|api\.groq\.com|api\.openai\.com/,
  audio: /api\.elevenlabs\.io/,
  image_api: /api\.unsplash\.com/,
  oauth_api: /gmail\.googleapis\.com|www\.googleapis\.com\/(calendar|drive)|googleapis\.com\/(gmail|calendar)/,
  webhook_out: /hooks\.slack\.com|slack\.com\/api|api\.telegram\.org|discord\.com\/api/,
  // CPU that scales with the document: a PDF render, a deck build, an
  // image resize. Not free merely because no invoice arrives for it.
  compute: /from "sharp"|from "@react-pdf\/renderer"|from "pptxgenjs"/,
  // Egress and storage: every read of an object is bytes off the bucket.
  volume: /\.storage\s*\n?\s*\.from\s*\(/,
};
// A CALL, not a mention. `estimate.reserveCredits` is a NUMBER — the size
// of the hold to take — and four routes read it without taking one
// themselves (they pass it to startJob, which does). Matching the bare
// name counted those as inside the system for the right reason by
// accident, and would have counted a route that merely logged the figure
// for no reason at all.
const RESERVES = /\breserveCredits\s*\(|\bsettleReservation\s*\(/;
const LIMITS = /checkRateLimit/;

/** What a route spends and what bounds it. `reached` is injectable so the
 *  controls below can exercise this function on files of their choosing
 *  instead of describing what it would have said. */
function classifyRoute(route, reached = reachableFrom(route)) {
  const kinds = [];
  let reserved = null;
  let limited = null;
  for (const [file, depth] of reached) {
    const text = SOURCE.get(file) || "";
    for (const [kind, re] of Object.entries(SPEND_KINDS)) {
      if (re.test(text) && !kinds.includes(kind)) kinds.push(kind);
    }
    // Within ONE hop only. A reservation three modules away belongs to
    // some other feature that happens to share a helper; it is not this
    // route entering the billing system.
    if (depth <= 1 && RESERVES.test(text) && reserved === null) reserved = file;
    if (depth <= 1 && LIMITS.test(text) && limited === null) limited = file;
  }
  return { kinds: kinds.sort(), reserved, limited };
}

const ROUTES = FILES.filter((f) => /^src\/app\/api\/.*\/route\.ts$/.test(f));
const shortName = (f) => f.replace("src/app/api/", "").replace("/route.ts", "");

// ---------------------------------------------------------------------
// THE FLOORS. Every assertion below reports a DIFFERENCE — offenders that
// should be empty — and an empty scraper produces an empty offender list
// and a green line. db-migrations.test.mjs had three of those and the
// output was byte-identical with all three replaced by empty collections.
// ---------------------------------------------------------------------
const classified = ROUTES.map((r) => ({ route: r, ...classifyRoute(r) }));
const spending = classified.filter((c) => c.kinds.length > 0);

checkTrue(`the route tree was read (${ROUTES.length} routes)`, ROUTES.length >= 100, "src/app/api yielded almost nothing — the walk or the filter is broken");
checkTrue(`the import graph resolved (${[...DEPS.values()].flat().length} local edges)`, [...DEPS.values()].flat().length >= 500, "no edges means every route classifies as its own file only");
checkTrue(`routes that spend something (${spending.length})`, spending.length >= 40, "the spend classifier matched nothing — every route below would pass vacuously");
for (const kind of Object.keys(SPEND_KINDS)) {
  checkTrue(
    `at least one route spends '${kind}'`,
    spending.some((c) => c.kinds.includes(kind)),
    `no route matched ${SPEND_KINDS[kind]} — a renamed dependency turns this kind off silently`
  );
}
checkTrue(
  `routes that settle (${spending.filter((c) => c.reserved).length})`,
  spending.filter((c) => c.reserved).length >= 20,
  "nothing reaches reserveCredits within one hop — the reserve detector is broken, and every spending route would need an entry below"
);

// ---------------------------------------------------------------------
// THE INVENTORY. A route that spends and does NOT reserve is here, with
// what bounds it instead and why that is the right answer.
//
//   "limited" — free on purpose, bounded by checkRateLimit. VERIFIED three
//               ways: the limiter must be reachable within one hop, the
//               SCOPE it names must be the one written here, and the route
//               must answer 429 somewhere. The scope is checked because
//               two routes sharing one scope share one budget without
//               either of them saying so, and nothing else in the tree
//               would notice.
//   "none"    — free on purpose and unbounded on purpose, with the
//               argument for why an unbounded loop of it costs nothing.
//   "artefact"— does not spend at all. The kind came from a module in its
//               import closure that some OTHER route uses to spend. These
//               are listed rather than filtered, because the filter that
//               removes them is the filter that removes real ones.
// ---------------------------------------------------------------------
const DECLARED = {
  // --- free because it was already paid for, bounded so it stays free ---
  "mission/[id]/pdf": { bound: "limited", scope: "document_export", why: "a plan already paid for, re-rendered; lib/export-guard.ts" },
  "research/[id]/pdf": { bound: "limited", scope: "document_export", why: "a report already paid for, re-rendered; lib/export-guard.ts" },
  "presentations/[id]/pdf": { bound: "limited", scope: "document_export", why: "a deck already paid for; downloads its own slide photos first" },
  "presentations/[id]/pptx": { bound: "limited", scope: "document_export", why: "same deck, other format; pptxgenjs builds it in this process" },

  // --- free because the user is spending their own quota, not ours ---
  "files/upload": { bound: "limited", scope: "file_upload", why: "storage counts against the plan's own quota (lib/files), not against credits" },
  "files/register": { bound: "limited", scope: "file_upload", why: "metadata for an object already uploaded; the quota was charged there" },
  "files/[id]/download": { bound: "limited", scope: "file_download", why: "mints a signed URL; the bytes leave Supabase, not this process" },
  "files/[id]": { bound: "none", why: "DELETE removes an object. Deleting is the cheap direction and refusing to delete costs the user storage they are paying for." },

  // --- outbound messages: free APIs, but an unbounded relay all the same ---
  "delivery-channels": { bound: "limited", scope: "delivery_channel_test", why: "sends a test message to a caller-supplied address; scope delivery_channel_test" },
  "notifications/channels": { bound: "limited", scope: "notification_channel_test", why: "the same test send, one directory away; scope notification_channel_test" },
  "integrations/[provider]": { bound: "limited", scope: "integration_disconnect", why: "connect/disconnect; scope integration_connect / integration_disconnect" },
  "integrations/[provider]/callback": {
    bound: "none",
    why: "the OAuth redirect. The code it exchanges is single-use and minted by the provider, so a loop of this route exchanges nothing twice; the state parameter is what guards it.",
  },
  "billing/overage": {
    bound: "none",
    why: "the telegram path is three hops away, through cost-alerts: a notification the account holder asked for, sent on a state change rather than per request.",
  },

  // --- READS AND CRUD, whose spend kind is a closure artefact ---
  // These six surfaced the day the reserve detector was tightened from a
  // mention to a CALL. None of them spends: each imports a module that
  // ALSO holds a provider URL or a storage read for some other route. They
  // are listed rather than filtered out, because the filter that would
  // have removed them is the filter that removes real ones.
  "agents": { bound: "artefact", why: "creates an agent row; the telegram URL is in delivery-channels, which the RUN path uses, not this one" },
  "agents/[id]": { bound: "artefact", why: "edits or deletes an agent row; same closure, same reason as POST /api/agents" },
  "voice/usage": { bound: "artefact", why: "reads a usage counter; the elevenlabs URL is a constant in voice-providers, which this route imports to say whether voice is configured" },
  "websites/storage-usage": { bound: "artefact", why: "sums the bytes the account already stores; the storage read is the sum itself, and it is what the quota screen shows" },
  "integrations/[provider]/connect": { bound: "artefact", why: "mints an OAuth state and redirects; it is rate limited on integration_connect, but nothing here spends, so the limit is not what excuses it" },
  "cron/monthly-credits": { bound: "artefact", why: "cron, guarded by CRON_SECRET; it GRANTS credits rather than consuming anything" },

  // --- not a user-facing route at all ---
  "cron/website-storage-cleanup": { bound: "none", why: "cron, guarded by CRON_SECRET; the caller is Vercel and there is no user to charge" },
  "system-health/files": { bound: "none", why: "owner-only (isAdminEmail); writes and removes one canary object per call" },
  "import/csv/apply": { bound: "limited", scope: "import_apply", why: "scope import_apply; the model call it makes was reserved by import/csv/analyse" },
};

// ---------------------------------------------------------------------
// 1. Nothing spends outside the system without saying so.
// ---------------------------------------------------------------------
const undeclared = spending
  .filter((c) => !c.reserved && !DECLARED[shortName(c.route)])
  .map((c) => `${shortName(c.route)} [${c.kinds.join(",")}]`);
check(
  "every route that spends either reserves credits or is declared below",
  undeclared,
  []
);
if (undeclared.length) {
  console.log("        Add an entry to DECLARED saying what bounds it, or make it reserve.");
  console.log("        'It does not charge' is an answer to one question; 'what stops a thousand of these'");
  console.log("        is the other, and the four PDF routes answered the first and not the second.");
}

// ---------------------------------------------------------------------
// 2. A declared bound is verified against the tree, not believed.
// ---------------------------------------------------------------------
const brokenClaims = [];
for (const [name, entry] of Object.entries(DECLARED)) {
  const found = classified.find((c) => shortName(c.route) === name);
  if (!found) {
    brokenClaims.push(`${name}: declared here but there is no such route`);
    continue;
  }
  if (found.kinds.length === 0) {
    brokenClaims.push(`${name}: declared as spending, but nothing in it spends any more — delete the entry`);
    continue;
  }
  if (entry.bound === "limited") {
    if (!found.limited) {
      brokenClaims.push(`${name}: declared "limited", but no checkRateLimit is reachable within one hop`);
    } else if (!entry.scope) {
      brokenClaims.push(`${name}: declared "limited" without naming the scope it consumes`);
    } else {
      const reach = [...reachableFrom(found.route)].filter(([, d]) => d <= 1).map(([f]) => SOURCE.get(f) || "");
      if (!reach.some((t) => t.includes(`"${entry.scope}"`))) {
        brokenClaims.push(`${name}: declared scope ${entry.scope}, but no reachable file names it`);
      }
    }
    // A limiter whose answer is never acted on is a counter. The route has
    // to be able to refuse.
    if (!/\b429\b/.test(SOURCE.get(found.route) || "")) {
      brokenClaims.push(`${name}: declared "limited", but the route never answers 429`);
    }
  }
  if (entry.bound === "none" && found.limited) {
    brokenClaims.push(`${name}: declared unbounded, but it IS rate limited now — say "limited"`);
  }
  if (!["limited", "none", "artefact"].includes(entry.bound)) {
    brokenClaims.push(`${name}: bound "${entry.bound}" is not one of limited / none / artefact`);
  }
  if (!entry.why || entry.why.length < 30) {
    brokenClaims.push(`${name}: the reason is too short to be an argument`);
  }
}
check("every declared bound is still true of the tree", brokenClaims, []);

// ---------------------------------------------------------------------
// 3. The inventory does not grow stale in the other direction either.
// ---------------------------------------------------------------------
const nowReserving = Object.keys(DECLARED).filter((name) => {
  const found = classified.find((c) => shortName(c.route) === name);
  return found && found.reserved;
});
check("no declared route has quietly started reserving (remove its entry)", nowReserving, []);

// ---------------------------------------------------------------------
// 3b. A ROUTE THAT REACHES A MODEL CALL AND DOES NOT ITSELF RESERVE.
//
// "Reserving within one hop" is what section 1 accepts, and for most
// routes the hop is their own estimator. For five it is not: three job
// readers, /api/jobs/[id]/continue and /api/research/[id]/continue reach
// reserveCredits through the runner they share, and the hold those
// routes rely on was taken by a DIFFERENT request — the one that started
// the job. So the question "what stops a thousand calls to continue" is
// not answered by the reservation at all.
//
// It is answered by an ATOMIC CLAIM: a conditional UPDATE that flips a
// flag only if it was not already set (`.eq("running", false)` /
// chunk_running), so of a thousand concurrent calls exactly one proceeds
// and the rest find the job already claimed. That is a real bound and it
// was the seventh kind in this tree; a census of bounds is only as honest
// as its list of what counts as one.
//
// Measured 2026-09-17: zero routes reach a model call with nothing
// bounding them.
// ---------------------------------------------------------------------
const CLAIMS = /claimJob\s*\(|claimChunk\s*\(|claim_activation_run|\.eq\(\s*"running"\s*,\s*false\s*\)/;
// "What stops a loop", not "does it reserve". A cron behind CRON_SECRET
// has no caller to loop it; a rate-limited route is bounded whether or
// not it also holds credits. Both were in the first version of this list
// as neither, which called five correct routes unbounded.
const BOUNDS_ITSELF = /\breserveCredits\s*\(|\bstartJob\s*\(|checkRateLimit\s*\(|checkCronAuth\s*\(/;
const modelRoutes = classified.filter((c) => c.kinds.includes("model"));
checkTrue(`routes that reach a model call (${modelRoutes.length})`, modelRoutes.length >= 20, "the model detector matched almost nothing");

const CONTINUES_SOMEBODY_ELSES_HOLD = {
  "jobs/[id]/continue": {
    bound: "job_claim",
    why: "the hold was taken by the request that STARTED the job. This one verifies `user.id !== job.user_id`, refuses a job that is not active, and then claimJob does a conditional UPDATE on `running = false`, so concurrent calls resolve to exactly one runner.",
  },
  "research/[id]/continue": {
    bound: "job_claim",
    why: "the same shape one feature over: ownership by `.eq(\"user_id\", user.id)`, a status gate on researching/synthesising, and claimChunk as the compare-and-set. The reservation id is carried on the report row from the request that began it.",
  },
  "jobs/[id]": { bound: "reads_only", why: "a GET that returns one job's status to its owner; the model call is three hops away in the handler the job TYPE names, not in anything this route runs." },
  jobs: { bound: "reads_only", why: "the list of the caller's own jobs; same closure artefact as the single-job read above." },
  "websites/generate": {
    bound: "affordability_then_process",
    why: "it queues rather than generates: the model call and the hold both live in /api/websites/generate/process, against the SAME estimate this route computes. What stops a loop here is hasEnoughCredits — an account that cannot afford the generation is refused before the row is written, so the queue cannot outrun the balance.",
  },
  "voice/usage": { bound: "reads_only", why: "reads a usage counter; the provider URL is a constant in voice-providers, imported to say whether voice is configured at all." },
};
const unboundModel = modelRoutes
  .filter((c) => !BOUNDS_ITSELF.test(SOURCE.get(c.route)))
  .filter((c) => !CONTINUES_SOMEBODY_ELSES_HOLD[shortName(c.route)])
  .map((c) => shortName(c.route));
check(
  "every route that reaches a model call either reserves, or says what else stops a loop",
  unboundModel,
  []
);

const claimBroken = [];
for (const [name, entry] of Object.entries(CONTINUES_SOMEBODY_ELSES_HOLD)) {
  const found = modelRoutes.find((c) => shortName(c.route) === name);
  if (!found) {
    claimBroken.push(`${name}: declared here but no longer reaches a model call`);
    continue;
  }
  if (BOUNDS_ITSELF.test(SOURCE.get(found.route))) {
    claimBroken.push(`${name}: it bounds itself now — drop the entry`);
  }
  if (entry.bound === "job_claim" && !CLAIMS.test(SOURCE.get(found.route))) {
    claimBroken.push(`${name}: declared bounded by an atomic claim, and there is none`);
  }
  // THE REFUSAL, not the call. A mutant that replaced the call with a
  // `{ ok: true }` literal left the NAME behind in its type annotation,
  // and a presence check went on calling the route bounded. What has to
  // be there is the branch that turns a negative answer into a refusal.
  if (entry.bound === "affordability_then_process") {
    const src = SOURCE.get(found.route);
    // THE REFUSAL ON THE FULL ESTIMATE, paired with the call that made
    // it. This route asks hasEnoughCredits TWICE — once for the tiny
    // clarification precheck and once for the whole generation — so
    // "contains a refusal branch" passed with the second one deleted.
    // What bounds the queue is the second.
    if (!/hasEnoughCredits\s*\(\s*user\.id\s*,\s*estimatedCost[\s\S]{0,120}?if\s*\(\s*!\s*[A-Za-z_$][\w$]*\.ok\s*\)/.test(src)) {
      claimBroken.push(`${name}: declared bounded by an affordability refusal on the full estimate, and that pair is not there`);
    }
  }
  if (!entry.why || entry.why.length < 60) claimBroken.push(`${name}: the reason is too short to be an argument`);
}
check("every claim-bounded route still holds its claim", claimBroken, []);

// ---------------------------------------------------------------------
// 4. POSITIVE CONTROLS — they drive classifyRoute, they do not describe it.
//    A control that re-states the regex passes while the regex is wrong.
// ---------------------------------------------------------------------
const chat = classified.find((c) => shortName(c.route) === "chat");
checkTrue("control: /api/chat classifies as a model spender", Boolean(chat && chat.kinds.includes("model")), "the model detector is not matching the largest model route in the tree");
checkTrue("control: /api/chat classifies as reserving", Boolean(chat && chat.reserved), "the reserve detector is not matching the route that reserves on every message");

const pptx = classified.find((c) => shortName(c.route) === "presentations/[id]/pptx");
checkTrue("control: the .pptx export is seen to spend compute", Boolean(pptx && pptx.kinds.includes("compute")), "pptxgenjs is no longer detected");
checkTrue("control: the .pptx export is seen to be limited, not reserving", Boolean(pptx && pptx.limited && !pptx.reserved), "export-guard.ts is not reachable within one hop of the route");

// A route with no spend of any kind must classify as none, or every
// assertion above is measuring the whole tree rather than the spenders.
const quiet = classified.filter((c) => c.kinds.length === 0);
checkTrue(`control: some routes spend nothing at all (${quiet.length})`, quiet.length >= 10, "EVERY route matched a spend kind — the classifier is matching something ubiquitous");

// And the classifier must actually look at the text it is given: an empty
// reachable set can produce no kinds, which is what makes the floors above
// necessary rather than decorative.
const blind = classifyRoute("src/app/api/chat/route.ts", new Map());
check("control: classifying with nothing reachable finds nothing", blind.kinds, []);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
