// Does host-and-word-boundaries.test.mjs catch the substring checks coming
// back?
//
// All four defects it exists for are ONE-LINE reversions — `includes` for a
// parsed host, `\w` for a letter class, `[.;\n·]` for a splitter that knows
// what a decimal is. A gate over source that reports PASS looks identical
// whether it is checking the right thing or nothing, so each mutation below
// puts one back. Two controls must stay GREEN.
//
// Every mutation runs against a COPY. Nothing here edits the repository.
//
// Run: node scripts/tests/host-and-word-boundaries.mutation.mjs
import { readFileSync, cpSync, rmSync, mkdtempSync, symlinkSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const GATE = "scripts/tests/host-and-word-boundaries.test.mjs";
const LOADER = "scripts/tests/load-ts.mjs";
const SCAN = "src/lib/website-html-security-scan.ts";
const SERVING = "src/lib/publishing/public-serving.ts";
const RULES = "src/lib/trading/rules.ts";

let caught = 0;
let missed = 0;

function run(name, edits, expectRed = true) {
  const dir = mkdtempSync(path.join(tmpdir(), "hwbmut-"));
  try {
    // The whole tree, because loadTs resolves @/ imports and the gate
    // reaches three modules that reach further.
    cpSync(path.join(ROOT, "src"), path.join(dir, "src"), { recursive: true });
    cpSync(path.join(ROOT, "scripts"), path.join(dir, "scripts"), { recursive: true });
    for (const f of ["package.json", "tsconfig.json"]) {
      try { cpSync(path.join(ROOT, f), path.join(dir, f)); } catch {}
    }
    // SYMLINKED, NOT COPIED. node_modules is tens of thousands of files
    // and copying it once per mutation made this suite time out rather
    // than fail — a mutation harness slow enough that nobody runs it is a
    // mutation harness that catches nothing.
    try { symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir"); } catch {}

    for (const [file, from, to] of edits) {
      const p = path.join(dir, file);
      const before = readFileSync(p, "utf8");
      if (!before.includes(from)) {
        console.log(`  ERROR ${name}: target not found in ${file}`);
        missed++;
        return;
      }
      writeFileSync(p, before.replace(from, to));
    }

    let red = false;
    let out = "";
    try {
      execFileSync(process.execPath, [GATE], { cwd: dir, encoding: "utf8", stdio: "pipe" });
    } catch (err) {
      red = true;
      out = String(err.stdout ?? "") + String(err.stderr ?? "");
    }

    if (red === expectRed) {
      caught++;
      const line = out.split("\n").find((l) => l.includes("FAIL  ")) ?? "";
      console.log(`  ${expectRed ? "CAUGHT " : "GREEN  "} ${name}${line ? `\n          -> ${line.trim()}` : ""}`);
    } else {
      missed++;
      console.log(`  ${expectRed ? "MISSED " : "FALSE+ "} ${name}  <- gate ${red ? "went red" : "stayed green"}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("host-and-word-boundaries mutations\n");

// 1. THE ORIGINAL IFRAME BUG: substring against the whole URL.
run("the iframe check goes back to src.includes(host)", [
  [
    SCAN,
    `  const url = parseHttpUrl(src);
  if (!url) return false;
  const hostname = url.hostname.toLowerCase();
  return ALLOWED_IFRAME_EMBEDS.some(
    (embed) =>
      hostname === embed.host &&
      (!embed.pathPrefix ||
        url.pathname === embed.pathPrefix ||
        url.pathname.startsWith(\`\${embed.pathPrefix}/\`))
  );`,
    "  return ALLOWED_IFRAME_EMBEDS.some((embed) => src.includes(embed.host));",
  ],
]);

// 2. Parsed, but the host compared with endsWith — the lookalike gets in.
run("the iframe host check loosens to endsWith", [
  [SCAN, "      hostname === embed.host &&", "      hostname.endsWith(embed.host) &&"],
]);

// 3. The path constraint on Google dropped: all of google.com becomes an embed.
run("the /maps path constraint is dropped", [
  [
    SCAN,
    `      (!embed.pathPrefix ||
        url.pathname === embed.pathPrefix ||
        url.pathname.startsWith(\`\${embed.pathPrefix}/\`))`,
    "      true",
  ],
]);

// 4. THE ORIGINAL FORM BUG: substring against the whole URL.
run("the form check goes back to action.includes(path)", [
  [
    SCAN,
    `  const pathOk =
    url.pathname.startsWith(FORM_ACTION_PATH_PREFIX) &&
    url.pathname.endsWith(FORM_ACTION_PATH_SUFFIX);
  if (!pathOk) return true;
  if (!appHost) return false;
  return url.hostname.toLowerCase() !== appHost.toLowerCase();`,
    "  return !raw.includes(FORM_ACTION_PATH_PREFIX);",
  ],
]);

// 5. Path checked, host ignored — evil.example/api/websites/x/submit-form.
run("the form check stops comparing the host", [
  [SCAN, "  if (!appHost) return false;\n  return url.hostname.toLowerCase() !== appHost.toLowerCase();", "  return false;"],
]);

// 6. THE TWO LISTS DRIFT APART again — the state the comment denied.
run("the CSP frame-src stops being built from the allowlist", [
  [
    SERVING,
    "  `frame-src ${ALLOWED_IFRAME_EMBEDS.map((embed) => `https://${embed.host}`).join(\" \")}`,",
    '  "frame-src https://www.google.com https://maps.google.com https://www.youtube.com",',
  ],
]);

// 7. THE ASCII \w comes back on the alternative that died from it.
run("the Greek daily-loss alternative goes back to ASCII \\w", [
  [
    RULES,
    "ζημι[\\p{L}\\p{N}_]*\\s*τη[νσ]?\\s*(?:μερα|ημερα))[^\\d]*(\\d+(?:[.,]\\d+)?)/u",
    "ζημι\\w*\\s*τη[νσ]?\\s*(?:μερα|ημερα))[^\\d]*(\\d+(?:[.,]\\d+)?)/",
  ],
]);

// 8. THE DECIMAL SPLIT comes back — the one that DOUBLED the risk.
run("the splitter goes back to splitting on every full stop", [
  [RULES, '    .split(/[;\\n·]+|\\.(?!\\d)/)', "    .split(/[.;\\n·]+/)"],
]);

// 9. Over-corrected: stops splitting on full stops at all. Every decimal
//    check above passes; the feature quietly loses multi-sentence rules.
run("the splitter over-corrects and never splits on a full stop", [
  [RULES, '    .split(/[;\\n·]+|\\.(?!\\d)/)', "    .split(/[;\\n·]+/)"],
]);

// ---- controls ----

run(
  "CONTROL: a comment is added beside the iframe check",
  [[SCAN, "function isAllowedIframeSrc(src: string): boolean {", "function isAllowedIframeSrc(src: string): boolean {\n  // exact host, parsed"]],
  false
);
run(
  "CONTROL: the allowlist gains a real new host in both places",
  [[SCAN, '  { host: "player.vimeo.com" },', '  { host: "player.vimeo.com" },\n  { host: "www.openstreetmap.org" },']],
  false
);

console.log(`\n${missed === 0 ? "PASS" : "FAIL"}  ${caught} correct, ${missed} wrong`);
process.exit(missed === 0 ? 0 : 1);
