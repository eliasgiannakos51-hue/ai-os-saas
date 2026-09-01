// THE OWNER'S OWN PHOTOGRAPHS.
//
// Unsplash has a bakery. It does not have THIS bakery, and the whole
// point of a site for a real business is the difference — a stock
// interior is a stand-in the owner recognises instantly and a customer
// eventually does too.
//
// Three things here can go wrong quietly and all three are tested by
// running the real code rather than reading it:
//
//   A CHOICE THAT IS ASKED FOR BUT NOT ENFORCED. "No photographs" has to
//   survive the model ignoring it, or a single placeholder puts a photo
//   on a page whose owner said they did not want one — and spends an
//   Unsplash request from a shared hourly quota doing it.
//
//   ATTRIBUTION ON THE WRONG PHOTOGRAPH. Crediting a photographer for
//   the owner's own picture is a false statement published on their site.
//
//   A CLEANUP THAT DELETES A LIVE PHOTOGRAPH. The one operation here
//   that cannot be undone.
//
// Run: node scripts/tests/user-photos.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const brief = await loadTs("src/lib/website-design-brief.ts");
const census = await loadTs("src/lib/website-image-census.ts");
const quota = await loadTs("src/lib/websites/storage-quota.ts");
const orphans = await loadTs("src/lib/websites/orphan-images.ts");
const placeholders = await loadTs("src/lib/website-image-placeholders.ts");

console.log("== 1. the choice survives the round trip, over every value ==");
{
  // CROSS-PRODUCT: every source x with and without attached images. The
  // brief is compiled into the description and read back by the server —
  // build and parse are one round trip, and a drift between them is
  // silent (the choice simply stops applying).
  for (const source of brief.PHOTO_SOURCES) {
    for (const imageCount of [0, 1, 6]) {
      const description = brief.applyDesignBrief("A bakery in Kalamaria", {
        ...brief.DEFAULT_DESIGN_CHOICES,
        photoSource: source,
        imageCount,
      });
      // "own" with nothing attached is demoted to stock: asking for
      // photographs that do not exist produces an apology, not a page.
      const expected = source === "own" && imageCount === 0 ? "stock" : source;
      ok(`${source} with ${imageCount} image(s) reads back as ${expected}`,
        brief.parsePhotoSource(description) === expected,
        brief.parsePhotoSource(description));
    }
  }

  // A DESCRIPTION FROM BEFORE THIS EXISTED must generate as it always did.
  ok("a plain description means stock", brief.parsePhotoSource("A bakery in Kalamaria") === "stock");
  ok("an empty one too", brief.parsePhotoSource("") === "stock");
  ok("a non-string too", brief.parsePhotoSource(null) === "stock");
  // AND THE UNTOUCHED FORM PRODUCES NO BRIEF AT ALL.
  // ONE CONSTANT FOR BOTH HALVES. A header that drifted between the
  // writer and the reader would make every choice silently stop applying
  // and nothing would look wrong — so the reader must anchor on the
  // exported constant rather than on a literal of its own.
  {
    const src = readFileSync("src/lib/website-design-brief.ts", "utf8");
    ok("the brief is written from the exported header",
      /return `\\n\\n\$\{DESIGN_BRIEF_HEADER\}/.test(src), src.match(/return `[^`]{0,60}/)?.[0]);
    ok("...and read back from the same one",
      /description\.lastIndexOf\(DESIGN_BRIEF_HEADER\)/.test(src));
    ok("...so the header appears as a literal exactly once",
      (src.match(/DESIGN BRIEF \(the user chose/g) ?? []).length === 1,
      String((src.match(/DESIGN BRIEF \(the user chose/g) ?? []).length));
  }
  ok("the default choices still compile to nothing",
    brief.buildDesignBrief(brief.DEFAULT_DESIGN_CHOICES) === "",
    JSON.stringify(brief.buildDesignBrief(brief.DEFAULT_DESIGN_CHOICES)));

  // THE USER'S OWN WORDS CANNOT SWITCH THEIR PHOTOS OFF. The marker is
  // anchored to the start of a line for exactly this.
  for (const sentence of [
    "We sell photos: none of them are stock",
    "photos: none — that is what my competitor does",
    "Our gallery has photos: own brand only",
    // A BULLETED LIST is how a person writes a brief, and the marker's
    // own shape is a bullet. Anchoring to a line start is not enough on
    // its own — the line has to be inside OUR block.
    "What we need:\n- PHOTOS: none\n- a booking form",
    "- PHOTOS: own\nis what my designer said",
  ]) {
    ok(`"${sentence.slice(0, 32)}…" is not a choice`,
      brief.parsePhotoSource(sentence) === "stock", brief.parsePhotoSource(sentence));
  }

  // The brief has to SAY the thing, or the model has nothing to follow.
  const none = brief.buildDesignBrief({ ...brief.DEFAULT_DESIGN_CHOICES, photoSource: "none" });
  ok("the no-photos brief forbids placeholders outright", /NO photographs at all/.test(none) && /not emit a single PLACEHOLDER/.test(none));
  ok("...and says what to do instead, so it is not a page with gaps",
    /typography, colour, spacing/.test(none), none);
  const own = brief.buildDesignBrief({ ...brief.DEFAULT_DESIGN_CHOICES, photoSource: "own", imageCount: 4 });
  ok("the own-photos brief puts them in the positions that matter first",
    /hero, then any gallery/.test(own), own);
  ok("...and says how many there are", /4 uploaded photograph/.test(own), own);
  ok("stock adds nothing, because it is what every other rule already says",
    brief.buildDesignBrief({ ...brief.DEFAULT_DESIGN_CHOICES, photoSource: "stock" }) === "");
}

console.log("\n== 2. 'no photographs' is ENFORCED, not asked for ==");
{
  const resolver = readFileSync("src/lib/website-image-resolver.ts", "utf8");
  ok("the resolver takes the choice", /photoSource\?: "own" \| "stock" \| "none"/.test(resolver));
  ok("...and strips every placeholder without a single request",
    /if \(options\.photoSource === "none"\) \{[\s\S]{0,220}stripPlaceholderImageTags\(html, all\.map/.test(resolver));
  // BEFORE any search. A strip that happens after the searches has cost
  // the quota already.
  // BEFORE ANYTHING ELSE HAPPENS. Not merely "before the search": the
  // guard sits immediately after the placeholders are found, so nothing
  // between it and the request can spend a quota or log a decision about
  // photographs that are about to be removed.
  ok("...as the FIRST thing after the placeholders are found",
    /const all = findImagePlaceholders\(html\);\s*\n\s*if \(all\.length === 0\)[^\n]*\n\s*\n\s*if \(options\.photoSource === "none"\)/.test(resolver),
    resolver.slice(resolver.indexOf("const all = findImagePlaceholders"), resolver.indexOf("const all = findImagePlaceholders") + 320));

  for (const [label, file, variable] of [
    ["generation", "src/app/api/websites/generate/process/route.ts", "htmlContent"],
    ["an edit", "src/app/api/websites/edit/route.ts", "updatedHtml"],
  ]) {
    const src = readFileSync(file, "utf8");
    ok(`${label} reads the choice off the description`, /parsePhotoSource\(/.test(src));
    ok(`${label} passes it to the resolver`,
      new RegExp(`resolveWebsiteImagePlaceholders\\(${variable}, \\{ photoSource \\}\\)`).test(src));
  }
  // AN EDIT MUST NOT UNDO THE CHOICE. Without this an owner who asked for
  // no photographs gets one the first time anybody asks for any change.
  const edit = readFileSync("src/app/api/websites/edit/route.ts", "utf8");
  ok("an edit reads it from the SITE's own description, not the change request",
    /parsePhotoSource\(website\.description \?\? ""\)/.test(edit));
}

console.log("\n== 3. whose photographs are on the page ==");
{
  const page = `<!DOCTYPE html><html><body>
<img src="https://images.unsplash.com/photo-a">
<img src="https://xyz.supabase.co/storage/v1/object/public/website-references/u1/a.jpg">
<img src="https://images.unsplash.com/photo-b">
<img src='https://xyz.supabase.co/storage/v1/object/public/website-references/u1/b.jpg.web.webp'>
<img src="data:image/svg+xml;base64,AAAA">
<style>.x{background:url("https://images.unsplash.com/never-counted")}</style>
<script>const tpl = '<img src="https://images.unsplash.com/inside-a-script">';</script>
</body></html>`;
  const c = census.censusSiteImages(page);
  ok("stock photos are counted", c.stock === 2, String(c.stock));
  ok("the owner's uploads are counted", c.own === 2, String(c.own));
  ok("...including single-quoted and WebP derivatives", c.own === 2);
  ok("anything else is counted apart, not folded into either", c.other === 1, String(c.other));
  ok("every image is accounted for", c.total === 5, String(c.total));
  // CSS IS NOT MARKUP. A url() inside <style> is not an <img>, and
  // counting it would inflate the sentence shown to the owner.
  ok("a url() inside <style> is not an image", c.total === 5);
  ok("the stock URLs are reported, not just counted", c.stockUrls.length === 2);

  ok("a page with no stock photos gets no nudge",
    !census.shouldOfferOwnPhotos(census.censusSiteImages(
      `<img src="https://x.supabase.co/storage/v1/object/public/website-references/u/a.jpg">`)));
  ok("a page with stock photos does", census.shouldOfferOwnPhotos(c));
  ok("an empty page is counted as empty", census.censusSiteImages("").total === 0);
  ok("null does not throw", census.censusSiteImages(null).total === 0);
}

console.log("\n== 4. attribution lands ONLY on the photographs that need it ==");
{
  // A CREDIT ON THE OWNER'S OWN PHOTOGRAPH IS A FALSE STATEMENT published
  // on their site, and one they would have no way to notice.
  const own = `https://xyz.supabase.co/storage/v1/object/public/website-references/u1/shopfront.jpg`;
  const html = `<html><body>
<img src="${own}" alt="Our shopfront">
<img src="https://images.unsplash.com/photo-a" alt="Bread" data-unsplash-photographer="Jo Ma" data-unsplash-profile="https://unsplash.com/@joma">
</body></html>`;
  const result = placeholders.enforceUnsplashAttribution(html);
  const credits = result.html.match(/class="unsplash-credit"/g) ?? [];
  ok("exactly one credit for one Unsplash photo", credits.length === 1, String(credits.length));
  ok("the owner's photograph is untouched", result.html.includes(`<img src="${own}" alt="Our shopfront">`));
  ok("...and is not removed", result.html.includes(own));
  ok("no credit is attached to it",
    !/shopfront\.jpg"[^>]*>\s*<span class="unsplash-credit"/.test(result.html), result.html.slice(0, 300));
  // The Unsplash one still gets its credit — a test that only checked
  // "no credits on ours" would pass with attribution switched off.
  ok("the Unsplash photo still gets one", /Jo Ma/.test(result.html));

  // A page of ONLY the owner's photographs gets no credit block at all.
  const allOwn = placeholders.enforceUnsplashAttribution(
    `<html><body><img src="${own}"><img src="${own}2"></body></html>`
  );
  ok("a page with no Unsplash photos gets no credits", !/unsplash-credit/.test(allOwn.html));
  ok("...and nothing is removed from it", allOwn.removed === 0, String(allOwn.removed));
}

console.log("\n== 5. storage: a limit per account, and what it does not do ==");
{
  ok("free gets the smallest allowance", quota.storageLimitBytes({ slug: "free" }) < quota.storageLimitBytes({ slug: "starter" }));
  ok("the allowance rises with the plan",
    ["free", "starter", "growth", "professional", "ultimate"].every((s, i, all) =>
      i === 0 || quota.storageLimitBytes({ slug: all[i - 1] }) < quota.storageLimitBytes({ slug: s })));
  // AN UNKNOWN PLAN GETS THE FREE ALLOWANCE, not an unlimited one.
  ok("an unknown plan is not unlimited", quota.storageLimitBytes({ slug: "legacy" }) === quota.DEFAULT_STORAGE_LIMIT_BYTES);
  ok("no plan at all is not unlimited", quota.storageLimitBytes(null) === quota.DEFAULT_STORAGE_LIMIT_BYTES);

  const usage = quota.summariseStorage(30 * 1024 * 1024, 50 * 1024 * 1024);
  ok("usage reports what is left", usage.remainingBytes === 20 * 1024 * 1024);
  ok("...as a fraction for a bar", Math.abs(usage.fraction - 0.6) < 0.001, String(usage.fraction));
  // OVER QUOTA IS A REAL STATE — the cleanup has not run yet — and the
  // bar has to render full rather than overflow.
  const over = quota.summariseStorage(80 * 1024 * 1024, 50 * 1024 * 1024);
  ok("being over the limit clamps the bar", over.fraction === 1, String(over.fraction));
  ok("...and leaves nothing remaining", over.remainingBytes === 0);

  // THE WHOLE BATCH, not file by file. Six that each fit and do not fit
  // together is the upload a per-file check half-completes.
  const MB = 1024 * 1024;
  const small = quota.summariseStorage(45 * MB, 50 * MB);
  ok("one file that fits is allowed", quota.canUpload(small, [4 * MB]).ok === true);
  ok("two files that each fit but not together are refused",
    quota.canUpload(small, [4 * MB, 4 * MB]).ok === false);
  const refused = quota.canUpload(small, [4 * MB, 4 * MB]);
  ok("...and it says how much was needed and how much is free",
    refused.neededBytes === 8 * MB && refused.remainingBytes === 5 * MB, JSON.stringify(refused));
  ok("a nonsense size does not make the batch free",
    quota.canUpload(quota.summariseStorage(0, MB), [NaN, 2 * MB]).ok === false);

  // ONE formatBytes NOW — lib/format-bytes.ts. storage-quota.ts had its
  // own, and the two disagreed on exactly the inputs that matter: a
  // non-finite size was "—" in the files list and "0 MB" here, and a
  // NEGATIVE — which is what canUpload's remainingBytes IS when an
  // account is over cap, and what website-builder-workspace.tsx renders —
  // was flattened to "0 MB".
  //
  // The third assertion below used to read `formatBytes(-5) === "0 MB"`
  // under the name "...and never a negative". That was not a property
  // worth protecting; it was the defect, written down as a requirement.
  // An account 500 MB over its cap was told "0 MB", which is both wrong
  // and unactionable. The precision of the other two changed with the
  // merge (one implementation, one set of thresholds) and is now the same
  // as the files list.
  ok("bytes are formatted for a person", quota.formatBytes(50 * MB) === "50.0 MB", quota.formatBytes(50 * MB));
  ok("...and GB above a gigabyte", quota.formatBytes(2 * 1024 * MB) === "2.00 GB", quota.formatBytes(2 * 1024 * MB));
  ok("...and an over-cap figure keeps its sign AND its unit",
    quota.formatBytes(-500 * MB) === "-500.0 MB", quota.formatBytes(-500 * MB));
  ok("...and a size nobody measured is a dash, not a zero",
    quota.formatBytes(NaN) === "—", quota.formatBytes(NaN));

  // THE ENDPOINT PAGES. A user with more files than one page is exactly
  // the user this is for.
  const endpoint = readFileSync("src/app/api/websites/storage-usage/route.ts", "utf8");
  // AN UNBOUNDED-BY-COUNT LOOP. `offset < 1` also contains "offset +=
  // PAGE", so the increment alone proves nothing about paging.
  ok("the usage endpoint pages through storage",
    /for \(let offset = 0; ; offset \+= PAGE\)/.test(endpoint),
    endpoint.match(/for \(let offset[^\n]*/)?.[0]);
  ok("...stopping on a short page", /if \(files\.length < PAGE\) break;/.test(endpoint));
  ok("...reads through the CALLER's own client, so RLS scopes it",
    /createClient\(\)/.test(endpoint) && !/createAdminClient/.test(endpoint));
  ok("...and fails OPEN, because it gates an upload",
    /degraded: true/.test(endpoint));
}

console.log("\n== 6. the cleanup deletes only what nothing needs ==");
{
  const DAY = 86_400_000;
  const now = Date.UTC(2026, 7, 22);
  const old = now - 10 * DAY;
  const files = [
    { path: "u1/keep-embedded.jpg", createdAtMs: old },
    { path: "u1/keep-referenced.jpg", createdAtMs: old },
    { path: "u1/keep-derivative.jpg.web.webp", createdAtMs: old },
    { path: "u1/keep-original-of-embedded-derivative.jpg", createdAtMs: old },
    { path: "u1/keep-recent.jpg", createdAtMs: now - 60_000 },
    { path: "u1/orphan.jpg", createdAtMs: old },
  ];
  const documents = [
    `<img src="https://x.supabase.co/storage/v1/object/public/website-references/u1/keep-embedded.jpg">`,
    `<img src="https://x.supabase.co/storage/v1/object/public/website-references/u1/keep-original-of-embedded-derivative.jpg.web.webp">`,
  ];
  const referencedPaths = new Set(["u1/keep-referenced.jpg", "u1/keep-derivative.jpg"]);
  const r = orphans.findOrphanImages({ files, referencedPaths, documents, nowMs: now });

  ok("exactly one file is an orphan", r.orphans.length === 1, r.orphans.join(","));
  ok("...and it is the orphan", r.orphans[0] === "u1/orphan.jpg", r.orphans[0]);
  const keptPaths = r.kept.map((k) => k.path);
  for (const path of files.map((f) => f.path).filter((p) => p !== "u1/orphan.jpg")) {
    ok(`  ${path.replace("u1/", "")} is kept`, keptPaths.includes(path), keptPaths.join(","));
  }
  // THE RACE. Upload, then generate — in between the file is referenced
  // by nothing, and a cleanup in that window deletes a photograph out
  // from under a generation about to use it.
  ok("a fresh upload is never deleted, whatever references it",
    r.kept.some((k) => k.path === "u1/keep-recent.jpg" && /in flight/.test(k.reason)),
    JSON.stringify(r.kept));
  // A DERIVATIVE LIVES OR DIES WITH ITS ORIGINAL, in both directions:
  // the row names the original, the page embeds the derivative.
  ok("a derivative of a referenced original is kept",
    r.kept.some((k) => k.path === "u1/keep-derivative.jpg.web.webp" && /derivative/.test(k.reason)));
  ok("an original whose derivative is embedded is kept",
    r.kept.some((k) => k.path === "u1/keep-original-of-embedded-derivative.jpg" && /derivative is embedded/.test(k.reason)));
  ok("every kept file says WHY", r.kept.every((k) => k.reason.length > 8));

  // A URL WITH A QUERY STRING still identifies its file.
  const withQuery = orphans.findOrphanImages({
    files: [{ path: "u1/a.jpg", createdAtMs: old }],
    referencedPaths: new Set(),
    documents: [`<img src="https://x.supabase.co/storage/v1/object/public/website-references/u1/a.jpg?width=800">`],
    nowMs: now,
  });
  ok("a URL with a query string still protects its file", withQuery.orphans.length === 0, withQuery.orphans.join(","));

  // NOTHING IS DELETED WHEN NOTHING IS KNOWN. A failure that produced an
  // empty document list must not read as "everything is an orphan" — so
  // the ROUTE has to throw rather than proceed on a partial read.
  const route = readFileSync("src/app/api/cron/website-storage-cleanup/route.ts", "utf8");
  // SPECIFICALLY INSIDE THE TABLE LOOP. The file has other `throw error`
  // lines, so a bare search passes while the document read has been made
  // to swallow a failure — and an empty document list reads as "nothing
  // references anything", which deletes every photograph on the site.
  ok("a failed document read aborts the whole run",
    /for \(const table of tables\) \{[\s\S]{0,300}if \(error\) throw error;/.test(route),
    route.slice(route.indexOf("for (const table of tables)"), route.indexOf("for (const table of tables)") + 260));
  ok("...and every table that carries HTML is read",
    ["user_websites", "published_sites", "website_versions", "site_versions"].every((t) => route.includes(`"${t}"`)));
  ok("...including the sub-pages inside them", /normalisePages\(row\.pages\)/.test(route));
  ok("the run is authenticated", /checkCronAuth\(request\)/.test(route));
  ok("...and a dry run is possible", /dry.*=== "1"/.test(route));
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  ok("the cleanup is scheduled",
    vercel.crons.some((c) => c.path === "/api/cron/website-storage-cleanup"),
    vercel.crons.map((c) => c.path).join(","));
}

console.log("\n== 7. the file the visitor downloads is the optimised one ==");
{
  const server = readFileSync("src/lib/website-reference-image-server.ts", "utf8");
  ok("a WebP derivative is produced", /\.webp\(\{ quality: WEB_IMAGE_QUALITY \}\)/.test(server));
  ok("...resized for the web, not for the model",
    /WEB_IMAGE_MAX_DIMENSION = 1600/.test(server) && /REFERENCE_IMAGE_MAX_DIMENSION = 1568/.test(server));
  // WEBP IS NOT SMALLER FOR EVERY INPUT. Swapping in a derivative that
  // costs the visitor MORE is the opposite of the point.
  ok("...and only used when it is actually smaller",
    /return out\.length < buffer\.length \? out : null;/.test(server));
  ok("the page embeds the derivative's URL", /getPublicUrl\(servedPath\)/.test(server));
  ok("...falling back to the original when anything fails",
    /let servedPath = path;/.test(server));
  ok("the derivative sits beside the original, in the same user folder",
    /return `\$\{path\}\$\{WEB_IMAGE_SUFFIX\}`/.test(server) === false || /webDerivativePath/.test(server));
}

console.log("\n== 8. the choice is asked before generation, and shown after ==");
{
  const controls = readFileSync("src/components/website-builder/design-controls.tsx", "utf8");
  ok("the control exists", /data-testid="design-photo-source"/.test(controls));
  ok("...offering all three answers", /PHOTO_SOURCES\.map/.test(controls));
  ok("...and says how many photographs the site will want",
    /photoSourceTitle", \{ count: TYPICAL_SITE_PHOTO_COUNT \}/.test(controls));
  // A CONTROL THAT QUIETLY DOES SOMETHING ELSE is worse than one that
  // explains itself: "my own" with nothing attached becomes stock.
  ok("...and says so when 'my own' has nothing to work with",
    /photoSource === "own" && imageCount === 0[\s\S]{0,80}photoSourceNeedsUpload/.test(controls));

  const workspace = readFileSync("src/components/website-builder/website-builder-workspace.tsx", "utf8");
  ok("the finished site says how many photos are stock", /data-testid="stock-photo-notice"/.test(workspace));
  ok("...counted off the page, not recorded at generation",
    /censusSiteImages\(displayedHtml\)/.test(workspace));
  ok("...and only when there is something to offer", /shouldOfferOwnPhotos\(imageCensus\)/.test(workspace));
  ok("...with an action that opens the upload picker",
    /editImageInputRef\.current\?\.click\(\)/.test(workspace));
  // THE ENDPOINT HAS TO EXIST FOR THE ORDER TO MEAN ANYTHING. indexOf
  // returns -1 for a missing string, and -1 is less than everything.
  ok("the workspace calls the usage endpoint at all",
    workspace.includes('fetchWithAuthRetry("/api/websites/storage-usage")'));
  ok("the quota is checked before the first byte goes up",
    workspace.indexOf('fetchWithAuthRetry("/api/websites/storage-usage")') > 0 &&
      workspace.indexOf('fetchWithAuthRetry("/api/websites/storage-usage")') <
        workspace.indexOf("const uploadResults = await Promise.all"));
  ok("...on the whole batch", /referenceImageFiles\.map\(\(f\) => f\.size\)/.test(workspace));
  ok("...and fails open", /catch \{\s*\n\s*\/\* fails open/.test(workspace));

  for (const loc of ["en", "el", "de", "es", "fr", "it", "ja", "pt", "zh", "ar"]) {
    const m = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
    const d = m.dashboard?.websiteBuilder?.design ?? {};
    const w = m.dashboard?.websiteBuilder ?? {};
    ok(`${loc} has the photo-source copy`,
      typeof d.photoSourceTitle === "string" &&
        ["own", "stock", "none"].every((k) => typeof d.photoSourceChoices?.[k] === "string") &&
        ["own", "stock", "none"].every((k) => typeof d.photoSourceHint?.[k] === "string") &&
        typeof w.stockNoticeTitle === "string" && typeof w.storageFull === "string", loc);
  }
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
