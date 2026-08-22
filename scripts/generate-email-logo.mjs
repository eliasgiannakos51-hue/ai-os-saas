#!/usr/bin/env node
/*
 * Regenerates public/ionexa-email-logo.png from the brand mark.
 *
 * Why a committed PNG file rather than the /email-logo route that used to
 * serve this: an email client never loads the image the way a browser
 * does. Gmail fetches it through googleusercontent.com, Outlook through
 * its own proxy, and both are far happier with a plain static file on a
 * CDN than with a dynamically rendered route that has no file extension.
 * A `.png` URL is also the only form that Next's middleware matcher
 * already excludes (see src/middleware.ts) — the extensionless
 * /email-logo route went through middleware, which does a Supabase
 * auth round-trip, on every single image fetch from every inbox.
 *
 * Run: node scripts/generate-email-logo.mjs
 */
import sharp from "sharp";
import { loadTs } from "./tests/load-ts.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

const SIZE = 256;
const OUT_DIR = path.join(process.cwd(), "public");
const OUT_FILE = path.join(OUT_DIR, "ionexa-email-logo.png");

// THE SAME MARK AS THE FAVICON, FROM THE SAME SOURCE — lib/brand/globe.ts.
//
// This file used to carry its own literal copy of the SVG, which is how
// it came to differ from src/app/icon.svg in stroke weight, dot size and
// plate colour without anyone deciding that. globeSvg() is now the only
// place the drawing exists, and scripts/tests/globe-mark.test.mjs fails if
// this file grows a second one.
//
// The strokes are ~3x heavier than the favicon's because this is scaled
// down to 56px in an inbox from a 256px source. The background is opaque
// and matches the email body's BG (see lib/email/templates.ts) so the tile
// disappears into the layout instead of showing as a dark square in
// clients that ignore border-radius.
const { globeSvg } = await loadTs("src/lib/brand/globe-svg.ts");

const MARK_SVG = globeSvg({
  size: SIZE,
  baseStroke: 6.6,
  ink: "#f5a623",
  background: "#090909",
  radius: 0,
  detail: "mark",
});

mkdirSync(OUT_DIR, { recursive: true });

const info = await sharp(Buffer.from(MARK_SVG)).png({ compressionLevel: 9 }).toFile(OUT_FILE);

console.log(`wrote ${OUT_FILE}`);
console.log(`  ${info.width}x${info.height}, ${info.size} bytes, format=${info.format}`);
