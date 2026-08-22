#!/usr/bin/env node
/*
 * Regenerates src/app/favicon.ico and src/app/apple-icon.png.
 *
 * TWO DEFECTS this exists to fix, both found when "the Vercel icon shows
 * up before ours, and in bookmarks" was reported:
 *
 * 1. favicon.ico held ONE 180x180 image. A favicon is consumed at 16px in
 *    a tab strip, 32px in a bookmarks bar and 48px in a shortcut, so every
 *    one of those was a browser-side downscale of a 180px source — soft,
 *    and slow enough to be repainted after first paint, which is what
 *    "another icon shows first, then ours" looks like. Next also reported
 *    the true size in the tag it emits:
 *
 *        <link rel="icon" href="/favicon.ico" sizes="180x180">
 *        <link rel="icon" href="/icon.svg"    sizes="any">
 *
 *    so a browser choosing by size had no small candidate to prefer. The
 *    .ico now carries real 16/32/48 entries.
 *
 * 2. apple-icon was a DYNAMIC route (apple-icon.tsx -> ImageResponse),
 *    which Next serves at the extensionless path "/apple-icon". The
 *    middleware matcher in src/middleware.ts excludes static assets BY
 *    EXTENSION, so "/apple-icon" matched nothing in the exclusion list and
 *    every fetch of it ran the auth middleware — a full Supabase getUser()
 *    round trip to serve an icon. This is the identical root cause as the
 *    old /email-logo route (see scripts/generate-email-logo.mjs); it was
 *    fixed there and left in place here. A committed .png is excluded by
 *    the existing matcher automatically.
 *
 * Run: node scripts/generate-icons.mjs
 */
import sharp from "sharp";
import { loadTs } from "./tests/load-ts.mjs";
import { writeFileSync } from "node:fs";
import path from "node:path";

const APP_DIR = path.join(process.cwd(), "src", "app");

// THE MARK COMES FROM lib/brand/globe.ts, not from a copy of it here.
//
// It used to be a literal SVG string in this file, a second literal in
// scripts/generate-email-logo.mjs, and a third in src/app/icon.svg — three
// hand-maintained copies of "the same" drawing, next to a fourth shape in
// the ThinkingIndicator and a fifth in the page backdrop. Editing one of
// them changed the icon and left the email logo behind, and nothing said
// so. scripts/tests/globe-mark.test.mjs now asserts every one of these
// files matches what globeSvg() produces.
//
// Stroke widths are still given per target size rather than scaled from
// one source: a 3px stroke on a 512px canvas vanishes at 16px, so the
// small sizes need proportionally heavier lines to stay legible in a tab
// strip. That is a rendering decision per size, not a different shape.
const { globeSvg } = await loadTs("src/lib/brand/globe-svg.ts");

const INK = "#f5a623";
const PLATE = "#0a0a0a";

function markSvg(size, baseStroke, { background = PLATE, radius = 17.14, nodeScale = 1 } = {}) {
  return globeSvg({ size, baseStroke, ink: INK, background, radius, nodeScale, detail: "mark" });
}

async function png(size, baseStroke, options) {
  return sharp(Buffer.from(markSvg(size, baseStroke, options))).resize(size, size).png().toBuffer();
}

// ---------------------------------------------------------------------------
// favicon.ico — a real multi-resolution icon.
//
// Written by hand rather than with a dependency: the ICO container is a
// 6-byte header, one 16-byte directory entry per image, then the payloads.
// Modern browsers accept PNG payloads inside ICO, which is what every
// generator emits today too.
// ---------------------------------------------------------------------------
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    // 0 means 256 in the ICO format; every size here is smaller than that.
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette colours (0 = truecolour)
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

// 16/32/48 are the sizes browsers actually request for tabs, bookmarks and
// desktop shortcuts. Heavier strokes at the small end so the orbit still
// reads as an orbit rather than a smudge.
// baseStroke is in viewBox units (the box is 100 wide), so 8.6 at 16px
// paints a ~1.4px sphere outline and 4.3 at 48px paints ~2px.
// nodeScale grows the dot as the canvas shrinks, for the same reason the
// strokes do: at 16px the unscaled 4.29-unit node is 0.7 of a pixel.
const ICO_SIZES = [
  { size: 16, baseStroke: 8.6, nodeScale: 3.2 },
  { size: 32, baseStroke: 5.4, nodeScale: 2 },
  { size: 48, baseStroke: 4.3, nodeScale: 1.6 },
];

const icoImages = [];
for (const { size, baseStroke, nodeScale } of ICO_SIZES) {
  icoImages.push({ size, data: await png(size, baseStroke, { nodeScale }) });
}
const icoPath = path.join(APP_DIR, "favicon.ico");
writeFileSync(icoPath, buildIco(icoImages));
console.log(`favicon.ico  ${ICO_SIZES.map((s) => `${s.size}x${s.size}`).join(", ")}`);

// ---------------------------------------------------------------------------
// apple-icon.png — static, so it is served at "/apple-icon.png" and the
// middleware matcher's extension-based exclusion covers it.
//
// Opaque background: iOS composites the touch icon onto the home screen
// with no transparency handling of its own, so a transparent one renders
// as a black square on some backgrounds.
// ---------------------------------------------------------------------------
const applePath = path.join(APP_DIR, "apple-icon.png");
// 3.0 viewBox units at 180px is a ~5.4px sphere outline — the same
// visual weight the old literal drew with stroke-width 3 in its 140-unit
// box. iOS applies its own mask, so the plate is square here.
writeFileSync(applePath, await png(180, 3, { radius: 0 }));
console.log("apple-icon.png  180x180");

// ---------------------------------------------------------------------------
// icon.svg — the scalable one Next emits alongside the .ico. Written here
// rather than edited by hand, because a hand-edited copy is exactly how
// the four marks drifted apart in the first place.
// ---------------------------------------------------------------------------
const svgPath = path.join(APP_DIR, "icon.svg");
writeFileSync(svgPath, markSvg(140, 3.5));
console.log("icon.svg  140x140");
