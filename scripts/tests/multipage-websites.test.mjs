// MORE THAN ONE PAGE, AND EVERY PAGE TREATED LIKE THE FIRST.
//
// A one-page site looks like another one-page site whatever a structural
// similarity score says, so this is the other half of the "same template"
// report. It is also the change with the widest blast radius in this
// codebase: FOUR tables carry a site's HTML, and a page that reaches only
// three of them is a navigation link to a 404 or a rollback that restores
// half a site.
//
// WHAT THIS FILE IS REALLY FOR. Splitting a generation into pages is
// easy. Doing it without letting a sub-page skip the checks the home page
// passes is the part that can ship broken and look fine — the sub-page
// renders, it just carries an unsafe link, an invented number, an
// uncredited photograph or an injected script.
//
// Run: node scripts/tests/multipage-websites.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const pagesLib = await loadTs("src/lib/publishing/website-pages.ts");
const multi = await loadTs("src/lib/website-multipage.ts");
const doc = (t) =>
  `<!DOCTYPE html><html><head><title>${t}</title><meta name="description" content="A description for ${t} long enough to clear the hundred character floor the completeness check applies."></head><body><h1>${t}</h1></body></html>`;

console.log("== 1. a slug is a URL path, so it is not trusted ==");
{
  // CROSS-PRODUCT over the ways a model can hand back something that is
  // not a path segment — not a sample of them.
  const REJECT = [
    ["traversal", "../admin"], ["encoded traversal", "%2e%2e"], ["double encoded", "%252e%252e"],
    ["a second segment", "a/b"], ["backslash", "a\\b"], ["dotfile", ".env"],
    ["absolute", "/etc/passwd"], ["reserved: index", "index"], ["reserved: api", "api"],
    ["reserved: sitemap", "sitemap.xml"], ["empty", ""], ["whitespace", "   "],
    ["too long", "x".repeat(41)], ["leading hyphen", "-a"], ["trailing hyphen", "a-"],
    ["double hyphen", "a--b"], ["an embedded space", "a b"], ["not a string", 42],
  ];
  for (const [label, value] of REJECT) {
    ok(`rejects ${label}`, pagesLib.validatePageSlug(value).ok === false, JSON.stringify(value));
  }
  const ACCEPT = [["plain", "services"], ["hyphenated", "contact-us"], ["numeric", "shop2"], ["uppercase is folded", "Services"]];
  for (const [label, value] of ACCEPT) {
    ok(`accepts ${label}`, pagesLib.validatePageSlug(value).ok === true, JSON.stringify(value));
  }
  ok("folding is to lowercase", pagesLib.validatePageSlug("Services").slug === "services");
}

console.log("\n== 2. a bad page does not fail the whole generation ==");
{
  const raw = [
    `<!--IONEXA:PAGE slug="home" label="Home"-->`, doc("Home"),
    `<!--IONEXA:PAGE slug="services" label="Services"-->`, doc("Services"),
    `<!--IONEXA:PAGE slug="../admin" label="Bad"-->`, doc("Bad"),
    `<!--IONEXA:PAGE slug="services" label="Duplicate"-->`, doc("Duplicate"),
    `<!--IONEXA:PAGE slug="contact" label="Contact"-->`, `<!DOCTYPE html><html><head><title>Cut off mid document with enough characters to clear the floor but no closing tag`,
  ].join("\n");
  const r = multi.splitGeneratedPages(raw);
  ok("the good page survives", r.pages.map((p) => p.slug).join(",") === "services", JSON.stringify(r.pages.map((p) => p.slug)));
  ok("the traversal is dropped", r.dropped.some((d) => d.includes("admin")), r.dropped.join(" | "));
  // A DUPLICATE IS NOT A MERGE: two pages claiming /services means one is
  // unreachable, and keeping the last would make which one arbitrary.
  ok("the duplicate is dropped", r.dropped.some((d) => d.includes("duplicate")), r.dropped.join(" | "));
  // THE TRUNCATION CHECK IS PER PAGE. The existing guard asks whether THE
  // RESPONSE ended cleanly, which in a multi-page response only ever
  // reports on the last page.
  ok("the truncated page is dropped", r.dropped.some((d) => d.includes("incomplete")), r.dropped.join(" | "));
  ok("the home page is the first document", /<title>Home<\/title>/.test(r.home));
}

console.log("\n== 3. a response with no markers is still a site ==");
{
  const r = multi.splitGeneratedPages(doc("Only one"));
  ok("it becomes the home page", /Only one/.test(r.home));
  ok("with no extra pages", r.pages.length === 0);
  ok("and nothing reported as dropped", r.dropped.length === 0, r.dropped.join(" | "));
}

console.log("\n== 4. EVERY page goes through EVERY check ==");
// THE PART THAT SHIPS BROKEN AND LOOKS FINE. Each of these ran on one
// document before; running on one document now means the home page is
// checked and the rest are not.
{
  const gen = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
  ok("the split happens before the checks",
    gen.indexOf("splitGeneratedPages(") < gen.indexOf("findInventedNumbers("));
  ok("...and after image resolution, so one Unsplash budget covers the site",
    gen.indexOf("resolveWebsiteImagePlaceholders(") < gen.indexOf("splitGeneratedPages("));
  const PER_PAGE = [
    ["invented numbers", /documents\.flatMap\(\(doc\) => findInventedNumbers\(doc, description\)\)/],
    ["link safety", /documents\.map\(\(doc\) => makeGeneratedLinksSafe\(doc\)\.html\)/],
    ["unsplash attribution", /cleaned\.map\(\(doc\) => enforceUnsplashAttribution\(doc\)\)/],
    ["script stripping", /cleaned\.map\(\(doc\) => stripDisallowedExternalScripts\(doc\)\)/],
    ["security scan", /stripped\.flatMap\(\(doc\) => scanWebsiteHtmlForSecurityIssues\(doc\)\)/],
  ];
  for (const [name, re] of PER_PAGE) {
    ok(`${name} runs on every document`, re.test(gen), name);
  }
  // The AI content review is deliberately ONE call over the whole site:
  // content is content wherever it sits, and four reviews would cost four
  // times as much to answer the same question.
  ok("the AI review is one call for the whole site",
    /reviewWebsiteContentSafety\(\s*apiKey,\s*stripped\.length === 1/.test(gen));
}

console.log("\n== 5. all FOUR tables that carry a site's HTML ==");
{
  const migration = readFileSync("supabase/migrations/20260822000000_website_pages.sql", "utf8");
  for (const table of ["user_websites", "published_sites", "website_versions", "site_versions"]) {
    ok(`${table} gets the column`,
      new RegExp(`alter table public\\.${table}\\s+add column if not exists pages jsonb`).test(migration), table);
  }
  // NOTHING DESTRUCTIVE, checked on the code rather than the prose — the
  // comment block says "no DROP, no TRUNCATE" and a naive scan reads that
  // as the thing itself.
  const code = migration.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  for (const [name, re] of [["DROP TABLE", /\bdrop\s+table\b/i], ["TRUNCATE", /\btruncate\b/i],
                            ["DELETE", /\bdelete\s+from\b/i], ["DROP COLUMN", /\bdrop\s+column\b/i]]) {
    ok(`the migration contains no ${name}`, !re.test(code));
  }
  ok("and it is idempotent", (migration.match(/if not exists/gi) ?? []).length >= 5);
  const publish = readFileSync("src/app/api/websites/[id]/publish/route.ts", "utf8");
  // EVERY write, not "somewhere in the file". Publishing touches three
  // rows — the live site (updated), the live site (first publish) and the
  // version history — and a presence test stays green while two of the
  // three keep the column and the third quietly drops it. That is exactly
  // the shape of "publish works, rollback restores half a site".
  const PAGE_WRITE = "pages: publishedPages.length > 0 ? publishedPages : null,";
  const WRITE_SITES = [
    ["the live row is updated with them", /\.from\("published_sites"\)\s*\.update\(\{[\s\S]*?\n\s*\}\)/],
    ["a first publish inserts them", /\.from\("published_sites"\)\s*\.insert\(\{[\s\S]*?\n\s*\}\)/],
    ["the version history keeps them", /\.from\("site_versions"\)\s*\.insert\(\{[\s\S]*?\n\s*\}\)/],
  ];
  for (const [name, re] of WRITE_SITES) {
    const block = publish.match(re);
    ok(`${name} — the write block exists`, Boolean(block), name);
    ok(`${name} — and it carries the pages`, Boolean(block) && block[0].includes(PAGE_WRITE), name);
  }
  ok("...and there is no fourth write that could be forgotten",
    publish.split(PAGE_WRITE).length - 1 === WRITE_SITES.length,
    String(publish.split(PAGE_WRITE).length - 1));
  ok("...after putting each through the same safety pass",
    /publishedPages = draftPages\.map\(\(pg\) => \(\{[\s\S]{0,200}stripDisallowedExternalScripts\(pg\.html\)/.test(publish));
  ok("...and scanning every one of them",
    /\[html, \.\.\.publishedPages\.map\(\(pg\) => pg\.html\)\]\.flatMap\(/.test(publish));
}

console.log("\n== 6. the route serves them, and refuses what it should ==");
{
  const route = readFileSync("src/app/s/[subdomain]/[page]/route.ts", "utf8");
  ok("the slug is validated before any lookup",
    route.indexOf("validatePageSlug(params.page)") < route.indexOf("normalisePages(site.pages)"));
  ok("an invalid slug is a 404", /if \(!slug\.ok\) return notFoundResponse\(\);/.test(route));
  // NOT A FALLBACK TO HOME. Serving the home page for an unknown path
  // tells a crawler every URL under the site exists, and tells a visitor
  // who mistyped that they arrived.
  ok("an unknown page is a 404, not the home page", /if \(!page\) return notFoundResponse\(\);/.test(route));
  ok("it selects the pages column", /select\("id, user_id, html_content, pages,/.test(route));
  ok("it carries the same published-site headers", /publishedSiteHeaders\(\)/.test(route));
  ok("and the same rate limit", /publicRequestAllowed\(request\)/.test(route));
}

console.log("\n== 8. LIVE EDITING is per page, not just the first ==");
// THE DECISION, EXECUTED. Which document an edit is sent and where the
// result is written back are the two things that go wrong here, and both
// go wrong invisibly: /services becomes a copy of /, or the front page
// becomes the services page. Neither throws. So this runs the real
// functions over the real cross-product rather than reading the route.
{
  const target = await loadTs("src/lib/publishing/page-edit-target.ts");
  const HOME = doc("Home");
  const PAGES = [
    { slug: "services", label: "Services", html: doc("Services") },
    { slug: "contact", label: "Contact", html: doc("Contact") },
  ];

  // Every way of naming the home page × the answer being the home page.
  for (const [label, raw] of [["absent", undefined], ["empty", ""], ["whitespace", "  "],
                              ["the literal home", "home"], ["HOME uppercased", "HOME"],
                              ["not a string", 7]]) {
    const r = target.resolveEditTarget(HOME, PAGES, raw);
    ok(`${label} means the home page`, r.ok === true && r.index === target.HOME_INDEX, JSON.stringify(r));
    ok(`${label} sends the home document`, r.ok === true && r.html === HOME);
  }

  // Every real page × being reachable by its own slug, in either case.
  for (const pg of PAGES) {
    for (const [label, raw] of [["exact", pg.slug], ["uppercased", pg.slug.toUpperCase()],
                                ["padded", `  ${pg.slug} `]]) {
      const r = target.resolveEditTarget(HOME, PAGES, raw);
      ok(`${pg.slug} is reachable (${label})`, r.ok === true && r.html === pg.html, JSON.stringify(r));
    }
  }

  // AN UNKNOWN PAGE IS A REFUSAL, NOT THE HOME PAGE. A fallback here is
  // an edit applied to a document the owner was not looking at.
  const unknown = target.resolveEditTarget(HOME, PAGES, "shop");
  ok("an unknown page is refused", unknown.ok === false && unknown.reason === "unknown_page", JSON.stringify(unknown));
  ok("...and it is NOT silently the home page", !(unknown.ok === true));
  const noPages = target.resolveEditTarget(HOME, [], "services");
  ok("a site with no pages refuses one", noPages.ok === false && noPages.reason === "unknown_page");
  for (const [label, raw] of [["traversal", "../admin"], ["a second segment", "a/b"],
                              ["reserved", "api"], ["too long", "x".repeat(41)]]) {
    const r = target.resolveEditTarget(HOME, PAGES, raw);
    ok(`${label} is rejected as a slug`, r.ok === false && r.reason === "invalid_slug", JSON.stringify(r));
  }

  // WHERE THE RESULT GOES BACK — the other half, over the cross-product
  // of every index × what must not move.
  const EDITED = doc("Edited");
  {
    const r = target.applyEditedDocument(HOME, PAGES, target.HOME_INDEX, EDITED);
    ok("a home edit replaces html_content", r.htmlContent === EDITED);
    ok("...and leaves every page byte-identical",
      JSON.stringify(r.pages) === JSON.stringify(PAGES));
  }
  for (let i = 0; i < PAGES.length; i += 1) {
    const r = target.applyEditedDocument(HOME, PAGES, i, EDITED);
    ok(`a ${PAGES[i].slug} edit leaves the home page alone`, r.htmlContent === HOME);
    ok(`...and replaces only ${PAGES[i].slug}`, r.pages[i].html === EDITED);
    ok(`...keeping its slug and label`,
      r.pages[i].slug === PAGES[i].slug && r.pages[i].label === PAGES[i].label);
    for (let j = 0; j < PAGES.length; j += 1) {
      if (j === i) continue;
      ok(`...and not touching ${PAGES[j].slug}`, r.pages[j].html === PAGES[j].html);
    }
    ok(`...without mutating the input array`, PAGES[i].html !== EDITED);
  }
}

// THE WIRING. Source-level, because a route handler cannot be called
// without a database — but each of these is a specific way the executed
// logic above could be present and unused.
{
  const edit = readFileSync("src/app/api/websites/edit/route.ts", "utf8");
  ok("the edit route reads the pages column", /\.select\("id, html_content, description, pages"\)/.test(edit));
  ok("the page is resolved BEFORE the edit lock is claimed",
    edit.indexOf("resolveEditTarget(") < edit.indexOf("claim_edit_lock"));
  ok("an unknown page is a 404", /reason === "invalid_slug"[\s\S]{0,300}status: 404/.test(edit));
  ok("the model is sent the SELECTED document",
    /editWebsiteHtml\(apiKey, sourceHtml,/.test(edit));
  ok("...and the hold is sized from it too",
    /inputChars: sourceHtml\.length \+ changeRequest\.length/.test(edit));
  ok("the result is written back through applyEditedDocument",
    /const saved = applyEditedDocument\(website\.html_content, sitePages, targetIndex, updatedHtml\)/.test(edit));
  ok("...and BOTH columns are saved together",
    /\.update\(\{ html_content: nextHomeHtml, pages: nextPages\.length > 0 \? nextPages : null \}\)/.test(edit));
  // A version is what the history shows, so a page edit that stored only
  // the page would show a version of half a site.
  ok("the version row carries the whole site",
    /html_content: nextHomeHtml,\s*\n\s*pages: nextPages\.length > 0 \? nextPages : null,/.test(edit));
  // THE REFUSAL A USER CAN ACTUALLY REACH — a stale page list — must not
  // reach them in English.
  ok("the refusals carry a machine-readable reason",
    /reason: "invalid_page"/.test(edit) && /reason: "unknown_page"/.test(edit));
  ok("the page is part of the breaker fingerprint",
    /fingerprintRequest\(websiteId, `\$\{pageSlugRaw\}/.test(edit));

  const ws = readFileSync("src/components/website-builder/website-builder-workspace.tsx", "utf8");
  ok("the workspace sends the page with the edit", /^\s*pageSlug,$/m.test(ws));
  // ONE picker for two tabs: a preview showing /services beside an edit
  // form that changes / is the same silent bug from the other end.
  ok("the picker is one element, used twice",
    /const pageTabs =/.test(ws) && (ws.match(/\{pageTabs\}/g) ?? []).length === 2,
    String((ws.match(/\{pageTabs\}/g) ?? []).length));
  ok("...and the workspace shows a TRANSLATED sentence for it",
    /data\?\.reason === "unknown_page" \|\| data\?\.reason === "invalid_page"/.test(ws) &&
    /setEditError\(t\("editPageGone"\)\)/.test(ws));
  ok("the shown page is derived, so an unknown slug falls back home",
    /const activePage = displayedPages\.find\(\(pg\) => pg\.slug === pageSlug\) \?\? null;/.test(ws) &&
    /displayedHtml = activePage\?\.html \?\? displayedSource\?\.html_content/.test(ws));
  ok("the preview reloads when the page changes",
    /key=\{`\$\{previewWebsite\.id\}:\$\{viewingVersion\?\.id \?\? "latest"\}:\$\{pageSlug \|\| "home"\}`\}/.test(ws));
  // A version's OWN pages, not the current site's — otherwise viewing an
  // old version shows today's sub-pages under yesterday's home page.
  ok("viewing an old version shows THAT version's pages",
    /displayedSource[\s\S]{0,120}viewingVersion \?\? previewWebsite/.test(ws) &&
    /normalisePages\(displayedSource\?\.pages\)/.test(ws));

  // Ten locales, or the picker renders a raw key for somebody.
  for (const loc of ["en", "el", "de", "es", "fr", "it", "ja", "pt", "zh", "ar"]) {
    const m = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
    const wb = m.dashboard?.websiteBuilder ?? {};
    ok(`${loc} has the picker strings`,
      typeof wb.pageSelectLabel === "string" && wb.pageSelectLabel.length > 0 &&
      typeof wb.pageHome === "string" && wb.pageHome.length > 0 &&
      typeof wb.editPageGone === "string" && wb.editPageGone.length > 0, loc);
  }
}

console.log("\n== 7. the prompt asks for what the parser expects ==");
{
  const instruction = multi.multipageInstruction();
  // A MARKER THE PROMPT AND THE PARSER DISAGREE ABOUT is a marker that
  // silently produces a one-page site, so the prompt's own example is
  // parsed with the real regex rather than eyeballed.
  const example = instruction.match(/<!--IONEXA:PAGE[^>]*-->/);
  ok("the prompt shows a marker", Boolean(example), instruction.slice(0, 200));
  multi.PAGE_MARKER_RE.lastIndex = 0;
  ok("...and the parser matches the prompt's own example",
    multi.PAGE_MARKER_RE.test(example?.[0] ?? ""), example?.[0]);
  ok("the prompt caps the page count", instruction.includes(String(pagesLib.MAX_PAGES_PER_SITE)));
  // CASE-INSENSITIVE. The prompt emphasises with capitals — "its OWN
  // <title>" — and a case-sensitive pattern failed on a sentence that
  // says exactly what it is asked to say.
  ok("...asks for per-page title and description",
    /own <title>[\s\S]{0,120}meta name="description"/i.test(instruction), instruction.match(/[^\n]*<title>[^\n]*/)?.[0]);
  ok("...asks for the same style on every page", /SAME <style>/.test(instruction));
  ok("...and for navigation that marks the current page", /marks the current one/.test(instruction));
  const builder = readFileSync("src/lib/website-builder.ts", "utf8");
  ok("the core rule permits more than one document", /Output complete HTML documents/.test(builder));
  ok("...and the instruction is composed into the prompt", /\$\{multipageInstruction\(\)\}/.test(builder));
}

console.log("\n== 9. THE PAGE CAP IS COVERED BY THE CREDIT HOLD ==");
// THE COST QUESTION, PRICED RATHER THAN ASSERTED.
//
// Generation holds credits before the model runs and settles at the
// measured cost afterwards. More pages means more output means a bigger
// settlement, and nothing about adding pages made the hold any bigger —
// so the cap is only safe while a site AT the cap still settles inside
// its own hold. This computes both sides with the same estimator and the
// same per-credit rate the route uses, over every plan and the shortest
// brief (the worst case: a short brief buys the smallest hold).
{
  const est = await loadTs("src/lib/billing/estimate.ts");
  const pcfg = await loadTs("src/lib/billing/pricing-config.ts");
  const models = await loadTs("src/lib/ai-models.ts");
  const f = await loadTs("src/lib/billing/credit-formula.ts");
  const pricing = await loadTs("src/lib/billing/model-pricing.ts");
  const cfg = pcfg.resolvePricingConfig();
  const MODEL = models.WEBSITE_BUILDER_MODEL;
  const CHARS_PER_TOKEN = 4;
  // A generously-sized page. Real generated pages in this app run
  // 20k-60k characters for a WHOLE single-page site; 15,000 per page in
  // a multi-page site is the upper end of what one page carries.
  const CHARS_PER_PAGE = 15000;
  const SHORTEST_BRIEF = 200;

  const capChars = pagesLib.MAX_PAGES_PER_SITE * CHARS_PER_PAGE;
  for (const slug of ["free", "starter", "growth", "professional", "ultimate"]) {
    const plan = f.getPlan(slug);
    const rate = f.effectiveCreditPriceEurForAccount(plan, null, cfg);
    const hold = est.estimateForAction(
      "websiteGenerate",
      { model: MODEL, inputChars: SHORTEST_BRIEF, planSlug: slug },
      cfg,
      rate
    );
    const inTok = 3000 + Math.ceil(SHORTEST_BRIEF / CHARS_PER_TOKEN);
    const usd = pricing.priceUsage(
      { input_tokens: inTok, output_tokens: Math.ceil(capChars / CHARS_PER_TOKEN) },
      MODEL
    ).usdCost;
    const charged = f.creditsForRealCostOnAccount(f.usdToEur(usd, cfg), plan, null, cfg, 4);
    ok(
      `${slug}: a site at the ${pagesLib.MAX_PAGES_PER_SITE}-page cap settles inside its hold`,
      charged <= hold.reserveCredits,
      `held ${hold.reserveCredits}, would charge ${charged} for ${capChars} chars`
    );
  }

  // AND IT FITS IN ONE RESPONSE — the other half of the cost question.
  // A site at the cap has to be generatable in one call, or pages start
  // getting dropped by the per-page truncation check for a reason the
  // owner cannot see.
  const builder = readFileSync("src/lib/website-builder.ts", "utf8");
  const maxTokens = Number((builder.match(/const WEBSITE_MAX_TOKENS = (\d+);/) ?? [])[1]);
  ok("WEBSITE_MAX_TOKENS is readable", Number.isFinite(maxTokens) && maxTokens > 0, String(maxTokens));
  ok(
    `...and covers ${pagesLib.MAX_PAGES_PER_SITE} pages without chunking`,
    maxTokens >= capChars / CHARS_PER_TOKEN,
    `${maxTokens} tokens vs ${Math.ceil(capChars / CHARS_PER_TOKEN)} needed`
  );
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
