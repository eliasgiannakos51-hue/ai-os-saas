// THE DESIGN SYSTEM IS THE ONLY PLACE A COLOUR LIVES.
//
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN — ΤΟ ΤΕΛΙΚΟ (2026-10-04), ΚΑΝΟΝΕΣ:
//   - "Όλα τα χρώματα από μεταβλητές. Έλεγχος που αποτυγχάνει αν βρεθεί
//     χρώμα γραμμένο απευθείας σε component."
//   - "Έλεγχος που αποτυγχάνει αν το #F2A65A χρησιμοποιηθεί οπουδήποτε
//     εκτός από τη γη και το λογότυπο."
//   - "Αντίθεση κειμένου τουλάχιστον 4.5:1."
//   and "ΕΝΑ ΘΕΜΑ ΜΟΝΟ, ΣΚΟΥΡΟ", "Καμία λάμψη, gradient ή σκιά", "Αφαίρεσε το
//   παλιό φόντο με τις γραμμές από όλες τις οθόνες".
//
// This is that check, and it ranges over the populations the rules name:
// every .ts/.tsx under src/ for classes and literals, every rule in
// src/app/globals.css for the signal colour and the effects. Comments are
// stripped first — a rule about code is not satisfied by prose.
//
// Run: node scripts/tests/design-tokens.test.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const SRC = walk("src");
const CODE = new Map(SRC.map((f) => [f, stripComments(readFileSync(f, "utf8"))]));
const CSS_RAW = readFileSync("src/app/globals.css", "utf8");
const CSS = CSS_RAW.replace(/\/\*[\s\S]*?\*\//g, "");
// THE FLOORS. Every check below is "none found", which a scan that read
// nothing would also say. 939 source files and 161 CSS rules on
// 2026-10-04; the floors sit well under that and well over zero.
check(`the scan reads the source tree (${SRC.length} files)`, SRC.length >= 600 && CODE.size >= 600);

// ---------------------------------------------------------------------
console.log("== 1. the palette is closed ==");
const tw = readFileSync("tailwind.config.ts", "utf8");
const themeColors = tw.match(/\n  theme: \{\n[\s\S]*?\n    colors: \{([\s\S]*?)\n    \},\n    extend: \{/);
check("tailwind's `colors` replaces the palette instead of extending it", Boolean(themeColors), "expected theme.colors before theme.extend");
const names = themeColors ? [...themeColors[1].matchAll(/^\s+"?([a-z-]+)"?:/gm)].map((m) => m[1]) : [];
const DESIGN_NAMES = ["transparent", "current", "inherit", "background", "panel", "panel-hover", "border", "divider", "tag", "foreground", "muted", "button", "button-ink", "success", "warning", "danger", "signal", "paper", "input"];
check("it holds the design's names and nothing else", names.join() === DESIGN_NAMES.join(), names.join());
// CHANNEL FORM, or `text-muted/70` emits no CSS at all: Tailwind can only
// apply an alpha modifier to a colour it can rewrite. (Moved here from the
// retired light-theme-contrast gate, which found 62 dead classes this way.)
const paletteEntries = themeColors ? [...themeColors[1].matchAll(/^\s+"?([a-z-]+)"?:\s*"([^"]+)"/gm)] : [];
check(`the palette's entries parse (${paletteEntries.length})`, paletteEntries.length >= 15);
const bare = paletteEntries
  .filter(([, n, v]) => !["transparent", "current", "inherit", "input"].includes(n) && !/^rgb\(var\(--[a-z-]+\) \/ <alpha-value>\)$/.test(v))
  .map(([, n]) => n);
check("every colour is written in channel form, so an alpha modifier works", bare.length === 0, bare.join(", "));
check("no colour is added back under extend", !/extend: \{[\s\S]*\b(colors|textColor|borderColor|backgroundColor)\s*:/.test(tw));

const HUES = "orange|amber|yellow|red|rose|emerald|green|sky|blue|indigo|violet|purple|fuchsia|pink|teal|cyan|lime|slate|gray|zinc|neutral|stone|white|black";
const UTIL = "ring-offset|bg|text|border(?:-[trblxyse])?|ring|from|to|via|fill|stroke|divide|shadow|outline|decoration|caret|accent|placeholder";
const PALETTE = new RegExp(`(?<![\\w-])(?:[a-z0-9-]+:)*(?:${UTIL})-(?:${HUES})(?:-\\d{2,3})?(?:/\\d+|/\\[[^\\]\\s]+\\])?(?![\\w-])`, "g");
const paletteHits = SRC.flatMap((f) => [...CODE.get(f).matchAll(PALETTE)].map((m) => `${f}: ${m[0]}`));
check("no Tailwind palette colour anywhere in src", paletteHits.length === 0, paletteHits.slice(0, 8).join("\n        "));
// THE STYLESHEET'S @apply TOO. A palette class there is not "no colour",
// it is a failed build — `next build` stopped on one on 2026-10-04 that
// this gate had not looked for.
const applyStatements = [...CSS.matchAll(/@apply[^;]*;/g)];
check(`the stylesheet's @apply lines are read (${applyStatements.length})`, applyStatements.length >= 3);
const applyHits = applyStatements.flatMap((m) => [...m[0].matchAll(PALETTE)].map((x) => x[0]));
check("no Tailwind palette colour in an @apply", applyHits.length === 0, applyHits.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 2. no colour written straight into a component ==");
// Each exception is a colour that is not the app's: it is the user's
// content, a third party's mark, or a surface CSS variables cannot reach.
// Checked BOTH ways: the file must still carry a literal, or the entry is
// stale and goes.
const LITERAL_ALLOWED = {
  "src/components/auth/social-auth-buttons.tsx": "a third party's sign-in mark, drawn in the colours its owner requires",
  "src/components/website-builder/design-controls.tsx": "the colour picker's starting value for the USER'S website palette — their content, not the app",
  "src/app/opengraph-image.tsx": "rendered to a PNG at the edge, where there is no stylesheet and no variable",
  "src/app/manifest.ts": "the browser reads theme_color and background_color as literals",
  "src/app/layout.tsx": "viewport.themeColor is read by the browser as a literal",
};
const LITERAL = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])|\brgba?\(\s*\d/;
const UI_FILES = SRC.filter(
  (f) =>
    (f.startsWith("src/components/") || (f.startsWith("src/app/") && !f.startsWith("src/app/api/") && !f.startsWith("src/app/s/"))) &&
    !/route\.ts$/.test(f)
);
check(`the component scan has components to read (${UI_FILES.length})`, UI_FILES.length >= 200);
const literalHits = [];
for (const f of UI_FILES) {
  if (LITERAL_ALLOWED[f]) continue;
  // In-page anchors ("#pricing", href="#top") are not colours; a quoted
  // hex IS one, and the first version of this line stripped both — the
  // mutation suite found that "#f97316" in a style prop passed.
  const code = CODE.get(f)
    .replace(/href="#[^"]*"/g, "")
    .replace(/(["'`])#([a-z0-9-]+)\1/gi, (m, _q, body) => (/^(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(body) ? m : ""));
  code.split("\n").forEach((line, i) => {
    if (LITERAL.test(line)) literalHits.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
  });
}
check(`no hex or rgb() literal in ${UI_FILES.length} component files`, literalHits.length === 0, literalHits.slice(0, 8).join("\n        "));
for (const [f, why] of Object.entries(LITERAL_ALLOWED)) {
  check(`exception still earned: ${f}`, existsSync(f) && LITERAL.test(CODE.get(f) ?? ""), why);
}
const ARBITRARY = /(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|text|border|from|to|via|fill|stroke|ring|shadow|outline)-\[[^\]\s]*(?:#|rgb|gradient)[^\]\s]*\]/g;
const arbitrary = SRC.flatMap((f) => [...CODE.get(f).matchAll(ARBITRARY)].map((m) => `${f}: ${m[0]}`));
check("no arbitrary colour value in a class (bg-[#…], bg-[linear-gradient…])", arbitrary.length === 0, arbitrary.slice(0, 6).join("\n        "));

// ---------------------------------------------------------------------
// A CHANNEL TRIPLE IS NOT A COLOUR. The variables are "245 247 251", valid
// only inside rgb(). Recharts takes stroke and fill as strings the
// compiler never reads, so a bare var(--muted) compiles and paints
// nothing. (Moved here from the retired light-theme-contrast gate.)
const CHANNEL_VARS = [...CSS_RAW.matchAll(/^\s*--([a-z0-9-]+):\s*\d+ \d+ \d+;/gm)].map((m) => m[1]);
check(`the channel variables are known (${CHANNEL_VARS.length})`, CHANNEL_VARS.length >= 15);
const BARE = new RegExp(`(?<!rgb\\()var\\(--(?:${CHANNEL_VARS.join("|")})\\)`, "g");
const bareVars = UI_FILES.flatMap((f) => [...CODE.get(f).matchAll(BARE)].map((m) => `${f}: ${m[0]}`));
check("no channel variable is used bare, outside rgb()", bareVars.length === 0, bareVars.slice(0, 6).join("\n        "));

// AND NO NAME THE PALETTE DOES NOT HAVE. A closed palette drops an
// unknown colour without a word: `bg-surface` and `bg-accent` produced no
// CSS at all, so the Marketplace's main button and four settings panels
// had no background, and `text-fg` had no colour — sixteen dead classes
// found by hand on 2026-10-04 (design D.11). Every colour utility on a
// class line must name a palette entry; the values below are the
// utilities' other meanings (size, side, style), not colours.
const NON_COLOR = new Set([
  "left", "center", "right", "start", "end", "justify", "ellipsis", "clip", "wrap", "nowrap", "balance", "pretty",
  "cover", "contain", "top", "bottom", "fixed", "local", "scroll", "repeat", "no-repeat", "repeat-x", "repeat-y", "auto", "none",
  "origin-border", "origin-padding", "origin-content", "clip-border", "clip-padding", "clip-content", "clip-text",
  "t", "b", "l", "r", "x", "y", "s", "e", "solid", "dashed", "dotted", "double", "hidden", "collapse", "separate",
  "inset", "wavy", "reverse", "offset", "current", "xs", "sm", "base", "lg", "xl",
]);
const COLOR_UTIL = /(?:^|[\s"'`{(])(?:[a-z0-9-]+:)*(bg|text|border(?:-[trblxyse])?|ring|ring-offset|fill|stroke|divide|outline|decoration|caret|accent|placeholder)-([a-z][a-z-]*)(?=[\s"'`/})]|$)/g;
const unknownColors = [];
for (const f of UI_FILES) {
  for (const line of CODE.get(f).split("\n")) {
    if (!/className|\bcn\(|clsx\(|`|: "/.test(line)) continue;
    for (const m of line.matchAll(COLOR_UTIL)) {
      const value = m[2];
      if (NON_COLOR.has(value) || DESIGN_NAMES.includes(value)) continue;
      unknownColors.push(`${f}: ${m[1]}-${value}`);
    }
  }
}
check(`every colour class names a palette colour (${unknownColors.length} do not)`, unknownColors.length === 0, unknownColors.slice(0, 10).join("\n        "));

console.log("\n== 3. the signal colour: the globe and the logo, nowhere else ==");
const SIGNAL_FILES = new Set(["src/components/logo.tsx", "src/components/ui/globe-mark.tsx", "src/components/brand/earth.tsx", "src/lib/brand/globe.ts", "src/lib/brand/globe-svg.ts", "src/lib/brand/earth.ts"]);
const SIGNAL = /f2a65a|--signal\b|--globe-ink\b|--logo-accent\b|(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|text|border|ring|fill|stroke|outline|decoration|accent|caret|from|to|via)-signal(?![\w-])/i;
const signalHits = [...CODE].filter(([f, code]) => !SIGNAL_FILES.has(f) && SIGNAL.test(code)).map(([f]) => f);
check("no other source file names the signal colour", signalHits.length === 0, signalHits.join(", "));
// In the stylesheet: only in :root (where it is defined) and on the globe.
const cssRules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
check(`the stylesheet parses into rules (${cssRules.length})`, cssRules.length >= 80);
const signalRules = cssRules.filter((r) => SIGNAL.test(r.body)).map((r) => r.sel);
check(
  "in globals.css it is used only by :root and the globe",
  signalRules.length > 0 && signalRules.every((sel) => sel === ":root" || /^\.ionexa-(?:globe|earth)\b/.test(sel)),
  signalRules.join(" | ")
);
check("the globe takes its colour from it", cssRules.some((r) => r.sel === ".ionexa-globe" && /color:\s*var\(--globe-ink\)/.test(r.body)));
const root = cssRules.find((r) => r.sel === ":root" && /--background:/.test(r.body))?.body ?? "";
check("the signal is #F2A65A", /--signal:\s*242 166 90;/.test(root) && /--globe-ink:\s*#f2a65a;/i.test(root));

// ---------------------------------------------------------------------
console.log("\n== 4. the values are the design's, and they read ==");
const channel = (name) => {
  const m = root.match(new RegExp(`--${name}:\\s*(\\d+) (\\d+) (\\d+);`));
  return m ? m.slice(1, 4).map(Number) : null;
};
const EXPECTED = {
  background: "#070A12", panel: "#0D1220", "panel-hover": "#0F1524", divider: "#161D2E", border: "#222A3D", tag: "#1E2638",
  foreground: "#F5F7FB", muted: "#8D96A8", button: "#F5F7FB", "button-ink": "#070A12",
};
const hex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
for (const [name, want] of Object.entries(EXPECTED)) {
  const got = channel(name);
  check(`--${name} is ${want}`, got && hex(got) === want, got ? hex(got) : "missing");
}
const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const SURFACES = ["background", "panel", "panel-hover"];
for (const ink of ["foreground", "muted", "success", "warning", "danger"]) {
  for (const surface of SURFACES) {
    const r = channel(ink) && channel(surface) ? ratio(channel(ink), channel(surface)) : 0;
    check(`${ink} on ${surface}: ${r.toFixed(2)}:1, at least 4.5`, r >= 4.5);
  }
}
const btn = channel("button") && channel("button-ink") ? ratio(channel("button"), channel("button-ink")) : 0;
check(`button ink on the button: ${btn.toFixed(2)}:1, at least 4.5`, btn >= 4.5);
check(
  "the focus ring is the text colour, solid, 2px",
  /a:focus-visible[\s\S]*?outline:\s*2px solid rgb\(var\(--foreground\)\);/.test(CSS)
);
check(
  "the three radii are the design's: 18 / 14 / 10",
  /--radius-field:\s*18px;/.test(root) && /--radius-card:\s*14px;/.test(root) && /--radius-item:\s*10px;/.test(root)
);

// ---------------------------------------------------------------------
console.log("\n== 5. one theme, dark ==");
const { THEMES, normalizeTheme } = await loadTs("src/lib/theme-prefs.ts");
check("the theme list is [dark]", JSON.stringify(THEMES) === '["dark"]', JSON.stringify(THEMES));
check("anything stored reads as dark", ["light", "midnight", "carbon", null].every((v) => normalizeTheme(v) === "dark"));
check("no light-theme rule is left in the stylesheet", !/data-theme="light"|data-theme='light'/.test(CSS));
const layout = CODE.get("src/app/layout.tsx");
check(
  "the first-paint script sets dark and clears an old choice",
  /setAttribute\('data-theme','dark'\)/.test(layout) && /localStorage\.removeItem\('theme'\)/.test(layout) && !/'light'/.test(layout)
);
check("the server renders <html data-theme=\"dark\">", /<html[^>]*data-theme="dark"/.test(layout));
const pickers = SRC.filter((f) => /theme-(toggle|settings)\.tsx$/.test(f));
check("no theme picker exists", pickers.length === 0, pickers.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 6. no glow, no gradient, no shadow, no backdrop ==");
const EFFECT = /(?<![\w-])(?:[a-z0-9-]+:)*(?:shadow(?:-(?:sm|md|lg|xl|2xl|inner))?|shadow-\[[^\]\s]+\]|drop-shadow(?:-[a-z0-9]+)?|bg-gradient-to-[a-z]+|blur-(?:xl|2xl|3xl))(?![\w/-])/g;
const effectHits = [];
for (const f of UI_FILES) {
  for (const m of CODE.get(f).matchAll(/(?:className=|cn\(|clsx\()\s*[{"`(]?[^\n]*/g)) {
    for (const e of m[0].matchAll(EFFECT)) effectHits.push(`${f}: ${e[0]}`);
  }
}
check("no shadow, gradient or glow utility in a component's classes", effectHits.length === 0, effectHits.slice(0, 8).join("\n        "));
const styleGradients = UI_FILES.filter((f) => /(linear|radial|conic)-gradient\(/.test(CODE.get(f)));
check("no gradient in a component's inline style", styleGradients.length === 0, styleGradients.join(", "));
// The one shadow allowed: WebKit paints autofilled fields yellow unless an
// inset shadow covers it — a browser's colour, put back to ours.
const cssEffects = cssRules.filter(
  (r) => /(box-shadow|text-shadow|drop-shadow|(?:linear|radial|conic)-gradient|backdrop-filter)/.test(r.body) && !/^input:-webkit-autofill/.test(r.sel)
);
check("no shadow, gradient or blur in the stylesheet", cssEffects.length === 0, cssEffects.map((r) => r.sel.replace(/\s+/g, " ")).join(" | "));
const dotGrid = [...CODE].filter(([, code]) => /\bbg-dot-grid\b/.test(code)).map(([f]) => f);
check("the dotted background is used nowhere", dotGrid.length === 0 && !/\.bg-dot-grid\b/.test(CSS), dotGrid.join(", "));
const BACKDROPS = ["app-background", "dashboard-background", "auth-background", "network-field", "ambient-dots", "glow-orb"];
const backdropImports = [...CODE].filter(([, code]) => BACKDROPS.some((b) => code.includes(`/${b}"`))).map(([f]) => f);
check("no screen mounts a backdrop", backdropImports.length === 0, backdropImports.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 7. three radii: the field, the card, the item ==");
// The design names three — 18px the main field, 14px a card, 10px an
// item (tailwind.config.ts) — and rounded-full for tags and round
// buttons. Design D.8 (2026-10-04) mapped every rounded-sm…3xl onto them
// (sm/md/lg → item, xl/2xl/3xl → card, the two main fields → field). Any
// other size, on any side, in any component or in an @apply, is a radius
// the design does not have.
const RADIUS = /(?<![\w-])rounded(?:-(?:tl|tr|bl|br|ss|se|es|ee|t|b|l|r|s|e))?-(sm|md|lg|xl|2xl|3xl|\[[^\]]+\])(?![\w-])/g;
const radiusHits = [];
for (const [f, code] of CODE) for (const m of code.matchAll(RADIUS)) radiusHits.push(`${f}: ${m[0]}`);
// And the bare `rounded` — Tailwind's 4px, which is none of the three —
// as a class: between quotes, backticks or spaces, on a class line.
// Only in a component's class strings, so a variable called `rounded`
// (lib/trading/guardian.ts has two) is not a hit.
for (const f of UI_FILES) {
  for (const line of CODE.get(f).split("\n")) {
    if (!/className|\bcn\(|clsx\(|`/.test(line)) continue;
    for (const m of line.matchAll(/(?<=["'` ])rounded(?=["'` ])/g)) radiusHits.push(`${f}: ${m[0]} (4px)`);
  }
}
for (const st of applyStatements) for (const m of st[0].matchAll(RADIUS)) radiusHits.push(`globals.css @apply: ${m[0]}`);
check(`every radius is one of the design's (${radiusHits.length} others)`, radiusHits.length === 0, radiusHits.slice(0, 8).join("\n        "));
const usedRadii = new Set([...[...CODE.values()].join("\n").matchAll(/\brounded(?:-[a-z]{1,2})?-(item|card|field)\b/g)].map((m) => m[1]));
check(`...and all three are in use (${[...usedRadii].sort().join(", ")})`, usedRadii.size === 3);
const mainFields = ["src/components/chat/chat-composer.tsx", "src/components/create/create-chat.tsx"].filter(
  (f) => !/<textarea[\s\S]{0,1200}?\brounded-field\b/.test(CODE.get(f) ?? "")
);
check("the main field — Home's and the conversation's — is the 18px one", mainFields.length === 0, mainFields.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 8. no text fainter than the design's muted ==");
// Muted (#8D96A8) is 6.6:1 on the background and about 6:1 on a panel;
// at 80% it is about 4.5:1 on the background and under it on a panel.
// The site audit of D.11 (scripts/site-audit.mjs) found five screens
// where axe reported exactly that, every one a `text-muted/70` or `/80`.
// So muted text is drawn at full strength. A disabled control is the
// exception WCAG makes (1.4.3), so a line that says cursor-not-allowed,
// or a `disabled:` variant, may fade it.
const fadedText = [];
for (const f of UI_FILES) {
  for (const line of CODE.get(f).split("\n")) {
    if (/cursor-not-allowed/.test(line)) continue;
    for (const m of line.matchAll(/(?:^|[\s"'`])((?:[a-z-]+:)*)text-muted\/\d+\b/g)) {
      if (!m[1].includes("disabled:")) fadedText.push(`${f}: ${m[0].trim()}`);
    }
  }
}
check(`muted text is never faded below the design's value (${fadedText.length} faded)`, fadedText.length === 0, fadedText.slice(0, 8).join("\n        "));

// ---------------------------------------------------------------------
console.log("\n== 9. a target is at least 44px ==");
// «Στόχοι αφής τουλάχιστον 44 px» (docs/CONTEXT.md, «ΚΙΝΗΤΟ»). The site
// audit of D.11 (scripts/site-audit.mjs) found 48 controls whose own
// class said so in numbers — min-h-[32px], [36px], [40px] — and raised
// them. A smaller height is allowed only behind a breakpoint prefix
// (sm:min-h-[36px] on a desktop pointer), never as the phone's size.
const smallTargets = [];
for (const f of UI_FILES) {
  // A line marked aria-hidden is a spacer, not something to press.
  for (const line of CODE.get(f).split("\n")) {
    if (/aria-hidden="true"/.test(line)) continue;
    for (const m of line.matchAll(/(?<![\w:\-\[])min-h-\[(\d+)px\]/g)) {
      if (Number(m[1]) < 44) smallTargets.push(`${f}: ${m[0]}`);
    }
  }
}
check(`no control sets a height under 44px for the phone (${smallTargets.length})`, smallTargets.length === 0, smallTargets.slice(0, 8).join("\n        "));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
