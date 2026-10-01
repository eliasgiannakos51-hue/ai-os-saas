/*
 * FOUR PROMISES A CONNECTOR MAKES, AND NOTHING HELD ANY OF THEM.
 *
 * Run: node scripts/tests/connector-safety.test.mjs
 *
 * The Gmail, Drive and Slack integrations are built and they are built
 * carefully: read-only scopes, PKCE, a signed cookie-bound CSRF state,
 * tokens encrypted with a key that is not in the database, and every
 * fetched item wrapped as untrusted before it reaches the model. All
 * four were confirmed by hand on 2026-09-30 and all four were held by
 * NOTHING — a `gmail.modify` added tomorrow, or one fetch path that
 * forgot the wrapper, would ship green.
 *
 * That is the worst shape for a security property: correct today,
 * unguarded, and invisible when it stops being correct. These are the
 * four, each checked by what the code DOES rather than by a comment
 * saying it does.
 *
 * THE POPULATION IS THE PROVIDER LIST, derived — so a fourth provider
 * added tomorrow is held to the same rules without anyone remembering
 * to come back here.
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

const providers = await loadTs("src/lib/integrations/providers.ts");
// NAMED ONCE, WITH NO FALLBACK. The first draft wrote
// `PROVIDERS ?? INTEGRATION_PROVIDERS ?? []`, and test-export-drift
// refused it: the second name is not exported by anything, so the
// chain's only real effect was a `[]` that would make every check below
// pass over nothing. A defensive fallback to a symbol that does not
// exist is the vacuity shape wearing a careful face.
const LIST = providers.PROVIDERS;

// ---------------------------------------------------------------------
console.log("== 1. read-only by default, and every write is named ==");

check(`there are providers to check (${LIST.length})`, LIST.length >= 2, JSON.stringify(LIST.map((p) => p.id)));

// A WRITE SCOPE IS ANYTHING THAT IS NOT PLAINLY A READ. Listed as the
// negative rather than the positive: a new scope nobody thought about
// is a write until somebody says otherwise, which is the safe default
// for a list that grows.
const READ_ONLY = /(\.readonly$|:read$|:history$|^users:read$|\.read$)/;

// THE ONE WRITE, NAMED WITH ITS REASON AND CHECKED BOTH WAYS. Slack's
// chat:write exists so an agent can deliver its result into a channel
// the USER configured as a delivery target (lib/agents/deliver.ts). It
// is the only write this product performs against any provider, and
// lib/integrations/read.ts says so above the one function that does it.
const ALLOWED_WRITE = { slack: ["chat:write"] };

for (const p of LIST) {
  const writes = (p.scopes ?? []).filter((s) => !READ_ONLY.test(s));
  const allowed = ALLOWED_WRITE[p.id] ?? [];
  const unexpected = writes.filter((s) => !allowed.includes(s));
  check(`${p.id}: no write scope beyond the ones named here`, unexpected.length === 0,
    `${unexpected.join(", ")} — a write scope must be added to ALLOWED_WRITE with its reason`);
  // BOTH WAYS. An allowance that outlives its scope is a licence to add
  // a different write silently.
  for (const s of allowed) {
    check(`${p.id}: the allowance for "${s}" is still used`, (p.scopes ?? []).includes(s),
      "the scope is gone; delete the allowance in the same commit");
  }
}

// ---------------------------------------------------------------------
console.log("\n== 2. what a stranger wrote never reaches the model unmarked ==");

// The attack, in the owner's own words: an email that says "ignore your
// previous instructions". The content of a connected account is written
// by whoever sent it, so it is data and must arrive marked as data.
const tool = stripComments(readFileSync("src/lib/integrations/chat-tool.ts", "utf8"));
check("the fetched items are wrapped before they are returned",
  /wrapUntrusted\(/.test(tool),
  "content from a connected account reaches the model as ordinary text");

// AND NO PATH AROUND IT. Every `return { content: ... }` that carries
// fetched items must go through the wrapper; the ones that do not are
// the harness's own refusals, which carry no fetched text at all.
const returns = [...tool.matchAll(/content:\s*([^,\n]+)/g)].map((m) => m[1].trim());
const carriesItems = returns.filter((r) => /format|items|result/i.test(r));
check(`there are content returns to check (${returns.length}, ${carriesItems.length} carry fetched text)`,
  returns.length >= 3 && carriesItems.length >= 1, returns.join(" | "));
check("every return that carries fetched text wraps it",
  carriesItems.every((r) => r.includes("wrapUntrusted")),
  carriesItems.filter((r) => !r.includes("wrapUntrusted")).join(" | "));

// ---------------------------------------------------------------------
console.log("\n== 3. a token is never written down in the clear ==");

const store = stripComments(readFileSync("src/lib/integrations/store.ts", "utf8"));
check("the access token is stored encrypted", /access_token_encrypted:\s*encryptSecret\(/.test(store),
  "the column is written with something other than encryptSecret");
check("...and so is the refresh token", /refresh_token_encrypted[\s\S]{0,120}encryptSecret\(/.test(store),
  "a refresh token is the long-lived one — it matters more, not less");
check("...each under its own context, so one ciphertext cannot be replayed as another",
  /tokenContext\(userId, provider, "access"\)/.test(store) && /tokenContext\(userId, provider, "refresh"\)/.test(store),
  "the same context for both means an access ciphertext decrypts as a refresh token");

const crypto = stripComments(readFileSync("src/lib/integrations/crypto.ts", "utf8"));
check("encryption REFUSES rather than falling back to plaintext when the key is absent",
  /throw/.test(crypto.slice(crypto.indexOf("export function encryptSecret"), crypto.indexOf("export function decryptSecret"))),
  "a missing key would store the token in the clear");

// ---------------------------------------------------------------------
console.log("\n== 4. one write path, and it is the one that is named ==");

// Derived: every HTTP call in the integration layer that is not a GET.
const read = stripComments(readFileSync("src/lib/integrations/read.ts", "utf8"));
const posts = [...read.matchAll(/fetch\("(https:\/\/[^"]+)"[\s\S]{0,200}?method:\s*"(POST|PUT|PATCH|DELETE)"/g)]
  .map((m) => `${m[2]} ${m[1]}`);
check(`the write census found calls to classify (${posts.length})`, posts.length >= 1, posts.join(", "));
check("the only non-GET call against a provider is the Slack delivery",
  posts.length === 1 && posts[0].includes("chat.postMessage"),
  posts.join(", ") + " — a new write must be named here and in ALLOWED_WRITE");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
