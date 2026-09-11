// THE STEP FLOW AND THE OUTLINE BUTTON, MEASURED RATHER THAN ASSERTED.
//
// Run: node scripts/step-flow-contrast.mjs [out.json]
//
// WHAT THIS CAN AND CANNOT SAY. It renders the markup
// components/ui/step-flow.tsx writes, plus one filled and one outlined
// button, against the CSS this repository's own `next build` produced
// in .next/static/css. That measures the STYLING of what was written —
// contrast, target height, wrapping — and it does NOT prove the
// component is on any page or that the page it is on renders. Those are
// scripts/tests/step-flow.test.mjs's job, and the reason both exist is
// that a browser can measure a colour a static reader cannot and a
// static reader can see a call site a browser does not visit.
//
// It found one thing this round: the digit inside the current step's
// chip read 4.44:1 in the light theme with text-orange-300, which is
// under AA for 11px text. The class is text-orange-500 now — 6.27:1
// light, 5.35:1 dark — and the comment beside it carries the numbers.
//
// Measured: WCAG 2.1 relative-luminance contrast with every translucent
// ground composited back to front, touch-target height, and horizontal
// overflow; at 1920/1440/768/390/375, in Greek, Arabic (RTL) and
// Chinese, in BOTH themes. 180 measurements, and it exits 1 if it
// collected any other number of them.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

// THE CSS THE BUILD PRODUCED. No build, no measurement — and saying so
// is better than measuring an old one silently.
const CSS = readdirSync(".next/static/css")
  .map((f) => readFileSync(`.next/static/css/${f}`, "utf8"))
  .join("\n");

const WORDS = {
  el: { label: "Βήματα", steps: ["Περιέγραψε", "Φτιάξ' το", "Άλλαξε", "Δες το", "Δημοσίευσε"], hint: "Γράφει την πρώτη εκδοχή. Κοστίζει credits.", primary: "Φτιάξε ιστοσελίδα", secondary: "Αποθήκευσε" },
  ar: { label: "الخطوات", steps: ["صِف", "أنشئ", "حرّر", "معاينة", "انشر"], hint: "يكتب النسخة الأولى. يستهلك رصيدًا.", primary: "أنشئ موقعًا", secondary: "احفظ" },
  zh: { label: "步骤", steps: ["描述", "生成", "编辑", "预览", "发布"], hint: "它写出第一版。会消耗额度。", primary: "生成网站", secondary: "保存" },
};

function page(loc, theme) {
  const w = WORDS[loc];
  const dir = loc === "ar" ? "rtl" : "ltr";
  const steps = w.steps
    .map((s, i) => {
      const here = i === 1;
      return `<li class="flex items-center gap-1.5" ${here ? 'aria-current="step"' : ""} data-step="${i}">
        ${i > 0 ? '<span class="me-1 h-px w-3 bg-border"></span>' : ""}
        <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${here ? "bg-orange-500/15 text-orange-500" : "bg-panel-hover text-muted"}" data-marker="${i}">${i + 1}</span>
        <span class="${here ? "font-semibold text-foreground" : "text-muted"}" data-label="${i}">${s}</span>
      </li>`;
    })
    .join("");
  return `<!doctype html><html lang="${loc}" dir="${dir}" data-theme="${theme}"><head><meta charset="utf-8"><style>${CSS}</style></head>
<body class="bg-background text-foreground"><div class="mx-auto max-w-3xl px-4 py-8 sm:px-6"><div class="surface">
  <div class="mb-4" data-testid="step-flow-website">
    <ol aria-label="${w.label}" class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">${steps}</ol>
    <p class="mt-1.5 text-xs text-muted" data-hint>${w.hint}</p>
  </div>
  <div class="flex flex-wrap gap-2">
    <button data-primary class="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90">${w.primary}</button>
    <button data-secondary class="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-orange-500/60 px-4 py-2 text-sm font-semibold text-orange-300 transition-all duration-200 hover:bg-orange-500/10">${w.secondary}</button>
  </div>
</div></div></body></html>`;
}

const L = (c) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const parse = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function over(fg, bgs) {
  // Composite the (possibly translucent) grounds back to front.
  let out = [255, 255, 255];
  for (const b of bgs) {
    const [r, g, bl, a = 1] = b;
    if (a === 0) continue;
    out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), bl * a + out[2] * (1 - a)];
  }
  const [r, g, b, a = 1] = fg;
  const f = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)];
  return ratio(f, out);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const rows = [];
for (const theme of ["dark", "light"]) {
  for (const loc of Object.keys(WORDS)) {
    for (const width of [1920, 1440, 768, 390, 375]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.setContent(page(loc, theme), { waitUntil: "load" });
      const r = await p.evaluate(() => {
        const chain = (el) => {
          const out = [];
          for (let n = el; n; n = n.parentElement) {
            const bg = getComputedStyle(n).backgroundColor;
            const m = (bg.match(/[\d.]+/g) ?? []).map(Number);
            if (m.length >= 3 && (m[3] === undefined || m[3] > 0)) out.unshift(m);
          }
          return out;
        };
        const pick = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const cs = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return { fg: (cs.color.match(/[\d.]+/g) ?? []).map(Number), grounds: chain(el), h: rect.height, w: rect.width };
        };
        return {
          current: pick('[data-label="1"]'),
          future: pick('[data-label="3"]'),
          hint: pick("[data-hint]"),
          marker: pick('[data-marker="1"]'),
          primary: pick("[data-primary]"),
          secondary: pick("[data-secondary]"),
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        };
      });
      for (const [name, v] of Object.entries(r)) {
        if (!v || typeof v !== "object") continue;
        rows.push({
          theme, loc, width, part: name,
          contrast: +over(v.fg, v.grounds).toFixed(2),
          height: Math.round(v.h),
          hscroll: r.scrollW > r.clientW,
        });
      }
      await ctx.close();
    }
  }
}
await browser.close();

// A FLOOR, because a table with no rows passes every assertion below it.
const EXPECTED = 2 * 3 * 5 * 6;
if (rows.length !== EXPECTED) {
  console.log(`MEASURED ${rows.length} of ${EXPECTED} — the harness did not run what it claims`);
  process.exit(1);
}
const worst = {};
for (const r of rows) {
  const k = r.part;
  if (!worst[k] || r.contrast < worst[k].contrast) worst[k] = r;
}
console.log(`${rows.length} measurements: 2 themes x 3 locales x 5 widths x 6 parts\n`);
console.log("part        worst contrast   where                     height");
for (const [k, r] of Object.entries(worst)) {
  console.log(`${k.padEnd(11)} ${String(r.contrast).padStart(6)}:1        ${r.theme}/${r.loc}/${r.width}`.padEnd(52) + `${r.height}px`);
}
const badText = rows.filter((r) => ["current", "future", "hint", "primary", "secondary"].includes(r.part) && r.contrast < 4.5);
const badTarget = rows.filter((r) => ["primary", "secondary"].includes(r.part) && r.height < 44);
const scrolled = rows.filter((r) => r.hscroll);
console.log(`\ntext below 4.5:1 : ${badText.length}`);
for (const r of badText.slice(0, 12)) console.log(`   ${r.part} ${r.contrast}:1 ${r.theme}/${r.loc}/${r.width}`);
console.log(`targets under 44px: ${badTarget.length}`);
for (const r of badTarget.slice(0, 8)) console.log(`   ${r.part} ${r.height}px ${r.theme}/${r.loc}/${r.width}`);
console.log(`horizontal scroll : ${scrolled.length}`);
writeFileSync(process.argv[2] ?? "/dev/null", JSON.stringify(rows, null, 1));
