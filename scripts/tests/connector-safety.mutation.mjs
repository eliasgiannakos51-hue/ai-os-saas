#!/usr/bin/env node
/*
 * WOULD A CONNECTOR STILL BE SAFE TO CONNECT?
 *
 * Run: node scripts/tests/connector-safety.mutation.mjs
 *
 * Every defect below ships green and looks like a feature. A wider
 * scope reads as "now it can do more". A dropped wrapper reads as
 * "cleaner code". A plaintext fallback reads as "works without the key
 * configured". None of them breaks a screen, and the first sign of any
 * of them is somebody else's mailbox.
 *
 * SIX MUTANTS, one per promise and two on the one that matters most.
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/connector-safety.test.mjs";
const PROVIDERS = "src/lib/integrations/providers.ts";
const TOOL = "src/lib/integrations/chat-tool.ts";
const STORE = "src/lib/integrations/store.ts";
const READ = "src/lib/integrations/read.ts";

const MUTANTS = [
  {
    // THE SCOPE WIDENS. gmail.modify can delete mail. It is one word
    // longer than the scope that is there, and no screen changes.
    name: "Gmail asks to modify, not only to read",
    file: PROVIDERS,
    from: 'scopes: ["https://www.googleapis.com/auth/gmail.readonly"],',
    to: 'scopes: ["https://www.googleapis.com/auth/gmail.modify"],',
    expect: "no write scope beyond",
  },
  {
    // THE ALLOWANCE OUTLIVES ITS SCOPE — a licence to add a different
    // write later without anybody noticing this one went.
    name: "the Slack write allowance is left behind after the scope goes",
    file: PROVIDERS,
    from: '"channels:read", "channels:history", "chat:write", "users:read"',
    to: '"channels:read", "channels:history", "users:read"',
    expect: 'allowance for "chat:write" is still used',
  },
  {
    // THE BOUNDARY GOES. An email saying "ignore your previous
    // instructions" arrives as an instruction.
    name: "fetched email reaches the model unmarked",
    file: TOOL,
    from: "content: wrapUntrusted(formatItemsForModel(result.items)),",
    to: "content: formatItemsForModel(result.items),",
    expect: "wraps it",
  },
  {
    // THE TOKEN IN THE CLEAR. The database becomes the only thing
    // between a leaked backup and everybody's mailbox.
    name: "the access token is stored as it arrived",
    file: STORE,
    from: 'access_token_encrypted: encryptSecret(tokens.accessToken, tokenContext(userId, provider, "access")),',
    to: "access_token_encrypted: tokens.accessToken,",
    expect: "stored encrypted",
  },
  {
    // ONE CONTEXT FOR BOTH. An access ciphertext then decrypts as a
    // refresh token — the long-lived one.
    name: "both tokens share one encryption context",
    file: STORE,
    from: 'tokenContext(userId, provider, "refresh")',
    to: 'tokenContext(userId, provider, "access")',
    expect: "own context",
  },
  {
    // A SECOND WRITE PATH, added quietly. This is the one that ends
    // with somebody's mail deleted.
    name: "a second write path is added to the integration layer",
    file: READ,
    from: 'const response = await fetch("https://slack.com/api/chat.postMessage", {\n      method: "POST",',
    to: 'await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/x/trash", {\n      method: "POST",\n    });\n    const response = await fetch("https://slack.com/api/chat.postMessage", {\n      method: "POST",',
    expect: "only non-GET call",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 300_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("connector-safety mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const baseline = runGate();
  if (!baseline.green) {
    console.log("BASELINE IS ALREADY RED — fix the gate before measuring it.");
    console.log(baseline.failed.map((f) => `  ${f}`).join("\n"));
    process.exit(1);
  }
  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("A connector that gains a write scope, or drops the untrusted marker, goes red here first.");
