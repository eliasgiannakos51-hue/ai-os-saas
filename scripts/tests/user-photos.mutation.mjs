#!/usr/bin/env node
/*
 * CAN THE USER-PHOTOS GATE GO RED?
 *
 * Three failure modes here are silent and one is irreversible.
 *
 *   A CHOICE THAT IS ASKED FOR AND NOT ENFORCED. The page renders; it
 *   just has photographs on it the owner said they did not want.
 *
 *   ATTRIBUTION ON THE WRONG PHOTOGRAPH. "Photo by Jo Ma on Unsplash"
 *   under the owner's own shopfront is a false statement published on
 *   their site, and one they have no way to notice.
 *
 *   A CLEANUP THAT DELETES A LIVE PHOTOGRAPH. Nothing gets it back.
 *
 * Run: node scripts/tests/user-photos.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/user-photos.test.mjs";
const BRIEF = "src/lib/website-design-brief.ts";
const CENSUS = "src/lib/website-image-census.ts";
const QUOTA = "src/lib/websites/storage-quota.ts";
const ORPHANS = "src/lib/websites/orphan-images.ts";
const PLACEHOLDERS = "src/lib/website-image-placeholders.ts";
const RESOLVER = "src/lib/website-image-resolver.ts";
const SERVER = "src/lib/website-reference-image-server.ts";
const GEN = "src/app/api/websites/generate/process/route.ts";
const EDIT = "src/app/api/websites/edit/route.ts";
const CLEANUP = "src/app/api/cron/website-storage-cleanup/route.ts";
const USAGE = "src/app/api/websites/storage-usage/route.ts";
const CONTROLS = "src/components/website-builder/design-controls.tsx";
const WORKSPACE = "src/components/website-builder/website-builder-workspace.tsx";

const MUTANTS = [
  // ------------------------------------------------------------------
  // THE CHOICE. Asked for, and not enforced.
  // ------------------------------------------------------------------
  {
    name: "'no photographs' becomes a request instead of a rule",
    file: RESOLVER,
    from: '  if (options.photoSource === "none") {',
    to: "  if (false) {",
  },
  {
    // NOT "just before the ladder" — placed there it still returns
    // before any request, so it was an equivalent mutant that proved
    // nothing. This moves the guard past the searches, which is the
    // defect: the quota is spent on photographs about to be deleted.
    name: "the strip happens after the searches, so the quota is spent anyway",
    file: RESOLVER,
    from: '  if (options.photoSource === "none") {\n    return {\n      html: stripPlaceholderImageTags(html, all.map((p) => p.slug)),\n      used: [],\n      halted: null,\n    };\n  }',
    to: "",
    edits: [
      {
        from: '  if (options.photoSource === "none") {\n    return {\n      html: stripPlaceholderImageTags(html, all.map((p) => p.slug)),\n      used: [],\n      halted: null,\n    };\n  }',
        to: "",
      },
      {
        from: "  const logoLike = all.filter((p) => isLogoLikeQuery(p.query));",
        to: '  if (options.photoSource === "none") {\n    return { html: stripPlaceholderImageTags(html, all.map((p) => p.slug)), used: [], halted: null };\n  }\n  const logoLike = all.filter((p) => isLogoLikeQuery(p.query));',
      },
    ],
  },
  {
    name: "generation stops reading the choice",
    file: GEN,
    from: "    const photoSource = parsePhotoSource(description);",
    to: '    const photoSource = "stock" as const;\n    void parsePhotoSource;',
  },
  {
    name: "an edit undoes the choice",
    file: EDIT,
    from: '    const photoSource = parsePhotoSource(website.description ?? "");',
    to: '    const photoSource = "stock" as const;\n    void parsePhotoSource;',
  },
  {
    name: "the marker is read anywhere, so a user's own sentence switches their photos off",
    file: BRIEF,
    from: "  const header = description.lastIndexOf(DESIGN_BRIEF_HEADER);\n  if (header === -1) return \"stock\";\n\n  const block = description.slice(header);",
    to: "  const block = description;",
  },
  {
    // NOT a change to the shared constant — both halves use it, so that
    // is an equivalent mutant. This makes the READER anchor on a literal
    // of its own, which is exactly the drift the constant prevents.
    name: "the reader anchors on its own copy of the header",
    file: BRIEF,
    from: "  const header = description.lastIndexOf(DESIGN_BRIEF_HEADER);",
    to: '  const header = description.lastIndexOf("DESIGN BRIEF:");',
  },
  {
    name: "'my own' with nothing attached silently demands photos that do not exist",
    file: BRIEF,
    from: '    choices.photoSource === "own" && choices.imageCount === 0 ? "stock" : choices.photoSource;',
    to: "    choices.photoSource;",
  },
  {
    name: "the no-photos brief stops forbidding placeholders",
    file: BRIEF,
    from: "Do not emit a single PLACEHOLDER image",
    to: "Prefer fewer PLACEHOLDER images",
  },
  {
    name: "the own-photos brief stops putting them first",
    file: BRIEF,
    from: "Put them in the positions that matter FIRST — the hero, then any gallery, then section illustrations — before considering any other image.",
    to: "Use them somewhere.",
  },
  {
    name: "a description with no brief defaults to no photographs",
    file: BRIEF,
    from: '  if (typeof description !== "string") return "stock";',
    to: '  if (typeof description !== "string") return "none";',
  },

  // ------------------------------------------------------------------
  // ATTRIBUTION ON THE WRONG PHOTOGRAPH.
  // ------------------------------------------------------------------
  {
    name: "attribution stops checking whose photograph it is",
    file: PLACEHOLDERS,
    from: "    if (!src.startsWith(UNSPLASH_CDN_PREFIX)) continue;",
    to: "    if (false) continue;",
  },

  // ------------------------------------------------------------------
  // THE CENSUS, which is what the sentence shown to the owner is built on.
  // ------------------------------------------------------------------
  {
    name: "the owner's own uploads are counted as stock",
    file: CENSUS,
    from: "    if (src.includes(`/${REFERENCE_IMAGE_BUCKET}/`)) {",
    to: "    if (false) {",
  },
  {
    name: "an SVG or a data: URI is counted as a stock photo to apologise for",
    file: CENSUS,
    from: "    census.other += 1;",
    to: "    census.stock += 1;",
  },
  {
    name: "a url() inside <style> is counted as an image on the page",
    file: CENSUS,
    from: '  const prose = html.replace(/<(script|style)\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>/gi, " ");',
    to: "  const prose = html;",
  },
  {
    name: "only double-quoted src is read, so half the images vanish",
    file: CENSUS,
    from: '      tag.match(/\\bsrc\\s*=\\s*\'([^\']*)\'/i)?.[1] ??',
    to: "      undefined ??",
  },
  {
    name: "the nudge appears on a site that has no stock photos at all",
    file: CENSUS,
    from: "  return census.stock > 0;",
    to: "  return true;",
  },

  // ------------------------------------------------------------------
  // STORAGE.
  // ------------------------------------------------------------------
  {
    name: "an unknown plan gets an unlimited allowance",
    file: QUOTA,
    from: "  return STORAGE_LIMIT_BYTES[slug] ?? DEFAULT_STORAGE_LIMIT_BYTES;",
    to: "  return STORAGE_LIMIT_BYTES[slug] ?? Number.MAX_SAFE_INTEGER;",
  },
  {
    name: "no plan at all gets an unlimited allowance",
    file: QUOTA,
    from: "  if (!slug) return DEFAULT_STORAGE_LIMIT_BYTES;",
    to: "  if (!slug) return Number.MAX_SAFE_INTEGER;",
  },
  {
    name: "the quota is judged file by file instead of on the batch",
    file: QUOTA,
    from: "  const needed = incomingBytes.reduce((sum, n) => sum + (Number.isFinite(n) && n > 0 ? n : 0), 0);",
    to: "  const needed = Math.max(0, ...incomingBytes.filter((n) => Number.isFinite(n)));",
  },
  {
    name: "being over the limit overflows the bar instead of filling it",
    file: QUOTA,
    from: "    fraction: Math.min(used / limit, 1),",
    to: "    fraction: used / limit,",
  },
  {
    name: "the usage endpoint reads one page, so a heavy account looks empty",
    file: USAGE,
    from: "    for (let offset = 0; ; offset += PAGE) {",
    to: "    for (let offset = 0; offset < 1; offset += PAGE) {",
  },
  {
    name: "the usage endpoint uses an admin client, so a parameter could ask about anyone",
    file: USAGE,
    from: "  const supabase = createClient();",
    to: "  const supabase = createClient();\n  void createAdminClient;",
    edits: [
      { from: 'import { createClient } from "@/lib/supabase/server";', to: 'import { createClient } from "@/lib/supabase/server";\nimport { createAdminClient } from "@/lib/supabase/admin";' },
      { from: "  const supabase = createClient();", to: "  const supabase = createClient();\n  void createAdminClient;" },
    ],
  },

  // ------------------------------------------------------------------
  // THE CLEANUP. The one thing here that cannot be undone.
  // ------------------------------------------------------------------
  {
    name: "a photograph embedded in a live page is deleted",
    file: ORPHANS,
    from: "    if (embedded.has(file.path)) {",
    to: "    if (false) {",
  },
  {
    name: "a photograph a website row still points at is deleted",
    file: ORPHANS,
    from: "    if (referencedPaths.has(file.path)) {",
    to: "    if (false) {",
  },
  {
    name: "an upload in flight is deleted out from under its generation",
    file: ORPHANS,
    from: "    if (nowMs - file.createdAtMs < MIN_ORPHAN_AGE_MS) {",
    to: "    if (false) {",
  },
  {
    name: "the derivative of a referenced original is deleted",
    file: ORPHANS,
    from: "      if (referencedPaths.has(original) || embedded.has(original)) {",
    to: "      if (false) {",
  },
  {
    name: "an original whose derivative is on the page is deleted",
    file: ORPHANS,
    from: "    } else if (embedded.has(`${file.path}${WEB_IMAGE_SUFFIX}`)) {",
    to: "    } else if (false) {",
  },
  {
    name: "a URL with a query string stops protecting its file",
    file: ORPHANS,
    from: 'if (c === \'"\' || c === "\'" || c === ")" || c === " " || c === "\\n" || c === "\\t" || c === "?") return i;',
    to: 'if (c === \'"\' || c === "\'" || c === ")" || c === " " || c === "\\n" || c === "\\t") return i;',
  },
  {
    name: "the cleanup forgets a table that carries HTML",
    file: CLEANUP,
    from: 'const tables = ["user_websites", "published_sites", "website_versions", "site_versions"] as const;',
    to: 'const tables = ["user_websites", "published_sites", "website_versions"] as const;',
  },
  {
    name: "the cleanup ignores sub-pages, so a multi-page site's photos are orphans",
    file: CLEANUP,
    from: "        for (const page of normalisePages(row.pages).pages) documents.push(page.html);",
    to: "        void normalisePages;",
  },
  {
    name: "a failed read is treated as 'nothing references anything'",
    file: CLEANUP,
    from: "      if (error) throw error;\n      collect(data as { html_content?: unknown; pages?: unknown }[]);",
    to: "      collect((data ?? []) as { html_content?: unknown; pages?: unknown }[]);",
  },
  {
    name: "the cleanup runs unauthenticated",
    file: CLEANUP,
    from: "  const auth = checkCronAuth(request);",
    to: "  const auth = { ok: true } as ReturnType<typeof checkCronAuth>;\n  void checkCronAuth;",
  },
  {
    name: "the cleanup is unscheduled",
    file: "vercel.json",
    from: '    {\n      "path": "/api/cron/website-storage-cleanup",\n      "schedule": "0 4 * * *"\n    }',
    to: '    {\n      "path": "/api/cron/reset-credits",\n      "schedule": "0 3 1 * *"\n    }',
  },

  // ------------------------------------------------------------------
  // THE OPTIMISED FILE.
  // ------------------------------------------------------------------
  {
    name: "a WebP derivative that is BIGGER is served to every visitor",
    file: SERVER,
    from: "    return out.length < buffer.length ? out : null;",
    to: "    return out;",
  },
  {
    name: "the page embeds the original instead of the derivative",
    file: SERVER,
    from: "      .getPublicUrl(servedPath);",
    to: "      .getPublicUrl(path);",
  },
  {
    name: "the web derivative is sized for the model instead of for the page",
    file: SERVER,
    from: "export const WEB_IMAGE_MAX_DIMENSION = 1600;",
    to: "export const WEB_IMAGE_MAX_DIMENSION = 1568;",
  },

  // ------------------------------------------------------------------
  // THE UI.
  // ------------------------------------------------------------------
  {
    name: "the choice is never offered",
    file: CONTROLS,
    from: 'data-testid="design-photo-source"',
    to: 'data-testid="design-photo-source-removed"',
  },
  {
    name: "the control stops saying that 'my own' with nothing attached becomes stock",
    file: CONTROLS,
    from: '          {value.photoSource === "own" && imageCount === 0\n            ? t("photoSourceNeedsUpload")',
    to: '          {false\n            ? t("photoSourceNeedsUpload")',
  },
  {
    name: "the finished site never says how many photos are stock",
    file: WORKSPACE,
    from: '                  {imageCensus && shouldOfferOwnPhotos(imageCensus) && (',
    to: "                  {false && (",
  },
  {
    name: "the quota is checked after the upload has already happened",
    file: WORKSPACE,
    from: '          const res = await fetchWithAuthRetry("/api/websites/storage-usage");',
    to: '          const res = await fetchWithAuthRetry("/api/websites/storage-usage-later");',
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
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 110)}`);
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
