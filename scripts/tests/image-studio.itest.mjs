/*
 * THE IMAGE TOOL'S CALL AND ITS PRICE, EXECUTED (MASTER 16, package 19).
 *
 * 1. lib/images/gemini-image.ts is run with fetch answered here: the
 *    request it sends (the model in the address, the key in a header, the
 *    picture BEFORE the words for a change, the shape and the 4K size) and
 *    what it does with each kind of answer, a timeout and a stop included.
 * 2. lib/images/image-pricing.ts against the settlement's own functions,
 *    on every plan and every credit pack: the price on the button is what
 *    settleReservation charges for the same pictures, and never under the
 *    business's minimum margin.
 *
 * No key and no network: the provider is never called. That a real key
 * makes a real picture is measured the first time one is set (NEEDS 5).
 *
 * Run: node scripts/tests/image-studio.itest.mjs
 */
import { loadTsWithDeps } from "./load-ts.mjs";

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

const gemini = await loadTsWithDeps("src/lib/images/gemini-image.ts");
const pricing = await loadTsWithDeps("src/lib/images/image-pricing.ts");
const formula = await loadTsWithDeps("src/lib/billing/credit-formula.ts");
const margins = await loadTsWithDeps("src/lib/billing/margin-policy.ts");
const plans = await loadTsWithDeps("src/lib/billing/plans.ts");
const config = (await loadTsWithDeps("src/lib/billing/pricing-config.ts")).resolvePricingConfig();

console.log("image-studio (the call and the price, executed)");

// A real PNG, one pixel, so what comes back is a picture and not a string.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const realFetch = globalThis.fetch;
let seen = [];
let answer = () => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG.toString("base64") } }] } }] }), { status: 200 });
globalThis.fetch = async (url, init) => {
  seen.push({ url: String(url), init, body: JSON.parse(init.body) });
  if (init.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
  return answer(init);
};

// ---------------------------------------------------------------------
console.log("\n== 1. the request ==");
// ---------------------------------------------------------------------
let out = await gemini.callImage({ apiKey: "k-test", model: "gemini-2.5-flash-image", prompt: "a boat", aspect: "4:5" });
check("a picture comes back as the bytes of a picture", out.ok && out.mime === "image/png" && out.data.equals(PNG));
let req = seen[0];
check("the model is in the address, the key in a header and never in it",
  req.url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent" && req.init.headers["x-goog-api-key"] === "k-test" && !req.url.includes("k-test"));
check("a picture is asked for, in the chosen shape, at the default size",
  JSON.stringify(req.body.generationConfig) === JSON.stringify({ responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:5" } }));
check("...with the words alone", req.body.contents[0].parts.length === 1 && req.body.contents[0].parts[0].text === "a boat");

seen = [];
out = await gemini.callImage({ apiKey: "k-test", model: "gemini-3-pro-image-preview", prompt: "same, larger", aspect: "16:9", size: "4K", source: { data: PNG, mime: "image/png" } });
req = seen[0];
check("a change or a larger size sends the picture FIRST, then the words",
  req.body.contents[0].parts[0].inlineData?.data === PNG.toString("base64") && req.body.contents[0].parts[0].inlineData?.mimeType === "image/png" && req.body.contents[0].parts[1].text === "same, larger");
check("...and the largest size is asked for by name", req.body.generationConfig.imageConfig.imageSize === "4K" && req.url.includes("/gemini-3-pro-image-preview:generateContent"));

// ---------------------------------------------------------------------
console.log("\n== 2. every answer ==");
// ---------------------------------------------------------------------
answer = () => new Response(JSON.stringify({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }), { status: 200 });
check("declined is declined", (await gemini.callImage({ apiKey: "k", model: "m", prompt: "p", aspect: "1:1" })).kind === "refused");
answer = () => new Response(JSON.stringify({ error: { code: 429 } }), { status: 429 });
check("a rate limit is a failure, not a picture and not a refusal", (await gemini.callImage({ apiKey: "k", model: "m", prompt: "p", aspect: "1:1" })).kind === "provider");
answer = () => new Response("<html>gateway</html>", { status: 502 });
check("an answer that is not JSON is a failure", (await gemini.callImage({ apiKey: "k", model: "m", prompt: "p", aspect: "1:1" })).kind === "provider");
answer = () => { throw new TypeError("fetch failed"); };
check("no network is a failure", (await gemini.callImage({ apiKey: "k", model: "m", prompt: "p", aspect: "1:1" })).kind === "provider");
const stop = new AbortController();
stop.abort();
check("the reader's stop is a stop", (await gemini.callImage({ apiKey: "k", model: "m", prompt: "p", aspect: "1:1", signal: stop.signal })).kind === "aborted");
seen = [];
check("no key: nothing is sent", (await gemini.callImage({ apiKey: "", model: "m", prompt: "p", aspect: "1:1" })).detail === "not_configured" && seen.length === 0);
check("the call has a ceiling under the route's own", gemini.IMAGE_CALL_TIMEOUT_MS === 100_000);
globalThis.fetch = realFetch;

// ---------------------------------------------------------------------
console.log("\n== 3. the price is the charge ==");
// ---------------------------------------------------------------------
const charge = (usd, plan, pack) =>
  formula.creditsForRealCostOnAccount(formula.usdToEur(usd, config), plan, pack, config, margins.resolveMarginFor(pricing.IMAGE_FEATURE, plan?.slug ?? null, config).margin);
const PACKS = [null, ...plans.CREDIT_PACKS.map((p) => p.price / p.credits)];
let combos = 0;
const wrong = [];
let lowest = Infinity;
for (const plan of Object.values(plans.PLANS)) {
  if (typeof plan.price !== "number") continue;
  for (const pack of PACKS) {
    combos++;
    const p = pricing.imagePrices(plan, pack, config);
    const expect = { variants: charge(4 * pricing.IMAGE_RATES_USD.preview, plan, pack), edit: charge(pricing.IMAGE_RATES_USD.preview, plan, pack), full: charge(pricing.IMAGE_RATES_USD.full, plan, pack) };
    if (JSON.stringify(p) !== JSON.stringify(expect)) wrong.push(`${plan.slug}/${pack}: ${JSON.stringify(p)} vs ${JSON.stringify(expect)}`);
    const credit = formula.effectiveCreditPriceEurForAccount(plan, pack, config);
    lowest = Math.min(lowest, (p.full * credit) / formula.usdToEur(pricing.IMAGE_RATES_USD.full, config));
  }
}
check(`every plan and pack (${combos}): the price shown is what settleReservation charges for those pictures`, combos >= 5 && wrong.length === 0, wrong.slice(0, 3).join(" | "));
check(`...and never under the business's minimum margin (lowest ${lowest.toFixed(2)}x)`, lowest >= 4);
const starter = plans.PLANS.starter ?? Object.values(plans.PLANS).find((p) => p.slug === "starter");
const shown = pricing.imagePrices(starter, null, config);
check(`fewer pictures cost less: three of four is charged as three (${charge(3 * pricing.IMAGE_RATES_USD.preview, starter, null)} of ${shown.variants})`,
  charge(3 * pricing.IMAGE_RATES_USD.preview, starter, null) < shown.variants);
console.log(`  ....  Starter today: 4 pictures ${shown.variants}, one change ${shown.edit}, the largest size ${shown.full} credits (at the list rates in image-pricing.ts)`);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
