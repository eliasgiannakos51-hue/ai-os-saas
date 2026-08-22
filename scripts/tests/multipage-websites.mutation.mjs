#!/usr/bin/env node
/*
 * CAN THE MULTI-PAGE GATE GO RED?
 *
 * The dangerous failure here is not "pages do not work" — that is
 * obvious the moment anyone looks. It is a sub-page that RENDERS while
 * having skipped a check its home page passed: an unsafe link, an
 * invented number, an uncredited photograph, an injected script. Those
 * mutations come first because they are the ones that ship looking fine.
 *
 * Run: node scripts/tests/multipage-websites.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/multipage-websites.test.mjs";
const GEN = "src/app/api/websites/generate/process/route.ts";
const PUBLISH = "src/app/api/websites/[id]/publish/route.ts";
const ROUTE = "src/app/s/[subdomain]/[page]/route.ts";
const PAGES = "src/lib/publishing/website-pages.ts";
const MULTI = "src/lib/website-multipage.ts";
const MIGRATION = "supabase/migrations/20260822000000_website_pages.sql";
const BUILDER = "src/lib/website-builder.ts";
const LINKSAFETY = "src/lib/website-link-safety.ts";
const SEOPROMPT = "src/lib/seo/prompt.ts";
const TARGET = "src/lib/publishing/page-edit-target.ts";
const EDIT = "src/app/api/websites/edit/route.ts";
const WORKSPACE = "src/components/website-builder/website-builder-workspace.tsx";

const MUTANTS = [
  // ------------------------------------------------------------------
  // A SUB-PAGE SKIPS A CHECK. Each of these renders perfectly.
  // ------------------------------------------------------------------
  {
    name: "link safety runs on the home page only",
    file: GEN,
    from: "      const cleaned = documents.map(\n        (doc) => makeGeneratedLinksSafe(doc, { pageSlugs: generatedSlugs }).html\n      );",
    to: "      const cleaned = [makeGeneratedLinksSafe(documents[0], { pageSlugs: generatedSlugs }).html, ...documents.slice(1)];",
  },
  {
    name: "the security scan sees the home page only",
    file: GEN,
    from: "const securityIssues = stripped.flatMap((doc) => scanWebsiteHtmlForSecurityIssues(doc));",
    to: "const securityIssues = scanWebsiteHtmlForSecurityIssues(stripped[0]);",
  },
  {
    name: "scripts are stripped from the home page only",
    file: GEN,
    from: "const stripped = cleaned.map((doc) => stripDisallowedExternalScripts(doc));",
    to: "const stripped = [stripDisallowedExternalScripts(cleaned[0]), ...cleaned.slice(1)];",
  },
  {
    name: "attribution is enforced on the home page only",
    file: GEN,
    from: "const attributions = cleaned.map((doc) => enforceUnsplashAttribution(doc));",
    to: "const attributions = [enforceUnsplashAttribution(cleaned[0])];",
  },
  {
    name: "invented numbers are looked for on the home page only",
    file: GEN,
    from: "const inventedNumbers = documents.flatMap((doc) => findInventedNumbers(doc, description));",
    to: "const inventedNumbers = findInventedNumbers(documents[0], description);",
  },
  {
    name: "the split moves after the checks, so they all see one blob",
    file: GEN,
    from: "      const split = splitGeneratedPages(htmlContent);",
    to: "      const split = { home: htmlContent, pages: [], dropped: [] };\n      void splitGeneratedPages;",
  },
  {
    // A REAL RELOCATION, not a dead statement beside the call. The first
    // version of this mutant inserted a no-op line above the call and
    // called that "images resolve per page" — it changed nothing, so the
    // gate staying green was the gate being right. This one actually
    // moves resolution to after the split and runs it once per document,
    // which is the defect: four pages, four Unsplash budgets.
    name: "images resolve per page, so each opens its own Unsplash budget",
    file: GEN,
    edits: [
      {
        from: "      images = await resolveWebsiteImagePlaceholders(htmlContent, { photoSource });\n      htmlContent = images.html;",
        to: "      // moved below the split",
      },
      {
        from: "      const documents: string[] = [split.home, ...split.pages.map((pg) => pg.html)];",
        to:
          "      const resolvedDocs: string[] = [];\n" +
          "      for (const rawDoc of [split.home, ...split.pages.map((pg) => pg.html)]) {\n" +
          "        images = await resolveWebsiteImagePlaceholders(rawDoc, { photoSource });\n" +
          "        resolvedDocs.push(images.html);\n" +
          "      }\n" +
          "      const documents: string[] = resolvedDocs;",
      },
    ],
  },
  // ------------------------------------------------------------------
  // THE SLUG. It is a URL path.
  // ------------------------------------------------------------------
  {
    name: "the slug shape check is relaxed, so traversal gets through",
    file: PAGES,
    from: "const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;",
    to: "const SLUG_SHAPE = /^[^/]+$/;",
  },
  {
    name: "the slug is validated AFTER the lookup instead of before",
    file: ROUTE,
    from: "    const slug = validatePageSlug(params.page);\n    if (!slug.ok) return notFoundResponse();\n\n    const { pages } = normalisePages(site.pages);",
    to: "    const { pages } = normalisePages(site.pages);\n    const slug = validatePageSlug(params.page);\n    if (!slug.ok) return notFoundResponse();",
  },
  {
    name: "an unknown page falls back to the home page",
    file: ROUTE,
    from: "    if (!page) return notFoundResponse();",
    to: "    if (!page) return new Response(site.html_content, { status: 200, headers: publishedSiteHeaders() });",
  },
  {
    name: "a duplicate slug is kept, so one page becomes unreachable",
    file: PAGES,
    from: "    if (seen.has(check.slug)) {",
    to: "    if (false) {",
  },
  // ------------------------------------------------------------------
  // THE FOUR TABLES.
  // ------------------------------------------------------------------
  {
    name: "the published snapshot stops carrying the pages",
    file: PUBLISH,
    from: "      pages: publishedPages.length > 0 ? publishedPages : null,",
    to: "",
  },
  {
    name: "published pages skip the safety pass the home page gets",
    file: PUBLISH,
    from: "      html: makeGeneratedLinksSafe(stripDisallowedExternalScripts(pg.html), siteContext).html,",
    to: "      html: pg.html,",
  },
  {
    name: "the published-history table loses the column, so rollback restores half a site",
    file: MIGRATION,
    from: "alter table public.site_versions\n  add column if not exists pages jsonb;",
    to: "",
  },
  {
    name: "the migration gains a destructive statement",
    file: MIGRATION,
    from: "alter table public.user_websites\n  add column if not exists pages jsonb;",
    to: "drop table if exists public.user_websites_old;\nalter table public.user_websites\n  add column if not exists pages jsonb;",
  },
  // ------------------------------------------------------------------
  // THE PROMPT AND THE PARSER, WHICH MUST AGREE.
  // ------------------------------------------------------------------
  {
    name: "the prompt's marker drifts from the parser's",
    file: MULTI,
    from: '  <!--IONEXA:PAGE slug="about" label="About us"-->',
    to: "  <!-- PAGE: about -->",
  },
  {
    // The requirement now lives in the SEO section, which the multi-page
    // section points at — so the mutant moved with it.
    name: "the prompt stops asking for a per-page title",
    file: SEOPROMPT,
    from: "- Every page gets its OWN <title>",
    to: "- The site gets a <title>",
  },
  // ------------------------------------------------------------------
  // THE NAVIGATION GOES NOWHERE. The pages exist, are served, and
  // nothing links to them. This shipped.
  // ------------------------------------------------------------------
  {
    name: "link safety stops being told which pages the site has",
    file: PUBLISH,
    from: "      pageSlugs: draftPages.map((pg) => pg.slug),",
    to: "      pageSlugs: [],",
  },
  {
    name: "the nav is left relative, so home resolves one directory up",
    file: PUBLISH,
    from: "      basePath: publishedSiteBasePath(subdomain),",
    to: "      basePath: null,",
  },
  {
    name: "a page link is treated as a section again",
    file: LINKSAFETY,
    from: "      const page = pageLinkTarget(href, pageSlugs);",
    to: "      const page = null; void pageLinkTarget;",
  },
  {
    name: "the home link gains a trailing slash, so every visit is a redirect",
    file: LINKSAFETY,
    from: "function homeHref(basePath: string): string {\n  return basePath;",
    to: "function homeHref(basePath: string): string {\n  return `${basePath}/`;",
  },
  {
    name: "a fragment on a page link is dropped",
    file: LINKSAFETY,
    from: "        const to = `${path}${fragment}`;",
    to: "        const to = path;",
  },
  {
    name: "the generate path forgets the site's own pages",
    file: GEN,
    from: "      const generatedSlugs = split.pages.map((pg) => pg.slug);",
    to: "      const generatedSlugs: string[] = [];",
  },
  // ------------------------------------------------------------------
  // THE CAP DRIFTS AWAY FROM WHAT THE HOLD COVERS. Nothing renders
  // wrong here — the site is fine and the invoice is quietly larger
  // than the hold that was taken for it.
  // ------------------------------------------------------------------
  {
    name: "the page cap goes back above what the credit hold covers",
    file: PAGES,
    from: "export const MAX_PAGES_PER_SITE = 5;",
    to: "export const MAX_PAGES_PER_SITE = 8;",
  },
  {
    name: "the output ceiling drops below a full site",
    file: BUILDER,
    from: "const WEBSITE_MAX_TOKENS = 128000;",
    to: "const WEBSITE_MAX_TOKENS = 16000;",
  },
  // ------------------------------------------------------------------
  // LIVE EDITING ON THE WRONG DOCUMENT. Every one of these renders a
  // perfectly good page — just not the one the owner was editing.
  // ------------------------------------------------------------------
  {
    name: "an unknown page quietly becomes the home page",
    file: TARGET,
    from: '  if (index < 0) return { ok: false, reason: "unknown_page" };',
    to: "  if (index < 0) return { ok: true, index: HOME_INDEX, slug: null, html: homeHtml };",
  },
  {
    name: "the slug is not validated, so traversal names a page",
    file: TARGET,
    from: '  if (!check.ok) return { ok: false, reason: "invalid_slug" };',
    to: "  if (!check.ok) return { ok: false, reason: \"unknown_page\" };",
  },
  {
    name: "a sub-page edit is written onto the front page",
    file: TARGET,
    from: "    htmlContent: homeHtml,",
    to: "    htmlContent: editedHtml,",
  },
  {
    name: "one page's edit is copied onto every page",
    file: TARGET,
    from: "    pages: pages.map((pg, i) => (i === index ? { ...pg, html: editedHtml } : pg)),",
    to: "    pages: pages.map((pg) => ({ ...pg, html: editedHtml })),",
  },
  {
    name: "the model is sent the home page whichever page was chosen",
    file: EDIT,
    from: "const editResult = await editWebsiteHtml(apiKey, sourceHtml, changeRequest",
    to: "const editResult = await editWebsiteHtml(apiKey, website.html_content, changeRequest",
  },
  {
    name: "the save drops the pages column, so the edit vanishes on reload",
    file: EDIT,
    from: "      .update({ html_content: nextHomeHtml, pages: nextPages.length > 0 ? nextPages : null })",
    to: "      .update({ html_content: nextHomeHtml })",
  },
  {
    name: "the version row keeps only the home page",
    file: EDIT,
    from: "      html_content: nextHomeHtml,\n      pages: nextPages.length > 0 ? nextPages : null,\n      change_description:",
    to: "      html_content: nextHomeHtml,\n      change_description:",
  },
  {
    name: "a stale page list is reported to the customer in English",
    file: WORKSPACE,
    from: '        if (data?.reason === "unknown_page" || data?.reason === "invalid_page") {',
    to: "        if (false) {",
  },
  {
    name: "the route stops saying WHY it refused, so nothing can translate it",
    file: EDIT,
    from: '            { ok: false, reason: "unknown_page", error: "That page is not part of this site." },',
    to: '            { ok: false, error: "That page is not part of this site." },',
  },
  {
    name: "the workspace stops saying which page it means",
    file: WORKSPACE,
    from: "          pageSlug,\n        }),",
    to: "        }),",
  },
  {
    name: "the edit form loses the picker, so it silently edits the home page",
    file: WORKSPACE,
    from: '              {pageTabs}\n              <label htmlFor="website-edit"',
    to: '              <label htmlFor="website-edit"',
  },
  {
    name: "an old version is shown with today's sub-pages",
    file: WORKSPACE,
    from: "    () => normalisePages(displayedSource?.pages).pages,",
    to: "    () => normalisePages(previewWebsite?.pages).pages,",
  },
  {
    name: "a truncated page is kept instead of dropped",
    file: MULTI,
    from: "    if (looksLikeCompleteHtmlDocument(s.html)) return true;",
    to: "    if (true) return true;",
  },
];

let caught = 0;
const missed = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  // A mutant is one or more edits to one file. Some defects cannot be
  // written as a single replacement — moving a call is a deletion here
  // and an insertion there — and expressing them as one edit is how a
  // mutant ends up changing nothing while claiming to.
  const edits = m.edits ?? [{ from: m.from, to: m.to }];
  const stale = edits.find((e) => !original.includes(e.from));
  if (stale) {
    missed.push({ ...m, why: "the mutation target no longer exists in the file" });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  let mutated = original;
  for (const e of edits) mutated = mutated.replace(e.from, e.to);
  if (mutated === original) {
    missed.push({ ...m, why: "the mutation left the file byte-identical — it is not a defect" });
    console.log(`  NO-OP   ${m.name}\n          the file did not change`);
    continue;
  }
  writeFileSync(m.file, mutated);
  let detail = null;
  try {
    execFileSync("node", [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (detail) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 120)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}\n          the gate stayed green`);
  }
}

try {
  execFileSync("node", [GATE], { stdio: "pipe" });
  console.log("\nbaseline: the gate is green on the unmutated tree");
} catch {
  console.log("\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
  process.exit(1);
}
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned the gate red.");
