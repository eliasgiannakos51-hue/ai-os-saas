// THE SCAN THAT RUNS ON EVERY PUSH ACTUALLY SCANS, not just prints.
//
// scripts/security/push-secret-scan.mjs is new with Βήμα 2 (CI for a
// private repository, 2026-10-21): the owner asked for "secret scan ...
// on every push", and a full walk of all of history is too slow for
// that. This file is the one that has to be fast AND right, so it is
// exercised against a REAL throwaway git repository, not read as text: a
// regex that looks right and a script that is wired to the wrong ref
// both read the same on paper.
//
// Run: node scripts/tests/push-secret-scan.test.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const SCRIPT = resolve("scripts/security/push-secret-scan.mjs");
const FAKE_ANTHROPIC_KEY = "sk-ant-api03-" + "x".repeat(40);
const FAKE_AWS_KEY = "AKIA" + "Q".repeat(16);

function sh(cmd, cwd) {
  return execFileSync("sh", ["-c", cmd], { cwd, encoding: "utf8" }).trim();
}

function initRepo() {
  const dir = mkdtempSync(join(tmpdir(), "push-secret-scan-"));
  sh("git init -q", dir);
  sh("git config user.email t@example.com", dir);
  sh("git config user.name test", dir);
  return dir;
}

function commit(dir, files, message) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  sh("git add -A", dir);
  sh(`git commit -q -m ${JSON.stringify(message)}`, dir);
  return sh("git rev-parse HEAD", dir);
}

function scan(dir, base, head = "HEAD") {
  try {
    const out = execFileSync("node", [SCRIPT], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, SCAN_BASE: base, SCAN_HEAD: head },
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

console.log("== 1. a credential-shaped string added in a push is caught ==");
{
  const dir = initRepo();
  try {
    const base = commit(dir, { "a.txt": "hello\n" }, "base");
    const head = commit(dir, { "a.txt": `hello\nANTHROPIC_API_KEY=${FAKE_ANTHROPIC_KEY}\n` }, "add a key");
    const { code, out } = scan(dir, base, head);
    ok("the scan exits non-zero", code === 1, out);
    ok("...and names the shape it matched", out.includes("Anthropic API key"), out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n== 2. an ordinary change is left alone ==");
{
  const dir = initRepo();
  try {
    const base = commit(dir, { "a.txt": "hello\n" }, "base");
    const head = commit(dir, { "a.txt": "hello\nworld\n" }, "add a line");
    const { code, out } = scan(dir, base, head);
    ok("the scan exits zero on an unremarkable diff", code === 0, out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n== 3. REMOVING a credential-shaped line is not reported as adding one ==");
{
  const dir = initRepo();
  try {
    // base ALREADY has the key (as if it leaked earlier and is now being
    // cleaned up) — the push under test only deletes it.
    const base = commit(dir, { "a.txt": `ANTHROPIC_API_KEY=${FAKE_ANTHROPIC_KEY}\n` }, "base, already leaked");
    const head = commit(dir, { "a.txt": "ANTHROPIC_API_KEY=redacted\n" }, "redact it");
    const { code, out } = scan(dir, base, head);
    ok("deleting a leaked-looking line scans clean", code === 0, out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n== 4. a test fixture's fake key is excluded by its own filename ==");
{
  const dir = initRepo();
  try {
    const base = commit(dir, { "a.txt": "hello\n" }, "base");
    const head = commit(
      dir,
      { "scripts/tests/fake-provider.test.mjs": `const FAKE = "${FAKE_ANTHROPIC_KEY}";\n` },
      "add a stand-in key in a test"
    );
    const { code, out } = scan(dir, base, head);
    ok("a .test.mjs fixture does not trip the scan", code === 0, out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n== 5. an unreachable base (a brand-new branch's first push) still scans the tree ==");
{
  // github.event.before is the all-zero SHA for a branch's first push.
  // That ref resolves to nothing in this shallow checkout, and the
  // script's own fallback — diff against git's empty-tree hash — must
  // still catch a key that is simply present in the committed tree.
  const dir = initRepo();
  try {
    commit(dir, { "a.txt": `ANTHROPIC_API_KEY=${FAKE_ANTHROPIC_KEY}\n` }, "first commit, carries a key");
    const { code, out } = scan(dir, "0000000000000000000000000000000000000000");
    ok("the fallback path still finds it", code === 1, out);
    ok("...and says it fell back", out.includes("not reachable"), out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n== 6. more than one provider shape is actually wired up, not just Anthropic's ==");
{
  const dir = initRepo();
  try {
    const base = commit(dir, { "a.txt": "hello\n" }, "base");
    const head = commit(dir, { "a.txt": `AWS_KEY=${FAKE_AWS_KEY}\n` }, "add an AWS-shaped key");
    const { code, out } = scan(dir, base, head);
    ok("an AWS-shaped key is caught too", code === 1 && out.includes("AWS access key id"), out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
