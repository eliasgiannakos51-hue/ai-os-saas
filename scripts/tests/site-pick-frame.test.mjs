// A SITE'S PARTS ARE PRESSED IN THE PAGE, AND THE PAGE STILL RUNS NOTHING IT WROTE.
//
// The approved Site screen (docs/design/approved/08-Site.png, ED2,
// 2026-11-05) picks a part of the page by pressing it in the preview, with
// a white outline and «<part> · selected» over it. Under the switch
// "editor-shell" the preview therefore runs ONE script — the app's own —
// in an opaque-origin frame; lib/website-builder/preview-picker.ts says
// why that and not the alternative. With the switch off the preview is
// the old one, sandbox="" with no script at all (held by
// scripts/tests/boxes.test.mjs and scripts/tests/tool-shell.test.mjs).
//
//   1. The frame is sandbox="allow-scripts" and nothing else: no
//      allow-same-origin, no forms, no pop-ups, no navigation of the page.
//   2. The first thing after the doctype is a Content-Security-Policy whose
//      script-src is exactly the picker's own SHA-256 — recomputed HERE
//      from PICKER_SCRIPT, so an edit of the script that forgets the hash
//      is red, not a picker that silently stops working.
//   3. A page's own <script>, its onclick and a javascript: link are all
//      still there to be refused: nothing in the policy admits them.
//   4. The parts are numbered as findPageBoxes numbers them, so "part 3"
//      is the same element in the frame, in the shell and in the edit route.
//   5. The selection is the product's white — the two colours written into
//      the frame are the tokens' own values — and never the old blue.
//   6. The app listens only to that frame's window, and takes from it only
//      "ready" or a whole, non-negative index.
//
// In a real browser — the page's own script not running, the picker
// running, the outline and the label — scripts/tests/editor-shell.prodtest.mjs.
//
// Run: node scripts/tests/site-pick-frame.test.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const picker = await loadTs("src/lib/website-builder/preview-picker.ts");
const boxes = await loadTs("src/lib/website-boxes.ts");
const frameSrc = stripComments(readFileSync("src/components/website-builder/site-pick-frame.tsx", "utf8"));
const siteSrc = stripComments(readFileSync("src/components/website-builder/website-shell.tsx", "utf8"));
const css = readFileSync("src/app/globals.css", "utf8");

console.log("== 1. the frame: scripts, and nothing else ==");
check("the sandbox is exactly allow-scripts", picker.PICKER_SANDBOX === "allow-scripts", JSON.stringify(picker.PICKER_SANDBOX));
check("...drawn from that constant, with the picked page as its document",
  /sandbox=\{PICKER_SANDBOX\}/.test(frameSrc) && /const srcDoc = useMemo\(\(\) => pickablePreview\(html\), \[html\]\);/.test(frameSrc) && /srcDoc=\{srcDoc\}/.test(frameSrc) &&
    (frameSrc.match(/<iframe\b/g) ?? []).length === 1 && !/sandbox="/.test(frameSrc));
check("...and Site draws it only in the editor layout", /\{editor \? \(\s*<SitePickFrame\b/.test(siteSrc) && (siteSrc.match(/<SitePickFrame\b/g) ?? []).length === 1);

console.log("\n== 2. the policy comes first, and admits the picker alone ==");
const hash = createHash("sha256").update(picker.PICKER_SCRIPT, "utf8").digest("base64");
check(`the hash is the picker's own (${hash})`, picker.PICKER_SCRIPT_SHA256 === hash, `written: ${picker.PICKER_SCRIPT_SHA256}`);
check("the policy is that hash and nothing else", picker.PICKER_CSP === `script-src 'sha256-${hash}'`, picker.PICKER_CSP);
const PAGE = '<!DOCTYPE html><html lang="el"><head><title>t</title><script>window.__pageScriptRan=1</script></head><body><header><a href="javascript:alert(1)">x</a></header><section onclick="window.__pageScriptRan=2"><h2>Hero</h2></section><footer>f</footer></body></html>';
const picked = picker.pickablePreview(PAGE);
const metaAt = picked.indexOf('<meta http-equiv="Content-Security-Policy"');
check("the policy is the first thing after the doctype", picked.startsWith("<!DOCTYPE html><meta http-equiv=\"Content-Security-Policy\""), picked.slice(0, 80));
check("...before every script of the page's own", metaAt >= 0 && metaAt < picked.indexOf("__pageScriptRan"));
check("...and with no doctype, it is the very first thing", picker.pickablePreview("<html><body><section>x</section></body></html>").startsWith('<meta http-equiv="Content-Security-Policy"'));
check("the picker is the only script the transform adds, and it is the hashed text",
  (picked.match(/<script>/g) ?? []).length === 2 && picked.includes(`<script>${picker.PICKER_SCRIPT}</script>`));
const policy = /content="([^"]*)"/.exec(picked.slice(metaAt))?.[1] ?? "";
check("nothing in the policy admits the page's own scripts, handlers or links",
  !/unsafe-inline|unsafe-eval|unsafe-hashes|strict-dynamic|\*|https?:|data:|'self'|nonce-/.test(policy) && /^script-src 'sha256-[A-Za-z0-9+/=]+'$/.test(policy), policy);
check("the picker's text cannot end its own element early", !/<\/script|<!--/i.test(picker.PICKER_SCRIPT));

console.log("\n== 3. the parts are numbered as everywhere else ==");
const found = boxes.findPageBoxes(PAGE);
check(`every part the scanner finds is numbered, in order (${found.length})`,
  found.length === 3 && [...picked.matchAll(/data-ionexa-n="(\d+)"/g)].map((m) => m[1]).join() === "1,2,3");
check("...and none is shown as chosen until the app says so", !/data-ionexa-on/.test(picked.replace(picker.PICKER_STYLE, "").replace(picker.PICKER_SCRIPT, "")));

console.log("\n== 4. the selection is the product's white ==");
const tokenHex = (name) => {
  const m = new RegExp(`--${name}:\\s*(\\d+) (\\d+) (\\d+);`).exec(css);
  return m ? "#" + m.slice(1).map((v) => Number(v).toString(16).padStart(2, "0")).join("").toUpperCase() : null;
};
check(`the white is --foreground (${tokenHex("foreground")})`, picker.PRODUCT_WHITE.toUpperCase() === tokenHex("foreground"));
check(`the label's ink is --button-ink (${tokenHex("button-ink")})`, picker.PRODUCT_INK.toUpperCase() === tokenHex("button-ink"));
check("the chosen part: a 2px outline in that white", new RegExp(`\\[data-ionexa-on\\][^{]*\\{outline:2px solid ${picker.PRODUCT_WHITE}`).test(picker.PICKER_STYLE));
check("hover: a 1px white line at 40%", /\[data-ionexa-n\]:hover\{outline:1px solid rgba\(245,247,251,\.4\)/.test(picker.PICKER_STYLE));
check("the label: white, with the ink", new RegExp(`#ionexa-pick-label\\{[^}]*background:${picker.PRODUCT_WHITE};color:${picker.PRODUCT_INK}`).test(picker.PICKER_STYLE));
check("no colour but those two and the 40% white", [...picker.PICKER_STYLE.matchAll(/#[0-9A-Fa-f]{3,8}\b|rgba?\([^)]*\)/g)].every((m) => [picker.PRODUCT_WHITE, picker.PRODUCT_INK, "rgba(245,247,251,.4)"].includes(m[0])));

console.log("\n== 5. the app hears only that frame, and only what it can use ==");
check("the message's window is checked against this frame's own",
  /if \(!frame\.current \|\| event\.source !== frame\.current\.contentWindow\) return;/.test(frameSrc) && /const message = readPickMessage\(event\.data\);/.test(frameSrc));
const read = picker.readPickMessage;
check("ready and a whole, non-negative index are taken", read({ source: picker.PICK_MESSAGE, type: "ready" })?.type === "ready" && read({ source: picker.PICK_MESSAGE, type: "pick", index: 2 })?.index === 2);
check("...anything else is not", [
  read({ source: "other", type: "pick", index: 1 }),
  read({ source: picker.PICK_MESSAGE, type: "pick", index: -1 }),
  read({ source: picker.PICK_MESSAGE, type: "pick", index: 1.5 }),
  read({ source: picker.PICK_MESSAGE, type: "pick", index: "1" }),
  read({ source: picker.PICK_MESSAGE, type: "select", index: 1 }),
  read(null),
  read("pick"),
].every((v) => v === null));
check("...and Site checks the index against the parts it has before choosing one",
  /onPick=\{\(i\) => \{\s*if \(i >= boxes\.length\) return;/.test(siteSrc));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
