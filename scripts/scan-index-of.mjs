#!/usr/bin/env node
/*
 * WHAT HAPPENS WHEN A SEARCH FINDS NOTHING?
 *
 * indexOf, lastIndexOf, search and findIndex all answer "not here" with
 * -1, and -1 is a valid array index counting from the end and a valid
 * argument to slice, substring and splice. So the not-found answer does
 * not throw, does not warn, and does not look wrong: it silently means
 * something ELSE.
 *
 *   text.slice(text.indexOf("{") + 1)      // 0 when absent: the whole string
 *   parts[parts.indexOf(x) - 1]            // parts[-2]: undefined
 *   name.substring(name.lastIndexOf("."))  // the whole filename
 *
 * This lists every call and says how its result is used, so the ones where
 * -1 is never handled can be read rather than guessed at. It reports, it
 * does not judge: a call whose result is compared to -1, or guarded with
 * `>= 0` / `< 0`, or passed to Math.max, is handled by construction.
 *
 * Run: node scripts/scan-index-of.mjs [--json]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const FINDERS = new Set([
  "indexOf",
  "lastIndexOf",
  "findIndex",
  "findLastIndex",
  "search",
]);

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * How the value of `node` is consumed by its parent.
 *
 * "compared"  — measured against -1, 0 or another number, or negated.
 *               The not-found case is a branch somebody wrote.
 * "clamped"   — wrapped in Math.max, which is the other correct handling.
 * "arithmetic"— +1, -1, etc. THE INTERESTING ONE: -1 + 1 is 0, and 0 is a
 *               perfectly ordinary index.
 * "index"     — used as a[i] or as an argument to slice/substring/splice.
 * "assigned"  — stored in a variable; the check has to follow that name.
 * "returned"  — handed to a caller.
 * "other"     — anything else.
 */
function consumption(node) {
  const p = node.parent;
  if (!p) return "other";
  if (ts.isBinaryExpression(p)) {
    const op = p.operatorToken.kind;
    if (
      op === ts.SyntaxKind.EqualsEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      op === ts.SyntaxKind.LessThanToken ||
      op === ts.SyntaxKind.LessThanEqualsToken ||
      op === ts.SyntaxKind.GreaterThanToken ||
      op === ts.SyntaxKind.GreaterThanEqualsToken
    ) {
      return "compared";
    }
    if (
      op === ts.SyntaxKind.PlusToken ||
      op === ts.SyntaxKind.MinusToken ||
      op === ts.SyntaxKind.AsteriskToken ||
      op === ts.SyntaxKind.SlashToken
    ) {
      return "arithmetic";
    }
    if (op === ts.SyntaxKind.EqualsToken) return "assigned";
    return "other";
  }
  if (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) {
    return "compared";
  }
  if (ts.isVariableDeclaration(p)) return "assigned";
  if (ts.isReturnStatement(p)) return "returned";
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return "index";
  if (ts.isCallExpression(p)) {
    const callee = p.expression;
    const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
    if (name === "max" || name === "min") return "clamped";
    if (["slice", "substring", "substr", "splice", "charAt", "at"].includes(name)) return "index";
    return "other";
  }
  if (ts.isConditionalExpression(p) && p.condition === node) return "compared";
  if (ts.isIfStatement(p) && p.expression === node) return "compared";
  return "other";
}

const hits = [];
for (const file of walk("src")) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      FINDERS.has(node.expression.name.text)
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      hits.push({
        file,
        line: line + 1,
        method: node.expression.name.text,
        use: consumption(node),
        text: text.split("\n")[line].trim().slice(0, 120),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ hits }, null, 2));
} else {
  const byUse = new Map();
  for (const h of hits) byUse.set(h.use, [...(byUse.get(h.use) ?? []), h]);
  for (const [use, list] of [...byUse].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n== ${use} (${list.length}) ==`);
    for (const h of list) console.log(`  ${h.file}:${h.line}  ${h.method}  ${h.text}`);
  }
  console.log(`\nTOTAL ${hits.length} search calls in src/`);
}
