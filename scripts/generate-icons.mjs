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
import { writeFileSync } from "node:fs";
import path from "node:path";

const APP_DIR = path.join(process.cwd(), "src", "app");

// The brand mark, identical in geometry to src/app/icon.svg. Stroke widths
// are given per target size rather than scaled from one source: a 3px
// stroke on a 512px canvas vanishes at 16px, so the small sizes need
// proportionally heavier lines to stay legible in a tab strip.
function markSvg(size, strokeScale) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="270 95 140 140">
  <rect x="270" y="95" width="140" height="140" rx="24" fill="#0a0a0a"/>
  <circle cx="340" cy="165" r="42" fill="none" stroke="#f5a623" stroke-width="${3 * strokeScale}"/>
  <circle cx="340" cy="123" r="${6 * Math.max(1, strokeScale * 0.8)}" fill="#f5a623"/>
  <ellipse cx="340" cy="165" rx="60" ry="22" fill="none" stroke="#f5a623" stroke-width="${2 * strokeScale}" opacity="0.5" transform="rotate(-20 340 165)"/>
</svg>`;
}

async function png(size, strokeScale) {
  return sharp(Buffer.from(markSvg(size, strokeScale))).resize(size, size).png().toBuffer();
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
const ICO_SIZES = [
  { size: 16, strokeScale: 4 },
  { size: 32, strokeScale: 2.5 },
  { size: 48, strokeScale: 2 },
];

const icoImages = [];
for (const { size, strokeScale } of ICO_SIZES) {
  icoImages.push({ size, data: await png(size, strokeScale) });
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
writeFileSync(applePath, await png(180, 1));
console.log("apple-icon.png  180x180");
