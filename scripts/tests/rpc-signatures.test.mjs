// Every .rpc() call, matched against the function's REAL signature.
//
// A parameter named wrong does not fail to compile, does not fail tsc,
// and does not fail any type check: Supabase sends the object as-is and
// PostgREST answers "Could not find the function public.x(...) in the
// schema cache" — at runtime, in production, on a feature that worked
// when it was written. There is no compiler on this edge; this file is
// the compiler.
//
// A NOTE ON THE INSTRUMENT, because the first version of it was wrong.
// It read the argument object with /\{([^}]*)\}/, which stops at the
// first closing brace — so `kinds.length > 0 ? kinds : null` made it
// report `kinds` as a parameter name and call a correct call site a bug.
// Braces are balanced here and only TOP-LEVEL keys are read. Section 3
// proves the parser survives that shape.
//
// Run: node scripts/tests/rpc-signatures.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
}

const stripSql = (s) => s.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const stripTs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Top-level keys of the object literal beginning at `start`. */
export function topLevelKeys(text, start) {
  let depth = 0, body = "";
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "{") { depth++; if (depth === 1) continue; }
    if (c === "}") { depth--; if (depth === 0) break; }
    if (depth >= 1) body += c;
  }
  const keys = []; let d = 0, cur = "";
  for (const c of body) {
    if ("{[(".includes(c)) d++;
    if ("}])".includes(c)) d--;
    if (c === "," && d === 0) { keys.push(cur); cur = ""; } else cur += c;
  }
  keys.push(cur);
  return keys.map((k) => (k.match(/^\s*(\w+)\s*:/) || [])[1]).filter(Boolean);
}


/** Split a parameter list on TOP-LEVEL commas only.
 *
 *  `p_period date default (date_trunc('month', now() at time zone 'utc'))::date`
 *  contains a comma INSIDE its default expression. Splitting on every
 *  comma turned that one parameter into two and reported the fragment
 *  `now() ...` as a required parameter the caller had omitted — a
 *  confident, entirely fictional finding. */
export function splitParams(list) {
  const out = []; let d = 0, cur = "", q = null;
  for (const c of list) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if ("([{".includes(c)) d++;
    if (")]}".includes(c)) d--;
    if (c === "," && d === 0) { out.push(cur); cur = ""; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** The parameter list of one function, from the whole migration corpus.
 *  `returns` may sit on the same line as the closing paren — record_site_view
 *  does exactly that, and requiring a newline made the match fall through
 *  to a greedy one that spanned three other functions. */
export function signatureOf(corpus, name) {
  const m = corpus.match(
    new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${name}\\s*\\(([\\s\\S]*?)\\)\\s*returns`, "i")
  );
  return m ? splitParams(m[1]) : null;
}

const sigs = {};
for (const f of readdirSync("supabase/migrations")) {
  const s = stripSql(readFileSync(path.join("supabase/migrations", f), "utf8"));
  for (const m of s.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\)\s*returns/gi)) {
    sigs[m[1]] = splitParams(m[2]).map((p) => (p.match(/^(\w+)/) || [])[1]).filter(Boolean);
  }
}

const files = [];
(function walk(d) { for (const e of readdirSync(d)) { const p = path.join(d, e);
  if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(p)) files.push(p); } })("src");

console.log("== 1. the signatures were actually read ==");
check(`function signatures parsed from the migrations (${Object.keys(sigs).length})`, Object.keys(sigs).length >= 20);
check("a known one has its real parameters", (sigs.reserve_credits ?? []).includes("p_user_id"), JSON.stringify(sigs.reserve_credits));

console.log("\n== 2. every call site matches its signature ==");
const sites = [];
for (const f of files) {
  const text = stripTs(readFileSync(f, "utf8"));
  for (const m of text.matchAll(/\.rpc\(\s*["'`](\w+)["'`]\s*,/g)) {
    const brace = text.indexOf("{", m.index + m[0].length);
    if (brace < 0) continue;
    sites.push({ file: f, fn: m[1], keys: topLevelKeys(text, brace) });
  }
}
check(`call sites found (${sites.length})`, sites.length >= 20, "the scan found almost nothing — check the matcher");
const noSig = sites.filter((s) => !sigs[s.fn]);
check("every called function is defined by a migration", noSig.length === 0,
  noSig.map((s) => `${s.file}: ${s.fn}`).join("\n        "));
const mismatched = sites.filter((s) => sigs[s.fn] && s.keys.some((k) => !sigs[s.fn].includes(k)));
check("every argument name exists in the signature", mismatched.length === 0,
  mismatched.map((s) => `${s.file}: ${s.fn} passes ${s.keys.filter((k) => !sigs[s.fn].includes(k)).join(", ")} — signature has ${sigs[s.fn].join(", ")}`).join("\n        "));
// AND the other direction: a required parameter left out is the same
// runtime failure, so anything without a DEFAULT must be supplied.
const CORPUS = stripSql(
  readdirSync("supabase/migrations").map((f) => readFileSync(path.join("supabase/migrations", f), "utf8")).join("\n")
);
const missingRequired = [];
for (const s of sites) {
  const params = signatureOf(CORPUS, s.fn);
  if (!params) continue;
  const required = params.filter((p) => !/\bdefault\b/i.test(p)).map((p) => (p.match(/^(\w+)/) || [])[1]).filter(Boolean);
  const absent = required.filter((r) => !s.keys.includes(r));
  if (absent.length) missingRequired.push(`${s.file}: ${s.fn} omits ${absent.join(", ")} — signature: ${params.join(" | ")}`);
}
check("no required parameter is omitted", missingRequired.length === 0, missingRequired.join("\n        "));

console.log("\n== 3. the parsers survive the shapes that fooled their first drafts ==");
// A default expression containing a comma is ONE parameter.
{
  const one = splitParams("p_period date default (date_trunc('month', now() at time zone 'utc'))::date");
  check(`a comma inside a default does not split the parameter (${one.length})`, one.length === 1, JSON.stringify(one));
  const three = splitParams("p_site_id uuid,\n  p_user_id uuid,\n  p_is_unique boolean");
  check(`three plain parameters split into three (${three.length})`, three.length === 3, JSON.stringify(three));
}
// `) returns void` on one line is a signature too.
{
  const params = signatureOf("create or replace function public.record_site_view(\n  p_site_id uuid,\n  p_user_id uuid,\n  p_is_unique boolean\n) returns void\nlanguage plpgsql", "record_site_view");
  check("a same-line `) returns` is matched", JSON.stringify(params) === JSON.stringify(["p_site_id uuid", "p_user_id uuid", "p_is_unique boolean"]), JSON.stringify(params));
}

const TRICKY = `x.rpc("search_all", {
  p_query: q,
  p_kinds: kinds.length > 0 ? kinds : null,
  p_module: { nested: "value" },
  p_limit: fn({ a: 1, b: [2, 3] }),
});`;
const got = topLevelKeys(TRICKY, TRICKY.indexOf("{", TRICKY.indexOf(",")));
check(`a ternary does not leak its operand (${got.join(",")})`,
  JSON.stringify(got) === JSON.stringify(["p_query", "p_kinds", "p_module", "p_limit"]), JSON.stringify(got));
check("a nested object's keys are not counted", !got.includes("nested"));
check("an argument object inside a call is not counted", !got.includes("a") && !got.includes("b"));

console.log(
  failures.length === 0 ? `\nALL ${pass} CHECKS PASSED`
  : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ` + failures.join("\n  - ")
);
process.exit(failures.length === 0 ? 0 : 1);
