/*
 * THE WHOLE SITE, DOWNLOADED, OPENED BY SOMETHING ELSE (package 10): the
 * archive lib/websites/site-download.ts makes is handed to Python's
 * zipfile, which checks every checksum (testzip) and reads every page —
 * an archive our own reader accepts and a real tool refuses is a download
 * nobody can open.
 *
 * Run: node scripts/tests/site-pages.itest.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
}

const dl = await loadTs("src/lib/websites/site-download.ts");
console.log("site-pages (the download, opened by Python)");

const doc = (body) => `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"><title>Αύρα</title></head><body>${body}</body></html>`;
const nav = '<nav><a href=".">Αρχική</a><a href="menu">Μενού</a><a href="contact">Επικοινωνία</a></nav>';
const out = dl.siteDownload({
  name: "Αύρα Νάξος",
  html_content: doc(nav + "<h1>Καλώς ήρθατε</h1>"),
  pages: [
    { slug: "menu", label: "Μενού", html: doc(nav + "<h1>Μενού</h1>") },
    { slug: "contact", label: "Επικοινωνία", html: doc(nav + "<h1>Επικοινωνία</h1>") },
  ],
});
const dir = mkdtempSync(path.join(tmpdir(), "site-pages-"));
const file = path.join(dir, out.filename);
writeFileSync(file, out.data);
const py = spawnSync(
  "python3",
  ["-I", "-c", [
    "import sys, zipfile, json",
    "z = zipfile.ZipFile(sys.argv[1])",
    "bad = z.testzip()",
    "print(json.dumps({'bad': bad, 'names': z.namelist(), 'pages': {n: z.read(n).decode('utf-8') for n in z.namelist()}}))",
  ].join("\n"), file],
  { encoding: "utf8" }
);
rmSync(dir, { recursive: true, force: true });
let read = null;
try { read = JSON.parse(py.stdout); } catch {}
check("Python opens the archive", py.status === 0 && read !== null, py.stderr.slice(0, 300));
check("...every checksum is right", read?.bad === null);
check("...the files are the site's pages", read?.names.join(",") === "index.html,menu.html,contact.html", read?.names.join(","));
check("...in Greek, whole", read?.pages["menu.html"].includes("<h1>Μενού</h1>") && read?.pages["index.html"].includes("Καλώς ήρθατε"));
check("...linked to each other as files", read?.pages["contact.html"].includes('href="menu.html"') && read?.pages["contact.html"].includes('href="index.html"'));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
