// THE EARTH IS THE DESIGN'S, IN THREE SIZES, AND IT NEVER HOLDS THE PAGE UP.
//
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN — ΤΟ ΤΕΛΙΚΟ, «Η ΓΗ»: great circles at
// different tilts, one outer orbit with a satellite moving on it, the
// signal colour, a slow continuous turn; ~6 circles and no nodes at 64px,
// 9 circles and surface nodes at 160px, static in the logo; quicker while
// the product works and calm after; still with reduced motion; a static
// image without 3D; and "Δεν καθυστερεί το φόρτωμα. Το 3D φορτώνει μετά
// το κείμενο."
//
// The geometry (src/lib/brand/earth.ts) is run, not read. The component
// (src/components/brand/earth.tsx) is read with its comments stripped,
// because how it waits for the page cannot be run without a browser; the
// browser pass of the site audit (docs/QUEUE.md D.11) is where it is
// watched.
//
// Run: node scripts/tests/earth.test.mjs
import { readFileSync, readdirSync } from "node:fs";
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

const E = await loadTs("src/lib/brand/earth.ts");

console.log("== 1. what each size draws ==");
check("small: about six great circles", E.EARTH_SPEC.small.circles === 6);
check("small: no nodes, so it stays clean", E.EARTH_SPEC.small.nodes === 0 && E.earthFrame("small", 0.6, 0.9).nodes.length === 0);
check("large: nine great circles", E.EARTH_SPEC.large.circles === 9);
const largeNodes = E.earthFrame("large", 0.6, 0.9).nodes.length;
check(`large: small nodes on the surface (${largeNodes} facing the viewer)`, largeNodes >= 4);
check("the logo draws fewer than the small size", E.EARTH_SPEC.logo.circles < E.EARTH_SPEC.small.circles);
const normals = E.greatCircleNormals(9);
const distinct = new Set(normals.map((n) => n.map((v) => v.toFixed(3)).join())).size;
check("no two great circles coincide", distinct === 9);
check("they are at different tilts", new Set(normals.map((n) => n[1].toFixed(2))).size >= 3);

console.log("\n== 2. the design's line weights ==");
check("the lines are at about 40%", Math.abs(E.LINE_OPACITY - 0.4) < 0.001);
check("the orbit at about 80%", Math.abs(E.ORBIT_OPACITY - 0.8) < 0.001);
const f = E.earthFrame("large", 0.6, 0.9);
check("the front of a circle is drawn at the line opacity", f.strokes.some((s) => s.opacity === E.LINE_OPACITY));
check("the far side is fainter, which is what makes it a sphere", f.strokes.some((s) => s.opacity === E.BACK_OPACITY) && E.BACK_OPACITY < E.LINE_OPACITY);
check("the orbit is drawn at its own opacity", f.strokes.some((s) => s.opacity === E.ORBIT_OPACITY));
const inside = f.strokes.every((s) => s.points.every(([x, y]) => x >= -2 && x <= 102 && y >= -2 && y <= 102));
check("everything is inside the 100-unit box", inside);

console.log("\n== 3. it moves: the sphere turns, the satellite travels ==");
const a = JSON.stringify(E.earthFrame("small", 0.6, 0.9).strokes);
const b = JSON.stringify(E.earthFrame("small", 1.2, 0.9).strokes);
check("turning the sphere changes the drawing", a !== b);
check("the same moment always draws the same frame (no clock, no randomness)", a === JSON.stringify(E.earthFrame("small", 0.6, 0.9).strokes));
const s1 = E.earthFrame("small", 0.6, 0.9).satellite;
const s2 = E.earthFrame("small", 0.6, 2.4).satellite;
check("the satellite moves along the orbit", Math.hypot(s1.x - s2.x, s1.y - s2.y) > 10);
check("quicker while working than at rest, for both", E.SPIN.working > E.SPIN.rest * 3 && E.ORBIT_SPEED.working > E.ORBIT_SPEED.rest * 2);
check("the rest turn is slow (more than 20 seconds a turn)", (2 * Math.PI) / E.SPIN.rest > 20);
const eased = E.easeSpeed(E.SPIN.rest, E.SPIN.working, 0.1);
check("the speed glides towards the target rather than jumping", eased > E.SPIN.rest && eased < E.SPIN.working);
check("...and gets there", Math.abs(E.easeSpeed(E.SPIN.rest, E.SPIN.working, 5) - E.SPIN.working) < 0.01);

console.log("\n== 4. the component never holds the page up ==");
const C = stripComments(readFileSync("src/components/brand/earth.tsx", "utf8"));
check("the server renders a static frame as SVG", /<svg[\s\S]{0,200}viewBox=\{`0 0 \$\{VIEW\} \$\{VIEW\}`\}/.test(C) && /const frame = earthFrame\(variant, 0\.6, 0\.9\);/.test(C));
check("the canvas starts only once the browser is idle", /requestIdleCallback\(begin/.test(C) && /setTimeout\(begin/.test(C));
check("reduced motion keeps it still, by the app's switch and the OS's", /dataset\.motion === "reduce"/.test(C) && /prefers-reduced-motion: reduce/.test(C) && /if \(reduce\) return;/.test(C));
check("no canvas means the static frame stays", /const ctx = cv\.getContext\("2d"\);\s*if \(!ctx\) return;/.test(C));
check(
  "the logo never animates, nor does a still earth",
  /const animated = variant !== "logo" && !still;/.test(C) && /if \(!animated\) return;/.test(C) && /\{animated && \(\s*<canvas/.test(C)
);
check("it stops drawing off screen and in a hidden tab", /new IntersectionObserver/.test(C) && /document\.hidden/.test(C));
check("working eases the speed up, and back", /easeSpeed\(spinSpeed, workingRef\.current \? SPIN\.working : SPIN\.rest, dt\)/.test(C));
check("the canvas is drawn from the same geometry", /draw\(earthFrame\(variant, spin, orbit\)\)/.test(C));
check("decorative unless named", /label \? \{ role: "img", "aria-label": label \} : \{ "aria-hidden": true \}/.test(C));

console.log("\n== 5. its colour is the signal's, from the stylesheet ==");
const css = readFileSync("src/app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
check("the earth takes the globe ink", /\.ionexa-earth\s*\{\s*color:\s*var\(--globe-ink\);\s*\}/.test(css));
check("the component carries that class", /className=\{`ionexa-earth /.test(C));
check("and draws in currentColor, never a written colour", /stroke="currentColor"/.test(C) && !/#[0-9a-fA-F]{6}/.test(C));

console.log("\n== 6. where it is drawn: 160px above the sign-in forms, the logo by its size ==");
// «Σύνδεση και εγγραφή: μεγαλύτερη, περίπου 160 px, πάνω από τη φόρμα»
// — and the same on the three other account screens that share that
// layout (forgotten and reset password, deleting the account).
const AUTH = [
  "src/app/login/login-form.tsx",
  "src/app/signup/signup-flow.tsx",
  "src/app/forgot-password/forgot-password-form.tsx",
  "src/app/reset-password/reset-password-form.tsx",
  "src/app/delete-account/confirm/confirm-delete-account-form.tsx",
];
const noLargeEarth = AUTH.filter((f) => !/<Earth variant="large" px=\{160\} label="Ionexa" \/>/.test(stripComments(readFileSync(f, "utf8"))));
check(`the account screens carry the 160px earth (${AUTH.length - noLargeEarth.length}/${AUTH.length})`, noLargeEarth.length === 0, noLargeEarth.join(", "));
// THE LOGO IS SIZED BY px, NOT BY A CLASS. It used to be an SVG that a
// height class scaled; the earth is drawn at the px it is given, so an
// h-6 on it sizes a box around a 24px drawing and nothing else.
const logoTags = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else if (p.endsWith(".tsx")) for (const m of readFileSync(p, "utf8").matchAll(/<Logo\b[^>]*>/g)) logoTags.push(`${p}: ${m[0]}`);
  }
})("src");
const logoBySize = logoTags.filter((tag) => /className="[^"]*\bh-/.test(tag));
check(`no logo is sized by a height class (${logoTags.length} logos read)`, logoTags.length >= 5 && logoBySize.length === 0, logoBySize.join("\n        "));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
