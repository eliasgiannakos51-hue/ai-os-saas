// A BRIEF IN, ONE POST PER PLATFORM OUT — AND NOTHING PUBLISHED (V5 #22).
//
// There was no /dashboard/posts before this round. The Content tracker
// is where a person types a caption by hand; this page is where one is
// WRITTEN for them, once per platform, each at that platform's length and
// in its register, with a copy button and no way to post it. The four
// absences (no publishing, no scheduling, no images, no accounts) are
// stated on the screen in ten languages, and section 5 holds them there.
//
// WHAT THIS ENVIRONMENT COULD NOT DO, said first: nothing here calls
// Anthropic. Section 2 checks the prompt, the tool schema and the order
// of the call; the posts parsed in section 1 are fixtures. The live run
// is in the round's report, not in a gate.
//
// THE FOUR THINGS THAT WOULD BE WRONG QUIETLY:
//
//   A CEILING STATED AND NOT APPLIED. The prompt says "never more than
//   280"; a 400-character "tweet" arrives anyway, and the copy button
//   hands over something X will refuse. Section 1 checks the parser, not
//   the prompt — and checks the thing a person PASTES (body plus hashtag
//   line), not one half of it.
//
//   THE SAME TEXT FIVE TIMES. "One post per platform" with one register
//   is a length slider, not a writer. Section 1 holds every platform to
//   its own ceiling and its own register; section 2 holds the prompt to
//   saying so.
//
//   A HOLD SIZED FROM THE BRIEF. A two-line brief for five platforms
//   costs five posts; an estimate that read the brief alone would
//   under-hold every time. Section 4 prices it.
//
//   A PUBLISHER THAT SNEAKS IN. The page says it publishes nothing.
//   Section 3 scans the route, the library and the page for a social
//   network's API and for any outbound call that is not this app's own.
//
// Run: node scripts/tests/posts.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const lookup = (obj, dotted) => dotted.split(".").reduce((n, p) => (n == null ? undefined : n[p]), obj);

const PLATFORMS_TS = "src/lib/posts/platforms.ts";
const PROMPT_TS = "src/lib/posts/prompt.ts";
const GENERATE_TS = "src/lib/posts/generate.ts";
const ROUTE = "src/app/api/posts/generate/route.ts";
const WORKSPACE = "src/components/posts/posts-workspace.tsx";
const PAGE = "src/app/dashboard/posts/page.tsx";
const NAV = "src/lib/sidebar-nav.ts";
const MIGRATION = "supabase/migrations/20260930000000_generated_posts.sql";

const contract = await loadTs(PLATFORMS_TS);
const {
  POST_PLATFORMS, PLATFORMS, MAX_DESCRIPTION_CHARS, MIN_DESCRIPTION_CHARS,
  checkDescription, normalisePlatforms, postClipboardText, cutToLength,
  parsePostsToolInput, parseStoredPostSet, postsEstimateInputChars,
} = contract;

ok(`ten locales were read (${LOCALES.length})`, LOCALES.length === 10);

console.log("== 1. the contract: every ceiling is applied to what a person pastes ==");
ok(`five platforms (${POST_PLATFORMS.join(", ")})`, POST_PLATFORMS.length === 5 && POST_PLATFORMS.every((p) => PLATFORMS[p]?.platform === p));
ok("X's ceiling is the network's own (280)", PLATFORMS.x.maxChars === 280);
ok("every ceiling sits above its target range and under its allowance",
  POST_PLATFORMS.every((p) => { const s = PLATFORMS[p]; return s.targetChars[0] < s.targetChars[1] && s.targetChars[1] <= s.maxChars && s.maxChars < s.outputAllowanceChars; }));
{
  const ceilings = new Set(POST_PLATFORMS.map((p) => PLATFORMS[p].maxChars));
  const registers = new Set(POST_PLATFORMS.map((p) => PLATFORMS[p].style));
  ok("no two platforms share a length or a register", ceilings.size === 5 && registers.size === 5 && POST_PLATFORMS.every((p) => PLATFORMS[p].style.length > 40));
}
ok("a brief is bounded at both ends", MIN_DESCRIPTION_CHARS >= 5 && MAX_DESCRIPTION_CHARS >= 1000 && !checkDescription("hi").ok && !checkDescription("x".repeat(MAX_DESCRIPTION_CHARS + 1)).ok && checkDescription("Our bakery now delivers breakfast to offices").ok);
ok("no platforms asked for means every platform, in the contract's order",
  JSON.stringify(normalisePlatforms([])) === JSON.stringify([...POST_PLATFORMS]) && JSON.stringify(normalisePlatforms(["threads", "x", "x", "tiktok"])) === JSON.stringify(["x", "threads"]));

const ctx = { platforms: [...POST_PLATFORMS], locale: "en" };
const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
{
  const raw = { posts: POST_PLATFORMS.map((platform) => ({ platform, text: words(900), hashtags: [] })) };
  const v = parsePostsToolInput(raw, ctx);
  const over = v.ok ? v.set.posts.filter((p) => postClipboardText(p).length > PLATFORMS[p.platform].maxChars) : POST_PLATFORMS;
  ok("an over-long body is cut to its platform's ceiling, on every platform", v.ok && v.set.posts.length === 5 && over.length === 0, `over: ${over.map((p) => p.platform ?? p).join(", ")}`);
  ok("...and the cut lands on a word, not inside one", v.ok && v.set.posts.every((p) => /word\d+$/.test(p.text)));
}
{
  // The body is EXACTLY at the ceiling and the hashtags would push the
  // paste over it: the body has to give way, because the paste is the
  // post.
  const raw = { posts: [{ platform: "x", text: "a".repeat(280), hashtags: ["bakery", "breakfast"] }] };
  const v = parsePostsToolInput(raw, { platforms: ["x"], locale: "en" });
  const paste = v.ok ? postClipboardText(v.set.posts[0]) : "";
  ok("the hashtag line counts against the ceiling", v.ok && paste.length <= 280 && paste.endsWith("#bakery #breakfast"), `${paste.length} chars`);
}
{
  const many = Array.from({ length: 20 }, (_, i) => `tag${i}`);
  const raw = { posts: POST_PLATFORMS.map((platform) => ({ platform, text: "A post.", hashtags: many })) };
  const v = parsePostsToolInput(raw, ctx);
  ok("hashtags are capped per platform", v.ok && v.set.posts.every((p) => p.hashtags.length === PLATFORMS[p.platform].maxHashtags),
    v.ok ? v.set.posts.map((p) => `${p.platform}:${p.hashtags.length}/${PLATFORMS[p.platform].maxHashtags}`).join(" ") : v.reason);
}
{
  const raw = { posts: [{ platform: "instagram", text: "A post.", hashtags: ["#Bakery", "bakery", " fresh bread ", "##", "", "café"] }] };
  const v = parsePostsToolInput(raw, { platforms: ["instagram"], locale: "en" });
  ok("hashtags are normalised: one #, no spaces, no duplicates, nothing empty", v.ok && JSON.stringify(v.set.posts[0].hashtags) === JSON.stringify(["#Bakery", "#freshbread", "#café"]), v.ok ? v.set.posts[0].hashtags.join(" ") : v.reason);
}
{
  const raw = { posts: [{ platform: "linkedin", text: "Not asked for.", hashtags: [] }, { platform: "x", text: "First.", hashtags: [] }, { platform: "x", text: "Second.", hashtags: [] }, { platform: "threads", text: "   ", hashtags: [] }] };
  const v = parsePostsToolInput(raw, { platforms: ["threads", "x"], locale: "el" });
  ok("a platform that was not asked for is dropped, a second answer is ignored, an empty one is skipped",
    v.ok && v.set.posts.length === 1 && v.set.posts[0].platform === "x" && v.set.posts[0].text === "First." && v.set.locale === "el");
}
{
  const raw = { posts: [{ platform: "threads", text: "T", hashtags: [] }, { platform: "linkedin", text: "L", hashtags: [] }, { platform: "x", text: "X", hashtags: [] }] };
  const v = parsePostsToolInput(raw, ctx);
  ok("posts come back in the contract's order whatever order the model used", v.ok && v.set.posts.map((p) => p.platform).join(",") === "linkedin,x,threads");
}
ok("a set with no posts is refused", !parsePostsToolInput({ posts: [] }, ctx).ok && !parsePostsToolInput(null, ctx).ok);
{
  const stored = parseStoredPostSet({ version: 1, locale: "ar", posts: [{ platform: "x", text: "a".repeat(400), hashtags: ["x"] }] });
  ok("a stored set comes back through the same clamps", stored?.locale === "ar" && stored.posts.length === 1 && postClipboardText(stored.posts[0]).length <= 280);
  ok("...and a row that is not a set is null, not a crash", parseStoredPostSet(null) === null && parseStoredPostSet("x") === null && parseStoredPostSet({ posts: [] }) === null);
}
ok("the paste is the body, a blank line, then the hashtags", postClipboardText({ platform: "x", text: "Body", hashtags: ["#a", "#b"] }) === "Body\n\n#a #b" && postClipboardText({ platform: "x", text: "Body", hashtags: [] }) === "Body");
ok("Chinese is cut at the ceiling, which is a whole character there", cutToLength("你好世界".repeat(100), 280).length === 280 && cutToLength("short", 280) === "short");
{
  // THE OTHER TWO SCRIPTS THIS APP SHIPS IN. Arabic has spaces, so the
  // cut lands on a word from the right-hand end of the string; Greek is
  // cut the same way; and a hashtag in either script is a hashtag —
  // normaliseHashtag reads \p{L}, not [A-Za-z].
  const arabic = "المخبز يوصل الإفطار إلى المكاتب في وسط المدينة ".repeat(20);
  const cutAr = cutToLength(arabic, 280);
  ok("Arabic is cut on a word, not inside one", cutAr.length <= 280 && cutAr.length > 224 && /[^\s]$/u.test(cutAr) && arabic.startsWith(cutAr) && arabic[cutAr.length] === " ", `${cutAr.length} chars, next char ${JSON.stringify(arabic[cutAr.length])}`);
  const greek = "Το αρτοποιείο παραδίδει πρωινό σε γραφεία στο κέντρο ".repeat(20);
  const cutEl = cutToLength(greek, 280);
  ok("...and so is Greek", cutEl.length <= 280 && cutEl.length > 224 && greek[cutEl.length] === " ");
  const v = parsePostsToolInput({ posts: [
    { platform: "x", text: arabic, hashtags: ["مخبز", "#إفطار", "مخبز"] },
    { platform: "threads", text: greek, hashtags: ["αρτοποιείο", "Αρτοποιείο"] },
  ] }, { platforms: ["x", "threads"], locale: "ar" });
  const ar = v.ok ? v.set.posts.find((p) => p.platform === "x") : null;
  const el = v.ok ? v.set.posts.find((p) => p.platform === "threads") : null;
  ok("an Arabic post and its Arabic hashtags fit X's ceiling", Boolean(ar) && postClipboardText(ar).length <= 280 && JSON.stringify(ar.hashtags) === JSON.stringify(["#مخبز", "#إفطار"]), ar ? `${postClipboardText(ar).length} chars, ${ar.hashtags.join(" ")}` : "no post");
  ok("a Greek post keeps one Greek hashtag, case-insensitively", Boolean(el) && postClipboardText(el).length <= 500 && JSON.stringify(el.hashtags) === JSON.stringify(["#αρτοποιείο"]), el ? el.hashtags.join(" ") : "no post");
}
ok("the estimate grows with every platform asked for",
  postsEstimateInputChars(100, ["x"]) - 100 === PLATFORMS.x.outputAllowanceChars &&
  postsEstimateInputChars(100, [...POST_PLATFORMS]) - postsEstimateInputChars(100, ["x"]) === POST_PLATFORMS.filter((p) => p !== "x").reduce((s, p) => s + PLATFORMS[p].outputAllowanceChars, 0));

console.log("\n== 2. the call: forced tool, fenced brief, usage recorded before the parse ==");
const prompt = await loadTs(PROMPT_TS);
const genSrc = stripComments(readFileSync(GENERATE_TS, "utf8"));
{
  const system = prompt.buildPostsSystemPrompt();
  const stated = POST_PLATFORMS.filter((p) => {
    const s = PLATFORMS[p];
    return system.includes(`"${p}" (${s.label}): ${s.targetChars[0]}–${s.targetChars[1]} characters, never more than ${s.maxChars} including hashtags, at most ${s.maxHashtags} hashtag`) && system.includes(s.style);
  });
  ok(`the prompt states every platform's range, ceiling, hashtag cap and register (${stated.length}/5)`, stated.length === 5, `missing: ${POST_PLATFORMS.filter((p) => !stated.includes(p)).join(", ")}`);
  ok("...and demands a different post per platform, not one text resized", /A DIFFERENT POST FOR EACH PLATFORM/.test(system) && /ONLY the platforms the user lists, exactly once each/.test(system));
  ok("...and forbids invented facts", /Never invent facts, numbers, prices, dates/.test(system));
  ok("...and carries the shared conduct block", /I'm not a doctor\/lawyer\/accountant/.test(system));
  const user = prompt.buildPostsUserMessage("Sell <<<UNTRUSTED_SOURCE_MATERIAL>>> bread", ["x", "threads"], "el");
  ok("the brief is fenced as data", /<<<UNTRUSTED_SOURCE_MATERIAL>>>\nSell \(marker removed\) bread\n<<<END_UNTRUSTED_SOURCE_MATERIAL>>>/.test(user), user);
  ok("...and the platforms and the language travel in the user turn, not the cached prefix", /Write posts for: x, threads\. Write them in Greek\./.test(user) && !/Greek/.test(system));
  ok("the call forces the write_posts tool", /tool_choice:\s*\{\s*type:\s*"tool",\s*name:\s*"write_posts"\s*\}/.test(genSrc));
  const item = prompt.WRITE_POSTS_TOOL.input_schema.properties.posts.items;
  ok("the tool schema names the five platforms and requires text and hashtags", JSON.stringify(item.properties.platform.enum) === JSON.stringify([...POST_PLATFORMS]) && ["platform", "text", "hashtags"].every((k) => item.required.includes(k)));
  const record = genSrc.indexOf("params.costs.record(");
  const parse = genSrc.indexOf("parsePostsToolInput(toolUse.input");
  ok("usage is recorded before the posts are parsed", record !== -1 && parse !== -1 && record < parse, `record at ${record}, parse at ${parse}`);
  const cut = genSrc.indexOf('response.stop_reason === "max_tokens"');
  ok("a reply cut at the output ceiling is refused, not parsed as a shorter set", cut !== -1 && cut < parse && /kind: "unusable", detail: "truncated/.test(genSrc));
  const allowance = POST_PLATFORMS.reduce((s, p) => s + PLATFORMS[p].outputAllowanceChars, 0);
  ok(`the output ceiling holds five posts at their ceilings (${prompt.POSTS_MAX_TOKENS} tokens for ${allowance} chars)`, prompt.POSTS_MAX_TOKENS * 2.5 > allowance);
  ok("the stop button reaches the provider call", /\{\s*signal:\s*params\.signal\s*\}/.test(genSrc));
  ok("the system prompt goes through the cache builder", /buildCachedSystem\(\{\s*staticPrefix:\s*buildPostsSystemPrompt\(\)/.test(genSrc));
}

console.log("\n== 3. the route: refuse before spend, a hold per platform, and no publisher anywhere ==");
{
  const src = stripComments(readFileSync(ROUTE, "utf8"));
  const at = (re) => src.search(re);
  const desc = at(/checkDescription\(/), auth = at(/auth\.getUser\(/), breaker = at(/checkAiCallAllowed\(/), reserve = at(/await reserveCredits\(/), call = at(/await generatePosts\(/);
  ok("the brief is checked before the user is read", desc !== -1 && auth !== -1 && desc < auth);
  ok("the breaker runs before the hold, and the hold before the model", breaker < reserve && reserve < call, `${breaker} < ${reserve} < ${call}`);
  ok("the hold is sized per platform asked for", /inputChars:\s*postsEstimateInputChars\(description\.length,\s*platforms\)/.test(src));
  const abortedBlock = src.slice(at(/outcome\.kind === "aborted"/), at(/outcome\.kind === "provider"/));
  ok("a stopped run releases the hold and writes no history row", /releaseReservation\(/.test(abortedBlock) && /status:\s*499/.test(abortedBlock) && !/generated_posts/.test(abortedBlock));
  const providerBlock = src.slice(at(/outcome\.kind === "provider"/), src.indexOf("if (!outcome.ok) {"));
  ok("an unreachable provider releases the hold and records the failure", /releaseReservation\(/.test(providerBlock) && /error: "ai_unavailable"/.test(providerBlock));
  const unusable = src.slice(src.indexOf("if (!outcome.ok) {"), src.indexOf("const settlement = await settleReservation({\n      userId"));
  ok("an unusable answer still settles — the tokens were spent", /settleReservation\(/.test(unusable) && !/releaseReservation\(/.test(unusable));
  const inserts = [...src.matchAll(/\.from\("generated_posts"\)\s*\.insert\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
  ok(`every row is stamped with the session's user, not the body's (${inserts.length} inserts)`, inserts.length === 3 && inserts.every((b) => /^\s*user_id:\s*user\.id,/m.test(b)) && !/body\.user/.test(src));
  ok("the row is written through the service role, because insert is revoked from the person", /admin\s*\.from\("generated_posts"\)\s*\.insert\(/.test(src) || /admin\.from\("generated_posts"\)\.insert\(/.test(src));
  ok("both the hold and the charge are labelled posts_generate", (src.match(/"posts_generate"/g) ?? []).length >= 3);
  ok("the function ceiling is declared", /export const maxDuration = 60;/.test(readFileSync(ROUTE, "utf8")));
  // NOTHING IS PUBLISHED. Not "no button": no host, no SDK, no outbound
  // call in the route or the library, and the page's only fetch is this
  // app's own route.
  const SOCIAL = /api\.linkedin\.com|api\.twitter\.com|api\.x\.com|graph\.facebook\.com|graph\.instagram\.com|graph\.threads\.net|linkedin-api|twitter-api|instagram-api|buffer\.com|hootsuite/i;
  const lib = ["platforms.ts", "prompt.ts", "generate.ts"].map((f) => stripComments(readFileSync(`src/lib/posts/${f}`, "utf8"))).join("\n");
  const ws = stripComments(readFileSync(WORKSPACE, "utf8"));
  const page = stripComments(readFileSync(PAGE, "utf8"));
  const wsFetches = [...ws.matchAll(/fetch\(\s*"([^"]+)"/g)].map((m) => m[1]);
  ok("nothing here reaches a social network", !SOCIAL.test(src + lib + ws + page) && !/\bfetch\(/.test(src + lib), "a social host or an outbound call appeared in the route or the library");
  ok(`the page's only outbound call is this app's route (${wsFetches.join(", ")})`, wsFetches.length === 1 && wsFetches[0] === "/api/posts/generate");
  ok("the page reads the rows under the person's own client", /supabase\s*\.from\("generated_posts"\)\s*\.select\(/.test(page) && !/createAdminClient/.test(page));
  ok("...and never inserts one from the browser", !/from\("generated_posts"\)\s*\.insert/.test(ws) && /from\("generated_posts"\)\.delete\(\)/.test(ws));
}

console.log("\n== 4. the price: per platform, and the number the owner was told ==");
{
  const est = await loadTs("src/lib/billing/estimate.ts");
  const margin = await loadTs("src/lib/billing/margin-policy.ts");
  const pricing = await loadTs("src/lib/billing/pricing-config.ts");
  const plans = await loadTs("src/lib/billing/plans.ts");
  const formula = await loadTs("src/lib/billing/credit-formula.ts");
  ok("postsGenerate has a profile", Boolean(est.ACTION_PROFILES.postsGenerate));
  ok("...and settles under posts_generate", margin.ACTION_TO_FEATURE.postsGenerate === "posts_generate");
  const config = pricing.DEFAULTS;
  const brief = 400;
  const sets = [["x"], ["linkedin", "x", "instagram"], [...POST_PLATFORMS]];
  const rows = [];
  for (const slug of ["free", "starter", "professional"]) {
    const plan = plans.getPlan(slug);
    const price = formula.effectiveCreditPriceEurForAccount(plan, null, config);
    const credits = sets.map((platforms) =>
      est.estimateForAction("postsGenerate", { model: prompt.POSTS_MODEL, inputChars: postsEstimateInputChars(brief, platforms), planSlug: slug }, config, price).estimatedCredits);
    rows.push({ slug, credits });
    console.log(`        ${slug.padEnd(12)} 1 platform ${String(credits[0]).padStart(3)}  3 platforms ${String(credits[1]).padStart(3)}  5 platforms ${String(credits[2]).padStart(3)} credits`);
  }
  ok("the estimate rises with the platform count on every plan", rows.every((r) => r.credits[0] < r.credits[1] && r.credits[1] < r.credits[2]));
  // THE CLAIM THIS CORRECTS. The V5 list said "~3-8 credits". Measured
  // on 2026-09-09 through the same estimator the route reserves against,
  // with a 400-character brief: Free 3 / 6 / 8, Starter 2 / 5 / 7,
  // Professional 4 / 10 / 13 for one, three and five platforms. So
  // "3-8" is true on Free and Starter and NOT on Professional, whose
  // credit is cheaper and therefore buys less — the same shape a
  // ten-slide deck showed (13 / 16 / 26). The band is wide on purpose:
  // it holds the ORDER of magnitude, and a profile change that moved a
  // five-platform set outside it should be argued for in the same commit.
  const five = rows.map((r) => r.credits[2]);
  ok(`five platforms are priced between 2 and 16 credits on every plan (${five.join(", ")})`, five.every((c) => c >= 2 && c <= 16));
}

console.log("\n== 5. the page: four absences in ten languages, a copy button, and where it sits ==");
{
  const ws = stripComments(readFileSync(WORKSPACE, "utf8"));
  const limits = [...ws.matchAll(/export const POST_LIMITS = \[([^\]]+)\]/g)][0]?.[1].match(/"(\w+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
  ok(`the four absences are declared (${limits.length})`, limits.length === 4 && limits[0] === "no_publish", limits.join(", "));
  for (const limit of limits) {
    const missing = LOCALES.filter((l) => typeof lookup(messages[l], `posts.limits.${limit}`) !== "string");
    ok(`${limit}: present in all ten locales`, missing.length === 0, missing.join(", "));
  }
  ok("the English absences each say what is NOT done", limits.every((l) => /\b(no|not|nothing)\b/i.test(lookup(messages.en, `posts.limits.${l}`))));
  ok("the first absence names the five networks it does not reach", ["LinkedIn", "X", "Instagram", "Facebook", "Threads"].every((n) => LOCALES.every((l) => lookup(messages[l], "posts.limits.no_publish").includes(n))));
  ok("the absences are drawn from the array, not retyped", /POST_LIMITS\.map\(\(limit\)/.test(ws) && /t\(`limits\.\$\{limit\}`\)/.test(ws));
  ok("one click copies through the clipboard", /await navigator\.clipboard\.writeText\(text\)/.test(ws));
  ok("...and what is copied is what the parser measured", /const clipboard = postClipboardText\(post\)/.test(ws) && /count: clipboard\.length, max: spec\.maxChars/.test(ws) && /<CopyButton text=\{clipboard\}/.test(ws));
  ok("...with a second button for all of them at once", /<CopyButton text=\{allText\}/.test(ws));
  ok("a refused clipboard is said, not swallowed", /addToast\(tCommon\("copyFailed"\), "error"\)/.test(ws));
  ok("every platform is a checkbox that shows its ceiling", /POST_PLATFORMS\.map\(\(p\)/.test(ws) && /t\("form\.upTo", \{ max: spec\.maxChars \}\)/.test(ws));
  ok("the brand names are shown as they are, in every language", /<span>\{spec\.label\}<\/span>/.test(ws) && LOCALES.every((l) => lookup(messages[l], "posts.platforms") === undefined));
  ok("a platform the model declined is shown as missing, not silently absent", /t\("result\.missing", \{ platform: PLATFORMS\[p\]\.label \}\)/.test(ws));
  ok("the page names itself through the nav key", /pageTitle\("sidebar\.items\.posts"\)/.test(readFileSync(PAGE, "utf8")));
  for (const l of LOCALES) {
    ok(`${l}: the nav name is the page heading`, lookup(messages[l], "sidebar.items.posts") === lookup(messages[l], "posts.title"));
  }
  ok("en: the hint says it publishes nothing", /publishes nothing/i.test(lookup(messages.en, "sidebar.hints.posts")));
  const nav = stripComments(readFileSync(NAV, "utf8"));
  const make = nav.slice(nav.indexOf('heading: "Make"'), nav.indexOf('heading: "Ask"'));
  const row = make.slice(make.indexOf('"/dashboard/posts"'), make.indexOf('"/dashboard/create"'));
  ok("the row is drawn under Make", row.length > 0 && make.indexOf('"/dashboard/presentations"') < make.indexOf('"/dashboard/posts"') && !/hidden:\s*true/.test(row), "the row is hidden or filed elsewhere");
  ok("the label has its key", /Posts: "posts"/.test(readFileSync("src/lib/sidebar-label-keys.ts", "utf8")));
  const tips = await loadTs("src/lib/help-tips.ts");
  const tip = tips.HELP_TIPS.find((t) => t.id === "posts");
  ok("the page carries a help tip that says it does not publish", tip?.file === PAGE && /does not publish/i.test(lookup(messages.en, "help.posts.doesNot")));
  ok("the Content tracker is untouched — it is where a caption is typed by hand", /slug: "content"/.test(readFileSync("src/lib/modules.ts", "utf8")));
}

console.log("\n== 6. the migration: the columns the route writes, insert revoked, nothing dropped ==");
{
  const sql = readFileSync(MIGRATION, "utf8");
  ok("the table is created idempotently", /create table if not exists public\.generated_posts \(/.test(sql));
  const route = stripComments(readFileSync(ROUTE, "utf8"));
  const insertBlocks = [...route.matchAll(/\.insert\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
  const inserted = [...new Set(insertBlocks.flatMap((b) => [...b.matchAll(/^\s+(\w+)(?::|,)/gm)].map((m) => m[1])))];
  const missing = inserted.filter((col) => !new RegExp(`^\\s+${col}\\s+\\w`, "m").test(sql));
  ok(`every column the route inserts exists (${inserted.length} columns, ${insertBlocks.length} inserts)`, insertBlocks.length === 3 && inserted.length >= 7 && missing.length === 0, `not in the migration: ${missing.join(", ")}`);
  ok("status and the receipt are constrained", /status in \('done', 'failed'\)/.test(sql) && /credits_charged >= 0/.test(sql));
  ok("no column for a publication or a schedule exists", !/published_at|scheduled_at|posted_at|external_id/.test(sql));
  const sqlCode = sql.replace(/^\s*--.*$/gm, "");
  ok("nothing is dropped or truncated", !/drop table|truncate/i.test(sqlCode));
  ok("row level security is on, with a policy per verb the person holds", /enable row level security/.test(sql) && ["select", "update", "delete"].every((v) => new RegExp(`for ${v} using \\(auth\\.uid\\(\\) = user_id\\)`).test(sql)));
  ok("the grant travels with the policies", /grant select, update, delete on public\.generated_posts to authenticated;/.test(sql));
  ok("insert is revoked from the person — the route writes the row", /revoke insert on public\.generated_posts from authenticated;/.test(sql) && !/grant[^;]*insert[^;]*generated_posts/.test(sqlCode));
  ok("anon holds nothing", /revoke all on public\.generated_posts from anon;/.test(sql));
  ok("the table is in the GDPR registry", /table: "generated_posts"/.test(readFileSync("src/lib/gdpr/user-data-registry.ts", "utf8")));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
