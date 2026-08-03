// TEMPORARY audit script — grep entire src/ for Greek Unicode characters
// in .ts/.tsx files, classify each match as i18n-dictionary (OK) vs
// hardcoded-in-component (bug). Deleted after use, per the task brief.
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

const GREEK_RE = /[Ͱ-Ͽἀ-῿]/;
const ROOT = "src";
const I18N_DIR = join("src", "i18n", "messages");

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "__tmp_repro__" || entry === "node_modules") continue;
      walk(full, files);
    } else if ([".ts", ".tsx"].includes(extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

const files = walk(ROOT);
const results = [];

for (const file of files) {
  const isI18nFile = file.startsWith(I18N_DIR) || file.includes("/i18n/");
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, idx) => {
    if (GREEK_RE.test(line)) {
      results.push({
        file,
        line: idx + 1,
        text: line.trim().slice(0, 200),
        isI18nFile,
      });
    }
  });
}

const hardcoded = results.filter((r) => !r.isI18nFile);
const i18n = results.filter((r) => r.isI18nFile);

console.log(`Total Greek-character matches: ${results.length}`);
console.log(`  In i18n message files (expected/OK): ${i18n.length}`);
console.log(`  OUTSIDE i18n files (potential bugs): ${hardcoded.length}`);
console.log("\n=== HARDCODED (non-i18n) MATCHES ===");
for (const r of hardcoded) {
  console.log(`${r.file}:${r.line}: ${r.text}`);
}
