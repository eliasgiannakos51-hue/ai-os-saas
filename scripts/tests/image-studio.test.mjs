/*
 * «ΠΑΙΡΝΩ 4 ΠΑΡΑΛΛΑΓΕΣ, ΑΛΛΑΖΩ ΜΙΑ ΜΕ ΛΟΓΙΑ, ΚΑΙ ΤΗΝ ΚΑΤΕΒΑΖΩ ΣΤΗΝ ΥΨΗΛΟΤΕΡΗ
 * ΑΝΑΛΥΣΗ» (MASTER 16, package 19), behind the switch "image-studio".
 *
 * What this holds, against the code rather than its comments:
 *
 *   1. THE WORDS SENT AND THE PICTURES KEPT: four different asks of one
 *      description; a change and a largest size sent WITH the picture; a
 *      stored row read defensively, the owner's paths only.
 *   2. WHAT THE PROVIDER'S ANSWER MEANS: a picture, declined, failed.
 *   3. THE MONEY: the hold before the call, only what was stored charged,
 *      nothing charged when nothing was made, the largest size made once.
 *   4. THE OWNER: every route signs in, reads the row as the owner's, and
 *      one change at a time.
 *   5. THE DATABASE: the table written by the server only, a private
 *      bucket, the account erasure that empties it.
 *   6. THE SCREEN AND THE WORDS.
 *
 * The provider's request and the prices against the settlement formula:
 * image-studio.itest.mjs. The screen in a browser: image-studio.prodtest.mjs.
 *
 * Run: node scripts/tests/image-studio.test.mjs
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

const studio = await loadTs("src/lib/images/image-studio.ts");
const answer = await loadTs("src/lib/images/image-answer.ts");

console.log("image-studio");

// ---------------------------------------------------------------------
console.log("\n== 1. the words sent and the pictures kept ==");
// ---------------------------------------------------------------------
check("four pictures from one description", studio.IMAGE_VARIANTS === 4);
const asks = Array.from({ length: 4 }, (_, i) => studio.variantPrompt("Ένα κάμπινγκ στη Νάξο το σούρουπο", i));
// Different in what they ask for, not only in the number they carry.
const directions = asks.map((a) => a.replace(/Version \d+ of 4/, ""));
check("...each asked differently, each with the description whole", new Set(directions).size === 4 && asks.every((a) => a.endsWith("Ένα κάμπινγκ στη Νάξο το σούρουπο")) && asks.every((a, i) => a.includes(`Version ${i + 1} of 4`)));
check("a change says to change only what was asked", /change nothing else/.test(studio.editPrompt("πιο ζεστά χρώματα")) && studio.editPrompt("πιο ζεστά χρώματα").endsWith("πιο ζεστά χρώματα"));
check("the largest size says to change nothing", /Do not change/.test(studio.FULL_SIZE_PROMPT));
check("a description: at least 3 and at most 1500 characters",
  studio.checkImageText("ab", 1500).reason === "too_short" && studio.checkImageText("x".repeat(1501), 1500).reason === "too_long" && studio.checkImageText("  μια βάρκα  ", 1500).text === "μια βάρκα");
check("the shape is one of the four, or the square", studio.readAspect("16:9") === "16:9" && studio.readAspect("21:9") === "1:1" && studio.readAspect(null) === "1:1");
const OWNER = "00000000-0000-4000-8000-000000000001";
const stored = studio.readVariants(
  [
    { index: 0, path: `${OWNER}/i/v0.png`, mime: "image/png", fullPath: `${OWNER}/i/v0-full.png`, previous: [`${OWNER}/i/old.png`, "someone-else/x.png"] },
    { index: 0, path: `${OWNER}/i/dup.png` },
    { index: 1, path: "someone-else/i/v1.png" },
    { index: 2, path: `${OWNER}/../x.png` },
    { index: 3, path: `${OWNER}/i/v3.jpg`, mime: "text/html" },
    { index: 9, path: `${OWNER}/i/v9.png` },
    "nonsense",
  ],
  OWNER
);
check("a stored row is read defensively: the owner's paths only, one per place, a known type",
  stored.length === 2 && stored[0].index === 0 && stored[0].previous.length === 1 && stored[1].index === 3 && stored[1].mime === "image/png", JSON.stringify(stored));
check("a picture's path is under its owner and its image", studio.imagePath(OWNER, "img", "v2", "image/jpeg") === `${OWNER}/img/v2.jpg`);
check("the saved file is named by the description, Greek kept", studio.imageFilename("Κάμπινγκ στη Νάξο, σούρουπο!", 1, true, "image/png") === "Κάμπινγκ-στη-Νάξο-σούρουπο-2-full.png");

// ---------------------------------------------------------------------
console.log("\n== 2. what the provider's answer means ==");
// ---------------------------------------------------------------------
const png = Buffer.from("fake-png").toString("base64");
const ok = answer.readImageAnswer(200, { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "here" }, { inlineData: { mimeType: "image/png", data: png } }] } }] });
check("a picture is a picture", ok.ok === true && ok.mime === "image/png" && ok.data.toString() === "fake-png");
check("the provider declining is said as declined",
  answer.readImageAnswer(200, { promptFeedback: { blockReason: "SAFETY" } }).kind === "refused" &&
    answer.readImageAnswer(200, { candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] }).kind === "refused" &&
    answer.readImageAnswer(200, { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "I can't draw that." }] } }] }).kind === "refused");
check("...and failing as failing",
  answer.readImageAnswer(500, {}).kind === "provider" &&
    answer.readImageAnswer(429, {}).kind === "provider" &&
    answer.readImageAnswer(200, { candidates: [{ finishReason: "MAX_TOKENS" }] }).kind === "provider" &&
    answer.readImageAnswer(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: "text/html", data: png } }] } }] }).kind === "provider");

// ---------------------------------------------------------------------
console.log("\n== 3. the money ==");
// ---------------------------------------------------------------------
const generate = code("src/app/api/images/generate/route.ts");
const remake = code("src/lib/images/image-remake.ts");
const edit = code("src/app/api/images/[id]/edit/route.ts");
const full = code("src/app/api/images/[id]/full/route.ts");
const pricing = code("src/lib/images/image-pricing.ts");
check("the price is the settlement's own formula, on this account",
  /creditsForRealCostOnAccount\(usdToEur\(usd, config\), plan, purchasedPackPriceEur, config, margin\)/.test(pricing) && /resolveMarginFor\(IMAGE_FEATURE, plan\?\.slug \?\? null, config\)\.margin/.test(pricing));
check("four are held before the four are asked",
  generate.indexOf("reserveCredits(user.id, prices.variants, IMAGE_FEATURE") > 0 && generate.indexOf("reserveCredits(user.id, prices.variants, IMAGE_FEATURE") < generate.indexOf("callImage("));
check("...only the pictures stored are charged",
  /for \(let i = 0; i < variants\.length; i\+\+\) \{\s*costs\.recordExternal\("generation", \{ provider: "google", usdCost: IMAGE_RATES_USD\.preview, units: 1, unit: "image" \}\);/.test(generate));
check("...none made: the hold goes back, and it says whether the provider declined",
  /if \(variants\.length === 0\) \{\s*await releaseReservation\(user\.id, reservationId\);/.test(generate) && /return refuse\(refused \? "refused" : "ai_unavailable", refused \? 422 : 503\);/.test(generate));
check("...the row is written before the charge, and pictures nobody can reach are not charged",
  generate.indexOf('.from("generated_images")\n      .insert(') > 0 &&
    generate.indexOf('.from("generated_images")\n      .insert(') < generate.indexOf("settleReservation(") &&
    /await removePictures\(variants\.map\(\(v\) => v\.path\)\);\s*await releaseReservation\(user\.id, reservationId\);\s*return refuse\("save_failed", 500\);/.test(generate));
check("...a throw before the charge gives the hold back", /if \(!settled\) await releaseReservation\(user\.id, reservationId\);/.test(generate));
for (const [label, src, price] of [["a change", edit, "edit"], ["the largest size", full, "full"]]) {
  check(`${label}: its price is held before the provider is asked`, new RegExp(`reserveCredits\\(user\\.id, gate\\.prices\\.${price}, IMAGE_FEATURE`).test(src) && src.indexOf("reserveCredits(") < src.indexOf("remake("));
}
check("a change or a largest size: a failed call gives the hold back, a stored one is charged once",
  /if \(!outcome\.ok\) \{\s*await releaseReservation\(user\.id, reservationId\);/.test(remake) &&
    /costs\.recordExternal\("generation", \{\s*provider: "google",\s*usdCost: job\.kind === "full" \? IMAGE_RATES_USD\.full : IMAGE_RATES_USD\.preview,/.test(remake) &&
    remake.indexOf('.update({ variants: next })') < remake.indexOf("settleReservation("));
check("the largest size is made once: asked again it is the same file, free, before anything is spent",
  /if \(variant\.fullPath\) \{\s*const url = await downloadUrl\(row, variant, true\);\s*return url \? NextResponse\.json\(\{ ok: true, url, creditsCharged: 0 \}\)/.test(full) &&
    full.indexOf("if (variant.fullPath) {") < full.indexOf("spendingAllowed("));
check("...from the picture, by the 4K model, at 4K",
  /model: job\.kind === "full" \? IMAGE_FULL_MODEL : IMAGE_PREVIEW_MODEL/.test(remake) && /size: job\.kind === "full" \? "4K" : undefined/.test(remake) && /\n\s*source,\n/.test(remake));
check("a change keeps the picture it replaced", /previous: \[\.\.\.v\.previous, v\.path, \.\.\.\(v\.fullPath \? \[v\.fullPath\] : \[\]\)\]/.test(remake));

// ---------------------------------------------------------------------
console.log("\n== 4. the owner ==");
// ---------------------------------------------------------------------
const access = code("src/lib/images/image-access.ts");
const download = code("src/app/api/images/[id]/download/route.ts");
const del = code("src/app/api/images/[id]/route.ts");
const ROUTES = { generate, edit, full, download, delete: del };
for (const [name, src] of Object.entries(ROUTES)) {
  check(`${name}: signs in, then the switch and the plan`, /if \(!user\) return refuse\("not_signed_in", 401\);\s*const gate = await imageGate\(user\);\s*if \(gate instanceof NextResponse\) return gate;/.test(src));
}
for (const [name, src] of Object.entries({ edit, full, download, delete: del })) {
  check(`${name}: the row is the owner's`, /\.from\("generated_images"\)\s*\.select\(IMAGE_ROW_COLUMNS\)\s*\.eq\("id", id\)\s*\.eq\("user_id", user\.id\)\s*\.maybeSingle\(\)/.test(src) && /if \(!data\) return refuse\("not_found", 404\);/.test(src));
}
check("the switch is image-studio, the plan Starter and up", /if \(!\(await isFeatureOn\("image-studio", user\)\)\) return refuse\("not_enabled", 403\);/.test(access) && /export const IMAGE_MIN_PLAN: PlanSlug = "starter";/.test(access) && /if \(!isAdmin && !planMeetsMinimum\(plan\?\.slug \?\? "free", IMAGE_MIN_PLAN\)\) return refuse\("not_included", 403\);/.test(access));
check("before anything is spent: the breaker, and the ceiling on accounts not charged", /const breaker = await checkAiCallAllowed\(user\.id, endpoint, fingerprint\);\s*if \(!breaker\.allowed\) return refuse\("rate_limited", 429\);/.test(access) && /checkBypassCeiling\(user\.id, gate\.isAdmin, isBeta\)/.test(access));
check("one change at a time: the row is claimed, and a stale claim expires",
  /\.or\(`busy_since\.is\.null,busy_since\.lt\.\$\{cutoff\}`\)/.test(access) && /if \(!\(await claimImage\(user\.id, id\)\)\) return refuse\("busy", 409\);/.test(edit) && /finally \{\s*await releaseImage\(user\.id, row\.id\);/.test(remake));
check("...and a refused hold lets go of the claim, and a throw before remake() lets go of both",
  [edit, full].every((s) => /if \(!enough\.ok\) \{\s*await releaseImage\(user\.id, id\);/.test(s) && /if \(!reservation\.ok\) \{\s*await releaseImage\(user\.id, id\);/.test(s) && /if \(claimed\) \{\s*await releaseReservation\(user\.id, reservationId\);\s*await releaseImage\(user\.id, id\);/.test(s)));
check("a saved picture: rate limited, the largest size only once made, never cached",
  /checkRateLimit\(\{ scope: "image_download", identifier: user\.id, maxAttempts: 240, windowMinutes: 60 \}\)/.test(download) && /if \(full && !variant\.fullPath\) return refuse\("not_made", 404\);/.test(download) && /"Cache-Control", "no-store"/.test(download));
check("a deleted image takes every picture it names first, then its row",
  del.indexOf("removePictures(everyPath(") > 0 && del.indexOf("removePictures(everyPath(") < del.indexOf(".delete()") && /\[v\.path, \.\.\.\(v\.fullPath \? \[v\.fullPath\] : \[\]\), \.\.\.v\.previous\]/.test(access));
check("pictures are signed only for the owner's paths", /readVariants\(row\.variants, userId\)/.test(access));

// ---------------------------------------------------------------------
console.log("\n== 5. the database ==");
// ---------------------------------------------------------------------
const migration = readFileSync("supabase/migrations/20261019000000_generated_images.sql", "utf8");
const sql = migration.replace(/--[^\n]*/g, "");
check("the table, its owner, its pictures", /create table if not exists public\.generated_images/.test(sql) && /user_id uuid not null references auth\.users\(id\) on delete cascade/.test(sql) && /variants jsonb not null default/.test(sql));
check("written by the server only: insert and update revoked", /revoke insert, update on public\.generated_images from authenticated;/.test(sql) && /grant select, delete on public\.generated_images to authenticated;/.test(sql));
check("the bucket is private", /values \('ai-images', 'ai-images', false, 52428800\)\s*on conflict \(id\) do update set public = false/.test(sql));
check("deleting an account empties it", /v_buckets text\[\] := array\['user-files', 'create-attachments', 'website-references', 'ai-images'\];/.test(sql));
check("the bucket the code names is the one the migration makes", /export const IMAGE_BUCKET = "ai-images";/.test(code("src/lib/images/image-studio.ts")));

// ---------------------------------------------------------------------
console.log("\n== 6. the screen and the words ==");
// ---------------------------------------------------------------------
check('"image-studio" is declared as a switch', /\n  "image-studio": "/.test(code("src/lib/flags/flags.ts")));
const page = code("src/app/dashboard/images/page.tsx");
check("the page draws the tool only behind the switch and for a plan that has it, the old list otherwise",
  /if \(\(await isFeatureOn\("image-studio", user\)\) && included\) \{/.test(page) && /<ImageShell/.test(page) && /return \(\s*<BuildModulePage config=\{CONFIG\} icon=\{MODULE_ICONS\.images\} \/>/.test(page));
check("...with the prices of this account, and whether pictures can be made at all", /prices=\{imagePrices\(plan, await getPurchasedPackCreditPriceEur\(user\.id\)\)\}/.test(page) && /configured=\{Boolean\(imageApiKey\(\)\)\}/.test(page));
const shell = code("src/components/images/image-shell.tsx");
check("the price is on the screen before it is spent: four, one change, the largest size",
  /t\("priceVariants", \{ count: prices\.variants, n: IMAGE_VARIANTS \}\)/.test(shell) && /t\("priceEdit", \{ count: prices\.edit \}\)/.test(shell) && /t\("price", \{ count: prices\.full \}\)/.test(shell));
const zOf = (src, marker) => Number((new RegExp(`${marker}[^"]*\\bz-\\[(\\d+)\\]`).exec(src) ?? [])[1] ?? 0);
const dialogZ = zOf(code("src/components/credits/cost-estimate.tsx"), "overlay-fade-in fixed inset-0");
const paneZ = zOf(code("src/components/shell/tool-shell.tsx"), 'data-testid="tool-shell-work"\\s+className="fixed inset-0');
check(`...and the question is ABOVE the work pane a phone shows full screen (${dialogZ} over ${paneZ})`, paneZ > 0 && dialogZ > paneZ);
check("...and a large one asks once more", /needsLargeActionConfirmation\(credits, DEFAULTS\)/.test(shell) && /<LargeActionConfirm/.test(shell));
check("a chosen picture is changed with words, the others are not", /if \(editing && shown && chosen !== null\) \{[\s\S]{0,200}change\(text\.slice\(0, MAX_IMAGE_INSTRUCTION_CHARS\), target, index\)/.test(shell) && /`\/api\/images\/\$\{image\.id\}\/edit`, \{ variant: index, instruction \}/.test(shell));
check("without the provider's key it says so, sends nothing, charges nothing", /if \(!configured\) \{\s*say\("tool", t\("notConfigured"\)\);\s*return;/.test(shell));
check("every refusal is said in words", ["too_short", "too_long", "insufficient_credits", "rate_limited", "not_configured", "refused", "busy", "not_found", "ai_unavailable"].every((c) => shell.includes(`case "${c}":`)));
check("the choice outlives the pane: going back to the field on a phone keeps it",
  /const editing = shown !== null && chosen !== null;/.test(shell) && /onCloseWork=\{\(\) => setOpen\(null\)\}/.test(shell));
check("a picture is a button, pressed to choose it", /data-testid="image-variant"/.test(shell) && /aria-pressed=\{chosen === variant\.index\}/.test(shell));

const KEYS = ["name", "help", "placeholder", "placeholderEdit", "aspect", "recent", "recentEmpty", "made", "changed", "fullReady", "choose", "chosen", "picture", "download", "fullMake", "fullDownload", "priceVariants", "priceEdit", "price", "delete", "deleteConfirm", "notConfigured"];
const NESTED = { aspects: ["square", "portrait", "wide", "story"], working: ["variants", "edit", "full"], errors: ["tooShort", "tooLong", "insufficient", "rateLimited", "refused", "busy", "gone", "unavailable", "failed", "offline"] };
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));
check(`the ten languages (${LOCALES.length})`, LOCALES.length === 10);
check(`the words to look for (${KEYS.length} + ${Object.values(NESTED).flat().length})`, KEYS.length >= 20 && Object.values(NESTED).flat().length >= 17);
for (const file of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.images ?? {};
  const missing = [
    ...KEYS.filter((k) => typeof m[k] !== "string" || !m[k].trim()),
    ...Object.entries(NESTED).flatMap(([group, keys]) => keys.filter((k) => typeof m[group]?.[k] !== "string" || !m[group][k].trim()).map((k) => `${group}.${k}`)),
  ];
  check(`${file}: every word, and the prices carry their number`, missing.length === 0 && /\{count/.test(m.price ?? "") && /\{count/.test(m.priceVariants ?? "") && /\{limit\}/.test(m.errors?.tooLong ?? ""), missing.join(", "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
