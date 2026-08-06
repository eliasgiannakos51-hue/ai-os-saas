// Reproduction test for "the Vercel icon shows before ours after every
// refresh, and in bookmarked items".
//
// Two real defects were found behind that report. Neither was the icon's
// CONTENT — favicon.ico already held the correct Ionexa mark, which is why
// looking at the file proved nothing.
//
// 1. favicon.ico held ONE 180x180 image. A favicon is consumed at 16px in
//    a tab strip, 32px in a bookmarks bar, 48px in a shortcut — so every
//    one of those was a browser-side downscale of a 180px source, and Next
//    advertised it honestly:
//
//        <link rel="icon" href="/favicon.ico" sizes="180x180">
//        <link rel="icon" href="/icon.svg"    sizes="any">
//
//    A browser picking by size had no small candidate to prefer. Late,
//    soft repaint is exactly what "another icon shows first, then ours"
//    looks like, and a bookmark captures whatever was resolved at the
//    moment it was saved.
//
// 2. apple-icon was a DYNAMIC route (apple-icon.tsx -> ImageResponse),
//    served by Next at the EXTENSIONLESS path "/apple-icon". The
//    middleware matcher excludes static assets by EXTENSION, so
//    "/apple-icon" matched no exclusion and every fetch ran the auth
//    middleware — a Supabase getUser() round trip, to serve an icon. This
//    is the identical root cause as the old /email-logo route, which was
//    fixed and this one left behind.
//
// Run:  node scripts/tests/icons.test.mjs
// Live: BASE_URL=http://localhost:3000 node scripts/tests/icons.test.mjs
import { readFileSync, existsSync, statSync } from "node:fs";

let pass = 0,
  fail = 0,
  skipped = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

console.log("== 1. favicon.ico carries the sizes browsers actually ask for ==");
const ICO = "src/app/favicon.ico";
checkTrue(`${ICO} exists`, existsSync(ICO));
const ico = readFileSync(ICO);
check("it is a real ICO container", [ico.readUInt16LE(0), ico.readUInt16LE(2)], [0, 1]);

const count = ico.readUInt16LE(4);
// The bug: exactly one image, at 180x180.
checkTrue(`it holds more than one size (${count})`, count > 1);
const sizes = [];
for (let i = 0; i < count; i++) {
  const o = 6 + i * 16;
  // 0 encodes 256 in the ICO format.
  sizes.push(ico.readUInt8(o) === 0 ? 256 : ico.readUInt8(o));
}
sizes.sort((a, b) => a - b);
console.log(`        sizes present: ${sizes.join(", ")}`);
for (const want of [16, 32, 48]) {
  checkTrue(`${want}x${want} is present`, sizes.includes(want));
}
checkTrue("the smallest entry is 16px, not a downscaled 180", sizes[0] === 16);

// Every payload must be a real image, not a truncated offset.
for (let i = 0; i < count; i++) {
  const o = 6 + i * 16;
  const size = ico.readUInt32LE(o + 8),
    off = ico.readUInt32LE(o + 12);
  const payload = ico.subarray(off, off + size);
  checkTrue(`entry ${sizes[i] ?? i}: payload is within the file`, off + size <= ico.length);
  checkTrue(`entry ${sizes[i] ?? i}: payload is a PNG`, payload.subarray(1, 4).toString() === "PNG");
}

console.log("\n== 2. no icon is served from an extensionless route ==");
// The apple-icon defect, stated structurally. A .tsx here means a
// dynamically rendered route at an extensionless URL.
check("apple-icon.tsx (dynamic route) is gone", existsSync("src/app/apple-icon.tsx"), false);
checkTrue("apple-icon.png (static file) exists", existsSync("src/app/apple-icon.png"));
if (existsSync("src/app/apple-icon.png")) {
  const png = readFileSync("src/app/apple-icon.png");
  check("it is a real PNG", [...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  // IHDR width/height live at bytes 16-24.
  check("it is 180x180 (what iOS asks for)", [png.readUInt32BE(16), png.readUInt32BE(20)], [180, 180]);
  checkTrue(`non-trivial (${statSync("src/app/apple-icon.png").size} bytes)`, statSync("src/app/apple-icon.png").size > 1000);
}
// No other icon convention may reintroduce the problem.
for (const f of ["src/app/icon.tsx", "src/app/opengraph-image.tsx"]) {
  if (existsSync(f)) {
    console.log(`        note: ${f} is a dynamic route — check its path is middleware-excluded`);
  }
}

console.log("\n== 3. every icon path skips the auth middleware ==");
// Reproduce the real matcher against the real paths, rather than trusting
// that it mentions the right extensions.
const middleware = readFileSync("src/middleware.ts", "utf8");
const matcher = middleware.match(/matcher:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
const negative = matcher.match(/"\/\(\(\?!([\s\S]*?)\)\.\*\)"/)?.[1];
checkTrue("the matcher's exclusion list was parsed", Boolean(negative));
if (negative) {
  const excluded = new RegExp(`^(?:${negative.replace(/\\\\/g, "\\")})`);
  for (const p of ["favicon.ico", "icon.svg", "apple-icon.png", "manifest.webmanifest"]) {
    checkTrue(`/${p} does NOT run middleware`, excluded.test(p));
  }
  // The exact shape of the bug: an extensionless icon path.
  check("the old extensionless /apple-icon WOULD have run it", excluded.test("apple-icon"), false);
  // And a real page still must.
  check("a real page still runs middleware", excluded.test("dashboard/overview"), false);
}

console.log("\n== 4. live: what a browser is actually offered ==");
const BASE = process.env.BASE_URL || "http://localhost:3131";
let html = null;
try {
  const r = await fetch(BASE + "/", { signal: AbortSignal.timeout(3000) });
  if (r.ok) html = await r.text();
} catch {
  /* no server */
}
if (!html) {
  skipped++;
  console.log(`  SKIP  no server at ${BASE} — the live half did NOT run.`);
  console.log("        Source checks cannot prove what the <head> advertises. To run it:");
  console.log("          npm run build && npx next start -p 3131");
} else {
  const links = [...html.matchAll(/<link rel="[^"]*icon[^"]*"[^>]*>/g)].map((m) => m[0]);
  for (const l of links) console.log(`        ${l}`);
  checkTrue("an icon link is present", links.length > 0);

  const icoLink = links.find((l) => l.includes("favicon.ico"));
  checkTrue("favicon.ico is linked", Boolean(icoLink));
  // The regression to prevent: advertising a single oversized icon.
  check("...and is NOT advertised as 180x180", /sizes="180x180"/.test(icoLink ?? ""), false);

  const appleLink = links.find((l) => l.includes("apple-touch-icon"));
  checkTrue("apple-touch-icon is linked", Boolean(appleLink));
  checkTrue("...at a .png path, not an extensionless one", /href="\/apple-icon\.png/.test(appleLink ?? ""));

  // And they must actually be fetchable.
  for (const p of ["/favicon.ico", "/icon.svg", "/apple-icon.png"]) {
    const r = await fetch(BASE + p);
    checkTrue(`${p} -> HTTP ${r.status} ${r.headers.get("content-type")}`, r.ok);
  }
  // The extensionless route must be gone, not merely unreferenced.
  const stale = await fetch(BASE + "/apple-icon");
  check("/apple-icon no longer serves an image", stale.headers.get("content-type")?.startsWith("image/") ?? false, false);
}

console.log(
  `\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed${skipped ? `, ${skipped} SKIPPED` : ""}`
);
process.exit(fail === 0 ? 0 : 1);
