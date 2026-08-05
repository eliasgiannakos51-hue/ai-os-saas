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
import { mkdirSync } from "node:fs";
import path from "node:path";

const SIZE = 256;
const OUT_DIR = path.join(process.cwd(), "public");
const OUT_FILE = path.join(OUT_DIR, "ionexa-email-logo.png");

// Same mark as src/app/icon.svg / apple-icon, with the ~3x heavier strokes
// that survive being scaled down to 56px in an inbox. The background is
// opaque and matches the email body's BG (see lib/email/templates.ts) so
// the tile disappears into the layout instead of showing as a dark square
// in clients that ignore border-radius.
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="272 97 136 136">
  <rect x="272" y="97" width="136" height="136" fill="#090909"/>
  <circle cx="340" cy="167" r="46" fill="none" stroke="#f5a623" stroke-width="9"/>
  <circle cx="340" cy="115" r="11" fill="#f5a623"/>
  <ellipse cx="340" cy="167" rx="64" ry="24" fill="none" stroke="#f5a623" stroke-width="7" opacity="0.85" transform="rotate(-20 340 167)"/>
</svg>`;

mkdirSync(OUT_DIR, { recursive: true });

const info = await sharp(Buffer.from(MARK_SVG)).png({ compressionLevel: 9 }).toFile(OUT_FILE);

console.log(`wrote ${OUT_FILE}`);
console.log(`  ${info.width}x${info.height}, ${info.size} bytes, format=${info.format}`);
