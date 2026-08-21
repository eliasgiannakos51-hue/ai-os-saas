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
import { readFileSync, readdirSync, statSync } from "node:fs";
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

/** Every .ts/.tsx under src/ — the whole tree, because a class name that
 *  emits no CSS is invisible in exactly the file nobody thought to open. */
function walkSource(dir = "src", out = []) {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) walkSource(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}
const sourceFiles = walkSource();

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
// EVERY SURFACE THE APP PAINTS, not two of them.
//
// This set used to be {panel, background}, under a comment two blocks
// down that says "cross-product, not a sample". The surface list WAS the
// sample: --panel-hover and --input-bg were missing, and both carry body
// text — hover rows, recessed inputs, code blocks, kbd badges. What hid
// there was not exotic. --muted measured 4.83:1 on the panel and 4.32:1
// on --panel-hover, and text-amber-400's themed ink measured 5.02:1 on
// white and 4.49:1 there. Both shipped as passing.
//
// --input-bg is a colour in light and rgba(0,0,0,0.4) in dark; the dark
// one is composited over the panel it sits in before being used, because
// a translucent surface is not a surface until you say what is behind it.
function inputSurface(selector) {
  const raw = varOf(selector, "input-bg");
  const m = raw.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/);
  if (!m) return raw;
  const behind = c.parseColor(varOf(selector, "panel"));
  const a = +m[4];
  return `${Math.round(+m[1] * a + behind.r * (1 - a))} ${Math.round(+m[2] * a + behind.g * (1 - a))} ${Math.round(+m[3] * a + behind.b * (1 - a))}`;
}
const surfaces = {
  dark: {
    panel: varOf(DARK, "panel"),
    background: varOf(DARK, "background"),
    "panel-hover": varOf(DARK, "panel-hover"),
    input: inputSurface(DARK),
  },
  light: {
    panel: varOf(LIGHT, "panel"),
    background: varOf(LIGHT, "background"),
    "panel-hover": varOf(LIGHT, "panel-hover"),
    input: inputSurface(LIGHT),
  },
};
// STILL LOAD-BEARING, just written in the channel form the variables now
// use: these two literals are what exposed the block() reader silently
// returning the DARK block, and they have to keep naming exact values or
// they stop being able to.
check("light panel is white", c.toHex(c.parseColor(surfaces.light.panel)), "#ffffff");
check("light page background", c.toHex(c.parseColor(surfaces.light.background)), "#f7f7f8");
check("light panel is declared as channels", surfaces.light.panel, "255 255 255");
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
console.log("\n== THE STRUCTURAL BORDER — every theme, every surface ==");
// ---------------------------------------------------------------------
// THE MOST-USED BORDER IN THE APP, AND NOTHING ABOVE THIS LINE TOUCHED
// IT.
//
// The section above checks --accent-border and --accent-amber-border:
// 149 and 11 usages. It never checked --border, which `border-border`
// resolves to and which appears 317 times across 127 files. It is the
// outline of every card, input, button, table row and divider in the
// product.
//
// Measured on https://ai-os-saas-five.vercel.app with data-theme=light,
// walking the rendered DOM of ten pages (scripts/prod-light-theme-audit
// .mjs): 2,504 elements scanned, 0 text failures, 0 focus failures — and
// 160 BORDER failures, 157 of them this one token, at
//
//     rgb(228,228,231) on rgb(247,247,248) = 1.19:1   (121 elements)
//     rgb(228,228,231) on rgb(255,255,255) = 1.27:1   ( 36 elements)
//
// against a 3:1 requirement. That is the report "στο άσπρο θέμα δεν
// διακρίνονται τα στοιχεία" in numbers: a white card on a #f7f7f8 page
// is 1.06:1 of fill difference, so the border is the ONLY thing saying
// where the card ends — and it was invisible.
//
// The same token fails identically in dark (#242424 is 1.12:1 on
// --panel-hover), which nobody had measured because nobody had looked.
//
// ALL FOUR THEMES, not the two the rest of this file checks. midnight and
// carbon are shipped themes with their own --border, and "cross-product,
// not a sample" has to include them or it is a sample again.
const ALL_THEMES = {
  dark: DARK,
  light: LIGHT,
  midnight: '[data-theme="midnight"]',
  carbon: '[data-theme="carbon"]',
};
for (const [theme, selector] of Object.entries(ALL_THEMES)) {
  const themeSurfaces =
    surfaces[theme] ??
    {
      panel: varOf(selector, "panel"),
      background: varOf(selector, "background"),
      "panel-hover": varOf(selector, "panel-hover"),
      input: inputSurface(selector),
    };
  const ink = varOf(selector, "border");
  for (const [surfaceName, surface] of Object.entries(themeSurfaces)) {
    const v = c.checkContrast(ink, surface, c.WCAG_UI_MIN);
    ok(
      `border-border on ${theme} ${surfaceName} — ${v.ratio}:1 (317 usages)`,
      v.passes,
      `${v.ratio}:1 is below the required ${v.required}:1`
    );
  }
}

// HEADROOM, so the next surface tweak cannot silently push it back under.
// --muted was already living on 0.01 of headroom when the backdrop was
// added, and that is how it went under without a single test changing.
for (const [theme, selector] of Object.entries(ALL_THEMES)) {
  const themeSurfaces =
    surfaces[theme] ??
    {
      panel: varOf(selector, "panel"),
      background: varOf(selector, "background"),
      "panel-hover": varOf(selector, "panel-hover"),
      input: inputSurface(selector),
    };
  const worst = Math.min(
    ...Object.values(themeSurfaces).map((s) => c.contrastRatio(varOf(selector, "border"), s))
  );
  ok(
    `${theme}'s border keeps headroom above the threshold — worst ${Math.round(worst * 100) / 100}:1`,
    worst >= 3.15,
    `worst surface is ${Math.round(worst * 100) / 100}:1, under the 3.15 working minimum`
  );
}

// A border nobody can see is the same defect whichever direction it is
// invisible in: this catches a "fix" that simply painted it the colour of
// the page.
for (const [theme, selector] of Object.entries(ALL_THEMES)) {
  const border = c.parseColor(varOf(selector, "border"));
  const panel = c.parseColor(varOf(selector, "panel"));
  ok(
    `${theme}'s border is not simply its panel colour`,
    Math.abs(border.r - panel.r) + Math.abs(border.g - panel.g) + Math.abs(border.b - panel.b) > 30
  );
}

// =====================================================================
console.log("\n== The filled button: label against fill, not against page ==");
// Deliberately asserted from the OTHER direction. bg-orange-500 must stay
// light enough for black text; a future "accessibility fix" that darkens
// it to clear 3:1 against white would fail here, which is the point.
const BUTTON_FILL = "#f97316"; // literal in tailwind.config — not themed

// This used to read `backgroundColor must not mention orange at all`,
// which is a proxy for the real rule and forbids more than the rule does:
// `bg-orange-950/20` is a notice tint, carries no black label, and was
// producing rgb(210,201,199) mud on white precisely BECAUSE it was left
// unthemed. The rule is about the FILLED BUTTON, so state it about the
// filled button — and about the shades a filled button can use, since
// that is what a future edit would reach for.
const bgBlock = (() => {
  const at = config.indexOf("backgroundColor: {");
  if (at < 0) return "";
  let depth = 0;
  for (let i = config.indexOf("{", at); i < config.length; i++) {
    if (config[i] === "{") depth++;
    else if (config[i] === "}") { depth--; if (!depth) return config.slice(at, i); }
  }
  return config.slice(at);
})();
const themedBgShades = [...bgBlock.matchAll(/(\d{2,3}):\s*"rgb\(var\(/g)].map((m) => Number(m[1]));
ok(
  "no filled-button shade is themed in backgroundColor",
  !themedBgShades.some((sh) => sh >= 300 && sh <= 700),
  `backgroundColor themes shade(s) ${themedBgShades.filter((sh) => sh >= 300 && sh <= 700).join(", ")} — ` +
    "a filled button's contrast is label-vs-fill and must not move with the theme"
);
// Anything that IS themed there has to survive its own alpha modifiers,
// which is the failure the light theme actually had. Checked against the
// alphas written in src/, not against a guess at which ones exist.
const INK_FOR_TINT = {
  "accent-tint": "accent-text",
  "accent-amber-tint": "accent-amber-text",
  "success-tint": "success-text",
  "danger-tint": "danger-text",
};
const { execSync: run } = await import("node:child_process");
for (const [tintVar, inkVar] of Object.entries(INK_FOR_TINT)) {
  const family = { "accent-tint": "orange", "accent-amber-tint": "amber", "success-tint": "emerald", "danger-tint": "red" }[tintVar];
  // The alphas these fills are ACTUALLY written with. Guessing the set
  // would test combinations nobody ships and miss the one that breaks.
  const alphas = [
    ...new Set(
      run(`grep -rhoE "\\bbg-${family}-950/[0-9]{1,3}" src --include=*.ts --include=*.tsx | sort -u || true`, { encoding: "utf8" })
        .split("\n").filter(Boolean).map((cls) => Number(cls.split("/")[1]) / 100)
    ),
  ];
  if (!alphas.length) continue;
  const tint = c.parseColor(varOf(LIGHT, tintVar));
  const ink = varOf(LIGHT, inkVar);
  for (const a of alphas.sort()) {
    for (const [surfaceName, surface] of Object.entries(surfaces.light)) {
      const base = c.parseColor(surface);
      const composited = {
        r: tint.r * a + base.r * (1 - a),
        g: tint.g * a + base.g * (1 - a),
        b: tint.b * a + base.b * (1 - a),
      };
      const v = c.checkContrast(ink, composited, c.WCAG_TEXT_MIN);
      ok(
        `bg-${family}-950/${Math.round(a * 100)} on light ${surfaceName}: its own ink reads ${v.ratio}:1`,
        v.passes,
        `${v.ratio}:1 is below ${v.required}:1 — the notice tint is too heavy for the ink it carries`
      );
    }
  }
}
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
const run0 = execSync;
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

// EVERY FAMILY, not the two the accent happened to use.
//
// The grep above is scoped to orange|amber, which is why twenty-six
// module badge hues sat at 1.3-2.7:1 on light without anything noticing:
// they were never looked at. Mutation testing confirmed the gap — a
// module hue could be dropped back to its dark-only value and this suite
// stayed green. Scoped to text- utilities on real colour families, and
// every one must resolve through a token that globals.css themes.
function themedTextVars() {
  const at = config.indexOf("textColor: {");
  let depth = 0, end = config.length;
  for (let i = config.indexOf("{", at); i < config.length; i++) {
    if (config[i] === "{") depth++;
    else if (config[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  const body = config.slice(at, end).replace(/\/\/[^\n]*/g, "");
  const out = {};
  let family = null;
  for (const line of body.split("\n")) {
    const fam = line.match(/^\s*([a-z]+):\s*\{/);
    if (fam && fam[1] !== "textColor") family = fam[1];
    for (const m of line.matchAll(/(\d{2,3}):\s*"rgb\(var\(--([a-z-]+)\)/g)) {
      if (family) out[`text-${family}-${m[1]}`] = m[2];
    }
  }
  return out;
}
const THEMED_TEXT_VARS = themedTextVars();
// Greys are the theme tokens' own job (--foreground/--muted), and
// text-white/text-black are not palette entries. Everything else is a hue
// that has to answer for itself.
const GREY_FAMILIES = new Set(["zinc", "neutral", "gray", "stone", "white", "black"]);
const usedAnyText = run0(
  `grep -rhoE "\\btext-[a-z]+-[0-9]{2,3}" src --include=*.ts --include=*.tsx | sort -u`,
  { encoding: "utf8" }
).split("\n").filter(Boolean);
let familyChecked = 0;
for (const cls of usedAnyText) {
  const family = cls.split("-")[1];
  if (GREY_FAMILIES.has(family)) continue;
  familyChecked++;
  const tokenName = THEMED_TEXT_VARS[cls];
  ok(
    `${cls} resolves through a themed token`,
    Boolean(tokenName),
    `${cls} is written in src/ but resolves to a fixed value, so one theme gets an ink chosen for the other`
  );
  if (!tokenName) continue;
  for (const [themeName, selector] of [["light", LIGHT], ["dark", DARK]]) {
    const ink = varOf(selector, tokenName);
    for (const [surfaceName, surface] of Object.entries(surfaces[themeName])) {
      const v = c.checkContrast(ink, surface, c.WCAG_TEXT_MIN);
      ok(
        `${cls} on ${themeName} ${surfaceName} — ${v.ratio}:1`,
        v.passes,
        `${v.ratio}:1 is below ${v.required}:1`
      );
    }
  }
}
ok(`every non-grey text hue was checked (${familyChecked})`, familyChecked > 20,
  "the family sweep matched almost nothing, which usually means the grep stopped matching");

// ---- HOLE 3: the alpha-neutralising rules must exist and be complete.
// Removing one of them left the suite green, because the inventory that
// generated them is not what ships — globals.css is.
const alphaClasses = run0(
  `grep -rhoE "\\btext-(orange|amber|emerald|red|rose)-[0-9]{2,3}/[0-9]{1,3}" src --include=*.ts --include=*.tsx | sort -u`,
  { encoding: "utf8" }
).split("\n").filter(Boolean);
for (const cls of alphaClasses) {
  const escaped = cls.replace("/", "\\/");
  ok(
    `${cls} has a light-theme rule dropping its alpha`,
    css.includes(`[data-theme="light"] .${escaped}`),
    `${cls} keeps its alpha in light, where alpha washes toward white instead of dimming toward black`
  );
}
ok(`alpha-modified themed text utilities were found to check (${alphaClasses.length})`,
  alphaClasses.length > 10, "the alpha grep matched almost nothing");

// ---- THE SAME HOLE, FOR BORDERS. The check above walks TEXT only. The
// border half of the alpha-neutralising block could be deleted whole and
// nothing here noticed — the mutation run proved it, twice: removing the
// accent border rule and dropping a module hue back to the raw palette
// both left the suite green.
//
// The rule being defended: a border in its RESTING state, written with an
// alpha modifier, is between 1.19:1 and 2.16:1 in light once composited,
// and no colour choice fixes it below 50% alpha (a 40% border over white
// is at most 153 in every channel even if the colour is black — 2.80:1).
// So in light the alpha has to go, and the value it lands on has to clear
// 3:1 on every surface.
//
// hover:/focus:/group-hover: variants are excluded by construction: they
// compile to a different selector, the component is already identifiable
// at rest by --border, and a state change is not what 1.4.11 is about.
//
// The one exemption is NAMED. Four `ring-<hue>-400/25` in
// components/overview/quick-action-card.tsx are `ring-1 ring-inset` on a
// 44x44 decorative icon chip inside a card that has its own border. They
// identify nothing; 1.4.11 exempts pure decoration. globals.css carries
// the same list and the same reason, so this is a decision in two places
// rather than a silence in one.
const DECORATIVE_RINGS = new Set([
  "ring-orange-400/25",
  "ring-purple-400/25",
  "ring-sky-400/25",
  "ring-emerald-400/25",
]);
const restingAlphaBorders = new Set();
for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(
    /(?<![-\w:])((?:[a-z-]+(?:\[[^\]]*\])?:)*)(border|ring|outline|divide)-([a-z]+)-(\d{2,3})\/(\d{1,3})\b/g
  )) {
    if (m[1]) continue; // hover:/focus:/... — a state, not the resting boundary
    restingAlphaBorders.add(`${m[2]}-${m[3]}-${m[4]}/${m[5]}`);
  }
}
// EVERY FAMILY USED AS A BORDER MUST BE THEMED IN borderColor, checked
// separately from the light-theme rules below. Deleting a module family's
// borderColor entry leaves the LIGHT rule intact — it names the token
// directly — while DARK silently falls back to the raw Tailwind palette,
// a hue chosen to sit on #0a0a0a. The light-only assertions cannot see
// that, and the mutation run proved it by removing the cyan entry and
// staying green.
const borderFamilies = new Set();
for (const cls of restingAlphaBorders) {
  const m = cls.match(/^(?:border|ring|outline|divide)-([a-z]+)-(\d{2,3})\//);
  if (m && !DECORATIVE_RINGS.has(cls)) borderFamilies.add(`${m[1]}-${m[2]}`);
}
const borderColorBlock = config.slice(config.indexOf("borderColor:"), config.indexOf("backgroundColor:"));
for (const famShade of [...borderFamilies].sort()) {
  const [family, shade] = famShade.split("-");
  const themed = new RegExp(`\\b${family}:\\s*\\{[\\s\\S]*?\\b${shade}:\\s*"rgb\\(var\\(--`).test(borderColorBlock);
  ok(
    `border-${famShade} resolves through a theme token in BOTH themes`,
    themed,
    `borderColor has no themed entry for ${family} ${shade}, so dark uses the raw palette value`
  );
}

ok(
  `resting-state alpha borders were found to check (${restingAlphaBorders.size})`,
  restingAlphaBorders.size > 30,
  "the border grep matched almost nothing, which usually means it stopped matching"
);
for (const cls of [...restingAlphaBorders].sort()) {
  if (DECORATIVE_RINGS.has(cls)) {
    ok(`${cls} is the named decorative exemption, and globals.css says so`, css.includes("quick-action-card"));
    continue;
  }
  const escaped = cls.replace("/", "\\/");
  // A DELIMITER IS REQUIRED AFTER THE CLASS. `includes` is a substring
  // test and the mutation run walked straight through it: renaming the
  // selector to `.border-orange-500\/40-removed` still CONTAINS
  // `.border-orange-500\/40`, so the rule could be deleted in effect
  // while this assertion stayed green.
  const selector = new RegExp(
    `\\[data-theme="light"\\] \\.${escaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[,{\n]`
  );
  const rule = selector.test(css);
  ok(
    `${cls} has a light-theme rule dropping its alpha`,
    rule,
    `${cls} keeps its alpha in light: composited it cannot reach the 3:1 of WCAG 1.4.11`
  );
  if (!rule) continue;
  // AND the colour it lands on has to actually pass. A rule pointing at a
  // token that is itself too light is a rule that changes nothing.
  const at = css.search(selector);
  const decl = css.slice(at, css.indexOf("}", at));
  const token = decl.match(/rgb\(var\(--([a-z-]+)\)\)/)?.[1];
  ok(`${cls} resolves to a theme token`, Boolean(token), `no rgb(var(--token)) in: ${decl.slice(0, 120)}`);
  if (!token) continue;
  const ink = varOf(LIGHT, token);
  for (const [surfaceName, surface] of Object.entries(surfaces.light)) {
    const v = c.checkContrast(ink, surface, c.WCAG_UI_MIN);
    ok(
      `${cls} -> --${token} on light ${surfaceName} — ${v.ratio}:1`,
      v.passes,
      `${v.ratio}:1 is below the required ${v.required}:1`
    );
  }
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
// WHAT COUNTS AS "THEMED" IS READ FROM THE CONFIG, not from the list of
// tokens this file spot-checks above. Deriving it from BORDER_TOKENS made
// the set a second copy that goes stale — and it did: when
// border-orange-900 moved onto --accent-border-deep, this loop still did
// not recognise it as themed, fell through to FIXED_BORDER_OK, and
// asserted against #7c2d12, a value the light theme had stopped shipping.
// It passed. That is the exact failure this file's own header warns about.
function themedBorderVars() {
  const at = config.indexOf("borderColor: {");
  if (at < 0) return {};
  let depth = 0, end = config.length;
  for (let i = config.indexOf("{", at); i < config.length; i++) {
    if (config[i] === "{") depth++;
    else if (config[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  const body = config.slice(at, end).replace(/\/\/[^\n]*/g, "");
  const out = {};
  let family = null;
  for (const line of body.split("\n")) {
    const fam = line.match(/^\s*([a-z]+):\s*\{/);
    if (fam && fam[1] !== "borderColor") family = fam[1];
    for (const m of line.matchAll(/(\d{2,3}):\s*"rgb\(var\(--([a-z-]+)\)/g)) {
      if (family) out[`border-${family}-${m[1]}`] = m[2];
    }
  }
  return out;
}
const THEMED_BORDER_VARS = themedBorderVars();
// The exemption above rests on "a notice box is identified by its fill".
// Check that, rather than believing the comment: if deep-bordered boxes
// stop carrying fills, the exemption stops being true and this fails.
{
  const { execSync: run2 } = await import("node:child_process");
  const lines = run2(
    `grep -rhoE 'className="[^"]*border-(red|orange|emerald|amber)-(800|900)[^"]*"' src --include=*.tsx || true`,
    { encoding: "utf8" }
  ).split("\n").filter(Boolean);
  const withFill = lines.filter((l) => /\bbg-/.test(l)).length;
  ok(
    `deep-bordered notices carry their own fill — ${withFill}/${lines.length}`,
    lines.length > 0 && withFill / lines.length >= 0.9,
    `only ${withFill} of ${lines.length} deep-bordered boxes have a fill; the edge is doing the identifying and owes 3:1 in dark too`
  );
}
ok(
  "the config's borderColor block parses",
  Object.keys(THEMED_BORDER_VARS).length > 0,
  "parsed no themed borderColor entries — the parser and the config have diverged"
);
for (const cls of usedBorder) {
  const themedVar = THEMED_BORDER_VARS[cls];
  if (themedVar) {
    // WHICH THRESHOLD APPLIES DEPENDS ON WHAT THE BORDER IS DOING.
    //
    // The --*-border tokens are component edges — inputs, cards, the
    // things a border is the boundary of. WCAG 1.4.11's 3:1 is theirs in
    // every theme.
    //
    // The --*-border-deep tokens are notice-box edges, and a notice box
    // is not identified by its edge: 60 of the 63 usages carry a fill and
    // coloured text in the same class string (counted, not assumed —
    // the grep is below). Holding a decorative reinforcement to the
    // identification threshold would demand brightening 63 dark notices
    // that nobody reported a problem with. So for -deep the assertion is
    // 3:1 in LIGHT, where the fills are now pale and the edge IS what
    // carries the box, and identifiability-by-fill in dark.
    //
    // The dark ratio is printed either way. An exemption that hides its
    // number is how the 2.62:1 border survived the last review.
    const isNotice = themedVar.endsWith("-border-deep");
    for (const theme of ["light", "dark"]) {
      const ink = varOf(theme === "light" ? LIGHT : DARK, themedVar);
      for (const [surfaceName, surface] of Object.entries(surfaces[theme])) {
        const v = c.checkContrast(ink, surface, c.WCAG_UI_MIN);
        if (isNotice && theme === "dark") {
          console.log(`  NOTE  ${cls} (--${themedVar}) on dark ${surfaceName} — ${v.ratio}:1, decorative edge on a filled notice`);
          continue;
        }
        ok(
          `${cls} (--${themedVar}) on ${theme} ${surfaceName} — ${v.ratio}:1`,
          v.passes,
          `${v.ratio}:1 is below ${v.required}:1`
        );
      }
    }
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
console.log("\n== Body text on every surface the app paints ==");
// THE CHECK THAT WAS MISSING. Every earlier measurement of the light
// theme compared ink against #ffffff. The app paints three surfaces —
// --background, --panel and --panel-hover — and secondary text lands on
// all of them. Against #ffffff, --muted read 4.83:1 and looked fine;
// against --panel-hover it was 4.32:1 and had been failing WCAG 1.4.3
// since the light theme shipped. Nothing was wrong with the value that a
// second surface would not have revealed, and nothing looked at one.
for (const [themeName, selector] of [["light", LIGHT], ["dark", DARK]]) {
  for (const token of ["foreground", "muted"]) {
    const ink = varOf(selector, token);
    for (const [surfaceName, surface] of Object.entries(surfaces[themeName])) {
      const v = c.checkContrast(ink, surface, c.WCAG_TEXT_MIN);
      ok(
        `--${token} on ${themeName} ${surfaceName} — ${v.ratio}:1`,
        v.passes,
        `${v.ratio}:1 is below ${v.required}:1`
      );
    }
  }
}

// =====================================================================
console.log("\n== The keyboard focus ring ==");
// MEASURED ON THE DEPLOYMENT FIRST, not derived from the stylesheet:
// tabbing through ten production pages and reading the ring that actually
// painted gave 1.73:1 on 59 of 60 stops in light and 2.80:1 in dark. It
// was `rgba(249, 115, 22, 0.55)` — and 55% of anything is a wash, in both
// directions. WCAG 2.4.11 wants 3:1 for the indicator against what it is
// drawn on, and this is the one control that keyboard-only users depend
// on completely.
const focusRule = (() => {
  const m = css.match(/:focus-visible\s*\{[^}]*outline:\s*([^;]+);/);
  return m ? m[1].trim() : null;
})();
ok("a focus-visible outline is declared", Boolean(focusRule), "no :focus-visible outline rule in globals.css");
ok(
  `the focus ring is opaque — "${focusRule}"`,
  Boolean(focusRule) && !/rgba?\([^)]*,\s*0?\.\d+\s*\)/.test(focusRule) && !/\/\s*0?\.\d+/.test(focusRule),
  "the ring carries an alpha modifier; a translucent indicator composites toward the background in both themes"
);
const focusVar = focusRule && focusRule.match(/var\(--([a-z-]+)\)/);
ok(
  "the focus ring resolves through a themed token",
  Boolean(focusVar),
  "the ring is a fixed colour, so one theme necessarily gets a value chosen for the other"
);
if (focusVar) {
  for (const theme of ["light", "dark"]) {
    const ink = varOf(theme === "light" ? LIGHT : DARK, focusVar[1]);
    for (const [surfaceName, surface] of Object.entries(surfaces[theme])) {
      const v = c.checkContrast(ink, surface, c.WCAG_UI_MIN);
      ok(
        `focus ring on ${theme} ${surfaceName} — ${v.ratio}:1`,
        v.passes,
        `${v.ratio}:1 is below the ${v.required}:1 WCAG 2.4.11 requires of a focus indicator`
      );
    }
  }
}

// =====================================================================
console.log("\n== The backdrop, and the text it sits under ==");
// The globe, its dots and .ambient-corners were never themed. Measured on
// production, they shifted 33% of the viewport past the just-noticeable
// threshold with a warm bias of +2.9 (r-b) — IDENTICALLY in both themes,
// which is the whole diagnosis: the same warm translucent layer adds light
// to #0a0a0a and tints #f7f7f8.
//
// The assertion is not "the backdrop is dimmer". It is the CONSEQUENCE:
// --muted body text, measured on the page background AS THE BACKDROP
// LEAVES IT, must still clear 4.5:1. Production had it at 4.35:1 against
// 4.51:1 on a clean background — a real failure caused by decoration.
for (const [themeName, selector] of [["light", LIGHT], ["dark", DARK]]) {
  const scale = Number(varOf(selector, "backdrop-scale"));
  ok(`--backdrop-scale is a number in ${themeName} (${scale})`, Number.isFinite(scale) && scale > 0);
}
ok(
  "light dims the backdrop relative to dark",
  Number(varOf(LIGHT, "backdrop-scale")) < Number(varOf(DARK, "backdrop-scale")),
  "light reuses dark's backdrop intensity, which is exactly what produced the haze"
);
ok(
  "the globe carries its own ink per theme",
  varOf(LIGHT, "globe-ink") !== varOf(DARK, "globe-ink"),
  "both themes draw the wireframe in the same ink; dimming alone makes it vanish rather than legible"
);
// .ambient-corners composited onto the page, then --muted on top of that.
function ambientAlphas(selector) {
  const b = selector === DARK ? block(":root") : null;
  const re = selector === LIGHT
    ? /\[data-theme="light"\]\s*\.ambient-corners\s*\{([\s\S]*?)\n\}/
    : /\n\.ambient-corners\s*\{([\s\S]*?)\n\}/;
  const m = css.match(re);
  void b;
  if (!m) throw new Error(`no .ambient-corners rule for ${selector}`);
  return [...m[1].matchAll(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/g)]
    .map((x) => ({ r: +x[1], g: +x[2], b: +x[3], a: +x[4] }));
}
for (const [themeName, selector, pageVar] of [["light", LIGHT, "background"], ["dark", DARK, "background"]]) {
  const page = c.parseColor(varOf(selector, pageVar));
  const pools = ambientAlphas(selector);
  // THE STRONGEST SINGLE POOL, at full strength, over the page.
  //
  // This began as "the two strongest, stacked", which is not a place that
  // exists: the four gradients sit at the four corners with radii that
  // fade to transparent at 60%, so no pixel sees two of them at full
  // strength. Modelling an impossible pixel makes the bound arbitrary —
  // it fails for a reason the user could never see. A corner at full
  // strength is real, and it is the worst thing that actually renders.
  const strongest = pools.sort((x, y) => y.a - x.a)[0];
  const stacked = {
    r: strongest.r * strongest.a + page.r * (1 - strongest.a),
    g: strongest.g * strongest.a + page.g * (1 - strongest.a),
    b: strongest.b * strongest.a + page.b * (1 - strongest.a),
  };
  const v = c.checkContrast(varOf(selector, "muted"), stacked, c.WCAG_TEXT_MIN);
  ok(
    `${themeName}: --muted over the tinted page — ${v.ratio}:1`,
    v.passes,
    `${v.ratio}:1 — the corner pools tint the page far enough to push body text below ${v.required}:1`
  );

  // AND THE TINT ITSELF, not only what it does to one token.
  //
  // Asserting this through --muted alone is not enough: once --muted was
  // darkened it had so much headroom that restoring the dark corner-pool
  // alphas kept the suite green. Mutation testing caught exactly that.
  // The complaint was "there is an orange fog", which is a statement
  // about the page looking tinted, and it stays true whether or not some
  // particular ink survives it.
  //
  // 3/255 per channel: 2 is roughly where a flat tint over a large area
  // becomes visible on an sRGB display, and one step of slack keeps this
  // from tripping on rounding. Light only — on #0a0a0a the same layer is
  // a glow rather than a stain, which is the asymmetry this whole block
  // exists to record.
  if (themeName === "light") {
    const dev = Math.max(Math.abs(stacked.r - page.r), Math.abs(stacked.g - page.g), Math.abs(stacked.b - page.b));
    const warm = (stacked.r - stacked.b) - (page.r - page.b);
    ok(
      `light: the strongest corner pool shifts the page by ${dev.toFixed(2)}/255 (warm ${warm.toFixed(2)})`,
      dev <= 3.5 && warm <= 3.5,
      `the pool moves the page background by ${dev.toFixed(2)}/255 with a warm bias of ${warm.toFixed(2)}; ` +
        `on a near-neutral surface that reads as a colour cast, which is the haze — dark's own pool measures 21.5 and 20.4 there, and is a glow rather than a stain because it is adding light to black`
    );
  }
}

// =====================================================================
console.log("\n== The wordmark ==");
// The brand name shipped at #f5f5f5 — near-white — in a theme whose page
// is #f7f7f8. That is 1.02:1: not dim, absent. It survived because the
// unthemed backdrop haze darkened the area behind it just enough to
// suggest letters, so the bug and its camouflage were the same defect.
// Cleaning the haze is what made it visible, by making it disappear.
//
// It also slipped past the rendered audit, which read `color` for every
// element. SVG glyphs are painted by `fill`.
for (const [themeName, selector] of [["light", LIGHT], ["dark", DARK]]) {
  for (const token of ["logo-ink", "logo-accent"]) {
    const ink = varOf(selector, token);
    // The wordmark is set at 34 units in a scaled viewBox and renders
    // well above 24px in every placement, so it is large text: 3:1.
    const v = c.checkContrast(ink, varOf(selector, "background"), c.WCAG_LARGE_TEXT_MIN);
    ok(
      `--${token} on the ${themeName} page — ${v.ratio}:1`,
      v.passes,
      `${v.ratio}:1 is below ${v.required}:1 — the brand name is not legible on its own page`
    );
  }
}
{
  const { execSync: run3 } = await import("node:child_process");
  const logo = readFileSync("src/components/logo.tsx", "utf8");
  // Every fill in the WORDMARK half must go through a token. The mark's
  // amber ring is a stroke on a shape and keeps its literal.
  const wordmarkLiterals = [...logo.matchAll(/fill="(#[0-9a-fA-F]{3,6})"/g)].map((m) => m[1]);
  ok(
    `the wordmark carries no near-white literal fill (${wordmarkLiterals.length} literal fills left)`,
    !wordmarkLiterals.some((hex) => c.relativeLuminance(hex) > 0.7),
    `logo.tsx still fills something with ${wordmarkLiterals.filter((h) => c.relativeLuminance(h) > 0.7).join(", ")}, which vanishes on a white page`
  );
  void run3;
}

// =====================================================================
console.log("\n== The decorative glow layers ==");
// FOUND LAST, AND ONLY BY LOOKING. The globe, the constellation and the
// corner pools were all dimmed, the automated pass reported the haze down
// 76%, and the screenshot still had a peach cloud across the top of the
// landing page. It was GlowOrb — `absolute`, not `fixed inset-0`, so the
// backdrop measurement's selectors never matched it and it was never in
// any number that was reported. Sampled at the top of the page it read
// rgb(244,199,180) against rgb(247,247,248), and read the same with every
// other layer hidden.
//
// So the assertion is on the layer itself, not on an aggregate that can
// silently omit it: the densest stop of each decorative gradient,
// composited onto the page it is drawn over.
function densestStop(value) {
  const stops = [...value.matchAll(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/g)]
    .map((m) => ({ r: +m[1], g: +m[2], b: +m[3], a: +m[4] }));
  if (!stops.length) throw new Error("no rgba stops in " + value.slice(0, 60));
  return stops.sort((x, y) => y.a - x.a)[0];
}
for (const [themeName, selector, limit] of [["light", LIGHT, 5], ["dark", DARK, Infinity]]) {
  const page = c.parseColor(varOf(selector, "background"));
  const stop = densestStop(varOf(selector, "glow-orb"));
  const on = {
    r: stop.r * stop.a + page.r * (1 - stop.a),
    g: stop.g * stop.a + page.g * (1 - stop.a),
    b: stop.b * stop.a + page.b * (1 - stop.a),
  };
  const dev = Math.max(Math.abs(on.r - page.r), Math.abs(on.g - page.g), Math.abs(on.b - page.b));
  if (limit === Infinity) {
    console.log(`  NOTE  ${themeName}: the hero orb moves the page by ${dev.toFixed(1)}/255 — a light source on black, which is what it is for`);
    continue;
  }
  ok(
    `${themeName}: the hero orb moves the page by ${dev.toFixed(1)}/255`,
    dev <= limit,
    `${dev.toFixed(1)}/255 is a colour wash, not a glow — on a near-white page a large soft warm layer reads as haze`
  );
}
ok(
  "the hero orb is themed at all",
  varOf(LIGHT, "glow-orb") !== varOf(DARK, "glow-orb"),
  "both themes draw the hero orb with the same ink and alpha"
);
// The CTA's pulse is the same kind of layer: a 30px 75% bloom that
// breathes on a loop. On white it is a moving smear.
ok(
  "the primary CTA's glow is themed",
  varOf(LIGHT, "cta-glow-peak") !== varOf(DARK, "cta-glow-peak"),
  "the CTA pulses the same coloured bloom in both themes"
);
{
  const peak = varOf(LIGHT, "cta-glow-peak");
  const blurs = [...peak.matchAll(/(\d+)px/g)].map((m) => Number(m[1]));
  const maxBlur = Math.max(...blurs);
  ok(
    `light's CTA glow is a shadow, not a bloom — largest blur ${maxBlur}px`,
    maxBlur <= 14,
    `${maxBlur}px of blur under a button on a near-white page is a smear; dark's is 30px and belongs there`
  );
}

// =====================================================================
console.log("\n== The config wiring the compiler cannot check ==");
// `rgb(var(--x) / <alpha-value>)` vs a bare `var(--x)` decides whether an
// opacity-modified class exists at all. Neither tsc nor eslint can see it.
//
// CORRECTION TO WHAT THIS COMMENT USED TO SAY. It said the modifier
// "silently becomes fully opaque". That is not what happens, and the
// difference matters: Tailwind emits NO RULE AT ALL for the modified
// class, so the element does not get the token's colour at any opacity —
// it keeps whatever it INHERITED, which is usually a different colour
// entirely. Verified against the deployed stylesheet rather than
// reasoned about: `.text-orange-400\\/70` is present (that token is in
// channel form) and `.text-foreground\\/90` is absent, while 27 elements
// in src/ ask for it. So 27 pieces of intentionally-softened text were
// rendering at full --foreground strength, and `text-muted/70` was not
// rendering as --muted at all.
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

// ---------------------------------------------------------------------
// THE GENERAL FORM OF THAT BUG, not the four tokens that happened to
// have it.
//
// The assertion above only ever looked at --accent* inside textColor and
// borderColor. `border`, `foreground`, `muted` and `input` live in the
// plain `colors` block and were all declared as bare var()s, so 62
// alpha-modified usages across src/ emitted nothing:
//
//     text-foreground/90  x27      text-muted/80  x14
//     text-muted/70       x3       text-muted/60  x2
//     text-muted/50       x3       text-foreground/80 x6
//     border-border/50    x3       border-border/70   x1
//     bg-input/40         x2       bg-muted/10        x1
//
// So this checks the RULE rather than the instances: every colour name
// used anywhere in src/ with an alpha modifier must be declared in a form
// Tailwind can actually apply an alpha to.
const bareVarTokens = new Set();
for (const m of config.matchAll(/(?:^|[{,\s])([a-zA-Z][\w-]*)\s*:\s*"var\(--[^"]*\)"/g)) {
  bareVarTokens.add(m[1]);
}
const UTILITY = "(?:text|bg|border|divide|ring|from|via|to|placeholder|decoration|outline|fill|stroke|caret|accent|shadow)";
const alphaUses = new Map();
for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(new RegExp(`\\b${UTILITY}-([a-zA-Z][\\w-]*?)(?:-\\d{2,3})?/(\\d{1,3})\\b`, "g"))) {
    const name = m[1];
    if (!bareVarTokens.has(name)) continue;
    const key = `${name}/${m[2]}`;
    alphaUses.set(key, (alphaUses.get(key) ?? 0) + 1);
  }
}
check(
  "no alpha-modified class refers to a bare var() token",
  [...alphaUses.entries()].map(([k, n]) => `${k} (${n})`).sort(),
  []
);
// And the four that had it are named, so a revert is unmistakable rather
// than just "one more failing assertion".
for (const token of ["border", "foreground", "muted", "background", "panel", "panel-hover"]) {
  ok(
    `--${token} is declared in channel form`,
    new RegExp(`"?${token}"?:\\s*"rgb\\(var\\(--${token}\\) / <alpha-value>\\)"`).test(config)
  );
}
// A channel-form variable is THREE NUMBERS. Leaving a hex behind in one
// theme block makes `rgb(#86868f / 0.7)` — invalid, so the colour drops
// out entirely and only in that theme.
for (const token of ["border", "foreground", "muted", "background", "panel", "panel-hover"]) {
  // ANCHORED TO THE START OF A LINE. globals.css explains itself in
  // comments, and one of them contains the text "--foreground:" — an
  // unanchored scan read that prose as a seventh declaration and failed
  // on it.
  const declarations = [...css.matchAll(new RegExp(`^\\s*--${token}:\\s*([^;]+);`, "gm"))].map((m) => m[1].trim());
  ok(`every --${token} declaration is channels, not hex (${declarations.length} found)`, declarations.length > 0 && declarations.every((d) => /^\d{1,3} \d{1,3} \d{1,3}$/.test(d)));
}
// The variables are also read directly from TSX — Recharts stroke/fill and
// inline styles — where the compiler sees only a string. Those consumers
// must have moved to rgb(var(--x)) in the same change, or the chart axis
// silently renders with an invalid colour.
for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  const bare = [...text.matchAll(/(?<!rgb\()var\(--(border|foreground|muted|background|panel|panel-hover)\)/g)].map((m) => m[1]);
  check(`${file.split("/").pop()} reads the channel variables through rgb()`, bare, []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
