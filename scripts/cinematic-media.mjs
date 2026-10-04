// The media of the three cinematic samples: storyboard posters today, the
// real AI image and clip once the key exists.
//
// Run: node scripts/cinematic-media.mjs --posters
//        draws each storyboard's poster (the picture a page shows without
//        JavaScript, with reduced motion or on Save-Data) from the same
//        drawing the frames use, into docs/samples/cinematic/*.png
//      GEMINI_API_KEY=… node scripts/cinematic-media.mjs [cafe|hotel|cava]
//        the trial the brief asks for: three image prompts per sample, the
//        chosen image animated with three video prompts, every take kept in
//        /tmp/cinematic-media/<sample>/ with a contact sheet to judge; then
//        --use <sample> <image#> <video#> writes the chosen take into the
//        page: poster, WebP frames (or the loop as WebM/MP4), no storyboard.
//
// ONE KEY FOR BOTH HALVES. Nano Banana Pro (images) and Veo 3.1 (video) are
// both served by the Gemini API, generativelanguage.googleapis.com — the one
// image/video host this environment's network policy lets through
// (2026-10-03: fal, Runway, Kling, BFL and BytePlus are refused). The model
// names are overridable because the first run is what confirms them:
// NOT YET RUN — written against the documented request shapes, with no key
// to try them. The first run with the key is the check.
//
// Frames need ffmpeg (FFMPEG=path, or ffmpeg on PATH). The bundled Chromium
// cannot decode H.264 (measured 2026-10-03: canPlayType("avc1") is ""), so
// frames cannot be pulled out in the browser.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { promptsFor, SAMPLES } from "./lib/cinematic-prompts.mjs";

const DIR = "docs/samples/cinematic";
const API = "https://generativelanguage.googleapis.com/v1beta";
const IMAGE_MODEL = process.env.CINEMATIC_IMAGE_MODEL || "gemini-3-pro-image-preview";
const VIDEO_MODEL = process.env.CINEMATIC_VIDEO_MODEL || "veo-3.1-fast-generate-preview";
const WORK = process.env.CINEMATIC_WORK || "/tmp/cinematic-media";
const args = process.argv.slice(2);

// ---------------------------------------------------------------- posters
if (args[0] === "--posters") {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const POSTERS = [
    // [source, file, width, height, t, the page's own colours]
    ["cup", "cup.png", 1200, 1200, 0, { "--sb-ink": "#d08a52" }],
    ["bottle", "bottle.png", 1200, 1200, 0, { "--sb-ink": "#d3ad66" }],
    ["hotel", "hotel.png", 1600, 1000, 0.999, { "--sb-ink": "#1c3a5e", "--sb-sun": "#e08a3c" }],
    ["hotel", "hotel-mobile.png", 900, 1800, 0.999, { "--sb-ink": "#1c3a5e", "--sb-sun": "#e08a3c" }],
  ];
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ content: "window.__src={};window.IonexaPlayers={source:function(n,f){window.__src[n]=f;}};" });
  await page.addScriptTag({ content: readFileSync(DIR + "/sample.js", "utf8") });
  for (const [src, file, w, h, t, vars] of POSTERS) {
    const b64 = await page.evaluate(([src, w, h, t, vars]) => {
      for (const k in vars) document.documentElement.style.setProperty(k, vars[k]);
      const n = 1000, frames = window.__src[src](n), f = frames[Math.min(n - 1, Math.round(t * n))];
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      f.draw(c.getContext("2d"), w, h);
      return c.toDataURL("image/png").split(",")[1];
    }, [src, w, h, t, vars]);
    writeFileSync(path.join(DIR, file), Buffer.from(b64, "base64"));
    console.log("  " + file + "  " + Math.round(Buffer.from(b64, "base64").length / 1024) + " KB");
  }
  await browser.close();
  process.exit(0);
}

// ------------------------------------------------------------ the real thing
// Either name: the app's failover registry reads GOOGLE_API_KEY, the
// owner's environment may carry GEMINI_API_KEY. Same key, same provider.
const KEY = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
if (!KEY) {
  console.error("SKIPPED: neither GEMINI_API_KEY nor GOOGLE_API_KEY is set in this environment.\n" +
    "  It is set in the environment's settings, never pasted into the chat.\n" +
    "  One key covers both the images (Nano Banana Pro) and the clips (Veo 3.1).");
  process.exit(2);
}
const headers = { "x-goog-api-key": KEY, "content-type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function image(prompt, aspect) {
  const res = await fetch(`${API}/models/${IMAGE_MODEL}:generateContent`, {
    method: "POST", headers,
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect, imageSize: "4K" } } }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`image ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("image: no picture in the answer: " + JSON.stringify(body).slice(0, 400));
  return { data: Buffer.from(part.inlineData.data, "base64"), mime: part.inlineData.mimeType };
}
async function video(prompt, first, last, aspect, negative) {
  const inst = { prompt, image: { bytesBase64Encoded: first.data.toString("base64"), mimeType: first.mime } };
  if (last) inst.lastFrame = { bytesBase64Encoded: last.data.toString("base64"), mimeType: last.mime };
  const res = await fetch(`${API}/models/${VIDEO_MODEL}:predictLongRunning`, {
    method: "POST", headers,
    body: JSON.stringify({ instances: [inst], parameters: { aspectRatio: aspect, resolution: "1080p", durationSeconds: 8, negativePrompt: negative } }),
  });
  let op = await res.json();
  if (!res.ok) throw new Error(`video ${res.status}: ${JSON.stringify(op).slice(0, 400)}`);
  for (let i = 0; !op.done; i++) {
    if (i > 90) throw new Error("video: not done after 15 minutes");
    await sleep(10_000);
    op = await (await fetch(`${API}/${op.name}`, { headers })).json();
  }
  if (op.error) throw new Error("video: " + JSON.stringify(op.error));
  const uri = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error("video: no clip in the answer: " + JSON.stringify(op).slice(0, 400));
  const clip = await fetch(uri, { headers: { "x-goog-api-key": KEY }, redirect: "follow" });
  return Buffer.from(await clip.arrayBuffer());
}
const ffmpeg = process.env.FFMPEG || "ffmpeg";

if (args[0] === "--use") {
  // Write the chosen take into the page.
  const [, name, imgN, vidN] = args;
  const work = path.join(WORK, name), out = path.join(DIR, "media", name);
  mkdirSync(out, { recursive: true });
  const sharp = (await import("sharp")).default;
  const imgFile = readdirSync(work).find((f) => f.startsWith(`image-${imgN}.`));
  await sharp(path.join(work, imgFile)).resize({ width: 2400, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(out, "poster.webp"));
  await sharp(path.join(work, imgFile)).resize({ width: 1080, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(out, "poster-mobile.webp"));
  const clip = path.join(work, `video-${imgN}-${vidN}.mp4`);
  let html = readFileSync(path.join(DIR, `${name}.html`), "utf8");
  const style = SAMPLES[name].style;
  if (style === "A") {
    execFileSync(ffmpeg, ["-y", "-i", clip, "-an", "-c:v", "libvpx-vp9", "-b:v", "1.4M", "-vf", "scale=1280:-2", path.join(out, "loop.webm")]);
    execFileSync(ffmpeg, ["-y", "-i", clip, "-an", "-c:v", "libvpx-vp9", "-b:v", "0.7M", "-vf", "scale=720:-2", path.join(out, "loop-mobile.webm")]);
    html = html.replace(/data-frames="source:[a-z]+" data-count="\d+"( data-count-mobile="\d+")?/, `data-src="media/${name}/loop.webm" data-src-mobile="media/${name}/loop-mobile.webm"`);
  } else {
    const [n, nMobile] = style === "C" ? [72, 36] : [48, 32];
    mkdirSync(path.join(out, "f"), { recursive: true });
    mkdirSync(path.join(out, "m"), { recursive: true });
    execFileSync(ffmpeg, ["-y", "-i", clip, "-vf", `fps=${n / 8},scale=1600:-2`, "-c:v", "libwebp", "-quality", "72", path.join(out, "f", "%03d.webp")]);
    execFileSync(ffmpeg, ["-y", "-i", clip, "-vf", `fps=${nMobile / 8},scale=720:-2`, "-c:v", "libwebp", "-quality", "70", path.join(out, "m", "%03d.webp")]);
    // ffmpeg numbers from 1; the players from 0.
    for (const sub of ["f", "m"]) {
      const files = readdirSync(path.join(out, sub)).sort();
      files.forEach((f, i) => { const to = path.join(out, sub, String(i).padStart(3, "0") + ".webp"); if (f !== path.basename(to)) execFileSync("mv", [path.join(out, sub, f), to]); });
    }
    html = html.replace(/data-frames="source:[a-z]+" data-count="\d+"( data-count-mobile="\d+")?/, `data-frames="media/${name}/f/{000}.webp" data-count="${n}" data-frames-mobile="media/${name}/m/{000}.webp" data-count-mobile="${nMobile}"`);
  }
  html = html.replace(/<source media="\(max-width:760px\)" srcset="[a-z-]+\.png">/, `<source media="(max-width:760px)" srcset="media/${name}/poster-mobile.webp">`);
  html = html.replace(/<img src="[a-z]+\.png"/, `<img src="media/${name}/poster.webp" srcset="media/${name}/poster-mobile.webp 1080w, media/${name}/poster.webp 2400w" sizes="100vw"`);
  html = html.replace(/\s*<(span|p) class="sb-note"[^>]*>[\s\S]*?<\/\1>/, "");
  writeFileSync(path.join(DIR, `${name}.html`), html);
  console.log(`${name}: image ${imgN}, clip ${vidN} written into the page`);
  process.exit(0);
}

// The trial: three images, then three clips of the chosen one.
const names = args.length ? args : Object.keys(SAMPLES);
for (const name of names) {
  const p = promptsFor(name), work = path.join(WORK, name), aspect = p.style === "C" ? "9:16" : "16:9";
  mkdirSync(work, { recursive: true });
  console.log(`\n== ${name} (style ${p.style}) ==`);
  const imgs = [];
  for (let i = 0; i < 3; i++) {
    const im = await image(p.images[i] + " Avoid: " + p.negative, aspect);
    const file = path.join(work, `image-${i + 1}.${im.mime.split("/")[1]}`);
    writeFileSync(file, im.data); imgs.push(im);
    console.log("  image " + (i + 1) + " → " + file);
  }
  const pick = Number(process.env.CINEMATIC_PICK_IMAGE || 1) - 1;
  const start = p.start ? await image(p.start + " Avoid: " + p.negative, aspect) : null;
  if (start) writeFileSync(path.join(work, "start.png"), start.data);
  for (let v = 0; v < 3; v++) {
    // A loop starts and ends on the same frame; a build starts empty and ends built.
    const first = start || imgs[pick], last = p.style === "A" ? imgs[pick] : p.style === "B" ? imgs[pick] : null;
    const clip = await video(p.videos[v], first, last, aspect, p.negative);
    const file = path.join(work, `video-${pick + 1}-${v + 1}.mp4`);
    writeFileSync(file, clip);
    console.log("  clip " + (v + 1) + " → " + file + "  " + Math.round(clip.length / 1024) + " KB");
  }
  writeFileSync(path.join(work, "prompts.json"), JSON.stringify(p, null, 2));
}
console.log(`\nJudge the takes in ${WORK}, then: node scripts/cinematic-media.mjs --use <sample> <image#> <clip#>`);
void existsSync;
