/*
 * «ΦΤΙΑΞΕ SITE ΓΙΑ ΤΟ CAMPING ΜΟΥ, ΜΕ ΕΙΚΟΝΕΣ, ΚΑΙ POSTS», ΕΓΚΡΙΝΩ ΤΟ ΠΛΑΝΟ,
 * ΚΑΙ ΠΑΙΡΝΩ ΚΑΙ ΤΑ ΤΡΙΑ ΣΕ ΕΝΑ ΕΡΓΟ, ΜΕ ΙΔΙΑ ΧΡΩΜΑΤΑ (MASTER 6.1, 6.3;
 * MASTER 16 package 36), behind the switch "flows".
 *
 * What this holds, against the code rather than its comments:
 *
 *   1. THE PLAN: the ten sentences of 6.3 — the three the tools here can
 *      make are planned, in order; the seven that need video, translation,
 *      a game or meetings start nothing and say what is missing.
 *   2. THE PRICE: every step priced by the estimate its own route holds.
 *   3. THE COLOUR: the site and the pictures get the same one, in the
 *      words each of them reads.
 *   4. THE ROUTES: signed in, the switch, the plan made again on the
 *      server, a project under the plan's cap, a step's row read back as
 *      the person's own before it goes in the project, a step claimed once.
 *   5. THE PROJECT: it can hold what a flow makes, and opens each one.
 *   6. THE DATABASE and THE WORDS.
 *
 * The screen in a browser: flows.prodtest.mjs.
 *
 * Run: node scripts/tests/flows.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
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
const code = (p) => stripComments(readFileSync(p, "utf8"));

const plan = await loadTs("src/lib/flows/plan.ts");
const brief = await loadTs("src/lib/flows/brief.ts");
const pricing = await loadTs("src/lib/flows/flow-pricing.ts");
const estimate = await loadTs("src/lib/billing/estimate.ts");
const config = await loadTs("src/lib/billing/pricing-config.ts");
const plans = await loadTs("src/lib/billing/plans.ts");
const formula = await loadTs("src/lib/billing/credit-formula.ts");

console.log("flows");

// ---------------------------------------------------------------------
console.log("\n== 1. the plan ==");
// ---------------------------------------------------------------------
const shape = (s) => plan.planFlow(s).steps.map((x) => (x.after.length ? `${x.kind}<${x.after.join("+")}` : x.kind)).join(",");
check("6.3 #1: a research, and the deck made from it after", shape("Κάνε έρευνα για τα camping στις Κυκλάδες και φτιάξε παρουσίαση.") === "research,slides<research");
check("6.3 #2: a site, pictures and posts, side by side", shape("Φτιάξε site για το camping μου, με εικόνες, και posts για να το ανακοινώσω.") === "site,images,posts");
check("6.3 #3: a file's analysis", shape("Πάρε αυτό το αρχείο πωλήσεων και γράψε αναφορά με γραφήματα.") === "analysis");
check("...and in English", shape("Make a website for my campsite with pictures and posts to announce it") === "site,images,posts" && shape("Research campsites in the Cyclades and make a presentation") === "research,slides<research");
const NOT_YET = [
  ["Από τη χθεσινή συνάντηση, βγάλε τις ενέργειες, βάλ' τες στους στόχους μου και θύμιζέ μου κάθε Δευτέρα.", "meeting"],
  ["Φτιάξε βίντεο 30 δευτερολέπτων για το site μου και βάλ' το στην αρχική του.", "video"],
  ["Από αυτά τα πέντε βίντεο και αυτό το τραγούδι, φτιάξε ένα TikTok 20 δευτερολέπτων.", "video"],
  ["Πάρε αυτό το βίντεο 10 λεπτών και βγάλε τα τρία καλύτερα σύντομα, με υπότιτλους.", "video"],
  ["Κάνε την παρουσίασή μου βίντεο με αφήγηση.", "video"],
  ["Μετάφρασε το site και την παρουσίαση στα αγγλικά.", "translation"],
  ["Φτιάξε μικρό παιχνίδι με το λογότυπό μου και βάλ' το στο site.", "game"],
];
for (const [said, missing] of NOT_YET) {
  const p = plan.planFlow(said);
  check(`6.3, needs ${missing}: nothing starts, and it says what is missing — «${said.slice(0, 40)}…»`, p.steps.length === 0 && p.notYet.includes(missing), JSON.stringify(p));
}
check("a sentence naming no tool is no plan", plan.planFlow("καλημέρα").steps.length === 0 && plan.planFlow("καλημέρα").notYet.length === 0);
const p2 = plan.planFlow("Κάνε έρευνα και φτιάξε παρουσίαση");
check("a step starts only once what it waits for is done", plan.readySteps(p2, new Set(), new Set()).map((s) => s.id).join() === "research" && plan.readySteps(p2, new Set(["research"]), new Set(["research"])).map((s) => s.id).join() === "slides");
const cut = plan.withoutUnavailable(plan.planFlow("Φτιάξε site, εικόνες και posts"), (k) => k !== "images");
check("a step this person cannot use is taken out before the price, and named", cut.steps.map((s) => s.kind).join() === "site,posts" && cut.unavailable.join() === "images");
const chain = plan.withoutUnavailable(p2, (k) => k !== "research");
check("...and a step that waits for it goes with it", chain.steps.length === 0 && chain.unavailable.join() === "research,slides");
check("a stored plan is read defensively", plan.readPlan({ steps: [{ kind: "site" }, { kind: "site" }, { kind: "hack" }, { kind: "slides", after: ["research", "slides"] }], notYet: ["video", "x"] }).steps.map((s) => `${s.kind}:${s.after.join("+")}`).join() === "site:,slides:" && plan.readPlan(null).steps.length === 0);
const states = { site: { status: "done", row: "r1" }, images: { status: "failed", error: "no_credits" } };
const three = plan.planFlow("Φτιάξε site, εικόνες και posts");
check("a flow runs until every step is finished, and is done only if every one is",
  plan.flowStatus(three, states) === "running" && plan.flowStatus(three, { ...states, posts: { status: "done", row: "r2" } }) === "failed" && plan.flowStatus(three, { site: states.site, images: { status: "done", row: "r3" }, posts: { status: "done", row: "r2" } }) === "done");
check("a stored step state is read defensively", JSON.stringify(plan.readStepStates({ site: { status: "done", row: "r1", x: 1 }, posts: { status: "nope" }, evil: { status: "done" } }, three)) === JSON.stringify({ site: { status: "done", row: "r1" } }));
check("each step's result is the tool's own table", plan.STEP_TABLE.site === "user_websites" && plan.STEP_TABLE.images === "generated_images" && plan.STEP_TABLE.posts === "generated_posts" && plan.STEP_TABLE.research === "research_reports" && plan.STEP_TABLE.slides === "ai_presentations" && plan.STEP_TABLE.analysis === "data_analyses");
check("the project is named by the sentence, short", plan.projectNameFor("  Φτιάξε   site ").length <= 60 && plan.projectNameFor("x".repeat(200)).length <= 60);

// ---------------------------------------------------------------------
console.log("\n== 2. the price ==");
// ---------------------------------------------------------------------
const cfg = config.resolvePricingConfig();
const growth = plans.PLANS.find((p) => p.slug === "growth");
const prices = pricing.flowPrices(growth, null, 1500, cfg);
const credit = formula.effectiveCreditPriceEurForAccount(growth, null, cfg);
const held = (profile, params) => estimate.estimateForAction(profile, { ...params, planSlug: "growth" }, cfg, credit).reserveCredits;
check("the site at the Site's own hold", prices.site === held("websiteGenerate", { model: "claude-sonnet-4-6", inputChars: 1500, imageCount: 0 }) && prices.site > 0);
check("every step costs something, and a research costs its plan and its run", ["site", "images", "posts", "research", "slides", "slidesFromResearch"].every((k) => prices[k] > 0) && prices.research > held("deepResearch", { model: "claude-sonnet-4-6", inputChars: 1500, expectedWebSearches: 0 }));
check("a deck made from a research is priced on the report, not on the sentence", prices.slidesFromResearch > prices.slides);
check("the total is the sum of the steps, the deck after a research at its own price",
  pricing.flowTotal(p2.steps, prices) === prices.research + prices.slidesFromResearch && pricing.flowTotal(three.steps, prices) === prices.site + prices.images + prices.posts);
const fp = code("src/lib/flows/flow-pricing.ts");
for (const [route, profile, model] of [
  ["src/app/api/websites/generate/route.ts", "websiteGenerate", "WEBSITE_MODEL"],
  ["src/app/api/posts/generate/route.ts", "postsGenerate", "POSTS_MODEL"],
  ["src/app/api/presentations/generate/route.ts", "presentationGenerate", "PRESENTATION_MODEL"],
  ["src/app/api/research/route.ts", "deepResearch", "RESEARCH_MODEL"],
]) {
  check(`${profile}: the same profile the route holds with`, code(route).includes(`"${profile}"`) && fp.includes(`"${profile}"`) && code(route).includes(model));
}
check("the pictures at the Image tool's own price", /images: imagePrices\(plan, purchasedPackPriceEur, config\)\.variants/.test(fp));
const priceRoute = code("src/app/api/data-analysis/[id]/price/route.ts");
const analyseRoute = code("src/app/api/data-analysis/[id]/analyse/route.ts");
const estimateArgs = (src) => (src.match(/estimateForAction\(\s*"dataAnalyse",\s*\{([^}]*)\}/) ?? [])[1]?.replace(/\s+/g, " ").replace("MODEL", "ANALYSIS_MODEL").replace("ANALYSIS_ANALYSIS_MODEL", "ANALYSIS_MODEL");
check("an analysis is quoted by the analyse route's own estimate, argument for argument", estimateArgs(priceRoute) && estimateArgs(priceRoute) === estimateArgs(analyseRoute) && /const MODEL = ANALYSIS_MODEL;/.test(analyseRoute), `${estimateArgs(priceRoute)} | ${estimateArgs(analyseRoute)}`);
check("...under the person's own row", /\.eq\("id", params\.id\)\s*\.eq\("user_id", user\.id\)\s*\.maybeSingle\(\)/.test(priceRoute));
check("the page prices at the longest sentence a flow takes, so the price shown is never under the price held", /flowPrices\(plan, packPrice, MAX_FLOW_SAID \+ MAX_COLOUR_CHARS\)/.test(code("src/lib/flows/page-data.ts")));

// ---------------------------------------------------------------------
console.log("\n== 3. the colour ==");
// ---------------------------------------------------------------------
const said = "Φτιάξε site για το camping μου";
check("the site gets the colour in its own design form's words", brief.briefFor("site", said, "#2f6b4f").includes("- PRIMARY COLOUR: exactly #2f6b4f") && brief.briefFor("site", said, "#2f6b4f").startsWith(said));
check("...and what the colour adds stays inside the room the price leaves for it", ["site", "images"].every((k) => brief.briefFor(k, said, "#2f6b4f").length - said.length <= brief.MAX_COLOUR_CHARS));
check("...the pictures in a sentence, the same colour", brief.briefFor("images", said, "#2f6b4f").includes("#2f6b4f"));
check("...posts and decks get the sentence", brief.briefFor("posts", said, "#2f6b4f") === said && brief.briefFor("slides", said, "#2f6b4f") === said);
check("a colour is a colour or nothing", brief.readColour("#2F6B4F") === "#2f6b4f" && brief.readColour("red") === null && brief.readColour("#2f6b4f;}") === null);
check("the site's memory brief does not override a colour said here", /!\/PRIMARY COLOUR:\/\.test\(description\)/.test(code("src/lib/memory/brand.ts")));

// ---------------------------------------------------------------------
console.log("\n== 4. the routes ==");
// ---------------------------------------------------------------------
const create = code("src/app/api/flows/route.ts");
const steps = code("src/app/api/flows/[id]/steps/route.ts");
for (const [name, src] of [["create", create], ["steps", steps]]) {
  check(`${name}: signs in, then the switch`, /if \(!user\) return NextResponse\.json\(\{ ok: false, code: "not_signed_in" \}, \{ status: 401 \}\);\s*if \(!\(await isFeatureOn\("flows", user\)\)\) return NextResponse\.json\(\{ ok: false, code: "not_enabled" \}, \{ status: 403 \}\);/.test(src));
}
check("the plan is made again on the server, from the sentence, without what this person cannot use", /const plan = withoutUnavailable\(planFlow\(said\), \(kind\) => available\[kind\]\);/.test(create) && !/body\.plan|body\.steps/.test(create));
check("a sentence that needs what does not exist makes no project", create.indexOf("if (plan.steps.length === 0)") < create.indexOf('.from("projects")\n      .insert('));
check("the project under the plan's own cap", /const cap = maxProjectsForPlan\(await resolveEffectivePlanSlug\(user\)\);/.test(create) && /if \(\(count \?\? 0\) >= cap\) return NextResponse\.json\(\{ ok: false, code: "project_limit_reached", limit: cap \}, \{ status: 402 \}\);/.test(create));
check("the flow row through the server, with the person's id", /\.from\("project_flows"\)\s*\.insert\(\{ user_id: user\.id, project_id: project\.id,/.test(create));
check("a step's flow is the person's own", /\.from\("project_flows"\)\s*\.select\("id, project_id, plan, steps, status, updated_at"\)\s*\.eq\("id", params\.id\)\s*\.eq\("user_id", user\.id\)/.test(steps));
check("a step's row is read back, from the step's own table, as the person's own, before it goes in the project",
  /const table = STEP_TABLE\[step\.kind\];/.test(steps) && /\.from\(table\)\.select\("id"\)\.eq\("id", row\)\.eq\("user_id", user\.id\)\.maybeSingle\(\);\s*if \(!made\) return NextResponse\.json\(\{ ok: false, code: "not_yours" \}, \{ status: 404 \}\);/.test(steps) && steps.indexOf("not_yours") < steps.indexOf('from("entity_links").insert('));
check("...into the project once", steps.indexOf('.select("id", { count: "exact", head: true })') < steps.indexOf('from("entity_links").insert(') && /if \(\(count \?\? 0\) === 0\) \{/.test(steps));
check("a step is claimed once, waits for what it needs, and is not reopened", /if \(status === "running" && !row && now\?\.status === "running"\) return "already_running";/.test(steps) && /if \(status === "running" && !step\.after\.every\(\(a\) => states\[a\]\?\.status === "done"\)\) return "waiting";/.test(steps) && /if \(now\?\.status === "done"\) return "already_done";/.test(steps));
check("two steps finishing together lose neither", /\.eq\("updated_at", current\.updated_at\)/.test(steps) && /const late = attempt > 0 \? refusal\(before\) : null;/.test(steps));
check("the creating route is bounded", /checkRateLimit\(\{ scope: "flow_create", identifier: user\.id,/.test(create));
const run = code("src/lib/flows/run-step.ts");
check("each step is its own tool's request", ['startSiteGeneration(', '"/api/images/generate"', '"/api/posts/generate"', '"/api/research"', '"/api/presentations/generate"', '"/api/data-analysis/upload"'].every((s) => run.includes(s)) && !/\.from\(|createAdminClient|reserveCredits/.test(run));
check("a deck after a research is made from it", /\.\.\.\(input\.researchId \? \{ researchId: input\.researchId \} : \{\}\)/.test(run));
const shell = code("src/components/flows/flow-shell.tsx");
check("nothing starts before «Έγκριση», and a large total asks again", /onApprove=\{\(\) => withConfirm\(totalOf\(draft\), \(\) => void approve\(id\)\)\}/.test(shell) && /async function approve\([\s\S]*?fetch\("\/api\/flows"[\s\S]*?if \(!response\.ok \|\| !data\?\.ok\) \{[\s\S]*?return;[\s\S]*?advance\(flow\.id/.test(shell));
check("a step that ends is seen by the next at once, so what waited for it starts", /flowsRef\.current = \{ \.\.\.flowsRef\.current, \[flowId\]: \{ \.\.\.flow, states \} \};\s*setFlows\(flowsRef\.current\);/.test(shell) && /finally \{\s*runningHere\.current\.delete\(key\);\s*if \(mounted\.current\) advance\(flowId\);/.test(shell));
check("a site or research left running is followed, not started again", /if \(state\?\.status === "running" && state\.row && \(step\.kind === "site" \|\| step\.kind === "research"\)\) void runOne\(flow\.id, step\.id, state\.row, true\);/.test(shell));

// ---------------------------------------------------------------------
console.log("\n== 5. the project ==");
// ---------------------------------------------------------------------
const extras = code("src/lib/projects/linkable-extras.ts");
check("a project can hold what a flow makes", ["user_websites", "generated_images", "research_reports", "data_analyses", "generated_posts", "ai_presentations"].every((t) => extras.includes(`table: "${t}"`)));
check("each thing in a project opens in its tool", /function openHref\(member: ProjectMemberView\)/.test(code("src/components/projects/project-detail.tsx")) && /data-testid="project-member-open"/.test(code("src/components/projects/project-detail.tsx")));
const page = code("src/app/dashboard/projects/page.tsx");
check("the flows only behind the switch, INSTEAD of the page", /if \(\(await isFeatureOn\("flows", user\)\) && projects\) \{/.test(page) && page.indexOf("<FlowShell") < page.lastIndexOf("return ("));

// ---------------------------------------------------------------------
console.log("\n== 6. the database and the words ==");
// ---------------------------------------------------------------------
const sql = readFileSync("supabase/migrations/20261022000000_project_flows.sql", "utf8");
check("project_flows: the owner reads, nobody writes from the browser, gone with its project",
  /alter table public\.project_flows enable row level security;/.test(sql) && /create policy project_flows_select_own on public\.project_flows for select using \(auth\.uid\(\) = user_id\);/.test(sql) && /revoke insert, update, delete on public\.project_flows from authenticated;/.test(sql) && /references public\.projects\(id\) on delete cascade/.test(sql));
check("a colour stored is a colour", /check \(colour is null or colour ~ '\^#\[0-9a-f\]\{6\}\$'\)/.test(sql));
check("the switch is declared", /\n  "flows": "/.test(readFileSync("src/lib/flags/flags.ts", "utf8")));
const used = new Set();
for (const f of ["src/components/flows/flow-shell.tsx", "src/components/flows/flow-plan.tsx"]) {
  for (const m of code(f).matchAll(/\bt\("([a-zA-Z_.0-9]+)"/g)) used.add(m[1]);
}
check(`the keys the screen uses were found (${used.size})`, used.size >= 55);
const get = (o, k) => k.split(".").reduce((v, p) => (v && typeof v === "object" ? v[p] : undefined), o);
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));
check(`the ten languages (${LOCALES.length})`, LOCALES.length === 10);
for (const file of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.flows ?? {};
  const missing = [...used].filter((k) => typeof get(m, k) !== "string" || !get(m, k).trim());
  check(`${file}: every word, the total with its number`, missing.length === 0 && /\{count/.test(m.total ?? "") && /\{names\}/.test(m.notYet ?? ""), missing.join(", "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
