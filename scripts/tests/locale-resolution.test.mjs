// WHERE THE LANGUAGE COMES FROM, and the two ways it used to come from
// nowhere.
//
// It was a cookie. Only a cookie. That is one bug wearing two faces:
//
//   the account   A language chosen on a laptop was not the language on
//                 the phone, and clearing site data reset it to English.
//                 Fixed in middleware.ts, which refreshes the cookie from
//                 raw_user_meta_data.preferred_locale on every request.
//                 Held by settings-language.prodtest.mjs, which needs a
//                 browser.
//
//   the browser   A first-time visitor from Athens or Lisbon got English
//                 on the landing page, the pricing page and the signup
//                 form — every page seen BEFORE there is an account to
//                 store anything on, and the only ones that decide
//                 whether there ever is one. Their browser had been
//                 announcing their language in every request the whole
//                 time and nothing read it.
//
// This file holds the second one. Accept-Language parsing is fiddly in
// exactly the ways that produce a plausible-looking wrong answer — q
// weights out of order, q=0 meaning "not this one", regional subtags,
// "*" — so it is a pure function with a table of cases rather than
// something inferred from a rendered page.
//
// Run: node scripts/tests/locale-resolution.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`); }
};

// request.ts imports next/headers, which cannot load outside a request.
// The parser is exported separately for exactly this reason and is lifted
// out of the source rather than imported, so the test reads the shipped
// code and not a copy of it.
const source = readFileSync("src/i18n/request.ts", "utf8");
const fnStart = source.indexOf("export function localeFromAcceptLanguage");
check("localeFromAcceptLanguage is exported from i18n/request.ts", fnStart !== -1);

const constants = await loadTs("src/i18n/constants.ts");

let localeFromAcceptLanguage;
if (fnStart !== -1) {
  // Take the function body up to its closing brace at column 0.
  const body = source.slice(fnStart).replace(/^export /, "");
  const end = body.indexOf("\n}\n");
  const src = body
    .slice(0, end + 2)
    // Strip the TypeScript annotations the Function constructor cannot parse.
    .replace(/: string \| null \| undefined/g, "")
    .replace(/: string \| null/g, "")
    .replace(/as readonly string\[\]/g, "");
  localeFromAcceptLanguage = new Function(
    "SUPPORTED_LOCALES",
    `${src}; return localeFromAcceptLanguage;`
  )(constants.SUPPORTED_LOCALES);
}

const CASES = [
  // header                                      expected  why
  ["el-GR,el;q=0.9,en;q=0.8", "el", "a Greek browser gets Greek, not the en it also accepts"],
  ["en-US,en;q=0.9", "en", "plain English"],
  ["pt-BR,pt;q=0.9,en;q=0.8", "pt", "Brazilian Portuguese is Portuguese"],
  ["zh-CN,zh;q=0.9", "zh", "a regional subtag falls back to its base"],
  ["nl-NL,nl;q=0.9,de;q=0.7", "de", "an unsupported first choice does not block a supported second"],
  ["en;q=0.4,de;q=0.9", "de", "q weights are honoured, not source order"],
  ["de;q=0,el;q=0.5", "el", "q=0 means NOT this one, which is not the same as unranked"],
  // The case that actually discriminates. In the line above, el outranks
  // de anyway, so dropping the q=0 filter entirely still produces "el" —
  // the assertion passed on broken code. A refusal has to be the ONLY
  // supported tag present for honouring it to be observable.
  ["el;q=0", null, "a language explicitly refused is not selected"],
  ["de;q=0,fr;q=0,en;q=0", null, "every supported tag refused leaves nothing"],
  ["sv,el;q=0", null, "an unsupported preference plus a refusal is still nothing"],
  ["*", null, "a wildcard expresses no preference"],
  ["sv,fi,nb", null, "nothing we serve"],
  ["", null, "empty header"],
  [null, null, "absent header"],
  ["EL-gr", "el", "case-insensitive"],
  ["ja-JP;q=0.8,en-GB;q=0.9", "en", "the higher-weighted supported tag wins across scripts"],
];

if (localeFromAcceptLanguage) {
  const wrong = [];
  for (const [header, expected, why] of CASES) {
    const got = localeFromAcceptLanguage(header);
    if (got !== expected) wrong.push(`${JSON.stringify(header)} -> ${got}, expected ${expected} (${why})`);
  }
  check(`all ${CASES.length} Accept-Language cases resolve correctly`, wrong.length === 0,
    wrong.join("\n        "));

  // Never invent a locale with no messages file: an unknown code would
  // make the dynamic import in request.ts throw at render time.
  const everyResult = CASES.map(([h]) => localeFromAcceptLanguage(h)).filter(Boolean);
  const unsupported = everyResult.filter((l) => !constants.SUPPORTED_LOCALES.includes(l));
  check("it never returns a locale with no messages file", unsupported.length === 0,
    unsupported.join(", "));
}

// ORDER OF PRECEDENCE, read from the source. The cookie has to win: it is
// what both selectors write and what middleware refreshes from the
// account, so a header that outranked it would undo an explicit choice on
// every request.
check("the cookie is consulted before Accept-Language",
  source.indexOf("LOCALE_COOKIE") < source.indexOf("accept-language"));
check("Accept-Language is only a fallback, not an override",
  /includes\(chosen \?\? ""\)/.test(source) && /localeFromAcceptLanguage\(headers\(\)/.test(source));
check("English is the last resort",
  /\?\? DEFAULT_LOCALE/.test(source));
// The account is authoritative but must NOT be read here: this runs on
// every server render and an auth round trip per page is the cost that
// design exists to avoid.
//
// COMMENTS ARE STRIPPED FIRST. The file explains WHY there is no auth
// lookup, which means it contains the word "getUser" — so a scan of the
// raw source flags the very sentence documenting the property it is
// checking. Narrowing to executable code makes the check mean what it
// says instead of matching prose.
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");
check("no auth lookup happens on the render path",
  !/supabase|getUser|createClient|createServerClient/i.test(code),
  code.split("\n").filter((l) => /supabase|getUser|createClient/i.test(l)).join(" | "));

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILED: " + failures.join(" | "));
  process.exit(1);
}
