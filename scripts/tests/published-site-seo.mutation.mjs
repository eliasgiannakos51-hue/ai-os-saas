#!/usr/bin/env node
/*
 * CAN THE SEO GATE GO RED?
 *
 * Everything this workstream added is invisible in a browser. A missing
 * canonical, a schema asserting an address the page never showed, an
 * og:image that is a relative path, a description that is the site's
 * CSS — the page renders identically with every one of those, and the
 * owner finds out from a search result months later, if ever.
 *
 * That is exactly the condition under which a green test means nothing.
 * So each defect below is put back into the real files and the gate is
 * required to notice.
 *
 * Run: node scripts/tests/published-site-seo.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/published-site-seo.test.mjs";

const FACTS = "src/lib/seo/facts.ts";
const HEAD = "src/lib/seo/head.ts";
const ALT = "src/lib/seo/alt-text.ts";
const SD = "src/lib/seo/structured-data.ts";
const NAP = "src/lib/seo/nap.ts";
const SITEMAP = "src/lib/seo/sitemap.ts";
const TEXT = "src/lib/seo/html-text.ts";
const PROMPT = "src/lib/seo/prompt.ts";
const GEN = "src/app/api/websites/generate/process/route.ts";
const EDIT = "src/app/api/websites/edit/route.ts";
const PUBLISH = "src/app/api/websites/[id]/publish/route.ts";
const APP_ROBOTS = "src/app/robots.ts";
const APP_SITEMAP = "src/app/sitemap.ts";

const MUTANTS = [
  // ------------------------------------------------------------------
  // A TAG THAT IS PRESENT AND WRONG. Every one of these renders fine.
  // ------------------------------------------------------------------
  {
    name: "the description is allowed to be the page's CSS",
    file: TEXT,
    from: 'const NON_PROSE = /<(script|style|template)\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>/gi;',
    to: 'const NON_PROSE = /<(script|template)\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>/gi;',
  },
  {
    name: "only double-quoted attributes are read, so a single-quoted page has no facts",
    file: TEXT,
    from: 'const re = new RegExp(`\\\\b${name}\\\\s*=\\\\s*("([^"]*)"|\'([^\']*)\'|([^\\\\s"\'>]+))`, "i");',
    to: 'const re = new RegExp(`\\\\b${name}\\\\s*=\\\\s*"([^"]*)"`, "i");',
  },
  {
    // The bug that shipped a bakery's weekday hours as its Saturday hours.
    name: "two identical data-seo tags both resolve to the first one",
    file: FACTS,
    from: '    `<([a-z0-9]+)\\\\b[^>]*\\\\bdata-seo-${key}\\\\b[^>]*>(?:([\\\\s\\\\S]*?)<\\\\/\\\\1\\\\s*>)?`,',
    to: '    `<([a-z0-9]+)\\\\b[^>]*\\\\bdata-seo-${key}\\\\b[^>]*>(?:([\\\\s\\\\S]*)<\\\\/\\\\1\\\\s*>)?`,',
  },
  {
    name: "a phone number is guessed out of the body text instead of a tel: link",
    file: FACTS,
    from: '  const phone = firstHref(prose, /^tel:/i)?.replace(/^tel:/i, "").trim() ?? null;',
    to: '  const phone = (/(\\+?\\d[\\d\\s-]{7,})/.exec(prose) ?? [])[1]?.trim() ?? null;',
  },

  // ------------------------------------------------------------------
  // THE PASS STOPS BEING IDEMPOTENT. It runs on every publish.
  // ------------------------------------------------------------------
  {
    name: "the previous run's tags are left behind, so every publish duplicates them",
    file: HEAD,
    from: "  out = out.replace(/([ \\t]*\\n?[ \\t]*)(<meta\\b[^>]*>)/gi, (whole, lead: string, tag: string) => {",
    to: "  out = out.replace(/([ \\t]*\\n?[ \\t]*)(<meta\\b[^>]*>)/gi, (whole, lead: string, tag: string) => {\n    if (true) return `${lead}${tag}`;",
  },
  {
    name: "the whitespace grows by a line per publish",
    file: HEAD,
    from: "  if (/<\\/head\\s*>/i.test(html)) return html.replace(/\\s*<\\/head\\s*>/i, `${block}</head>`);",
    to: "  if (/<\\/head\\s*>/i.test(html)) return html.replace(/<\\/head\\s*>/i, `${block}</head>`);",
  },

  // ------------------------------------------------------------------
  // A CLAIM THE PAGE DOES NOT SUPPORT.
  // ------------------------------------------------------------------
  {
    name: "a business with no address and no phone is listed as a local business anyway",
    file: SD,
    from: "  if (!address && !phone) return null;",
    to: "  if (false) return null;",
  },
  {
    name: "an invented @type is passed straight through",
    file: SD,
    from: '  return "LocalBusiness";\n}',
    to: "  return raw;\n}",
  },
  {
    name: "a price with no currency becomes an Offer anyway",
    file: SD,
    from: "    if (p.price && p.currency) {",
    to: "    if (p.price || p.currency) {",
  },
  {
    name: "og:image is allowed to be a relative path",
    file: HEAD,
    from: "    if (/^https?:\\/\\//i.test(img.src)) return img.src;",
    to: "    if (img.src) return img.src;",
  },

  // ------------------------------------------------------------------
  // THE BREAKOUT. Model-written text inside a <script> served publicly.
  // ------------------------------------------------------------------
  {
    name: "a </script> in a business name closes our block and opens theirs",
    file: SD,
    from: '    .replace(/</g, "\\\\u003c")',
    to: "    .replace(/\\u0000/g, \"\")",
  },

  // ------------------------------------------------------------------
  // ALT TEXT THAT PASSES A CHECK AND HELPS NOBODY.
  // ------------------------------------------------------------------
  {
    name: 'an image with nothing to describe it gets alt="Image"',
    file: ALT,
    from: '  const fromFile = filenameWords(attr(tag, "src"));\n  if (fromFile) return sentence(fromFile);\n  return "";',
    to: '  const fromFile = filenameWords(attr(tag, "src"));\n  if (fromFile) return sentence(fromFile);\n  return "Image";',
  },
  {
    name: "a stock-library id becomes the alt text",
    file: ALT,
    from: '  const generic = new Set(["img", "image", "photo", "picture", "pic", "dsc", "screenshot", "untitled"]);\n  const useful = words.filter((w) => !generic.has(w.toLowerCase()));\n  return useful.length >= 2 ? useful.join(" ") : "";',
    to: "  return words.join(\" \");",
  },
  {
    name: "an image that already has an alt is overwritten",
    file: ALT,
    from: "    if (hasAttr(tag, \"alt\")) {\n      untouched += 1;\n      return tag;\n    }",
    to: "    if (false) {\n      untouched += 1;\n      return tag;\n    }",
  },

  // ------------------------------------------------------------------
  // ONE BUSINESS, TWO IDENTITIES.
  // ------------------------------------------------------------------
  {
    name: "a phone written with a country code counts as a different number",
    file: NAP,
    from: "    return x === y || x.endsWith(y) || y.endsWith(x);",
    to: "    return a === b;",
  },
  {
    name: "a page that simply omits the address is reported as disagreeing",
    file: NAP,
    from: "      if (!mine || !other) continue;",
    to: "      if (!mine && !other) continue;",
  },
  {
    name: "each page's schema uses its own address instead of the site's",
    file: PUBLISH,
    from: "        nap: napReport.nap,",
    to: "        nap: null,",
  },

  // ------------------------------------------------------------------
  // THE SITEMAP.
  // ------------------------------------------------------------------
  {
    name: "an unparseable date is written into the sitemap as Invalid Date",
    file: SITEMAP,
    from: "  if (Number.isNaN(d.getTime())) return null;",
    to: "  if (false) return null;",
  },
  {
    name: "a relative URL is accepted as a sitemap entry",
    file: SITEMAP,
    from: '    .filter((e) => typeof e.loc === "string" && /^https?:\\/\\//i.test(e.loc))',
    to: '    .filter((e) => typeof e.loc === "string")',
  },
  {
    name: "the sitemap stops escaping ampersands",
    file: SITEMAP,
    from: '    .replace(/&/g, "&amp;")',
    to: '    .replace(/\\u0000/g, "")',
  },
  {
    name: "the app's robots.txt stops naming /s/",
    file: APP_ROBOTS,
    from: 'allow: ["/", "/pricing", "/terms", "/privacy", "/s/"],',
    to: 'allow: ["/", "/pricing", "/terms", "/privacy"],',
  },
  {
    name: "the app's sitemap lists sites that are not live",
    file: APP_SITEMAP,
    from: '      .eq("status", "live")',
    to: "      ",
  },
  {
    // NOT `throw error` inside the try — that is caught by the outer
    // catch, which returns [] anyway, so it changes nothing and proves
    // nothing. The real defect is the whole sitemap failing rather than
    // degrading to the app's own pages: a 500 tells a crawler far more
    // confidently that there is nothing here than a short file does.
    name: "a database failure takes the whole sitemap down instead of degrading",
    file: APP_SITEMAP,
    from: '    logApiError("sitemap.xml", err, { stage: "published_sites_unhandled" });\n    return [];',
    to: "    throw err;",
  },

  // ------------------------------------------------------------------
  // WIRED IN, OR NOT.
  // ------------------------------------------------------------------
  {
    name: "generation optimises the home page only",
    file: GEN,
    from: "      const optimised = stripped.map((doc) => {",
    to: "      const optimised = [stripped[0]].map((doc) => {",
  },
  {
    name: "generation stores the un-optimised documents",
    file: GEN,
    from: "      htmlContent = optimised[0];",
    to: "      htmlContent = stripped[0];",
  },
  {
    name: "an edit stops re-establishing the head it just rewrote",
    file: EDIT,
    from: "        updatedHtml = enforceSeoHead(withAlt.html).html;",
    to: "        updatedHtml = withAlt.html;",
  },
  {
    name: "publishing stores the pre-seo document",
    file: PUBLISH,
    from: "      html_content: publishedHtml,\n      pages: publishedPages.length > 0 ? publishedPages : null,\n      version_number: versionNumber,",
    to: "      html_content: html,\n      pages: publishedPages.length > 0 ? publishedPages : null,\n      version_number: versionNumber,",
  },
  {
    name: "the canonical points at the site root from every page",
    file: PUBLISH,
    from: "        canonicalUrl: pageUrl,",
    to: "        canonicalUrl: siteBaseUrl,",
  },
  {
    name: "a NAP disagreement is swallowed instead of reported",
    file: PUBLISH,
    from: "    if (napReport.disagreements.length > 0) {",
    to: "    if (false) {",
  },

  // ------------------------------------------------------------------
  // THE PROMPT DRIFTS FROM THE READER.
  // ------------------------------------------------------------------
  {
    name: "the prompt asks for a hook the reader does not look for",
    file: PROMPT,
    from: "  data-seo-hours per hours line",
    to: "  data-seo-opening-hours per hours line",
  },
  {
    name: "the prompt suggests a schema type the builder rejects",
    file: PROMPT,
    from: "schema.org kind: Bakery,",
    to: "schema.org kind: Coffee Shop,",
  },
  {
    name: "the prompt stops forbidding the model's own JSON-LD",
    file: PROMPT,
    from: "- Write NO <script>, og:/twitter: meta, canonical or JSON-LD",
    to: "- Add structured data if it helps",
  },
  {
    name: "the prompt stops demanding the same NAP on every page",
    file: PROMPT,
    from: "- The SAME name, address and phone, character for character, on EVERY page:",
    to: "- Put the contact details somewhere:",
  },
];

let caught = 0;
const missed = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
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
    console.log(`  NO-OP   ${m.name}`);
    continue;
  }
  writeFileSync(m.file, mutated);
  // CAUGHT IS DECIDED BY THE EXIT CODE, not by the text.
  //
  // This used to be `let detail = null` … `if (detail)`, which asks "did
  // we manage to find a line saying FAIL in the child's stdout" and
  // treats a no as "the mutation was missed". A gate that exits non-zero
  // while its stdout arrives empty or truncated — which happened, twice,
  // on different mutants of the same run — was then reported as a HOLE
  // that is not there. An intermittently red mutation gate is worse than
  // none: it teaches you to re-run it until it is green.
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 120)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}`);
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
