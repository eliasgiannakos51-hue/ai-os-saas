#!/usr/bin/env node
/*
 * WHAT ONE IMAGE WEIGHS AT 2K, 4K AND 8K, MEASURED ON REAL PHOTOGRAPHS.
 *
 * Run: node scripts/image-sizes.mjs
 *
 * docs/v6-images-2026-10-02.md carries the storage half of the 8K
 * question. "4K = a few MB, 8K = tens of MB" is a sentence anybody can
 * write; this prints what three real photographs weigh when Unsplash
 * renders them at each width, then re-encodes the same pixels the three
 * ways an image product would store them: PNG (what generators return),
 * JPEG q90 and WebP q85.
 *
 * WHAT IT CANNOT SAY: what a GENERATED image weighs. Generators return
 * PNG, and PNG's size depends on the picture; a flat illustration is a
 * fraction of a photograph. The photographs here are the heavy case, and
 * that is the one a storage quota has to survive.
 *
 * It downloads from images.unsplash.com, which the product already uses
 * (lib/website-image-resolver.ts). If that host is unreachable it says so
 * and prints nothing it did not measure.
 */
import sharp from "sharp";

const PHOTOS = [
  "photo-1495474472287-4d71bcdd2085", // coffee cup, shallow depth of field
  "photo-1501339847302-ac426a4a7cbb", // cafe interior
  "photo-1470770841072-f978cf4d019e", // landscape, fine detail everywhere
];
const WIDTHS = [
  ["2K", 2048],
  ["4K", 3840],
  ["8K", 7680],
];
const mb = (n) => (n / 1_048_576).toFixed(2).padStart(6);

const rows = [];
for (const id of PHOTOS) {
  for (const [label, w] of WIDTHS) {
    const url = `https://images.unsplash.com/${id}?w=${w}&q=90&fm=jpg`;
    let buf;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.log(`${id} ${label}: not measured (${err.message})`);
      continue;
    }
    const img = sharp(buf);
    const meta = await img.metadata();
    const png = await sharp(buf).png({ compressionLevel: 9 }).toBuffer();
    const jpg = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
    const webp = await sharp(buf).webp({ quality: 85 }).toBuffer();
    rows.push({ id, label, w: meta.width, h: meta.height, png: png.length, jpg: jpg.length, webp: webp.length });
  }
}

console.log("photo                               size  pixels        MP     PNG MB  JPEG90 MB  WebP85 MB");
for (const r of rows) {
  const mp = ((r.w * r.h) / 1e6).toFixed(1).padStart(5);
  console.log(
    `${r.id.padEnd(35)} ${r.label}   ${`${r.w}x${r.h}`.padEnd(12)} ${mp}  ${mb(r.png)}     ${mb(r.jpg)}     ${mb(r.webp)}`,
  );
}
const short = rows.filter((r) => r.w < WIDTHS.find(([l]) => l === r.label)[1]);
if (short.length) {
  console.log(
    `\n${short.length} row(s) came back narrower than asked; ` +
      "those rows are measured at the size received, not the size in the label.",
  );
}
