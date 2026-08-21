#!/usr/bin/env node
/*
 * DARK AND LIGHT, THE SAME PAGE, SIDE BY SIDE — ten pages, one sheet each.
 *
 * The brief asks to SEE the two themes together rather than read ratios
 * about them, because "τα πάντα φαίνονται χειρότερα" is a judgement a
 * number cannot settle on its own.
 *
 * Inputs are the post-fix renders scripts/light-border-before-after.mjs
 * already produced: real production markup with this tree's stylesheet,
 * captured in the same browser at the same viewport. Nothing is
 * re-rendered here, so the two halves are guaranteed to be the same page
 * at the same size.
 *
 * Usage: node scripts/light-border-before-after.mjs --theme light
 *        node scripts/light-border-before-after.mjs --theme dark
 *        node scripts/theme-side-by-side.mjs
 */
import sharp from "sharp";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const LIGHT_DIR = "prod-audit/border-light";
const DARK_DIR = "prod-audit/border-dark";
const OUT = path.resolve("prod-audit/theme-compare");
mkdirSync(OUT, { recursive: true });

const GAP = 16;
const LABEL = 28;

const pages = readdirSync(LIGHT_DIR)
  .filter((f) => f.endsWith("-after.png"))
  .map((f) => f.replace("-after.png", ""))
  .sort();

if (pages.length === 0) {
  console.error(`No *-after.png in ${LIGHT_DIR} — run light-border-before-after.mjs first.`);
  process.exit(2);
}

let made = 0;
for (const name of pages) {
  const lightPath = path.join(LIGHT_DIR, `${name}-after.png`);
  const darkPath = path.join(DARK_DIR, `${name}-after.png`);
  if (!existsSync(darkPath)) {
    console.log(`  skip ${name} — no dark capture`);
    continue;
  }
  const [l, d] = await Promise.all([sharp(lightPath).metadata(), sharp(darkPath).metadata()]);
  const h = Math.min(l.height, d.height);
  const w = Math.min(l.width, d.width);

  const label = (text, fill) =>
    Buffer.from(
      `<svg width="${w}" height="${LABEL}"><rect width="100%" height="100%" fill="${fill}"/>` +
        `<text x="10" y="19" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="#ffffff">${text}</text></svg>`
    );

  await sharp({
    create: { width: w * 2 + GAP, height: h + LABEL, channels: 3, background: "#3f3f46" },
  })
    .composite([
      { input: label(`${name} — LIGHT`, "#18181b"), top: 0, left: 0 },
      { input: label(`${name} — DARK`, "#18181b"), top: 0, left: w + GAP },
      { input: await sharp(lightPath).extract({ left: 0, top: 0, width: w, height: h }).toBuffer(), top: LABEL, left: 0 },
      { input: await sharp(darkPath).extract({ left: 0, top: 0, width: w, height: h }).toBuffer(), top: LABEL, left: w + GAP },
    ])
    .png()
    .toFile(path.join(OUT, `${name}.png`));
  made += 1;
  console.log(`  ${name.padEnd(18)} ${w * 2 + GAP}x${h + LABEL}`);
}

console.log(`\n${made} side-by-side sheet(s) -> ${OUT}`);
