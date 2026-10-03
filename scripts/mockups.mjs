// The Ionexa mockup: one design, two themes, two languages, photographed.
//
// WHAT CHANGED, 2026-10-02. This used to generate three skins (a-claude,
// b-linear, c-hybrid) over one structure. The owner rejected all three and
// asked for ONE that combines them, so the source is now a single hand-
// written page, docs/mockups/ionexa.src.html, and this script does the
// three jobs that page cannot do for itself:
//
//   1. INLINES THE TYPEFACE. Commissioner, because the Stripe-like faces
//      (Geist, Instrument Sans, Hanken Grotesk, Onest, Figtree) have no
//      Greek - checked against Google Fonts' own subset list - and this
//      product sells to Greek businesses. The two subsets live in
//      docs/mockups/fonts/ under the SIL Open Font License beside them.
//      Inlined rather than linked so the photographs and the published page
//      cannot render in a fallback face without saying so.
//
//   2. WRITES TWO ENVELOPES AROUND ONE CONTENT. A published artifact must
//      not carry doctype/html/head/body (the host supplies them and pads the
//      root for the phone's safe areas); a file on disk must, or the browser
//      reads it in quirks mode.
//
//   3. PHOTOGRAPHS IT, AND CHECKS EVERY PICTURE AGAINST THE STATE IT CLAIMS.
//      The page exposes window.mock.state(); each shot is refused unless the
//      page reports the screen, theme and language the file name says, the
//      face actually loaded, and nothing scrolls sideways.
//
// Run: node scripts/mockups.mjs
//      SKIP_SHOTS=1 node scripts/mockups.mjs
//      SHOT_DIR=... FRAG_DIR=... node scripts/mockups.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const DIR = "docs/mockups";
const SHOT_DIR = process.env.SHOT_DIR || "/tmp/mockup-shots";
const FRAG = process.env.FRAG_DIR || "/tmp/mockup-fragments";

// The unicode ranges are Google Fonts' own for these two subsets, so the
// browser picks the Greek file only for Greek text.
const FACES = [
  ["greek", "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF"],
  ["latin", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"],
];
const fontFaces = FACES.map(([subset, range]) => {
  const b64 = readFileSync(DIR + "/fonts/commissioner-" + subset + ".woff2").toString("base64");
  return '@font-face{font-family:"Commissioner";font-style:normal;font-weight:400 700;font-display:swap;' +
    'src:url(data:font/woff2;base64,' + b64 + ') format("woff2");unicode-range:' + range + "}";
}).join("\n");

const src = readFileSync(DIR + "/ionexa.src.html", "utf8");
if (!src.includes("/*@FONTS@*/")) throw new Error("ionexa.src.html lost its /*@FONTS@*/ marker - the face would silently not load");
const page = src.replace("/*@FONTS@*/", fontFaces);

const standalone =
  '<!doctype html><html lang="el"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  "</head><body>" + page + "</body></html>";

mkdirSync(FRAG, { recursive: true });
writeFileSync(DIR + "/ionexa.html", standalone);
writeFileSync(FRAG + "/ionexa.html", page);
console.log("  " + DIR + "/ionexa.html   " + Math.round(standalone.length / 1024) + " KB");
console.log("  " + FRAG + "/ionexa.html   (the publishable form)");

if (process.env.SKIP_SHOTS) {
  console.log("\nSKIP_SHOTS=1 - not photographing");
  process.exit(0);
}

// [screen, device, theme, language]
const SHOTS = [
  ["home", "desktop", "dark", "el"], ["home", "desktop", "light", "el"],
  ["typed", "desktop", "dark", "el"], ["typed", "desktop", "light", "el"],
  ["chat", "desktop", "dark", "el"], ["chat", "desktop", "light", "el"],
  ["build", "desktop", "dark", "el"], ["build", "desktop", "light", "el"],
  ["palette", "desktop", "dark", "el"], ["palette", "desktop", "light", "el"],
  ["filter", "desktop", "dark", "el"],
  ["tools", "desktop", "dark", "el"], ["tools", "desktop", "light", "el"],
  ["home", "desktop", "dark", "en"],
  ["home", "phone", "dark", "el"], ["typed", "phone", "light", "el"],
  ["chat", "phone", "dark", "el"], ["build", "phone", "dark", "el"],
  ["palette", "phone", "dark", "el"], ["tools", "phone", "light", "el"],
  ["drawer", "phone", "dark", "el"],
];
const DEVICES = { desktop: [1440, 900], phone: [390, 844] };
const lum = (rgb) => { const m = rgb.match(/\d+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };

mkdirSync(SHOT_DIR, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const bg = {};
let n = 0;
try {
  for (const [screen, device, theme, lang] of SHOTS) {
    const [w, h] = DEVICES[device];
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto("file://" + process.cwd() + "/" + DIR + "/ionexa.html#home");
    await p.evaluate(() => document.fonts.ready);
    await p.evaluate(([s, th, l]) => {
      document.body.classList.add("shot");
      window.mock.theme(th);
      window.mock.lang(l);
      window.mock.show(s);
    }, [screen, theme, lang]);
    await p.waitForTimeout(250);
    const st = await p.evaluate(() => window.mock.state());
    const name = device + "-" + theme + "-" + lang + "-" + screen;
    const fail = [];
    if (errors.length) fail.push("script errors: " + errors.join(" | "));
    if (st.shown !== screen) fail.push("shows " + st.shown);
    // The screen the name claims must be the ONLY one laid out. Asserting the
    // page's own `shown` variable passed while all four screens were stacked
    // on top of each other; layout is the thing a person sees.
    const expectView = { typed: "home", palette: "home", filter: "home", drawer: "home" }[screen] || screen;
    if (st.visible.length !== 1 || st.visible[0] !== expectView) fail.push("visible screens are [" + st.visible.join(", ") + "], expected [" + expectView + "]");
    if (st.theme !== theme) fail.push("theme is " + st.theme);
    if (st.lang !== lang) fail.push("language is " + st.lang);
    if (st.font !== true) fail.push("Commissioner did not load - this would be a fallback face");
    if (st.overflowX > 0) fail.push("scrolls sideways by " + st.overflowX + "px");
    if (st.tileOff > 1.5) fail.push("an icon sits " + st.tileOff.toFixed(1) + "px off the centre of its square");
    if (fail.length) throw new Error(name + ": " + fail.join("; "));
    bg[theme] = st.bg;
    await p.screenshot({ path: SHOT_DIR + "/" + name + ".png" });
    console.log("  ok  " + name);
    n++;
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (!bg.dark || !bg.light || !(lum(bg.dark) < lum(bg.light))) throw new Error("dark is not darker than light: " + JSON.stringify(bg));
console.log("\n  dark " + bg.dark + "   light " + bg.light);
console.log("\n" + n + " shots. Each checked against the screen, theme and language it is named for,\nthe face it is set in, and the width it is shown at.");
