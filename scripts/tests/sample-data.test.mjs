// THE SAMPLE ACCOUNT: is it real enough to be worth loading, and safe
// enough to be worth removing?
//
// V4.6 #6. An empty product is an invisible product, so there is a button
// that fills the account with a small Greek design studio's last three
// months. Two things have to hold, and they pull in opposite directions:
// the data has to be convincing enough that the charts and the chat have
// something to say, and it has to be removable without a trace.
//
// THE DANGEROUS ONE IS THE REMOVAL, and it is a one-line ordering bug
// waiting to happen. `import_id` is `on delete set null` on every module
// table — correct for a CSV, because deleting an import record must not
// delete a user's own rows. Delete the user_imports row FIRST and the
// thirty-six sample rows survive with import_id = NULL, which is exactly
// the shape of a row somebody typed by hand. The sample would become
// real, permanently, and nothing downstream could tell.
//
// Run: node scripts/tests/sample-data.test.mjs
import { readFileSync, existsSync, readdirSync } from "node:fs";
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
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

// ---------------------------------------------------------------------
console.log("== 0. the dataset is reusable — no database in it ==");
// CHECKED BEFORE IT IS LOADED, and the order is the point.
//
// The brief asks for this same data to serve a signed-out demo later, so
// the module must not reach for a database. Its own mutation suite is
// what proved the check had to move: adding
// `import { createClient } from "@/lib/supabase/server"` made loadTs
// THROW — scripts/tests refuse external node_modules imports — so the
// gate died before it could say anything, and a crash names nothing. The
// source is read as text first, so the failure is a sentence rather than
// a stack trace.
const datasetSrc = readFileSync("src/lib/sample-data/dataset.ts", "utf8");
check(
  "dataset.ts imports nothing at all",
  !/^\s*import\s/m.test(stripComments(datasetSrc)),
  stripComments(datasetSrc).match(/^\s*import\s.*$/m)?.[0] ?? ""
);
check(
  "...and calls no clock of its own",
  !/Date\.now\(\)|new Date\(\s*\)/.test(stripComments(datasetSrc)),
  "a dataset that reads the clock cannot be materialised at a fixed moment"
);
if (failures.length > 0) {
  // Loading it now would throw rather than report, which is what the
  // mutation suite caught. Stop with the sentence already printed.
  console.log(`\nFAILURES: ${pass} passed, ${failures.length} failed`);
  process.exit(1);
}

const { SAMPLE_TABLES, SAMPLE_ROW_COUNT, SAMPLE_SPAN_DAYS, materialiseSampleData } =
  await loadTs("src/lib/sample-data/dataset.ts");

// ---------------------------------------------------------------------
console.log("\n== 1. the dataset is the size and shape the brief asked for ==");
check(
  `${SAMPLE_ROW_COUNT} rows, wanted 30-40`,
  SAMPLE_ROW_COUNT >= 30 && SAMPLE_ROW_COUNT <= 40,
  String(SAMPLE_ROW_COUNT)
);
check(
  `${SAMPLE_TABLES.length} modules, wanted 3-4`,
  SAMPLE_TABLES.length >= 3 && SAMPLE_TABLES.length <= 4,
  SAMPLE_TABLES.map((t) => t.slug).join(", ")
);
check(
  `spread over ${SAMPLE_SPAN_DAYS} days, wanted 60+ so a chart has a shape`,
  SAMPLE_SPAN_DAYS >= 60,
  `${SAMPLE_SPAN_DAYS} days`
);
// EVERY MODULE HAS ENOUGH TO SAY SOMETHING. Four modules where one holds
// thirty rows and three hold two is not four modules of data.
for (const t of SAMPLE_TABLES) {
  check(`${t.slug}: ${t.rows.length} rows`, t.rows.length >= 5, String(t.rows.length));
}

console.log("\n== 2. it reads as a real business, in Greek, in euros ==");
const allText = SAMPLE_TABLES.flatMap((t) =>
  t.rows.flatMap((r) => Object.values(r).filter((v) => typeof v === "string"))
).join(" ");
check(
  "the text is Greek",
  /[Ͱ-Ͽ]/.test(allText),
  "no Greek characters anywhere — the sample is for a Greek-speaking user"
);
const money = SAMPLE_TABLES.find((t) => t.table === "finance_entries");
check("there is a money module", Boolean(money));
const amounts = money.rows.map((r) => Number(r.amount));
check(
  `${amounts.length} amounts, none round-numbered into implausibility`,
  amounts.every((a) => a > 0 && a < 20000),
  amounts.filter((a) => !(a > 0 && a < 20000)).join(", ")
);
// REPEATED AMOUNTS ARE REALISM, NOT LAZINESS — and the first version of
// this check called them laziness. Rent is the same number every month;
// a dataset where it is not is a dataset nobody believes. What must vary
// is the INCOME, because every invoice is a different job, and a column
// of identical invoices is the tell.
const invoiceAmounts = money.rows.filter((r) => r.type === "income").map((r) => Number(r.amount));
check(
  `${new Set(invoiceAmounts).size} of ${invoiceAmounts.length} invoices are for different amounts`,
  new Set(invoiceAmounts).size >= invoiceAmounts.length - 1,
  `${new Set(invoiceAmounts).size} distinct — a column of identical invoices reads as generated`
);
// And the costs repeat, which is what makes them costs.
const costAmounts = money.rows.filter((r) => r.type === "expense").map((r) => Number(r.amount));
check(
  "and at least one cost recurs, the way a rent does",
  costAmounts.length !== new Set(costAmounts).size,
  `${new Set(costAmounts).size} distinct out of ${costAmounts.length} — nothing recurs, so there are no standing costs`
);
// BOTH DIRECTIONS OF MONEY, or "expenses" is a heading with nothing
// under it and the chat cannot answer a question about profit.
const types = new Set(money.rows.map((r) => r.type));
check("income AND expenses", types.has("income") && types.has("expense"), [...types].join(", "));
const income = money.rows.filter((r) => r.type === "income").length;
const expense = money.rows.filter((r) => r.type === "expense").length;
check(`${income} invoices and ${expense} costs`, income >= 8 && expense >= 4, `${income}/${expense}`);
// NAMES THAT RECUR, because "who is my biggest customer" is only
// answerable if somebody appears more than once.
const leads = SAMPLE_TABLES.find((t) => t.table === "leads");
check("there is a customer module", Boolean(leads));
const recurring = leads.rows.filter((l) =>
  money.rows.some((m) => String(m.description).includes(String(l.lead_name)))
);
check(
  `${recurring.length} customers appear in the money module too`,
  recurring.length >= 4,
  "a question about a named customer's revenue has nothing to join on"
);

console.log("\n== 3. materialising is pure, and spreads the dates ==");
const FIXED = Date.UTC(2026, 5, 1, 12, 0, 0);
const a = materialiseSampleData(FIXED);
const b = materialiseSampleData(FIXED);
check("same moment in, same rows out", JSON.stringify(a) === JSON.stringify(b));
const stamps = a.flatMap((t) => t.rows.map((r) => Date.parse(r.created_at)));
check(`every row has a real timestamp (${stamps.length})`, stamps.every((s) => Number.isFinite(s)));
check("none of them is in the future", stamps.every((s) => s <= FIXED), String(Math.max(...stamps)));
check(
  `the oldest is ${Math.round((FIXED - Math.min(...stamps)) / 86400000)} days back`,
  FIXED - Math.min(...stamps) >= 60 * 86400000
);
// NOT ALL AT MIDNIGHT. A day's rows stacking on the same instant makes
// every by-hour view look broken, and it is what tells somebody the data
// is fake before they have read a word of it.
const hours = new Set(stamps.map((s) => new Date(s).getUTCHours()));
check(`${hours.size} distinct hours of day`, hours.size >= 5, [...hours].join(", "));
// AND THE DATASET DOES NOT CARRY user_id OR import_id. Those are stamped
// from the session at write time; a dataset that carried them would be a
// dataset that could write into somebody else's account.
const leaked = a.flatMap((t) =>
  t.rows.filter((r) => "user_id" in r || "import_id" in r).map(() => t.table)
);
check("no row carries a user_id or import_id", leaked.length === 0, leaked.join(", "));

console.log("\n== 5. THE REMOVAL ORDER — rows before the record ==");
const applySrc = stripComments(readFileSync("src/lib/sample-data/apply.ts", "utf8"));
const clearBody = applySrc.slice(applySrc.indexOf("export async function clearSampleData"));
check("clearSampleData exists", clearBody.length > 100);
const rowsDeleteAt = clearBody.search(/\.from\(t\.table\)\s*\n?\s*\.delete\(/);
const importDeleteAt = clearBody.search(/\.from\("user_imports"\)\s*\n?\s*\.delete\(/);
check("it deletes module rows", rowsDeleteAt !== -1);
check("it deletes the import record", importDeleteAt !== -1);
// -1 IN A POSITION COMPARISON IS A SILENT PASS. Both are asserted found
// above, so this only runs on two real positions — but the guard is
// written out because `-1 < anything` is exactly how this check would
// lie if one of them stopped matching.
check(
  "and the rows go FIRST",
  rowsDeleteAt !== -1 && importDeleteAt !== -1 && rowsDeleteAt < importDeleteAt,
  `rows at ${rowsDeleteAt}, import record at ${importDeleteAt} — reversed, the sample survives with import_id = NULL and becomes indistinguishable from the user's own rows`
);
check(
  "every row delete is scoped to the user AND the import",
  /\.eq\("user_id", userId\)\s*\n?\s*\.eq\("import_id", existing\.id\)/.test(clearBody),
  "a delete scoped to one of the two either leaves the sample or takes real rows with it"
);

console.log("\n== 6. nothing here spends credits ==");
const routeSrc = stripComments(readFileSync("src/app/api/sample-data/route.ts", "utf8"));
check(
  "the route imports nothing from billing",
  !/@\/lib\/billing/.test(routeSrc),
  "loading a constant must not be able to charge"
);
check(
  "...and neither does the loader",
  !/@\/lib\/billing|reserveCredits|deductCredits/.test(applySrc),
  applySrc.match(/.*(reserveCredits|deductCredits).*/)?.[0] ?? ""
);
check(
  "the button says it is free",
  /loadFree/.test(readFileSync("src/components/sample-data/load-sample-button.tsx", "utf8")),
  "a button that might cost something and does not say is the fault V4.6 keeps finding"
);

console.log("\n== 7. the marker is on every page, not just Home ==");
const layoutSrc = stripComments(readFileSync("src/app/dashboard/layout.tsx", "utf8"));
check(
  "the banner renders from the dashboard layout",
  /<SampleDataBanner\s*\/>/.test(layoutSrc),
  "rendered from a page, it is absent on every other page while the data is still there"
);
const bannerSrc = readFileSync("src/components/sample-data/sample-data-banner.tsx", "utf8");
check(
  "and it cannot be dismissed",
  !/dismiss|onClose|setHidden|localStorage/.test(stripComments(bannerSrc)),
  "a banner you can close is absent while the thing it warns about is still true"
);
check(
  "the way out is on the banner itself",
  /\/api\/sample-data/.test(bannerSrc) && /method: "DELETE"/.test(bannerSrc)
);

console.log("\n== 8. the database can tell the difference ==");
const migrations = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
const sampleMigration = migrations.find((f) => f.includes("sample_data_source"));
check(`the migration exists (${sampleMigration ?? "none"})`, Boolean(sampleMigration));
const migSrc = readFileSync(`supabase/migrations/${sampleMigration}`, "utf8");
check(
  "'sample' is an allowed user_imports.source",
  /check \(source in \([^)]*'sample'[^)]*\)\)/.test(migSrc),
  "the insert would be refused by the existing constraint"
);
// THE OTHER FIVE MUST SURVIVE THE REWRITE. A CHECK cannot be extended in
// place, so the constraint is dropped and re-added in full — and a
// re-added constraint that forgot a value would silently break every CSV
// import.
for (const src of ["csv", "paste", "quick_add", "gmail", "google_drive"]) {
  check(`...and '${src}' still is`, new RegExp(`'${src}'`).test(migSrc));
}
check(
  "an account cannot end up with two samples",
  /create unique index[\s\S]{0,200}?where source = 'sample'/.test(migSrc),
  "a double-click writes the sample twice and the second cannot be cleared"
);
check(
  "the migration is idempotent",
  /drop constraint if exists/.test(migSrc) && /create unique index if not exists/.test(migSrc)
);

console.log("\n== 9. the export knows which rows are the demo ==");
const registrySrc = readFileSync("src/lib/gdpr/user-data-registry.ts", "utf8");
for (const t of SAMPLE_TABLES) {
  check(`${t.table} is in the GDPR registry`, new RegExp(`table: "${t.table}"`).test(registrySrc));
}
check(
  "user_imports is too, so source='sample' is in the export",
  /table: "user_imports"/.test(registrySrc),
  "without it the export carries import_id values that resolve to nothing"
);
const exportSrc = readFileSync("src/app/api/account/export/route.ts", "utf8");
check(
  "the export selects every column, so import_id comes with the row",
  /\.select\("\*"\)/.test(exportSrc),
  "a column list that omitted import_id would export the demo as though it were real"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
