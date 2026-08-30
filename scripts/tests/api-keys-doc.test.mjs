// docs/api-keys.md HAS TO STAY TRUE, and a document is the easiest thing
// in a repository to leave behind.
//
// It is the file somebody follows when setting up a deployment. If it
// names a variable the code stopped reading, they set it and nothing
// happens. If it says a provider is "not in the code" after the provider
// is wired, they never set the key and the feature is dark — which is the
// exact failure the document exists to prevent, committed by the document.
//
// security-posture.test.mjs already does this for SECURITY.md's list of
// gates, for the same reason and in the same words: "a SECURITY.md that
// names a gate which was renamed or deleted is worse than no SECURITY.md".
//
// Run: node scripts/tests/api-keys-doc.test.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";

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

const DOC = "docs/api-keys.md";
const doc = readFileSync(DOC, "utf8");
const { envVarsReadByCode } = await import("../lib/env-usage.mjs");
const readByCode = new Set(envVarsReadByCode().keys());
const { loadTs } = await import("./load-ts.mjs");
const { ENV_REQUIREMENTS } = await loadTs("src/lib/env-check.ts");

// ---------------------------------------------------------------------
console.log("== 1. every variable the document names is real ==");
// Backticked ALL_CAPS names, minus the ones the document itself marks as
// proposals for providers that are not wired (Table B names none, by
// design — the check below is what holds that).
const named = [...new Set([...doc.matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/g)].map((m) => m[1]))];
check(`the document names variables (${named.length})`, named.length >= 25, String(named.length));

// Names the document uses to talk ABOUT the environment rather than to
// name a setting: the prefix itself, and the platform's own.
const NOT_A_SETTING = new Set([
  "NEXT_PUBLIC_", "VERCEL_", "STRIPE_PRICE_", "STRIPE_PRICE_ADDON_",
  "AI_PROVIDER_ORDER", "AI_FAILOVER_ENABLED",
]);

// AND THE CODE IDENTIFIERS IT QUOTES. `ENV_REQUIREMENTS`,
// `BUILD_MODULES`, `PROVIDER_KEY_ENV_VARS` and the rest are ALL_CAPS in
// backticks and are not settings — they are the constants the document
// points at to show its working. DERIVED from src/ rather than listed
// here, so a constant that is renamed or deleted stops excusing a name in
// this document instead of quietly going on excusing it.
const exported = new Set();
{
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) {
        for (const m of readFileSync(full, "utf8").matchAll(
          /export (?:const|function|type|class) ([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g
        )) exported.add(m[1]);
      }
    }
  };
  walk("src");
}
check(`the exported-constant scan found some (${exported.size})`, exported.size >= 10, String(exported.size));
// Families the document writes with a wildcard.
const family = (n) =>
  /^STRIPE_PRICE_/.test(n) || /^NEXT_PUBLIC_$/.test(n) || /_$/.test(n);
const unknown = named.filter(
  (n) => !readByCode.has(n) && !NOT_A_SETTING.has(n) && !family(n) && !exported.has(n)
);
check("every one of them is read by the code", unknown.length === 0, unknown.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 2. nothing the deployment needs is left out ==");
const mustAppear = ENV_REQUIREMENTS.filter((r) => r.level !== "optional").map((r) => r.name);
const missing = mustAppear.filter((n) => !doc.includes(n));
check(
  `every required and recommended variable is in the document (${mustAppear.length})`,
  missing.length === 0,
  missing.join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 3. the counts are counted ==");
// A DOCUMENT THAT OPENS BY REFUSING TO PRINT UNMEASURED NUMBERS may not
// print an unmeasured number. It said "twelve variables" over a list of
// fourteen, and this is what would have caught that.
const minimumBlock = doc.split("**Fourteen variables, plus one that")[1] ?? "";
const fenced = minimumBlock.match(/```([\s\S]*?)```/)?.[1] ?? "";
const listed = [...new Set(fenced.split(/\s+/).filter((w) => /^[A-Z][A-Z0-9_]{6,}$/.test(w)))];
check(`the minimum-set block lists variables (${listed.length})`, listed.length > 0);
check("every one of them is read by the code", listed.every((n) => readByCode.has(n)),
  listed.filter((n) => !readByCode.has(n)).join(", "));
// Fourteen, plus MAX_FUNCTION_DURATION which the sentence calls conditional.
check("the stated count matches the block", listed.length === 15, `${listed.length} in the block`);
check("...and the conditional one is the one named as conditional",
  listed.includes("MAX_FUNCTION_DURATION") && /depends on your Vercel plan/.test(doc));

const crons = JSON.parse(readFileSync("vercel.json", "utf8")).crons;
check(`the cron count is the cron count (${crons.length})`,
  doc.includes(`all ten scheduled routes`) && crons.length === 10,
  `vercel.json has ${crons.length}`);
check("...and the split between /api/cron and the digest is right",
  crons.filter((c) => c.path.startsWith("/api/cron")).length === 9);

check(`the registry size is right (${ENV_REQUIREMENTS.length})`,
  doc.includes(`all ${ENV_REQUIREMENTS.length} variables`),
  `document does not say "all ${ENV_REQUIREMENTS.length} variables"`);

// ---------------------------------------------------------------------
console.log("\n== 4. 'not in the code' still is not in the code ==");
// THE CLAIM THAT ROTS FIRST. The day one of these is wired, the document
// tells a reader not to bother setting its key — and the feature is dark
// for exactly as long as nobody re-reads this file.
const NOT_WIRED = [
  "XAI", "GROK", "PERPLEXITY", "MANUS", "DEEPSEEK", "TOGETHER", "MISTRAL", "COHERE",
  "RUNWAY", "LUMA", "KLING", "PIKA", "HEYGEN", "SYNTHESIA",
  "MIDJOURNEY", "IDEOGRAM", "RECRAFT", "DEEPGRAM", "ASSEMBLYAI",
  "PLAID", "TINK", "GOCARDLESS", "ALCHEMY", "MORALIS",
  "TAVILY", "BRAVE", "FIRECRAWL", "APIFY",
];
const nowWired = NOT_WIRED.filter((p) => [...readByCode].some((n) => n.includes(p)));
check(
  `none of the ${NOT_WIRED.length} providers the document calls unwired has an env var`,
  nowWired.length === 0,
  `${nowWired.join(", ")} — move them to Table A and give them a row`
);
// And the registry really is the closed set of four the document quotes.
const registry = readFileSync("src/lib/ai/providers/registry.ts", "utf8");
const providers = [...(registry.match(/PROVIDER_KEY_ENV_VARS[\s\S]*?\};/)?.[0] ?? "").matchAll(/^\s+(\w+): "/gm)].map((m) => m[1]);
check(`the model registry holds four providers (${providers.join(", ")})`, providers.length === 4);
check("...the four the document names",
  JSON.stringify(providers.slice().sort()) === JSON.stringify(["anthropic", "google", "groq", "openai"]));

// ---------------------------------------------------------------------
console.log("\n== 5. every gate it points at exists, and does what it says ==");
for (const gate of [...new Set([...doc.matchAll(/`?scripts\/tests\/([a-z0-9-]+\.test\.mjs)`?/g)].map((m) => m[1]))]) {
  check(`the gate it names exists: ${gate}`, existsSync(`scripts/tests/${gate}`));
}
// THE ONE THE DOCUMENT MADE A PROMISE ABOUT. The sentence "fails the
// build if a secret-shaped name acquires it" was written before the check
// existed; it is here now, and this is what stops it being written out
// again.
const posture = readFileSync("scripts/tests/security-posture.test.mjs", "utf8");
check("security-posture really does check the NEXT_PUBLIC_ prefix",
  /no secret-shaped name carries the NEXT_PUBLIC_ prefix/.test(posture));
check("...against the names the code actually reads",
  /envVarsReadByCode\(\)\.keys\(\)/.test(posture));

// ---------------------------------------------------------------------
console.log("\n== 6. the honesty clause is still there ==");
// The document's first section is the reason its cost column can be
// trusted at all: it says plainly that no price was measured except
// Anthropic's, and points at the constant in the code that says the same.
check("it says the prices are not measured", /have not measured any provider's price/i.test(doc));
check("...and quotes the constant that agrees", /UNVERIFIED_PRICE_PROVIDERS/.test(doc));
const catalog = readFileSync("src/lib/ai/providers/catalog.ts", "utf8");
check("...which still exists and still names three providers",
  /UNVERIFIED_PRICE_PROVIDERS[^=]*=\s*\["openai", "google", "groq"\]/.test(catalog));

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`${pass} checks passed. The setup document still describes this deployment.`);
