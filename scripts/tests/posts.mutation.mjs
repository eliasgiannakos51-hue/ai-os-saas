#!/usr/bin/env node
/*
 * CAN posts.test.mjs TELL A POST WRITER FROM A CLAIM OF ONE?
 *
 * Every clause in the gate that could pass over a broken feature is put
 * to the test here: a ceiling the parser stops applying, a hashtag line
 * that stops counting, a platform nobody asked for that is kept, a hold
 * sized from the brief instead of the platforms, a stopped run that keeps
 * the hold, an unusable answer refunded as if the tokens were free, a
 * row stamped with a user id the browser sent, a publisher that sneaks
 * into the route, the copy button that stops copying, the migration that
 * lets the person insert their own receipt, and the row sliding back
 * into hiding in the sidebar. And the gate going blind: the locale list
 * shrinking to one.
 *
 * Run: node scripts/tests/posts.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/posts.test.mjs";
const CONTRACT = "src/lib/posts/platforms.ts";
const PROMPT = "src/lib/posts/prompt.ts";
const GENERATE = "src/lib/posts/generate.ts";
const ROUTE = "src/app/api/posts/generate/route.ts";
const WORKSPACE = "src/components/posts/posts-workspace.tsx";
const NAV = "src/lib/sidebar-nav.ts";
const MIGRATION = "supabase/migrations/20260930000000_generated_posts.sql";
const ZH = "messages/zh.json";

const TARGETS = [GATE, CONTRACT, PROMPT, GENERATE, ROUTE, WORKSPACE, NAV, MIGRATION, ZH];

const MUTANTS = [
  // ---- the contract ------------------------------------------------
  {
    name: "the parser stops cutting the body to the platform's ceiling",
    file: CONTRACT,
    from: "    const text = cutToLength(body, Math.max(1, spec.maxChars - hashtagLine));",
    to: "    const text = body;",
    expect: "an over-long body is cut to its platform's ceiling",
  },
  {
    name: "the hashtag line stops counting against the ceiling",
    file: CONTRACT,
    from: '    const hashtagLine = hashtags.length > 0 ? hashtags.join(" ").length + 2 : 0;',
    to: "    const hashtagLine = 0;",
    expect: "the hashtag line counts against the ceiling",
  },
  {
    name: "an eleventh hashtag survives",
    file: CONTRACT,
    from: "      if (hashtags.length >= spec.maxHashtags) break;\n",
    to: "",
    expect: "hashtags are capped per platform",
  },
  {
    // TWO EDITS, because the parser drops an unrequested platform twice:
    // the guard skips it on the way in, and the final map walks the
    // REQUESTED list on the way out. Removing the guard alone changes
    // nothing a caller can see — the first run of this suite proved it
    // (MISSED) — so the mutant that tests the clause takes both away.
    name: "a platform nobody asked for is kept",
    edits: [
      {
        file: CONTRACT,
        from: "    if (!isPostPlatform(p.platform) || !context.platforms.includes(p.platform) || byPlatform.has(p.platform)) continue;",
        to: "    if (!isPostPlatform(p.platform) || byPlatform.has(p.platform)) continue;",
      },
      {
        file: CONTRACT,
        from: "  const posts = context.platforms.map((p) => byPlatform.get(p)).filter((p): p is Post => Boolean(p));",
        to: "  const posts = [...byPlatform.values()];",
      },
    ],
    expect: "a platform that was not asked for is dropped",
  },
  {
    name: "the estimate holds for one platform however many were asked for",
    file: CONTRACT,
    from: "  return Math.max(0, descriptionChars) + allowance;",
    to: "  return Math.max(0, descriptionChars) + PLATFORMS.x.outputAllowanceChars;",
    expect: "the estimate grows with every platform asked for",
  },
  // ---- the call ------------------------------------------------------
  {
    name: "the tool is offered, not forced",
    file: GENERATE,
    from: '        tool_choice: { type: "tool", name: "write_posts" },\n',
    to: "",
    expect: "the call forces the write_posts tool",
  },
  {
    name: "the brief is pasted unfenced",
    file: PROMPT,
    from: "${UNTRUSTED_OPEN}\n${description",
    to: "${description",
    expect: "the brief is fenced as data",
  },
  {
    name: "the stop button no longer reaches the provider",
    file: GENERATE,
    from: "      { signal: params.signal }",
    to: "      {}",
    expect: "the stop button reaches the provider call",
  },
  {
    name: "usage is recorded only after a successful parse",
    file: GENERATE,
    from: '  params.costs.record("generation", response.usage, response.model || POSTS_MODEL);\n',
    to: "",
    expect: "usage is recorded before the posts are parsed",
  },
  {
    name: "a reply cut at the output ceiling is parsed as a shorter set",
    file: GENERATE,
    from: '  if (response.stop_reason === "max_tokens") {\n    return { ok: false, kind: "unusable", detail: "truncated at the output ceiling" };\n  }\n',
    to: "",
    expect: "a reply cut at the output ceiling is refused",
  },
  // ---- the route -----------------------------------------------------
  {
    name: "the hold is sized from the brief alone",
    file: ROUTE,
    from: "        inputChars: postsEstimateInputChars(description.length, platforms),",
    to: "        inputChars: description.length,",
    expect: "the hold is sized per platform asked for",
  },
  {
    name: "a stopped run keeps the hold",
    file: ROUTE,
    from: '      // did this, and "failed" would be the wrong word for it.\n      await releaseReservation(user.id, reservationId);\n',
    to: '      // did this, and "failed" would be the wrong word for it.\n',
    expect: "a stopped run releases the hold",
  },
  {
    name: "an unusable answer is refunded as if the tokens were free",
    file: ROUTE,
    from: '      const settlement = await settleReservation({\n        userId: user.id,\n        reservationId,\n        feature: "posts_generate",\n        costs,\n        plan,\n        bypassCharge: bypass,\n        metadata: { platforms, outcome: outcome.kind },\n      });',
    to: "      await releaseReservation(user.id, reservationId);\n      const settlement = { creditsCharged: 0 };",
    expect: "an unusable answer still settles",
  },
  {
    name: "the row is stamped with a user id the browser sent",
    file: ROUTE,
    from: "        user_id: user.id,\n        description,\n        platforms,\n        posts: outcome.set,",
    to: "        user_id: String(body.userId ?? user.id),\n        description,\n        platforms,\n        posts: outcome.set,",
    expect: "every row is stamped with the session's user",
  },
  {
    name: "a publisher sneaks into the route",
    file: ROUTE,
    from: "    const admin = createAdminClient();\n",
    to: '    const admin = createAdminClient();\n    if (outcome.ok) void fetch("https://api.linkedin.com/v2/ugcPosts", { method: "POST", body: JSON.stringify(outcome.set) });\n',
    expect: "nothing here reaches a social network",
  },
  // ---- the page, the sidebar and the copy -----------------------------
  {
    name: "the copy button stops copying",
    file: WORKSPACE,
    from: "      await navigator.clipboard.writeText(text);\n",
    to: "",
    expect: "one click copies through the clipboard",
  },
  {
    name: "the row slides back into hiding",
    file: NAV,
    from: '      { href: "/dashboard/posts", label: "Posts", icon: POSTS_ICON, hintKey: "posts" },',
    to: '      { href: "/dashboard/posts", label: "Posts", icon: POSTS_ICON, hintKey: "posts", hidden: true },',
    expect: "the row is drawn under Make",
  },
  {
    name: "the Chinese 'publishes nothing' loses its key",
    file: ZH,
    from: '"no_publish": "它不发布任何内容。',
    to: '"no_publishX": "它不发布任何内容。',
    expect: "no_publish: present in all ten locales",
  },
  // ---- the migration -------------------------------------------------
  {
    name: "the person may insert their own receipt",
    file: MIGRATION,
    from: "revoke insert on public.generated_posts from authenticated;\n",
    to: "",
    expect: "insert is revoked from the person",
  },
  // ---- the gate going blind -------------------------------------------
  {
    name: "the gate reads one locale and calls it ten",
    file: GATE,
    from: 'const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];',
    to: 'const LOCALES = ["en"];',
    expect: "ten locales were read",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("posts mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    const stale = edits.filter((e) => !originals.get(e.file).includes(e.from));
    if (stale.length > 0) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${stale.map((e) => e.file).join(", ")}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const byFile = new Map();
    for (const e of edits) {
      const current = byFile.get(e.file) ?? originals.get(e.file);
      byFile.set(e.file, current.replace(e.from, e.to));
    }
    if ([...byFile.entries()].every(([file, text]) => text === originals.get(file))) {
      missed.push({ ...m, why: "the mutation left every file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    for (const [file, text] of byFile) writeFileSync(file, text);
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
      missed.push({ ...m, why: `the gate went red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(after.green ? "\nbaseline: the gate is green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
