/*
 * «ΕΞΑΓΩΓΗ ΟΛΩΝ»: ONE FILE WITH EVERY FILE, SITE, GAME AND ROW (MASTER
 * Μέρος 18 §2.4, docs/ACCEPTANCE.md Α49).
 *
 * src/lib/account/export-archive.ts is run here against a stand-in that
 * answers as Supabase's Storage API does (one folder level per listing,
 * folders as entries with no id, pages, download by exact path): a person
 * with files in every bucket, folders three deep, a file Storage cannot
 * read and a key that tries to climb out of its folder, next to another
 * person with files of their own. The archive is read back with the
 * repository's independent zip reader (src/lib/files/zip.ts), which was
 * written for documents people upload, not for this.
 *
 * Then the route: the archive only behind the switch `export-all`, the
 * files only from the session's own folder, the JSON export unchanged
 * when the switch is off.
 *
 * Run: node scripts/tests/export-archive.test.mjs
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";
import { readdirSync } from "node:fs";
const LOCALES_ALL = readdirSync("messages").filter((f) => /^[a-z]{2}\.json$/.test(f)).map((f) => f.slice(0, 2));

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

const { collectExportFiles, buildExportArchive, safeEntryName, EXPORT_FILES_MAX_BYTES, EXPORT_FILES_MAX_COUNT } = await loadTs("src/lib/account/export-archive.ts");
const { USER_BUCKETS } = await loadTs("src/lib/account/erase-storage.ts");
const { readZipEntries, readZipEntryText } = await loadTs("src/lib/files/zip.ts");
const { GAME_CSP } = await loadTs("src/lib/games/game-html.ts");

const U = "11111111-1111-4111-8111-111111111111";
const V = "22222222-2222-4222-8222-222222222222";

/** A Storage API stand-in: list one level, folders without id, pages; download by path. */
function makeStorage() {
  const buckets = new Map();
  const unreadable = new Set();
  const downloads = [];
  const put = (bucket, path, text) => {
    if (!buckets.has(bucket)) buckets.set(bucket, new Map());
    buckets.get(bucket).set(path, new TextEncoder().encode(text));
  };
  const storage = {
    from(bucket) {
      if (!buckets.has(bucket)) buckets.set(bucket, new Map());
      const files = buckets.get(bucket);
      return {
        async list(path, { limit, offset }) {
          const prefix = path ? `${path}/` : "";
          const children = new Map();
          for (const key of files.keys()) {
            if (!key.startsWith(prefix)) continue;
            const rest = key.slice(prefix.length);
            const slash = rest.indexOf("/");
            if (slash === -1) children.set(rest, { name: rest, id: `id-${key}` });
            else children.set(rest.slice(0, slash), { name: rest.slice(0, slash), id: null });
          }
          const sorted = [...children.values()].sort((a, b) => a.name.localeCompare(b.name));
          return { data: sorted.slice(offset, offset + limit), error: null };
        },
        async download(path) {
          downloads.push(`${bucket}:${path}`);
          if (unreadable.has(`${bucket}:${path}`)) return { data: null, error: { message: "Object not found" } };
          const body = files.get(path);
          return body ? { data: new Blob([body]), error: null } : { data: null, error: { message: "Object not found" } };
        },
      };
    },
  };
  return { storage, put, unreadable, downloads };
}

function fixture() {
  const s = makeStorage();
  s.put("user-files", `${U}/report.pdf`, "U report");
  s.put("user-files", `${U}/a/b/c/deep.txt`, "U deep");
  s.put("create-attachments", `${U}/photo.jpg`, "U photo");
  s.put("website-references", `${U}/site-1/ref.png`, "U ref");
  s.put("ai-images", `${U}/gen/1.png`, "U image");
  s.put("user-files", `${U}/broken.bin`, "U broken");
  s.unreadable.add(`user-files:${U}/broken.bin`);
  s.put("user-files", `${V}/report.pdf`, "V report");
  s.put("ai-images", `${V}/gen/1.png`, "V image");
  return s;
}

console.log("== 1. every stored file of the person, and nobody else's ==");
{
  const s = fixture();
  const got = await collectExportFiles(s.storage, U);
  const names = got.included.map((f) => `${f.bucket}:${f.path}`).sort();
  check(`the five readable files, from all ${USER_BUCKETS.length} buckets (${names.length})`,
    names.join(",") === [`ai-images:${U}/gen/1.png`, `create-attachments:${U}/photo.jpg`, `user-files:${U}/a/b/c/deep.txt`, `user-files:${U}/report.pdf`, `website-references:${U}/site-1/ref.png`].join(","), names.join(", "));
  check("...folders followed three deep", names.includes(`user-files:${U}/a/b/c/deep.txt`));
  check("...the bytes are the file's own", new TextDecoder().decode(got.included.find((f) => f.path.endsWith("report.pdf")).data) === "U report");
  check("nothing of the other person's is listed or downloaded", !s.downloads.some((d) => d.includes(V)) && !names.some((n) => n.includes(V)), s.downloads.join(", "));
  check("a file Storage cannot read is named with its reason, not dropped", got.left.length === 1 && got.left[0].path === `${U}/broken.bin` && got.left[0].reason === "unreadable", JSON.stringify(got.left));
  check("the byte count is the files' sum", got.bytes === ["U report", "U deep", "U photo", "U ref", "U image"].reduce((n, t) => n + t.length, 0), String(got.bytes));
  let refused = false;
  try { await collectExportFiles(s.storage, "not-a-user-id"); } catch { refused = true; }
  check("a folder that is not a user id is refused before anything is listed", refused);
}

console.log("\n== 2. the caps: what does not fit is named, never dropped in silence ==");
{
  const s = fixture();
  const bySize = await collectExportFiles(s.storage, U, { maxBytes: 16, maxCount: 100 });
  check(`over the size cap: in the archive up to the cap (${bySize.bytes} of 16 bytes)`, bySize.bytes <= 16 && bySize.included.length >= 1);
  check("...the rest named with the reason «size»", bySize.left.filter((f) => f.reason === "size").length === 5 - bySize.included.length, JSON.stringify(bySize.left));
  const byCount = await collectExportFiles(s.storage, U, { maxBytes: 1e9, maxCount: 2 });
  check("over the count cap: two in, the rest named with the reason «count»", byCount.included.length === 2 && byCount.left.filter((f) => f.reason === "count").length === 3, JSON.stringify(byCount.left));
  check(`the route's caps are the module's own (${EXPORT_FILES_MAX_BYTES / 1048576} MB, ${EXPORT_FILES_MAX_COUNT} files), below the format's 65,535 entries`,
    EXPORT_FILES_MAX_BYTES > 0 && EXPORT_FILES_MAX_BYTES <= 200 * 1048576 && EXPORT_FILES_MAX_COUNT > 0 && EXPORT_FILES_MAX_COUNT < 65535);
}

console.log("\n== 3. the archive, read back by an independent reader ==");
const s3 = fixture();
s3.put("user-files", `${U}/../../escape.txt`, "climbing");
const files = await collectExportFiles(s3.storage, U);
const data = { export_format_version: 2, account: { id: U }, data: { notes: [{ title: "Σημείωση" }] } };
const zip = Buffer.from(buildExportArchive({
  data,
  userId: U,
  files: files.included,
  sites: [
    { name: "Camping Αύρα", html_content: "<html><body>home</body></html>", pages: [] },
    { name: "Camping Αύρα", html_content: "<html><body>second</body></html>", pages: [] },
    { name: "Five pages", html_content: '<html><body><a href="about">About</a></body></html>', pages: [{ slug: "about", title: "About", html: "<html><body>about</body></html>" }] },
    { name: "Empty", html_content: null },
  ],
  games: [{ title: "Space/Run", html: "<!doctype html><html><head></head><body><script>1</script></body></html>" }, { title: "Draft", html: null }],
}));
const entries = readZipEntries(zip);
const byName = new Map(entries.map((e) => [e.name, e]));
const text = (name) => (byName.has(name) ? readZipEntryText(zip, byName.get(name)) : null);
// A STORED entry's own bytes, for the one entry that is binary (a site's
// .zip): readZipEntryText decodes as UTF-8, which is right for every other
// entry here and mangles an archive.
const rawEntry = (buf, entry) => {
  const at = entry.localHeaderOffset;
  const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
  return buf.subarray(start, start + entry.compressedSize);
};
console.log(`  (entries: ${entries.map((e) => e.name).join(" · ")})`);
check("the data file is there, and is the same data", JSON.stringify(JSON.parse(text("ionexa-data.json") ?? "null")) === JSON.stringify(data));
check("every file under files/<bucket>/, without the person's id in the path",
  text("files/user-files/report.pdf") === "U report" && text("files/user-files/a/b/c/deep.txt") === "U deep" && text("files/create-attachments/photo.jpg") === "U photo" && text("files/website-references/site-1/ref.png") === "U ref" && text("files/ai-images/gen/1.png") === "U image");
check("no entry can step outside the folder it is unpacked into", entries.every((e) => !e.name.split("/").some((seg) => seg === ".." || seg === ".") && !e.name.startsWith("/") && !e.name.includes("\\")), entries.map((e) => e.name).join(", "));
check("...and the climbing key is kept, inside", entries.some((e) => e.name.startsWith("files/user-files/") && e.name.endsWith("escape.txt")));
check("a one-page site is its own .html, and two sites of one name are both there",
  text("sites/Camping Αύρα.html") === "<html><body>home</body></html>" && text("sites/Camping Αύρα (2).html") === "<html><body>second</body></html>");
const pagedSite = byName.get("sites/Five pages.zip");
check("a site with pages is the same .zip the Site downloads, and it opens", Boolean(pagedSite) && (() => {
  const inner = readZipEntries(rawEntry(zip, pagedSite));
  return inner.some((e) => e.name === "index.html") && inner.some((e) => e.name === "about.html");
})());
check("a site with nothing written yet is left out", !entries.some((e) => e.name.startsWith("sites/Empty")));
const game = text("games/Space Run.html");
check("a game is its own page, sealed as it is served", game !== null && game.includes(GAME_CSP) && game.indexOf("Content-Security-Policy") < game.indexOf("<script>"), game?.slice(0, 160));
check("a game with no code yet is left out", !entries.some((e) => e.name.startsWith("games/Draft")));
check("safeEntryName keeps a plain path as it is", safeEntryName("files", "user-files", "a/b.txt") === "files/user-files/a/b.txt");

console.log("\n== 4. the route ==");
const route = stripComments(readFileSync("src/app/api/account/export/route.ts", "utf8"));
const flagsSrc = readFileSync("src/lib/flags/flags.ts", "utf8");
check("the switch is declared", /\n  "export-all": "/.test(flagsSrc));
const gateAt = route.indexOf('if (await isFeatureOn("export-all", user))');
check("the archive is built only behind the switch, for this person", gateAt > 0 && route.indexOf("buildExportArchive(", gateAt) > gateAt);
check("...after the session is read and the hourly limit is asked", route.indexOf("supabase.auth.getUser()") < gateAt && route.indexOf('scope: "account_export"') < gateAt);
check("the files come from the session's own id, never from the request",
  /collectExportFiles\(createAdminClient\(\)\.storage, user\.id\)/.test(route) && !/request|searchParams|req\./.test(route.slice(gateAt, route.indexOf("return new NextResponse(Buffer.from(zip)"))));
check("...and the sites and games from rows the person's own session reads",
  /supabase\.from\("user_websites"\)\.select\("name, html_content, pages"\)\.eq\("user_id", user\.id\)/.test(route) && /supabase\.from\("user_games"\)\.select\("title, html"\)\.eq\("user_id", user\.id\)/.test(route));
check("what did not fit is written into the data file", /files_not_included: files\.left/.test(route));
check("the archive is a .zip attachment", /"Content-Type": "application\/zip"/.test(route) && /ionexa_export_\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}\.zip/.test(route));
check("with the switch off, the JSON export is the same as before",
  /const filename = `ionexa_export_\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}\.json`;\s*return new NextResponse\(JSON\.stringify\(payload, null, 2\)/.test(route));
const settings = stripComments(readFileSync("src/app/dashboard/settings/page.tsx", "utf8"));
check("Settings says what the button downloads: the .zip with the switch, the JSON without it",
  /\(await isFeatureOn\("export-all", user\)\) \? t\("exportData\.descriptionAll"\) : t\("exportData\.description"\)/.test(settings));
for (const l of ["en", "el", "de", "fr", "es", "it", "pt", "ar", "ja", "zh"]) {
  const e = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).settings.exportData;
  check(`${l}: the .zip is named, and the JSON one no longer counts «13 modules»`, /\.zip/.test(e.descriptionAll ?? "") && /JSON/.test(e.description) && !/13/.test(e.description), `${e.description} | ${e.descriptionAll}`);
}

console.log("\n== 5. a refusal in the reader's language ==");
// The route's `error` is an English sentence, and the button used to put
// it in the toast on every screen. It says the limit from the route's
// code and number instead, in the reader's language.
const button = stripComments(readFileSync("src/components/settings/export-data-button.tsx", "utf8"));
check("the button never shows the route's own sentence", !/body\?\.error|body\.error/.test(button), "export-data-button.tsx");
check("...it says the hourly limit from the route's code and number",
  /body\?\.code === "export_rate_limited" && typeof body\.limit === "number" \? t\("tooMany", \{ count: body\.limit \}\) : t\("exportFailed"\)/.test(button));
check("...and the route sends that code with the limit it enforces",
  /code: "export_rate_limited",\s*limit: EXPORT_MAX_PER_HOUR,/.test(route) && /maxAttempts: EXPORT_MAX_PER_HOUR,/.test(route));
for (const l of LOCALES_ALL) {
  const line = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).settings?.exportData?.tooMany;
  check(`${l}: the limit is worded, with its number`, typeof line === "string" && line.includes("{count}") && !/'\{count\}'/.test(line), String(line));
}

const archive = stripComments(readFileSync("src/lib/account/export-archive.ts", "utf8"));
check("the export reads the same listing the account deletion erases", /import \{ listUserFiles, type BucketApi \} from "@\/lib\/account\/erase-storage";/.test(archive) && /const listed = await listUserFiles\(storage, userId\);/.test(archive));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
