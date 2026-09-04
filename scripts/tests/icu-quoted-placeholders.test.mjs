// "No matches for '{query}'" NEVER SHOWED THE QUERY.
//
// In ICU MessageFormat the single quote is the escape character: '{query}'
// is the literal text {query}, in every language, whatever value is
// passed. Two keys (common.noMatches, module.noMatches) were written that
// way in all ten locales and rendered "No matches for {query}" on the
// command palette, the module lists, the agents search, the template
// browser and the file browser — seen on production on 2026-09-04 by a
// probe that had gone there for something else. The strings look right in
// the JSON; only a render shows it.
//
// So this file renders. Section 1 proves the ICU behaviour with the same
// formatter next-intl uses (the claim, before the check that depends on
// it). Section 2 renders the two keys in every locale with a real query
// and requires the query to come out. Section 3 scans every locale for
// the escaped shape. Section 4 checks the build gate carries the rule, so
// the next such string fails `npm run build` rather than a reader.
//
// Run: node scripts/tests/icu-quoted-placeholders.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const IntlMessageFormat = require("intl-messageformat").default ?? require("intl-messageformat").IntlMessageFormat;

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

const flatten = (obj, prefix = "") =>
  Object.entries(obj).reduce((out, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v, key));
    else out[key] = String(v);
    return out;
  }, {});

const render = (message, locale, values) => new IntlMessageFormat(message, locale).format(values);

// ---------------------------------------------------------------------
console.log("== 1. what ICU does with a quoted placeholder ==");
check(
  "'{query}' renders the literal text {query} — the quotes escape the braces",
  render("No matches for '{query}'", "en", { query: "καφε" }) === "No matches for {query}"
);
check(
  "''{query}'' renders the value inside real quotes",
  render("No matches for ''{query}''", "en", { query: "καφε" }) === "No matches for 'καφε'"
);
check(
  "“{query}” renders the value inside typographic quotes",
  render("No matches for “{query}”", "en", { query: "καφε" }) === "No matches for “καφε”"
);

// ---------------------------------------------------------------------
console.log("\n== 2. the two keys that were wrong render the query in every locale ==");
const locales = readdirSync("messages")
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();
check(`ten locales found (${locales.join(", ")})`, locales.length === 10, String(locales.length));
const messages = Object.fromEntries(locales.map((l) => [l, flatten(JSON.parse(readFileSync(`messages/${l}.json`, "utf8")))]));
for (const key of ["common.noMatches", "module.noMatches"]) {
  for (const loc of locales) {
    const msg = messages[loc][key];
    let out = null;
    try {
      out = render(msg, loc, { query: "καφε" });
    } catch (e) {
      out = `ERROR ${e.message}`;
    }
    check(`${loc} ${key} shows the query`, typeof out === "string" && out.includes("καφε") && !out.includes("{query}"), `${JSON.stringify(msg)} -> ${JSON.stringify(out)}`);
  }
}

// ---------------------------------------------------------------------
console.log("\n== 3. no locale wraps a placeholder in single quotes ==");
const ESCAPED = /(^|[^'])'\{[A-Za-z_]+\}'(?!')/;
const offenders = [];
for (const loc of locales) {
  for (const [key, value] of Object.entries(messages[loc])) if (ESCAPED.test(value)) offenders.push(`${loc}:${key} = ${value}`);
}
check("no locale wraps a placeholder in single quotes", offenders.length === 0, offenders.slice(0, 6).join("\n        "));
check("...and the scan sees a placeholder at all (it is not vacuous)", Object.values(messages.en).some((v) => /\{[A-Za-z_]+\}/.test(v)));

// ---------------------------------------------------------------------
console.log("\n== 4. the build gate carries the rule ==");
const gate = readFileSync("scripts/check-i18n.js", "utf8");
check(
  "the build gate carries the escaped-placeholder rule",
  /ESCAPED_PLACEHOLDER = \/\(\^\|\[\^'\]\)'\\\{\[A-Za-z_\]\+\\\}'\(\?!'\)\//.test(gate) && /ESCAPED PLACEHOLDER/.test(gate),
  "scripts/check-i18n.js no longer fails a locale on '{x}'"
);
check("...and it scans English too, not only the translations", /for \(const loc of \["en", \.\.\.LOCALES\]\)/.test(gate));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
