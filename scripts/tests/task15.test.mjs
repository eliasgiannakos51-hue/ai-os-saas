// V3 Task 15 — launch readiness: EU AI Act art. 50 coverage, backups
// documentation, monitoring, encryption statements, the missing legal
// set, performance budgets, and the readiness score itself.
//
// Run: node scripts/tests/task15.test.mjs
import { readFileSync, existsSync } from "node:fs";

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

const { loadTs } = await import("./load-ts.mjs");

console.log("== 1. EU AI Act art. 50 — every AI interface discloses ==");
checkTrue("the notice component exists", existsSync("src/components/ui/ai-interaction-notice.tsx"));
const AI_INTERFACES = [
  "src/components/chat/chat-workspace.tsx",
  "src/components/create/create-chat.tsx",
  "src/components/mission/mission-form.tsx",
  "src/components/research/research-workspace.tsx",
  "src/components/website-builder/website-builder-workspace.tsx",
];
for (const file of AI_INTERFACES) {
  checkTrue(`${file.split("/").at(-1)} mounts the notice`, readFileSync(file, "utf8").includes("<AiInteractionNotice />"));
}

console.log("\n== 2. generated content is MARKED ==");
const { withAiContentMarking } = await loadTs("src/lib/publishing/public-serving.ts");
const marked = withAiContentMarking("<!doctype html><html><head><title>x</title></head><body>hi</body></html>");
checkTrue("published sites get a machine-readable marking in <head>", marked.includes('name="generator"') && marked.indexOf("generator") < marked.indexOf("<title>"));
check("marking is idempotent (serving twice never doubles it)", withAiContentMarking(marked), marked);
checkTrue("a headless document still gets marked", withAiContentMarking("<p>hi</p>").includes("generator"));
checkTrue("...and the served route uses it", readFileSync("src/app/s/[subdomain]/route.ts", "utf8").includes("withAiContentMarking(site.html_content)"));
checkTrue("shared decks state it on the page", readFileSync("src/app/p/[slug]/page.tsx", "utf8").includes("AI-generated"));
checkTrue("agent emails carry the notice in the agent's language", readFileSync("src/lib/agents/ai-disclosure.ts", "utf8").includes("aiGeneratedNotice"));
checkTrue("research documents carry it too", readFileSync("src/app/api/research/[id]/run/route.ts", "utf8").includes("aiGeneratedNotice"));

console.log("\n== 3. the transparency and legal pages ==");
const transparency = readFileSync("src/app/ai-transparency/page.tsx", "utf8");
checkTrue("/ai-transparency names the model provider", transparency.includes("Anthropic"));
checkTrue("...and states data is not used for training", /not used to train/i.test(transparency));
checkTrue("...and covers Article 50 explicitly", transparency.includes("Article 50"));
checkTrue("terms state AI use", readFileSync("src/app/terms/page.tsx", "utf8").includes("AI-Generated Content & Transparency"));
checkTrue("AUP exists with published-site rules", readFileSync("src/app/acceptable-use/page.tsx", "utf8").includes("safety review"));
const dpa = readFileSync("src/app/dpa/page.tsx", "utf8");
checkTrue("DPA lists the real sub-processors", ["Supabase", "Vercel", "Anthropic", "Stripe", "Resend"].every((s) => dpa.includes(s)));
checkTrue("DPA states the 72-hour breach clock", dpa.includes("72"));
const smoke = readFileSync("scripts/tests/routes-smoke.prodtest.mjs", "utf8");
checkTrue("all three new public pages are smoke-tested", ["/ai-transparency", "/acceptable-use", "/dpa"].every((r) => smoke.includes(`"${r}"`)));

console.log("\n== 4. monitoring ==");
const health = readFileSync("src/app/api/health/route.ts", "utf8");
checkTrue("/api/health answers 503 when the DB is down (not a vanity 200)", health.includes("503"));
// Every JSON body the route can return carries ONLY ok/db/ms — no
// error detail, no versions, no counts reach the anonymous caller.
const healthBodies = [...health.matchAll(/NextResponse\.json\(\s*(\{[\s\S]*?\})/g)].map((m) =>
  m[1].replace(/\s+/g, " ")
);
checkTrue(
  "...and reveals nothing but up/down and latency",
  healthBodies.length >= 2 &&
    healthBodies.every((b) => b.startsWith("{ ok:") && b.includes("db:") && b.includes("ms:") && !b.includes("error"))
);
checkTrue("...and is justified in the security posture gate", readFileSync("scripts/tests/security-posture.test.mjs", "utf8").includes('"src/app/api/health/route.ts"'));
const ops = readFileSync("docs/OPERATIONS.md", "utf8");
checkTrue("the runbook points an EXTERNAL monitor at it", ops.includes("/api/health") && /external/i.test(ops));
checkTrue("error alerts to the owner are documented as wired", ops.includes("ADMIN_EMAILS"));

console.log("\n== 5. backups: a procedure, not a hope ==");
checkTrue("the restore test has numbered steps", /1\..*throwaway|1\. Create a NEW throwaway/s.test(ops));
checkTrue("...restores into a NEW project, never over prod", /never restore over prod/i.test(ops));
checkTrue("...and demands the RTO be recorded", ops.includes("Restore-test log"));
checkTrue("encryption at rest is stated with its mechanism", ops.includes("AES-256"));
checkTrue("connection pooling is stated with its mechanism", ops.includes("Supavisor") || ops.includes("pooler"));

console.log("\n== 6. performance budget is asserted, not aspired to ==");
checkTrue("the smoke test asserts the median navigation budget", smoke.includes("median signed-in navigation under 3s"));
checkTrue("...excluding the cold-start route", smoke.includes("slice(1)"));

console.log("\n== 7. the readiness score is computed from checks, not typed ==");
const readiness = readFileSync("scripts/launch-readiness.mjs", "utf8");
checkTrue("the score script exists and reads real files", readiness.includes("readFileSync") && readiness.includes("TOTAL"));
checkTrue("it lists the manual launch gates", readiness.includes("PITR") && readiness.includes("uptime monitor"));
checkTrue("the unverifiable point (restore test performed) is NOT self-awarded", readiness.includes("_pending — run before launch_"));

console.log("\n== 8. the notice strings exist in every locale ==");
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
for (const locale of LOCALES) {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  checkTrue(`${locale}: aiNotice strings`, typeof messages.aiNotice?.interacting === "string" && typeof messages.aiNotice?.learnMore === "string");
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
