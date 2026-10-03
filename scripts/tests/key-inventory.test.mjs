// THE KEY INVENTORY SAYS WHAT THE CODE DOES, AND ITS CHECK NEVER SHOWS A KEY.
//
// src/lib/ai/providers/key-inventory.ts answers the owner's §1.0 question
// (docs/v6-master.md): which keys are set, which work, and which are read
// by nothing. Its `readBy` is the part that can lie — a key listed as read
// by a file that stopped reading it, or listed as read by nothing after an
// adapter landed — so this holds it to src/ both ways. The rest holds
// checkKey() to its promise: a status and an HTTP code, never the key or
// the provider's body, and the route that runs it to the owner alone.
//
// Run: node scripts/tests/key-inventory.test.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const INVENTORY = "src/lib/ai/providers/key-inventory.ts";
const ROUTE = "src/app/api/system-health/keys/route.ts";
const PAGE = "src/app/dashboard/system-health/page.tsx";
const PANEL = "src/components/system-health/key-checks.tsx";

const { KEY_INVENTORY, checkKey, statusFromHttp, keyVarFor } = await loadTs(INVENTORY);

// Files that NAME every variable without reading it for a feature: the
// inventory itself, and the registry of documented settings.
const NAMERS = new Set([INVENTORY, "src/lib/env-check.ts"]);

// One entry has more readers than are worth listing. Checked both ways:
// if its direct readers ever fall to the ones listed, this is stale.
const MANY_READERS = {
  anthropic: "dozens of routes call Anthropic directly; readBy names the router's path",
};

const sources = readdirSync("src", { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile() && /\.tsx?$/.test(d.name))
  .map((d) => join(d.parentPath ?? d.path, d.name).replaceAll("\\", "/"))
  .filter((f) => !NAMERS.has(f));
const code = new Map(sources.map((f) => [f, stripComments(readFileSync(f, "utf8"))]));
const readsVar = (text, name) =>
  new RegExp(`process\\.env\\.${name}\\b`).test(text) || text.includes(`"${name}"`);
const readersOf = (entry) =>
  [...code].filter(([, text]) => entry.envVars.some((v) => readsVar(text, v))).map(([f]) => f);

console.log("== 1. the scan sees the code ==");
check(`the walk found source files (${code.size})`, code.size >= 300, `${code.size}`);
check(
  "a known reader is found (VAPID_PRIVATE_KEY in src/lib/push/web-push.ts)",
  readsVar(code.get("src/lib/push/web-push.ts") ?? "", "VAPID_PRIVATE_KEY"),
);
check(`the inventory has its ten entries (${KEY_INVENTORY.length})`, KEY_INVENTORY.length === 10);

console.log("\n== 2. readBy matches src/, both ways ==");
for (const entry of KEY_INVENTORY) {
  const actual = readersOf(entry);
  for (const file of entry.readBy) {
    check(
      `${entry.id}: ${file} reads ${entry.envVars.join(" or ")}`,
      existsSync(file) && actual.includes(file),
      existsSync(file) ? "the file does not read any of them" : "the file does not exist",
    );
  }
  if (entry.readBy.length === 0) {
    check(`${entry.id}: read by nothing, as it says`, actual.length === 0, `read by: ${actual.join(", ")}`);
  } else {
    const unlisted = actual.filter((f) => !entry.readBy.includes(f));
    if (MANY_READERS[entry.id]) {
      check(`${entry.id}: the many-readers exception still holds (${unlisted.length} more)`, unlisted.length >= 2);
    } else {
      check(`${entry.id}: no reader is left off readBy`, unlisted.length === 0, unlisted.join(", "));
    }
  }
}
for (const id of Object.keys(MANY_READERS)) {
  check(`the many-readers exception names a real entry (${id})`, KEY_INVENTORY.some((e) => e.id === id));
}

console.log("\n== 3. the inventory and the documented settings agree ==");
const example = readFileSync(".env.local.example", "utf8");
for (const entry of KEY_INVENTORY) {
  for (const v of entry.envVars) {
    check(`${v} is in .env.local.example`, new RegExp(`^${v}=`, "m").test(example));
  }
  check(`${entry.id}: says what it is for`, entry.roles.length > 0);
  check(
    `${entry.id}: a key nothing reads says what is missing`,
    entry.readBy.length > 0 || (entry.missing ?? "").length > 0,
  );
}

console.log("\n== 4. checkKey: statuses ==");
const anthropic = KEY_INVENTORY.find((e) => e.id === "anthropic");
const ideogram = KEY_INVENTORY.find((e) => e.id === "ideogram");
const google = KEY_INVENTORY.find((e) => e.id === "google");
const statusOf = async (http) => {
  const fake = async () => new Response("{}", { status: http });
  return (await checkKey(anthropic, { ANTHROPIC_API_KEY: "sk-test" }, fake)).status;
};
for (const [http, want] of [[200, "ok"], [401, "invalid"], [403, "forbidden"], [404, "unknown-endpoint"], [429, "rate-limited"], [500, "unreachable"]]) {
  check(`HTTP ${http} -> ${want}`, (await statusOf(http)) === want && statusFromHttp(http) === want);
}
let called = 0;
const counting = async () => (called++, new Response("{}", { status: 200 }));
check("an unset key is not-set, and no call is made", (await checkKey(anthropic, {}, counting)).status === "not-set" && called === 0);
check("a blank key counts as unset", (await checkKey(anthropic, { ANTHROPIC_API_KEY: "  " }, counting)).status === "not-set" && called === 0);
check("a provider with no free call is no-check, and no call is made", (await checkKey(ideogram, { IDEOGRAM_API_KEY: "k" }, counting)).status === "no-check" && called === 0);
check("the second name is accepted (GEMINI_API_KEY)", keyVarFor(google, { GEMINI_API_KEY: "g" }) === "GEMINI_API_KEY");
check("the canonical name wins when both are set", keyVarFor(google, { GEMINI_API_KEY: "g", GOOGLE_API_KEY: "o" }) === "GOOGLE_API_KEY");
const throwing = async () => {
  throw new Error("network down");
};
check("a network error is unreachable, not a throw", (await checkKey(anthropic, { ANTHROPIC_API_KEY: "k" }, throwing)).status === "unreachable");
const hanging = (_url, init) =>
  new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
// Raced against this gate's own clock: without the abort, checkKey would
// never settle and the gate would hang instead of going red.
let guard;
const timedOut = await Promise.race([
  checkKey(anthropic, { ANTHROPIC_API_KEY: "k" }, hanging, 50),
  new Promise((resolve) => (guard = setTimeout(() => resolve({ status: "hung for 2s" }), 2000))),
]);
clearTimeout(guard);
check("a hanging provider times out as unreachable", timedOut.status === "unreachable", timedOut.status);

console.log("\n== 5. the key never comes back ==");
const SECRET = "sk-ant-THIS-MUST-NOT-ECHO-1234";
let sentHeaders = null;
let sentMethod = null;
const echo = async (_url, init) => {
  sentHeaders = JSON.stringify(init.headers);
  sentMethod = init.method;
  return new Response(JSON.stringify({ echoed: SECRET, headers: init.headers }), { status: 200 });
};
const result = await checkKey(anthropic, { ANTHROPIC_API_KEY: SECRET }, echo);
check("the key was sent to the provider", (sentHeaders ?? "").includes(SECRET));
check("the check is a GET (a read, never a generation)", sentMethod === "GET");
check("the result does not carry the key, even when the provider echoes it", !JSON.stringify(result).includes(SECRET));
check("the result carries the variable NAME", result.envVar === "ANTHROPIC_API_KEY");
for (const entry of KEY_INVENTORY.filter((e) => e.check)) {
  check(`${entry.id}: the check URL is https and carries no key in it`, /^https:\/\//.test(entry.check.url) && !entry.check.url.includes("key="));
}

console.log("\n== 6. the route and the screen ==");
const route = stripComments(readFileSync(ROUTE, "utf8"));
const adminAt = route.indexOf("isAdminEmail(user.email)");
const checkAt = route.indexOf("checkKey(");
check("the route answers the owner alone, before any provider is called", adminAt > 0 && checkAt > adminAt);
check("a non-owner gets 404, so the route does not advertise itself", /isAdminEmail\(user\.email\)\)\s*return NextResponse\.json\([^)]*status:\s*404/.test(route));
check("the route returns checkKey's results, not the environment", /results\s*}/.test(route) && !/process\.env\[/.test(route));
const panel = stripComments(readFileSync(PANEL, "utf8"));
check("the panel does not import the provider layer", !/ai\/providers/.test(panel));
{
  const { KEY_STATUSES } = await loadTs(INVENTORY);
  const panelStatuses = [...(panel.match(/type KeyStatus =([^;]+);/)?.[1] ?? "").matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  const labelled = [...(panel.match(/STATUS_TEXT[^=]*=\s*{([\s\S]*?)\n};/)?.[1] ?? "").matchAll(/^\s*"?([a-z-]+)"?:/gm)].map((m) => m[1]);
  check(
    `the panel's statuses are the inventory's (${KEY_STATUSES.length})`,
    panelStatuses.length === KEY_STATUSES.length && KEY_STATUSES.every((k) => panelStatuses.includes(k)),
    `panel: ${panelStatuses.join(", ")}`,
  );
  check(
    "every status has words on the panel",
    KEY_STATUSES.every((k) => labelled.includes(k)),
    `labelled: ${labelled.join(", ")}`,
  );
}
check("the panel says when a key is set and read by nothing", /No code reads this key yet — it is set, and does nothing/.test(panel) && /row\.set \? UNREAD_BUT_SET : UNREAD/.test(panel));
const page = stripComments(readFileSync(PAGE, "utf8"));
check("the page renders the panel", /<KeyChecks rows={keyRows} \/>/.test(page));
check("the page passes whether a key is set, as a boolean", /set:\s*keyVarFor\(entry,\s*process\.env\)\s*!==\s*null/.test(page));

console.log(
  failures.length === 0
    ? `\nALL PASS: ${pass} passed, 0 failed`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
