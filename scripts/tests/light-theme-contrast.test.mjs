// The light theme, measured instead of eyeballed.
//
// THE REPORT WAS "in the white theme nothing stands out and you cannot
// tell things apart". The cause is in a comment in globals.css: the amber
// accent was deliberately kept OUT of the theme variable system "for
// brand consistency", so colours chosen to glow on #0a0a0a were used
// unchanged on #ffffff. Measured, every accent role failed:
//
//   text-orange-400   2.26:1  (needs 4.5:1)   198 usages
//   text-orange-300   1.69:1  (needs 4.5:1)    37 usages
//   text-amber-400    1.67:1  (needs 4.5:1)    26 usages
//   border-orange-500 2.80:1 on #fff, 2.62:1 on the page background
//                             (needs 3:1)     149 usages
//
// WHAT THIS TEST KNOWS THAT A PALETTE CHECK DOES NOT.
//
//   1. ROLE MATTERS. `bg-orange-500` measures 2.80:1 against white and is
//      NOT a defect: it is a filled button carrying `text-black`, and
//      black on orange-500 is 7.49:1. The contrast that matters there is
//      label-against-fill. A naive "every orange must clear 3:1 on white"
//      rule would have demanded darkening it — which drops black-on-fill
//      to 4.06:1 and breaks the primary button in the name of
//      accessibility.
//   2. ALPHA MATTERS. `border-orange-500/40` is not orange-500. It is
//      orange-500 composited at 40% over whatever is behind it, which on
//      white is 1.51:1 — not the 2.80:1 the raw token reads.
//   3. BOTH THEMES MATTER. Fixing light by darkening a shared token would
//      silently wreck dark, where the same ink sits on #0a0a0a.
//
// Run: node scripts/tests/light-theme-contrast.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0,
  fail = 0;
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
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

const c = await loadTs("src/lib/contrast.ts");
const css = readFileSync("src/app/globals.css", "utf8");
const config = readFileSync("tailwind.config.ts", "utf8");

// Read the REAL values out of globals.css rather than restating them
// here. A test carrying its own copy of the palette passes forever while
// the shipped theme drifts away from it.
// Anchored to the start of a line and required to be followed by " {".
//
// A plain indexOf finds the FIRST mention of the selector text anywhere in
// the file — and globals.css mentions `[data-theme="light"]` inside a
// comment 32 lines before the rule itself. That landed this reader inside
// the :root block, so every "light theme" assertion below silently read
// DARK values, compared dark ink against a dark surface, and passed. The
// two literal surface assertions immediately after this are what exposed
// it; they are load-bearing, not decorative.
function block(selector) {
  const re = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m");
  const m = css.match(re);
  if (!m) throw new Error(`No ${selector} rule in globals.css`);
  const open = css.indexOf("{", m.index);
  const close = css.indexOf("\n}", open);
  return css.slice(open, close);
}
function varOf(selector, name) {
  const m = block(selector).match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--${name} missing from ${selector}`);
  return m[1].trim();
}

const DARK = ":root";
const LIGHT = '[data-theme="light"]';

// =====================================================================
// The arithmetic itself, pinned to reference values.
//
// Without this, the sRGB transfer function could be replaced by a naive
// `pow(s, 2.2)` and every assertion below would still pass — the theme
// values have enough margin to absorb a systematically wrong formula.
// That mutation survived the first version of this test, which is exactly
// the class of error a contrast suite exists to prevent: numbers that
// look authoritative and are quietly wrong.
//
// Both branches of the transfer function are exercised on purpose. The
// linear branch (channels <= 0.04045) is where the naive gamma diverges
// most — #0a0a0a is 19.8:1 against white correctly and 20.67:1 naively —
// and it is also the app's own dark background.
console.log("\n== The contrast arithmetic ==");
check("white luminance is exactly 1", c.relativeLuminance("#ffffff"), 1);
check("black luminance is exactly 0", c.relativeLuminance("#000000"), 0);
check("black on white is exactly 21:1", Math.round(c.contrastRatio("#000000", "#ffffff") * 100) / 100, 21);
// Power branch.
check("mid grey #808080 on white is 3.95:1", c.checkContrast("#808080", "#ffffff", 4.5).ratio, 3.95);
// Linear branch — the app's dark background.
check("#0a0a0a on white is 19.8:1", c.checkContrast("#0a0a0a", "#ffffff", 4.5).ratio, 19.8);
check("the ratio is order-independent", c.checkContrast("#ffffff", "#808080", 1).ratio, 3.95);
// The thresholds are the spec's, not a preference.
check("WCAG text threshold", c.WCAG_TEXT_MIN, 4.5);
check("WCAG large-text threshold", c.WCAG_LARGE_TEXT_MIN, 3);
check("WCAG non-text (UI) threshold", c.WCAG_UI_MIN, 3);
// Channel parsing must accept the space-separated form globals.css uses.
check("space-separated channels parse", c.toHex(c.parseColor("194 65 12")), "#c2410c");
check("hex parses", c.toHex(c.parseColor("#C2410C")), "#c2410c");
check("shorthand hex expands", c.toHex(c.parseColor("#fff")), "#ffffff");

// =====================================================================
console.log("\n== The surfaces each theme paints on ==");
const surfaces = {
  dark: { panel: varOf(DARK, "panel"), background: varOf(DARK, "background") },
  light: { panel: varOf(LIGHT, "panel"), background: varOf(LIGHT, "background") },
};
check("light panel is white", surfaces.light.panel, "#ffffff");
check("light page background", surfaces.light.background, "#f7f7f8");
ok("dark panel is dark", c.relativeLuminance(surfaces.dark.panel) < 0.1);

// =====================================================================
// Every accent ROLE, in BOTH themes, against BOTH surfaces.
// Cross-product, not a sample: a colour that clears white and fails the
// page background is still a colour a user cannot read.
// =====================================================================
console.log("\n== Accent text (WCAG 1.4.3 — 4.5:1) ==");
const TEXT_TOKENS = [
  ["text-orange-400", "accent-text", 198],
  ["text-orange-300", "accent-text-soft", 37],
  ["text-orange-200", "accent-text-softer", 4],
  ["text-orange-500", "accent-text-strong", 16],
  ["text-amber-400", "accent-amber-text", 26],
  ["text-amber-300", "accent-amber-text-soft", 16],
  ["text-amber-200", "accent-amber-text-softer", 6],
];
for (const [cls, token, uses] of TEXT_TOKENS) {
  for (const theme of ["light", "dark"]) {
    const ink = varOf(theme === "light" ? LIGHT : DARK, token);
    for (const [surfaceName, surface] of Object.entries(surfaces[theme])) {
      const v = c.checkContrast(ink, surface, c.WCAG_TEXT_MIN);
      ok(
        `${cls} on ${theme} ${surfaceName} — ${v.ratio}:1 (${uses} usages)`,
        v.passes,
        `${v.ratio}:1 is below the required ${v.required}:1`
      );
    }
  }
}

// =====================================================================
console.log("\n== Accent borders (WCAG 1.4.11 — 3:1) ==");
const BORDER_TOKENS = [
  ["border-orange-500", "accent-border", 149],
  ["border-amber-500", "accent-amber-border", 11],
];
for (const [cls, token, uses] of BORDER_TOKENS) {
  for (const theme of ["light", "dark"]) {
    const ink = varOf(theme === "light" ? LIGHT : DARK, token);
    for (const [surfaceName, surface] of Object.entries(surfaces[theme])) {
      const v = c.checkContrast(ink, surface, c.WCAG_UI_MIN);
      ok(
        `${cls} on ${theme} ${surfaceName} — ${v.ratio}:1 (${uses} usages)`,
        v.passes,
        `${v.ratio}:1 is below the required ${v.required}:1`
      );
    }
  }
}

// =====================================================================
console.log("\n== The filled button: label against fill, not against page ==");
// Deliberately asserted from the OTHER direction. bg-orange-500 must stay
// light enough for black text; a future "accessibility fix" that darkens
// it to clear 3:1 against white would fail here, which is the point.
const BUTTON_FILL = "#f97316"; // literal in tailwind.config — not themed
ok(
  "bg-orange-500 is NOT redefined per theme",
  !/backgroundColor:\s*\{[\s\S]*?orange/.test(config),
  "backgroundColor.orange was themed — the filled button's contrast is label-vs-fill and must not move"
);
for (const label of ["#000000"]) {
  const v = c.checkContrast(label, BUTTON_FILL, c.WCAG_TEXT_MIN);
  ok(`black label on the orange fill — ${v.ratio}:1`, v.passes);
}
// And the trap made explicit: the "obvious" fix is measurably worse.
const wouldBe = c.checkContrast("#000000", "#c2410c", c.WCAG_TEXT_MIN);
ok(
  `darkening the fill to orange-700 would DROP the label to ${wouldBe.ratio}:1`,
  !wouldBe.passes
);

// =====================================================================
console.log("\n== Translucent accents are measured composited ==");
// The alpha variants cannot be fixed by colour choice — that is arithmetic,
// not an opinion — so this asserts the arithmetic is at least being DONE,
// and records the real number.
const lightBorder = c.parseColor(varOf(LIGHT, "accent-border"));
const composited40 = c.compositeOver(lightBorder, 0.4, "#ffffff");
const v40 = c.checkContrast(composited40, "#ffffff", c.WCAG_UI_MIN);
ok(
  "a 40% border is measured after compositing, not as its raw token",
  v40.ratio < c.checkContrast(lightBorder, "#ffffff", c.WCAG_UI_MIN).ratio
);
ok("compositing 100% is a no-op", c.toHex(c.compositeOver("#123456", 1, "#ffffff")) === "#123456");
ok("compositing 0% is the background", c.toHex(c.compositeOver("#123456", 0, "#ffffff")) === "#ffffff");

// =====================================================================
console.log("\n== No accent shade escapes the theme system ==");
// The failure this prevents: someone adds `text-orange-600` next month.
// It resolves to a fixed Tailwind value, is dark-only, and nothing here
// would otherwise notice.
const src = [];
for (const dir of ["src"]) {
  const walk = (p) => {
    for (const entry of readFileSync(`/dev/null`, "utf8") ? [] : []) void entry;
  };
  void walk;
  void dir;
}
const { execSync } = await import("node:child_process");
const usedText = execSync(
  `grep -rhoE "\\btext-(orange|amber)-[0-9]{2,3}" src --include=*.ts --include=*.tsx | sort -u`,
  { encoding: "utf8" }
)
  .split("\n")
  .filter(Boolean);
const usedBorder = execSync(
  `grep -rhoE "\\bborder-(orange|amber)-[0-9]{2,3}" src --include=*.ts --include=*.tsx | sort -u`,
  { encoding: "utf8" }
)
  .split("\n")
  .filter(Boolean);

const themedText = new Set(TEXT_TOKENS.map(([cls]) => cls));
for (const cls of usedText) {
  ok(`${cls} is covered by a theme-aware token`, themedText.has(cls),
    `${cls} is used in the app but resolves to a fixed dark-theme value`);
}
// Borders are allowed to be un-themed ONLY when the fixed value already
// clears 3:1 on white by itself.
const FIXED_BORDER_OK = {
  "border-orange-600": "#ea580c",
  "border-orange-800": "#9a3412",
  "border-orange-900": "#7c2d12",
  "border-amber-600": "#d97706",
  "border-amber-800": "#92400e",
};
const themedBorder = new Set(BORDER_TOKENS.map(([cls]) => cls));
for (const cls of usedBorder) {
  if (themedBorder.has(cls)) {
    ok(`${cls} is theme-aware`, true);
    continue;
  }
  const fixed = FIXED_BORDER_OK[cls];
  ok(`${cls} is un-themed but listed`, Boolean(fixed), `${cls} is neither themed nor known-safe`);
  if (fixed) {
    const v = c.checkContrast(fixed, "#ffffff", c.WCAG_UI_MIN);
    ok(`${cls} clears 3:1 on white unaided — ${v.ratio}:1`, v.passes);
  }
}

// =====================================================================
console.log("\n== The config wiring the compiler cannot check ==");
// `rgb(var(--x) / <alpha-value>)` vs a bare `var(--x)` is the difference
// between 246 opacity-modified usages working and silently becoming
// fully opaque. Neither tsc nor eslint can see it.
ok(
  "textColor uses the alpha-value placeholder",
  /textColor:\s*\{[\s\S]*?rgb\(var\(--accent-text\) \/ <alpha-value>\)/.test(config)
);
ok(
  "borderColor uses the alpha-value placeholder",
  /borderColor:\s*\{[\s\S]*?rgb\(var\(--accent-border\) \/ <alpha-value>\)/.test(config)
);
ok("no accent token is declared as a bare var() colour",
  !/(textColor|borderColor):\s*\{[\s\S]{0,600}?:\s*"var\(--accent/.test(config));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
