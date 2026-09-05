#!/usr/bin/env node
/*
 * THE HONEYPOT, IN A RIGHT-TO-LEFT PAGE, IN A REAL BROWSER.
 *
 * website-forms.test.mjs asserts the prompt does not hide the honeypot
 * with a negative offset. That is a check on a STRING. This is the
 * behaviour that string decides, and the two are not the same claim: a
 * technique nobody thought of could satisfy the regex and still push the
 * page sideways.
 *
 * WHY IT EXISTS. `position:absolute;left:-9999px` is the classic way to
 * hide a honeypot and it is genuinely safe in a left-to-right page — a
 * browser does not make overflow to the LEFT of the origin scrollable.
 * In dir="rtl" the scrollable direction flips and the same rule becomes
 * ~10,000px of horizontal scroll on every page carrying a form.
 *
 * Measured on a real Arabic site generated through the live model on
 * 2026-09-02: 9,975px of sideways scroll into empty space at 375px. The
 * two Latin-script sites in the same batch measured 0px from the
 * IDENTICAL markup — which is why nothing caught it. The defect is
 * invisible in every language this product had been tested in.
 *
 * THE MARKUP IS READ OUT OF THE PROMPT, not retyped here. A copy would
 * pass forever while the real instruction drifted.
 *
 * Run: node scripts/tests/honeypot-rtl.prodtest.mjs
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { chromiumPath } from "./lib/chromium.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}

const builder = readFileSync("src/lib/website-builder.ts", "utf8");
const hp = (builder.match(/Add one hidden honeypot input, exactly: (<input[^>]*>)/) ?? [])[1];
check("the honeypot markup was found in the prompt", Boolean(hp), "the prompt no longer quotes it verbatim");
if (!hp) { console.log(`\nFAILED: ${pass} passed, ${failures.length} failed`); process.exit(1); }

// THREE SCRIPTS, AND THE THIRD IS NOT DECORATION. The honeypot's style
// carries `white-space:nowrap`, and Han has NO WORD BOUNDARIES — a
// line breaker with nothing to break on is exactly where a 1px clipped
// box can behave differently from the Latin case. Arabic covers the
// right-to-left axis; Chinese covers the no-spaces axis; English is the
// control. scripts/tests/language-extremes.test.mjs requires the pair,
// and it was right to: this file shipped with Arabic alone.
const CASES = [
  { id: "en", lang: "en", dir: "ltr", heading: "Form", label: "Name", send: "Send" },
  { id: "ar", lang: "ar", dir: "rtl", heading: "نموذج", label: "الاسم", send: "إرسال" },
  { id: "zh-Hans", lang: "zh-Hans", dir: "ltr", heading: "表单", label: "姓名", send: "提交" },
];

const page = (c) => `<!doctype html><html lang="${c.lang}" dir="${c.dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:system-ui}main{padding:16px}</style></head>
<body><main><h1>${c.heading}</h1>
<form>${hp}
<label>${c.label}<input name="name" style="width:100%"></label>
<button type="submit">${c.send}</button>
</form></main></body></html>`;

const executablePath = chromiumPath();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  for (const c of CASES) {
    const dir = c.id;
    const p = await browser.newPage({ viewport: { width: 375, height: 800 } });
    await p.setContent(page(c), { waitUntil: "load" });
    const m = await p.evaluate(() => {
      const el = document.querySelector('[name="_hp"]');
      const r = el?.getBoundingClientRect();
      const cs = el ? getComputedStyle(el) : null;
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        present: Boolean(el),
        // A bot decides whether to fill a field by whether it is
        // RENDERED. display:none and visibility:hidden are the two that
        // make it skip — either would "fix" the overflow by disarming
        // the trap.
        rendered: cs ? cs.display !== "none" && cs.visibility !== "hidden" : false,
        left: r ? Math.round(r.left) : null,
        width: r ? Math.round(r.width) : null,
      };
    });
    check(`${dir}: the honeypot is in the page`, m.present);
    check(`${dir}: …and still rendered, so a bot still fills it`, m.rendered,
      "display:none or visibility:hidden would disarm the honeypot");
    check(`${dir}: no horizontal overflow at 375px (${m.overflow}px)`, m.overflow === 0,
      `honeypot at left=${m.left}px width=${m.width}px — this is the RTL case that measured 9975px`);
    await p.close();
  }

  // THE MEASUREMENT CAN GO RED. The old technique, in the same harness,
  // must fail the same assertion — otherwise the numbers above prove
  // nothing about the check.
  const old = hp.replace(/style="[^"]*"/, 'style="position:absolute;left:-9999px;opacity:0;"');
  const p = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await p.setContent(page(CASES[1]).replace(hp, old), { waitUntil: "load" });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`the old left:-9999px technique still measures as broken in rtl (${overflow}px)`, overflow > 1000);
  await p.close();
} finally {
  await browser.close();
}

console.log(`\n${failures.length === 0 ? "OK" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
