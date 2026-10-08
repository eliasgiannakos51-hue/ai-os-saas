// POSTS FOR SEVERAL PLATFORMS, EACH WITH ITS PICTURE AT THE RIGHT SIZE
// (MASTER 16, package 15), behind the switch "posts-images".
//
// One picture per set — the person's own photo, or one Unsplash finds from
// the posts' own words — stored once on the set and CUT per platform when
// it is asked for (api/posts/[id]/image). What would be wrong quietly:
//
//   THE WRONG SIZE. A 1200 x 630 picture uploaded to Instagram is cropped
//   by Instagram, wherever it likes. Section 4 cuts a real picture for
//   every platform with the code the route runs, and reads the pixels back.
//
//   THE SUBJECT CUT OFF. A landscape photo cut to a portrait 1080 x 1350
//   from its centre loses whatever was not in the middle. Section 4 puts
//   the subject at the edge and requires it in the cut.
//
//   SOMEBODY ELSE'S PHOTO. The person's photo is named by a path the
//   browser sends. Section 5 holds both routes to the person's own folder,
//   and to the switch, before anything is spent.
//
//   A CREDIT LEFT OFF. Unsplash's terms ask for the photographer's name
//   and a link; section 6 holds the screen to it in every language.
//
// Run: node scripts/tests/posts-images.test.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadTs, loadTsLinked } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const read = (f) => stripComments(readFileSync(f, "utf8"));

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));

const IMG = await loadTs("src/lib/posts/post-images.ts");
const { POST_PLATFORMS, parsePostsToolInput, parseStoredPostSet } = await loadTs("src/lib/posts/platforms.ts");
const { WRITE_POSTS_TOOL, buildPostsUserMessage } = await loadTs("src/lib/posts/prompt.ts");
const { cutForPlatform } = await loadTsLinked("src/lib/posts/post-image-server.ts");

console.log("== 1. every platform's size, and the file's name ==");
{
  const WANT = { linkedin: [1200, 627], x: [1600, 900], instagram: [1080, 1350], facebook: [1200, 630], threads: [1080, 1350] };
  const wrong = POST_PLATFORMS.filter((p) => IMG.POST_IMAGE_SIZES[p]?.width !== WANT[p][0] || IMG.POST_IMAGE_SIZES[p]?.height !== WANT[p][1]);
  ok(`every platform has its own published size (${POST_PLATFORMS.length})`, POST_PLATFORMS.length === 5 && wrong.length === 0, wrong.join(", "));
  ok("the file is named for what it is", IMG.postImageFilename("instagram") === "instagram-1080x1350.jpg" && IMG.postImageFilename("x") === "x-1600x900.jpg");
  ok("three sources: none, own, Unsplash — and nothing else", IMG.POST_IMAGE_SOURCES.join() === "none,own,unsplash" && IMG.isPostImageSource("own") && !IMG.isPostImageSource("dalle") && !IMG.isPostImageSource(null));
}

console.log("\n== 2. a stored picture, made safe ==");
{
  const photo = { kind: "unsplash", url: "https://images.unsplash.com/photo-1?ixid=a", photographerName: "Ann", photographerUrl: "https://unsplash.com/@ann", downloadLocation: "https://api.unsplash.com/photos/1/download" };
  ok("an own photo keeps its path", JSON.stringify(IMG.parsePostImage({ kind: "own", path: "u1/123-a.jpg" })) === JSON.stringify({ kind: "own", path: "u1/123-a.jpg" }));
  ok("...and a path that climbs out is refused", IMG.parsePostImage({ kind: "own", path: "u1/../u2/a.jpg" }) === null && IMG.parsePostImage({ kind: "own", path: "  " }) === null);
  ok("an Unsplash photo keeps its credit", JSON.stringify(IMG.parsePostImage(photo)) === JSON.stringify(photo));
  ok("...is refused without its photographer", IMG.parsePostImage({ ...photo, photographerName: "" }) === null && IMG.parsePostImage({ ...photo, photographerUrl: undefined }) === null);
  ok("...and only from Unsplash's own image host", IMG.parsePostImage({ ...photo, url: "https://evil.example/a.jpg" }) === null && IMG.parsePostImage({ ...photo, url: "http://images.unsplash.com/a" }) === null);
  ok("anything else is nothing", IMG.parsePostImage(null) === null && IMG.parsePostImage("x") === null && IMG.parsePostImage({ kind: "generated", url: "https://images.unsplash.com/a" }) === null);
  const sized = new URL(IMG.unsplashAtSize(photo.url, 1080, 1350));
  ok("an Unsplash photo is asked of Unsplash's CDN at the platform's size", sized.host === "images.unsplash.com" && sized.searchParams.get("w") === "1080" && sized.searchParams.get("h") === "1350" && sized.searchParams.get("fit") === "crop" && sized.searchParams.get("ixid") === "a");
}

console.log("\n== 3. the set keeps its picture; the model says what to look for ==");
{
  const ctx = { platforms: ["linkedin", "instagram"], locale: "el" };
  const raw = { posts: [{ platform: "linkedin", text: "Νέο μενού.", hashtags: [] }, { platform: "instagram", text: "Νέο μενού!", hashtags: ["φαγητό"] }] };
  const v = parsePostsToolInput({ ...raw, imageQuery: "  greek   taverna   table  " }, ctx);
  ok("the search words come back, tidied", v.ok && v.imageQuery === "greek taverna table", JSON.stringify(v.imageQuery));
  ok("...capped, so a model cannot send a paragraph", parsePostsToolInput({ ...raw, imageQuery: "a ".repeat(200) }, ctx).imageQuery.length <= 60);
  ok("...and none asked for is none", parsePostsToolInput(raw, ctx).imageQuery === null && parsePostsToolInput({ ...raw, imageQuery: null }, ctx).imageQuery === null);
  const stored = parseStoredPostSet({ version: 1, locale: "el", posts: raw.posts, image: { kind: "own", path: "u1/a.jpg" } });
  ok("a stored set keeps its picture", stored?.image?.kind === "own" && stored.image.path === "u1/a.jpg");
  ok("...and a stored picture that is not one is dropped, the posts kept", (() => { const s = parseStoredPostSet({ version: 1, locale: "el", posts: raw.posts, image: { kind: "own", path: "../x" } }); return s && s.posts.length === 2 && !s.image; })());
  ok("a set made before has no picture and still reads", (() => { const s = parseStoredPostSet({ version: 1, locale: "el", posts: raw.posts }); return s && s.posts.length === 2 && !s.image; })());
  const props = WRITE_POSTS_TOOL.input_schema.properties;
  ok("the tool can say what to search for, and need not", props.imageQuery && !WRITE_POSTS_TOOL.input_schema.required.includes("imageQuery"));
  const asked = buildPostsUserMessage("Νέο μενού", ["linkedin"], "el", "", true);
  const notAsked = buildPostsUserMessage("Νέο μενού", ["linkedin"], "el", "", false);
  ok("the model is asked for search words only when a photo is wanted", /imageQuery/.test(asked) && !/imageQuery/.test(notAsked));
}

console.log("\n== 4. a real picture, cut for every platform ==");
{
  // A wide grey picture with its subject — red, busy — at the right edge.
  const W = 3000, H = 1000;
  const base = sharp({ create: { width: W, height: H, channels: 3, background: { r: 128, g: 128, b: 128 } } });
  const stripes = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">${Array.from({ length: 20 }, (_, i) => `<rect x="0" y="${i * 20}" width="400" height="10" fill="${i % 2 ? "#ff0000" : "#ffee00"}"/>`).join("")}</svg>`
  );
  const wide = await base.composite([{ input: stripes, left: 2550, top: 300 }]).jpeg().toBuffer();
  const sizes = [];
  for (const p of POST_PLATFORMS) {
    const out = await cutForPlatform(wide, p);
    const meta = await sharp(out).metadata();
    sizes.push(`${p} ${meta.width}x${meta.height} ${meta.format}`);
    ok(`${p}: exactly ${IMG.POST_IMAGE_SIZES[p].width} x ${IMG.POST_IMAGE_SIZES[p].height}, a JPEG`, meta.width === IMG.POST_IMAGE_SIZES[p].width && meta.height === IMG.POST_IMAGE_SIZES[p].height && meta.format === "jpeg", sizes.at(-1));
  }
  // Instagram's portrait keeps a third of the width: the subject must be in it.
  const insta = await sharp(await cutForPlatform(wide, "instagram")).raw().toBuffer({ resolveWithObject: true });
  let red = 0;
  for (let i = 0; i < insta.data.length; i += 3) if (insta.data[i] > 200 && insta.data[i + 2] < 80) red++;
  const share = red / (insta.info.width * insta.info.height);
  ok(`the portrait cut keeps the subject at the edge, not the empty middle (${(share * 100).toFixed(1)}% of it)`, share > 0.05, `${(share * 100).toFixed(2)}%`);

  // A phone photo stored on its side (EXIF 6): red on top, blue below,
  // which upright is blue on the left and red on the right.
  const sideways = await sharp({ create: { width: 1000, height: 2000, channels: 3, background: { r: 0, g: 0, b: 255 } } })
    .composite([{ input: { create: { width: 1000, height: 1000, channels: 3, background: { r: 255, g: 0, b: 0 } } }, left: 0, top: 0 }])
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const upright = await sharp(await cutForPlatform(sideways, "x")).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (y * upright.info.width + x) * 3; return upright.data.slice(i, i + 3); };
  const left = px(20, 450), right = px(upright.info.width - 20, 450);
  ok("a photo taken on its side is turned upright first", left[2] > 200 && left[0] < 60 && right[0] > 200 && right[2] < 60, `left ${[...left]} right ${[...right]}`);
}

console.log("\n== 5. the routes: the switch, the person's own folder, nothing spent before ==");
{
  const gen = read("src/app/api/posts/generate/route.ts");
  const breaker = gen.indexOf("checkAiCallAllowed(");
  const flag = gen.indexOf('pictureSource !== "none" && !(await isFeatureOn("posts-images", user))');
  const owner = gen.indexOf("ownPath && !ownPath.startsWith(`${user.id}/`)");
  ok("a picture asked for without the switch is refused, before the model", flag > 0 && flag < breaker && /\{\s*return NextResponse\.json\(\{ error: "not_enabled" \}, \{ status: 403 \}\);/.test(gen.slice(flag, flag + 200)));
  ok("a photo from outside the person's own folder is refused, before the model", owner > 0 && owner < breaker && /return NextResponse\.json\(\{ error: "bad_image_path" \}, \{ status: 400 \}\)/.test(gen.slice(owner, owner + 160)));
  ok("...and a path that climbs is refused with the body", /ownPath\.includes\("\.\."\)\)\) return NextResponse\.json\(\{ error: "bad_image_path" \}/.test(gen));
  ok("the model is asked for search words only for Unsplash, and only with a key", /wantsPhoto: pictureSource === "unsplash" && isUnsplashConfigured\(\)/.test(gen));
  const after = gen.slice(gen.indexOf("generatePosts("));
  ok("Unsplash is searched with the posts' own words, after the posts exist", /if \(pictureSource === "unsplash" && outcome\.imageQuery\) \{\s*const photo = await searchUnsplashPhoto\(outcome\.imageQuery\);/.test(after));
  ok("...and its use is registered, as Unsplash asks", /image = \{ kind: "unsplash", \.\.\.photo \};\s*void triggerUnsplashDownload\(photo\);/.test(after));
  ok("the set saved is the set with its picture", /posts: set,/.test(after) && /const set = image \? \{ \.\.\.outcome\.set, image \} : outcome\.set;/.test(after));

  const img = read("src/app/api/posts/[id]/image/route.ts");
  ok("the picture route is behind the same switch", /if \(!\(await isFeatureOn\("posts-images", user\)\)\) return NextResponse\.json\(\{ ok: false, code: "not_enabled" \}, \{ status: 403 \}\)/.test(img));
  ok("...reads the set with the person's own session, by id AND owner", /\.from\("generated_posts"\)\s*\.select\("posts"\)\s*\.eq\("id", params\.id\)\s*\.eq\("user_id", user\.id\)/.test(img) && !/createAdminClient/.test(img));
  ok("...cuts only a photo from the person's own folder", /set\.image\.kind === "own" && !set\.image\.path\.startsWith\(`\$\{user\.id\}\/`\)\) return NextResponse\.json\(\{ ok: false, code: "not_found" \}/.test(img));
  ok("...and only for a platform the set has", /!set\.posts\.some\(\(p\) => p\.platform === platform\)/.test(img) && /if \(!isPostPlatform\(platform\)\)/.test(img));
  ok("a download is bounded like every export, and named for what it is", /if \(download && !\(await allowExport\(user\.id\)\)\)/.test(img) && /\$\{download \? "attachment" : "inline"\}; filename="\$\{postImageFilename\(platform\)\}"/.test(img));
  ok("...and is the cut, as a JPEG", /const jpeg = await cutForPlatform\(source, platform\);/.test(img) && /"Content-Type": "image\/jpeg"/.test(img));

  const server = read("src/lib/posts/post-image-server.ts");
  ok("the cut fills the frame and keeps what matters in it", /\.resize\(\{ width, height, fit: "cover", position: sharp\.strategy\.attention \}\)/.test(server) && /\.rotate\(\)/.test(server));
  ok("the person's photo is read with the caller's own storage client", /supabase\.storage\.from\(CREATE_ATTACHMENT_BUCKET\)\.download\(image\.path\)/.test(server));
  ok("an Unsplash photo is fetched from Unsplash's CDN, with a time limit", /fetch\(unsplashAtSize\(image\.url, width, height\), \{ signal: controller\.signal \}\)/.test(server) && /setTimeout\(\(\) => controller\.abort\(\), FETCH_TIMEOUT_MS\)/.test(server));
}

console.log("\n== 6. the screen ==");
{
  const shell = read("src/components/posts/posts-shell.tsx");
  const page = read("src/app/dashboard/posts/page.tsx");
  ok("the page offers pictures only with the switch, and Unsplash only with its key", /pictures=\{await isFeatureOn\("posts-images", user\)\}/.test(page) && /unsplashConfigured=\{isUnsplashConfigured\(\)\}/.test(page));
  ok("the choice is a third option, drawn only with the switch", /\.\.\.\(pictures\s*\?\s*\[\s*<span key="picture"/.test(shell) && /const pictureSources: PostImageSource\[\] = unsplashConfigured \? \["none", "own", "unsplash"\] : \["none", "own"\];/.test(shell));
  ok("the field's «+» is there only for the person's own photo", /attach=\{\s*pictures && pictureSource === "own"\s*\? \{ accept: ACCEPTED_ATTACHMENT_IMAGE_TYPES\.join\(","\), label: t\("picture\.attach"\), onFiles: addOwnPhoto \}\s*: undefined\s*\}/.test(shell));
  ok("the photo is put in the person's own folder", /const path = buildAttachmentImagePath\(user\.id, ownPhoto\.file\.name\);/.test(shell) && /supabase\.storage\.from\(CREATE_ATTACHMENT_BUCKET\)\.upload\(path, ownPhoto\.file/.test(shell));
  ok("...and removed again when no posts come back to hold it", /await supabase\.storage\.from\(CREATE_ATTACHMENT_BUCKET\)\.remove\(\[path\]\);/.test(shell) && (shell.match(/await discardUpload\(\);/g) ?? []).length === 2);
  ok("...or when the posts that held it are deleted", /if \(image\?\.kind === "own"\) \{\s*try \{\s*await supabase\.storage\.from\(CREATE_ATTACHMENT_BUCKET\)\.remove\(\[image\.path\]\);/.test(shell));
  ok("a press on the choice already made closes the list, which would otherwise sit over the send button", /name="posts-picture-source"[\s\S]{0,200}onChange=\{\(\) => setPictureSource\(s\)\}\s*onClick=\{\(\) => setChoosing\(null\)\}/.test(shell));
  ok("own chosen and no photo added: said, not sent", /if \(source === "own" && !ownPhoto\) \{\s*addToast\(t\("picture\.needPhoto"\), "error"\);\s*return;/.test(shell));
  ok("every post shows its own picture at its platform's size", /<PostPicture id=\{shown\.id\} platform=\{post\.platform\} image=\{shown\.set\.image\}/.test(shell) && /const \{ width, height \} = POST_IMAGE_SIZES\[platform\];/.test(shell) && /width=\{width\}\s*height=\{height\}/.test(shell));
  ok("...from the route that cuts it, with a button that downloads that file", /const src = `\/api\/posts\/\$\{id\}\/image\?platform=\$\{platform\}`;/.test(shell) && /href=\{`\$\{src\}&download=1`\}\s*download/.test(shell));
  ok("an Unsplash photo names its photographer and Unsplash, both linked", /t\.rich\("picture\.credit", \{\s*name: image\.photographerName,/.test(shell) && /href=\{withUnsplashUtm\(image\.photographerUrl\)\}/.test(shell) && /href=\{UNSPLASH_HOME_URL\}/.test(shell));
  ok("Unsplash asked for and nothing found: said", /source === "unsplash" && !made\.set\.image \? \[\{ id: `n\$\{prev\.length\}`, role: "tool" as const, text: t\("picture\.noneFound"\) \}\]/.test(shell));
}

console.log("\n== 7. the words, and the switch ==");
{
  const KEYS = ["option", "none", "own", "unsplash", "attach", "uploading", "ready", "failed", "rejected", "needPhoto", "download", "credit", "noneFound"];
  for (const l of LOCALES) {
    const p = messages[l].posts?.picture ?? {};
    const missing = KEYS.filter((k) => typeof p[k] !== "string" || !p[k].trim());
    const credit = p.credit ?? "";
    ok(`${l}: every sentence, and a credit that links the photographer and Unsplash`, missing.length === 0 && /<author>\{name\}<\/author>/.test(credit) && /<unsplash>Unsplash<\/unsplash>/.test(credit) && /\{platform\}/.test(p.download ?? ""), missing.join(", ") || credit);
  }
  ok('the switch "posts-images" is declared', /\n  "posts-images": "/.test(readFileSync("src/lib/flags/flags.ts", "utf8")));
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exitCode = failures.length ? 1 : 0;
