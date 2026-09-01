// Reproduction test for the email logo that never showed up in a real inbox.
//
// The previous fix was verified by RENDERING the templates and asserting
// the <img> tag existed. That test passed 8/8 while the logo was still
// invisible in every real inbox, because the thing that was broken was
// never the markup — it was what the markup pointed AT:
//
//   - /email-logo had no file extension, so src/middleware.ts's matcher
//     did not exclude it. Every image fetch, from every inbox, ran the
//     auth middleware including a Supabase getUser() round trip.
//   - it was a dynamically rendered edge ImageResponse route, which
//     Gmail's and Outlook's image proxies handle far less reliably than
//     a static file.
//
// So this test asserts the things that actually determine whether an
// inbox can load the image, not merely that a tag is present.
//
// Run: node scripts/tests/email-logo.test.mjs
import { readFileSync, existsSync, statSync } from "node:fs";
import ts from "typescript";

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
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

// --- Render the templates exactly as the app sends them, with a
// --- production-shaped absolute site URL.
const PROD = "https://ionexa.example";

// The site URL is baked into a module-level const in templates.ts, so it
// is read exactly once when the module first evaluates. It is passed in
// here rather than set on process.env for that reason — and because Node
// caches a data: URI import by its content, so two loads with identical
// source would return the SAME module and silently test nothing.
function loadTemplates(siteUrl) {
  let src = readFileSync("src/lib/email/templates.ts", "utf8");
  src = src.replace('import "server-only";', "");
  src = src.replace(
    'import { getSiteUrl } from "@/lib/site-url";',
    `export function getSiteUrl(){ return ${JSON.stringify(siteUrl)}; }`
  );
  // THE REAL ESCAPER, INLINED — not a stand-in.
  //
  // This loader stubs imports by exact string, so a new one breaks it,
  // which is what adding lib/html-escape.ts to templates.ts did. Writing
  // a local `escapeHtml` here instead would make this file test its own
  // four-line copy rather than the one templates.ts actually calls —
  // which is the ELEVEN-copies problem that produced lib/html-escape.ts
  // in the first place, reintroduced inside its own gate.
  src = src.replace(
    'import { escapeHtml } from "@/lib/html-escape";',
    readFileSync("src/lib/html-escape.ts", "utf8")
  );
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}

const mod = await loadTemplates(PROD);
const html = mod.welcomeEmailHtml({ email: "user@example.com" });
const imgMatch = html.match(/<img[^>]*ionexa-email-logo[^>]*>/);

console.log("== 1. the image is a real static file, committed to the repo ==");
checkTrue("public/ionexa-email-logo.png exists", existsSync("public/ionexa-email-logo.png"));
if (existsSync("public/ionexa-email-logo.png")) {
  const bytes = readFileSync("public/ionexa-email-logo.png");
  // PNG magic number. A dynamically generated route could return anything;
  // a committed file either is a PNG or it isn't.
  check("file is a real PNG", [...bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  checkTrue(`file is non-trivial (${statSync("public/ionexa-email-logo.png").size} bytes)`, statSync("public/ionexa-email-logo.png").size > 1000);
}
checkTrue(
  "the old dynamically-rendered /email-logo route is gone",
  !existsSync("src/app/email-logo")
);

console.log("\n== 2. the URL is one an inbox can actually fetch ==");
checkTrue("an <img> pointing at the logo is rendered", Boolean(imgMatch));
const img = imgMatch?.[0] ?? "";
const src = img.match(/src="([^"]+)"/)?.[1] ?? "";
console.log(`        src = ${src}`);
checkTrue("src is ABSOLUTE (email clients never resolve relative paths)", src.startsWith("https://"));
check("src is on the configured site origin", src, `${PROD}/ionexa-email-logo.png`);
checkTrue("src ends in .png — a real extension, not an extensionless route", src.endsWith(".png"));

console.log("\n== 3. middleware does not gate the image ==");
// This is the actual root cause of the reported bug: the matcher's
// exclusion list is extension-based, so an extensionless URL fell through
// to the auth check on every fetch.
const middleware = readFileSync("src/middleware.ts", "utf8");
const matcher = middleware.match(/matcher:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
checkTrue("matcher excludes .png", /png/.test(matcher));
checkTrue("matcher excludes .webmanifest", /webmanifest/.test(matcher));
// Reproduce the matcher against the real URL path to be sure, rather than
// trusting that the regex mentions the extension.
const negative = matcher.match(/"\/\(\(\?!([\s\S]*?)\)\.\*\)"/)?.[1];
if (negative) {
  const excluded = new RegExp(`^(?:${negative.replace(/\\\\/g, "\\")})`);
  checkTrue("/ionexa-email-logo.png matches an exclusion", excluded.test("ionexa-email-logo.png"));
  checkTrue("/manifest.webmanifest matches an exclusion", excluded.test("manifest.webmanifest"));
  check("a real page still runs middleware", excluded.test("dashboard/overview"), false);
}

console.log("\n== 4. it degrades when the client blocks images (most do) ==");
checkTrue("inline width attribute (not just CSS)", /\bwidth="56"/.test(img));
checkTrue("inline height attribute (not just CSS)", /\bheight="56"/.test(img));
checkTrue('alt text is the brand name', /alt="Ionexa AI"/.test(img));
// An unstyled alt renders as tiny default-serif dark text on a near-black
// background — present but unreadable. These make the fallback legible.
checkTrue("alt is styled with a visible colour", /color:#f97316/.test(img));
checkTrue("alt is styled with a font-size", /font-size:15px/.test(img));
checkTrue(
  "the wordmark is separate real TEXT, so the brand shows with images off",
  />Ionexa AI<\/span>/.test(html)
);

console.log("\n== 5. a non-https origin renders NO image rather than a broken one ==");
const localMod = await loadTemplates("http://localhost:3000");
const localHtml = localMod.welcomeEmailHtml({ email: "user@example.com" });
check("no <img> at all on a localhost origin", /<img[^>]*ionexa-email-logo/.test(localHtml), false);
checkTrue("the wordmark still renders", />Ionexa AI<\/span>/.test(localHtml));

console.log("\n== 6. every template that uses the layout gets the same header ==");
const prodMod = mod;
const templates = [
  ["welcomeEmailHtml", { email: "u@e.com" }],
  ["teamInviteEmailHtml", { inviterEmail: "o@e.com", acceptUrl: "https://e.com/a" }],
  ["deleteAccountConfirmationEmailHtml", { confirmUrl: "https://e.com/c" }],
  ["newDeviceLoginEmailHtml", { when: "Mon", ip: "1.2.3.4", userAgent: "Chrome" }],
];
for (const [name, args] of templates) {
  const fn = prodMod[name];
  if (typeof fn !== "function") {
    fail++;
    console.log(`  FAIL  ${name} is not exported`);
    continue;
  }
  const out = fn(args);
  checkTrue(`${name}: absolute .png logo`, out.includes(`${PROD}/ionexa-email-logo.png`));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
