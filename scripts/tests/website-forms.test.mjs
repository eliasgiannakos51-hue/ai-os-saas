// FORMS ON PUBLISHED SITES — the pure half, and the wiring the compiler
// cannot see.
//
// The database half is proved in scripts/tests/website-forms.dbtest.mjs
// against a real PostgreSQL: the foreign key, the cascade, the CHECK
// constraints and every RLS policy, as the roles that actually run.
// Nothing here repeats it.
//
// What IS here:
//
//   * THE EMAIL FAILURE THE PRODUCT USED TO SWALLOW. Without a verified
//     sending domain the owner saw a working form, a filling table and
//     an empty inbox, and the only record was a server log. Classifying
//     that correctly is the whole point, so it is tested against the
//     sentences Resend actually returns.
//
//   * THE CSV, which leaves the product and gets opened in Excel.
//
//   * The strings that connect four files and typecheck either way: the
//     form types the prompt writes, the CHECK constraint accepts, the
//     route parses and the dashboard labels.
//
//   * Every translation key, in all ten locales, cross-product.
//
// Run: node scripts/tests/website-forms.test.mjs
import { createTranslator } from "next-intl";
import { carriesNumber } from "./icu-carries.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(
      `  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`,
    );
  }
};

const types = await loadTs("src/lib/websites/form-types.ts");
const delivery = await loadTs("src/lib/websites/form-delivery.ts");
const {
  FORM_TYPES,
  isFormType,
  parseFormType,
  DEFAULT_FORM_TYPE,
  MAX_CONSENT_TEXT_LENGTH,
  QUOTE_FIELDS_BY_INDUSTRY,
  submissionName,
  submissionEmail,
  submissionPhone,
  submissionHeadline,
  submissionsToCsv,
} = types;
const {
  FORM_EMAIL_STATUSES,
  isFormEmailStatus,
  DELIVERY_FAULTS,
  isDeliveryFault,
  SHARED_TEST_SENDER,
  usesSharedTestSender,
  classifySendFailure,
  worstDeliveryFault,
  faultCount,
} = delivery;

const MIGRATION = "supabase/migrations/20260825000000_website_forms.sql";
const sql = readFileSync(MIGRATION, "utf8");
const routeSrc = readFileSync(
  "src/app/api/websites/[id]/submit-form/route.ts",
  "utf8",
);
const senderSrc = readFileSync(
  "src/lib/email/send-website-form-submission-email.ts",
  "utf8",
);

/**
 * Source with its comments removed.
 *
 * MY OWN INSTRUMENT, CAUGHT BY ITS OWN TEST. The "is the key checked
 * before the client is built" assertion compares the position of
 * `new Resend(` against the position of the env check — and the file
 * EXPLAINS itself in a comment that contains the words
 * "`new Resend(undefined)` throws". The comment sits above the check, so
 * the assertion went red on code that was correct. A prose mention of a
 * construct is not the construct.
 */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}
const senderCode = codeOnly(senderSrc);
const builderSrc = readFileSync("src/lib/website-builder.ts", "utf8");
const listSrc = readFileSync(
  "src/components/websites/form-submissions-list.tsx",
  "utf8",
);
const pageSrc = readFileSync(
  "src/app/dashboard/form-submissions/page.tsx",
  "utf8",
);

console.log("1. Form types");
{
  ok(
    "four types, no duplicates",
    FORM_TYPES.length === 4 && new Set(FORM_TYPES).size === 4,
  );
  for (const type of FORM_TYPES)
    ok(`isFormType("${type}")`, isFormType(type) === true);
  // BOOKING IS DEFERRED, and it must not sneak in as a type that files a
  // message and calls itself a booking. The person who turns up on
  // Tuesday is the one who finds out.
  ok("booking is not a form type", !FORM_TYPES.includes("booking"));
  ok(
    "the prompt refuses to build a booking form",
    /BOOKING FORMS: do not build one/.test(builderSrc),
  );
  ok(
    "...and says what to build instead",
    /build a CONTACT form/.test(builderSrc),
  );

  for (const bad of [
    "booking",
    "Contact",
    "",
    " contact",
    "__proto__",
    "toString",
  ]) {
    ok(`isFormType rejects ${JSON.stringify(bad)}`, isFormType(bad) === false);
  }
  for (const bad of [null, undefined, 0, {}, [], ["contact"], true]) {
    ok(
      `isFormType rejects ${JSON.stringify(bad) ?? String(bad)}`,
      isFormType(bad) === false,
    );
  }

  ok("parseFormType keeps a valid type", parseFormType("quote") === "quote");
  // The CHECK constraint would REJECT an unknown type, and the insert
  // that carries it is the one that saves the lead. Falling back is what
  // makes a malformed request lose a label instead of a customer.
  ok(
    "parseFormType falls back rather than passing junk through",
    parseFormType("booking") === DEFAULT_FORM_TYPE,
  );
  ok(
    "...for every non-string too",
    [null, undefined, 7, {}].every(
      (v) => parseFormType(v) === DEFAULT_FORM_TYPE,
    ),
  );
  ok("the default is one of the types", FORM_TYPES.includes(DEFAULT_FORM_TYPE));
}

console.log("\n2. The migration accepts exactly the types the code produces");
{
  // THE CONSTRAINT AND THE ARRAY ARE THE SAME LIST, written twice in two
  // languages. A type added to one and not the other is either a value
  // the database refuses (losing the submission) or a value nothing can
  // label.
  const typeCheck = /check \(form_type in \(([^)]*)\)\)/.exec(sql);
  ok("the form_type CHECK exists", typeCheck !== null);
  if (typeCheck) {
    const inSql = typeCheck[1]
      .split(",")
      .map((s) => s.trim().replace(/'/g, ""))
      .sort();
    ok(
      "the CHECK lists exactly FORM_TYPES",
      inSql.join(",") === [...FORM_TYPES].sort().join(","),
      `sql=${inSql.join(",")} ts=${[...FORM_TYPES].sort().join(",")}`,
    );
  }

  const statusCheck = /check \(email_status in \(([\s\S]*?)\)\)/.exec(sql);
  ok("the email_status CHECK exists", statusCheck !== null);
  if (statusCheck) {
    const inSql = statusCheck[1]
      .split(",")
      .map((s) => s.trim().replace(/'/g, ""))
      .filter(Boolean)
      .sort();
    ok(
      "the CHECK lists exactly FORM_EMAIL_STATUSES",
      inSql.join(",") === [...FORM_EMAIL_STATUSES].sort().join(","),
      `sql=${inSql.join(",")} ts=${[...FORM_EMAIL_STATUSES].sort().join(",")}`,
    );
  }
}

console.log("\n3. Email delivery classification");
{
  for (const status of FORM_EMAIL_STATUSES)
    ok(`isFormEmailStatus("${status}")`, isFormEmailStatus(status));
  for (const bad of ["delivered", "SENT", "", null, 1, {}]) {
    ok(
      `isFormEmailStatus rejects ${JSON.stringify(bad) ?? String(bad)}`,
      isFormEmailStatus(bad) === false,
    );
  }

  // THE ACTUAL SENTENCES. Written out rather than paraphrased, because
  // paraphrasing them is exactly how a matcher passes its own test and
  // fails in production.
  const cases = [
    [
      'Missing API key. Pass it to the constructor `new Resend("re_123")`',
      "no_key",
    ],
    ["API key is invalid", "no_key"],
    [
      "The example.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
      "unverified_domain",
    ],
    [
      "You can only send testing emails to your own email address (owner@example.com)",
      "unverified_domain",
    ],
    ["fetch failed", "failed"],
    ["Rate limit exceeded", "failed"],
  ];
  for (const [message, expected] of cases) {
    const got = classifySendFailure(message);
    ok(
      `"${message.slice(0, 42)}..." -> ${expected}`,
      got.status === expected,
      got.status,
    );
    ok(
      "...and the provider's own sentence is kept",
      got.detail.includes(message.slice(0, 20)),
    );
  }
  // CASE-INSENSITIVE, because a provider that capitalises differently
  // one day must not silently drop into the uncategorised bucket.
  ok(
    "matching does not depend on case",
    classifySendFailure("THE EXAMPLE.COM DOMAIN IS NOT VERIFIED").status ===
      "unverified_domain",
  );

  ok(
    "an Error object is read",
    classifySendFailure(new Error("Missing API key")).status === "no_key",
  );
  ok(
    "an object with a message is read",
    classifySendFailure({ message: "domain is not verified" }).status ===
      "unverified_domain",
  );
  ok("null does not throw", classifySendFailure(null).status === "failed");
  ok(
    "...and still carries a detail",
    classifySendFailure(null).detail.length > 0,
  );
  ok(
    "a very long message is truncated",
    classifySendFailure("x".repeat(5000)).detail.length <= 500,
  );

  // The shared test sender. It DOES send — to exactly one address —
  // which is why "it worked in testing" is the shape of this bug.
  ok(
    "the shared sender is recognised",
    usesSharedTestSender(`Ionexa AI <${SHARED_TEST_SENDER}>`),
  );
  ok(
    "...whatever its case",
    usesSharedTestSender("Ionexa AI <Onboarding@Resend.dev>"),
  );
  ok(
    "a real sender is not",
    usesSharedTestSender("Ionexa AI <hello@ionexa.app>") === false,
  );
  ok("undefined is not", usesSharedTestSender(undefined) === false);
  ok(
    "the sender default in the sender file IS the shared address",
    senderSrc.includes(SHARED_TEST_SENDER),
    "if this ever stops being the default, the unverified-domain warning is guarding nothing",
  );

  // Faults vs choices.
  for (const status of DELIVERY_FAULTS)
    ok(`${status} is a fault`, isDeliveryFault(status));
  for (const status of ["sent", "pending", "opted_out", "daily_cap"]) {
    ok(`${status} is NOT a fault`, isDeliveryFault(status) === false);
  }
  ok("a made-up status is not a fault", isDeliveryFault("delivered") === false);
  ok(
    "every fault is a real status",
    DELIVERY_FAULTS.every((s) => FORM_EMAIL_STATUSES.includes(s)),
  );

  // The order is the order they have to be fixed in.
  ok(
    "no fault, no banner",
    worstDeliveryFault({ sent: 10, opted_out: 3 }) === null,
  );
  ok("an empty tally shows nothing", worstDeliveryFault({}) === null);
  ok(
    "a missing key outranks an unverified domain",
    worstDeliveryFault({ unverified_domain: 5, no_key: 1 }) === "no_key",
  );
  ok(
    "an unverified domain outranks a generic failure",
    worstDeliveryFault({ failed: 9, unverified_domain: 1 }) ===
      "unverified_domain",
  );
  ok(
    "a zero count is not a fault",
    worstDeliveryFault({ no_key: 0, failed: 2 }) === "failed",
  );
  ok(
    "faultCount adds only the faults",
    faultCount({ sent: 100, opted_out: 5, failed: 2, no_key: 1 }) === 3,
  );
  ok("faultCount of nothing is zero", faultCount({}) === 0);
}

console.log("\n4. Reading a visitor out of their own answers");
{
  ok(
    "name wins",
    submissionHeadline({ name: "Μαρία", email: "m@x.gr" }) === "Μαρία",
  );
  ok(
    "email when there is no name",
    submissionHeadline({ email: "m@x.gr" }) === "m@x.gr",
  );
  ok(
    "phone when there is neither",
    submissionHeadline({ phone: "+30 210 000" }) === "+30 210 000",
  );
  // A row that carries data and shows nothing is worse than one that
  // shows the wrong thing: it looks empty and gets ignored.
  ok(
    "something, when the keys are unrecognised",
    submissionHeadline({ whatever: "I want a quote" }) === "I want a quote",
  );
  ok(
    "null only when there is genuinely nothing",
    submissionHeadline({}) === null,
  );
  ok(
    "...and when every value is blank",
    submissionHeadline({ name: "   " }) === null,
  );

  ok(
    "keys are matched case-insensitively",
    submissionName({ Name: "Alex" }) === "Alex",
  );
  ok(
    "...and with separators removed",
    submissionName({ "full-name": "Alex Papa" }) === "Alex Papa",
  );
  ok(
    "full_name works too",
    submissionName({ full_name: "Alex Papa" }) === "Alex Papa",
  );
  ok(
    "email is found under mail",
    submissionEmail({ mail: "a@b.gr" }) === "a@b.gr",
  );
  ok("phone is found under tel", submissionPhone({ tel: "12345" }) === "12345");
  // The prompt asks for English attribute names in every language; these
  // are the fallbacks for when it does not comply.
  ok(
    "a Greek-named field still resolves",
    submissionName({ onoma: "Νίκος" }) === "Νίκος",
  );
  ok(
    "a Spanish-named field still resolves",
    submissionName({ nombre: "Ana" }) === "Ana",
  );
  ok(
    "an empty value is not picked over a later real one",
    submissionName({ name: "", fullname: "Real" }) === "Real",
  );
  // THE CASE THAT MATTERS: two keys that normalise to the SAME one, the
  // blank arriving first. Without the guard the blank claims the slot
  // and the real answer is unreachable — and the row shows the email
  // address instead of the name, or nothing at all.
  ok(
    "a blank does not claim the slot a real value normalises into",
    submissionName({ name: "   ", Name: "Πραγματικό" }) === "Πραγματικό",
  );
  ok(
    "...and the headline is the name, not the fallback",
    submissionHeadline({ name: "  ", NAME: "Νίκος", email: "n@x.gr" }) ===
      "Νίκος",
  );
}

console.log("\n5. The CSV");
{
  const rows = [
    {
      createdAt: "2026-08-01T10:00:00Z",
      websiteName: "Site A",
      formType: "contact",
      consent: true,
      consentText: "I agree",
      emailStatus: "sent",
      classification: "hot",
      fields: { name: "A", message: "Hello" },
    },
    {
      createdAt: "2026-08-02T10:00:00Z",
      websiteName: "Site B",
      formType: "quote",
      consent: false,
      consentText: null,
      emailStatus: "unverified_domain",
      classification: null,
      fields: { name: "B", square_metres: "80" },
    },
  ];
  const { headers, values } = submissionsToCsv(rows);

  // THE UNION, NOT ROW ONE. Two sites have different forms; an export
  // shaped by the first row silently drops every column the rest
  // introduced, and the file still opens and still looks complete.
  ok(
    "a column exists for a field only the second row has",
    headers.includes("field_square_metres"),
    headers.join(","),
  );
  ok(
    "...and for one only the first row has",
    headers.includes("field_message"),
  );
  ok(
    "the second row's value lands under its own column",
    values[1][headers.indexOf("field_square_metres")] === "80",
  );
  ok(
    "a row without that field is blank there, not shifted",
    values[0][headers.indexOf("field_square_metres")] === "",
  );
  ok(
    "every row has one cell per header",
    values.every((row) => row.length === headers.length),
  );

  // A form field called "consent" must not overwrite the consent column.
  const collide = submissionsToCsv([
    { ...rows[0], fields: { consent: "maybe", website: "spoof" } },
  ]);
  ok(
    "a field named 'consent' gets its own prefixed column",
    collide.headers.includes("field_consent") &&
      collide.headers.includes("consent"),
  );
  ok(
    "...and the real consent column still says yes",
    collide.values[0][collide.headers.indexOf("consent")] === "yes",
  );

  ok(
    "consent is written as yes/no, not true/false",
    values[0][headers.indexOf("consent")] === "yes" &&
      values[1][headers.indexOf("consent")] === "no",
  );
  ok(
    "a null consent text is empty, not the word null",
    values[1][headers.indexOf("consent_text")] === "",
  );
  ok(
    "a null classification is empty, not the word null",
    values[1][headers.indexOf("classification")] === "",
  );
  ok("the delivery status is exported", headers.includes("email_status"));
  ok(
    "an empty export still has headers",
    submissionsToCsv([]).headers.length > 0,
  );
  ok("...and no rows", submissionsToCsv([]).values.length === 0);

  // FORMULA INJECTION. The values come from strangers on the internet
  // and the file gets opened in Excel; lib/download/table-csv.ts is what defuses them,
  // and this is the check that this export goes through it.
  const csv = await loadTs("src/lib/download/table-csv.ts");
  const evil = csv.toCSV(["a"], [["=cmd|' /c calc'!A1"]]);
  ok(
    "a formula is neutralised on the way into the file",
    !/^a\r\n=/.test(csv.toCSV(["a"], [["=1+1"]])),
    evil,
  );
  ok(
    "the list component builds its file with toCSV",
    /toCSV\(headers, values\)/.test(listSrc),
  );
}

console.log("\n6. The route, and the strings it shares with everything else");
{
  ok("the honeypot is still checked", /rawFields\._hp/.test(routeSrc));
  ok(
    "the honeypot answers 200, so a bot learns nothing",
    /rawFields\._hp[\s\S]{0,220}ok: true/.test(routeSrc),
  );
  // THE CALL, not the constant. Renaming the declaration leaves the name
  // at its use site, so a `/MAX_SUBMISSIONS_PER_IP_PER_HOUR/` grep passes
  // over a file that no longer declares it.
  ok(
    "the per-IP rate limit is still called",
    /checkRateLimit\(\{[\s\S]{0,200}scope: "website_form_ip"/.test(routeSrc),
  );
  ok(
    "...with a real per-IP ceiling",
    /maxAttempts: MAX_SUBMISSIONS_PER_IP_PER_HOUR/.test(routeSrc) &&
      /^const MAX_SUBMISSIONS_PER_IP_PER_HOUR = \d+;$/m.test(routeSrc),
  );
  ok(
    "...and a blocked request costs the owner nothing",
    routeSrc.indexOf("checkRateLimit(") <
      routeSrc.indexOf("classifyLeadMessage("),
  );
  ok(
    "the per-website rate limit is still there",
    /^const MAX_SUBMISSIONS_PER_HOUR = \d+;$/m.test(routeSrc),
  );

  // THE ROW IS WRITTEN BEFORE THE EMAIL IS ATTEMPTED. That order IS the
  // fallback: reverse it and an email outage loses the lead.
  // ANCHORED ON THE INSERT ITSELF. This used to look for the first
  // `.from("website_form_submissions")`, which is the RATE-LIMIT COUNT
  // several statements earlier — so the assertion was comparing the
  // wrong two positions and would have passed with the insert moved
  // anywhere after it.
  const insertAt = routeSrc.indexOf(
    ".insert({\n        website_id: websiteId,",
  );
  const sendAt = routeSrc.indexOf("sendWebsiteFormSubmissionEmail({");
  const statusAt = routeSrc.indexOf("email_status: delivery.status");
  ok("the insert was found at all", insertAt !== -1, String(insertAt));
  ok(
    "the submission is stored before the email is tried",
    insertAt !== -1 && sendAt !== -1 && insertAt < sendAt,
    `${insertAt} vs ${sendAt}`,
  );
  ok(
    "...and the outcome is recorded after it",
    sendAt !== -1 && statusAt !== -1 && sendAt < statusAt,
    `${sendAt} vs ${statusAt}`,
  );
  ok(
    "the email result is awaited, not fired and forgotten",
    /await sendWebsiteFormSubmissionEmail\(/.test(routeSrc),
    "a void call on a serverless runtime can be frozen before it sends",
  );
  ok(
    "the outcome is written back onto the row",
    /email_status: delivery\.status/.test(routeSrc) &&
      /email_detail: delivery\.detail/.test(routeSrc),
  );

  // The in-app notification is the fallback that does not depend on
  // email at all, so it must not be conditional on the email failing.
  ok("a notification is created", /createNotification\(/.test(routeSrc));
  const notifyBlock = routeSrc.slice(routeSrc.indexOf("createNotification("));
  ok(
    "...pointing at the page that lists them",
    /url: "\/dashboard\/form-submissions"/.test(notifyBlock),
  );
  ok(
    "...unconditionally, not only when the email failed",
    !/if \([^)]*delivery\.status[^)]*\)\s*\{[\s\S]{0,200}createNotification/.test(
      routeSrc,
    ),
  );

  // Machinery must not be stored as an answer.
  ok("_hp is kept out of the stored fields", /key === "_hp"/.test(routeSrc));
  ok(
    "_consent is kept out of the stored fields",
    /key === "_consent"/.test(routeSrc),
  );
  ok(
    "consent is read from either place the checkbox can arrive",
    /body\?\.consent \?\? \(typeof rawFields\._consent/.test(routeSrc),
  );
  // THE SLICE, not the identifier. The import line mentions the constant
  // too, so `/MAX_CONSENT_TEXT_LENGTH/` stayed green with the truncation
  // deleted — the mutation suite proved it.
  ok(
    "the consent text is bounded",
    /\.trim\(\)\.slice\(0, MAX_CONSENT_TEXT_LENGTH\)/.test(routeSrc),
  );
  ok(
    "MAX_CONSENT_TEXT_LENGTH is a real bound",
    MAX_CONSENT_TEXT_LENGTH > 0 && MAX_CONSENT_TEXT_LENGTH <= 2000,
  );
  ok(
    "the form type is parsed, not trusted",
    /parseFormType\(body\?\.formType\)/.test(routeSrc),
  );

  // The keys the generated page sends and the keys the route reads.
  for (const key of ["fields", "formType", "consent", "consentText"]) {
    ok(
      `the prompt tells the page to send "${key}"`,
      builderSrc.includes(`"${key}"`),
      "a key the prompt does not name is a key no generated site sends",
    );
    ok(
      `the route reads body.${key}`,
      new RegExp(`body\\?\\.${key}\\b`).test(routeSrc) || key === "fields",
    );
  }
  ok("the prompt names the honeypot input", builderSrc.includes('name="_hp"'));
  ok(
    "the prompt names the consent input",
    builderSrc.includes('name="_consent"'),
  );
  ok("the prompt requires the consent box", /required/.test(builderSrc));
  ok(
    "...and forbids pre-ticking it",
    /pre-ticked box is not consent/.test(builderSrc),
  );
}

console.log("\n7. The email sender reports rather than swallows");
{
  ok("it returns a result type", /Promise<FormEmailResult>/.test(senderSrc));
  // Checked BY NAME before the client is constructed: `new Resend(undefined)`
  // throws, so without this the missing-key case is indistinguishable
  // from a network error.
  ok(
    "the file really does construct a Resend client",
    senderCode.includes("new Resend("),
  );
  ok(
    "a missing API key is detected before a client is built",
    senderCode.indexOf("!process.env.RESEND_API_KEY") !== -1 &&
      senderCode.indexOf("!process.env.RESEND_API_KEY") <
        senderCode.indexOf("new Resend("),
    "new Resend(undefined) throws, so this order is what names the cause",
  );
  ok(
    "it never throws at the caller",
    /return classifySendFailure\(err\)/.test(senderSrc),
  );
  ok(
    "the opt-out and the cap are told apart from a fault",
    /status: gate\.reason === "opted_out" \? "opted_out" : "daily_cap"/.test(
      senderSrc,
    ),
  );
  ok(
    "the shared test sender is reported, not called sent",
    /usesSharedTestSender\(FROM_ADDRESS\)[\s\S]{0,400}status: "unverified_domain"/.test(
      senderSrc,
    ),
  );
  ok(
    "the email links to the page that lists submissions",
    /dashboard\/form-submissions/.test(senderSrc),
  );
}

console.log("\n8. The dashboard");
{
  ok(
    "the page reads the delivery columns",
    /email_status/.test(pageSrc) && /email_detail/.test(pageSrc),
  );
  ok("the banner shows the worst fault", /worstDeliveryFault\(/.test(pageSrc));
  ok("the page is owner-scoped", /\.eq\("user_id", user\.id\)/.test(pageSrc));
  // The counts on screen come from the rows on screen; a number taken
  // over a different set is one the user cannot check against anything.
  ok(
    "the counts are derived from the listed rows",
    /for \(const row of rows\)/.test(pageSrc),
  );

  ok(
    "the CSV exports what is on screen, not everything",
    /visible\.map\(\(row\) => \(\{/.test(listSrc),
  );
  ok(
    "a submission can be deleted",
    /\.delete\(\)\s*\.eq\("id", row\.id\)/.test(listSrc),
  );
  ok(
    "...behind a confirmation",
    /window\.confirm\(t\("deleteConfirm"\)\)/.test(listSrc),
  );
  ok("opening one marks it read", /void markRead\(row\)/.test(listSrc));
  ok(
    "the optimistic update is reverted when the write fails",
    /read_at: null[\s\S]{0,120}addToast/.test(listSrc),
  );
  ok("search folds accents", /matchesSearch\(/.test(listSrc));
  ok(
    "...over the visitor's own words, not just the headings",
    /Object\.values\(row\.fields\)/.test(listSrc),
  );

  // The sidebar entry, without which the page exists and nobody finds it.
  const nav = readFileSync("src/lib/sidebar-nav.ts", "utf8");
  ok("the sidebar links to it", nav.includes('"/dashboard/form-submissions"'));
  const labels = readFileSync("src/lib/sidebar-label-keys.ts", "utf8");
  ok(
    "...and the label has a translation key",
    labels.includes('"Form Submissions": "formSubmissions"'),
  );
}

console.log("\n9. Every string the UI builds, in every locale");
{
  const locales = readdirSync("messages")
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5));
  ok("ten locales", locales.length === 10, locales.join(","));
  const messages = Object.fromEntries(
    locales.map((l) => [
      l,
      JSON.parse(readFileSync(`messages/${l}.json`, "utf8")),
    ]),
  );
  const lookup = (obj, dotted) =>
    dotted.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

  // Interpolated keys — `types.${form_type}` and `delivery.${status}` —
  // which check-i18n.js cannot see, because there is no literal key in
  // the source to find.
  const needed = [
    "title",
    "description",
    "deletedWebsite",
    "searchPlaceholder",
    "filterType",
    "filterSite",
    "allTypes",
    "allSites",
    "countMeta",
    "exportCsv",
    "noName",
    "new",
    "noMatches",
    "noMatchesBody",
    "delete",
    "deleteConfirm",
    "deleted",
    "deleteFailed",
    "markReadFailed",
    "consentGiven",
    "consentMissing",
    "consentRecorded",
    "consentNoText",
    "consentMissingBody",
    "empty.title",
    "empty.body",
    ...FORM_TYPES.map((t) => `types.${t}`),
    ...DELIVERY_FAULTS.map((s) => `delivery.${s}`),
    "delivery.sent",
    "delivery.affected",
  ];
  for (const locale of locales) {
    const block = messages[locale]?.dashboard?.formSubmissions;
    ok(`${locale} has dashboard.formSubmissions`, !!block);
    if (!block) continue;
    for (const dotted of needed) {
      const value = lookup(block, dotted);
      ok(
        `${locale}: ${dotted}`,
        typeof value === "string" && value.trim().length > 0,
      );
    }
    // No stragglers: a key nothing renders is ten translations nobody reads.
    const flat = [];
    for (const [key, value] of Object.entries(block)) {
      if (typeof value === "string") flat.push(key);
      else for (const leaf of Object.keys(value)) flat.push(`${key}.${leaf}`);
    }
    for (const dotted of flat)
      ok(`${locale}: ${dotted} is used`, needed.includes(dotted));

    ok(
      `${locale}: the sidebar item`,
      typeof messages[locale]?.sidebar?.items?.formSubmissions === "string" &&
        messages[locale].sidebar.items.formSubmissions.trim().length > 0,
    );
    ok(
      `${locale}: the sidebar hint`,
      typeof messages[locale]?.sidebar?.hints?.formSubmissions === "string" &&
        messages[locale].sidebar.hints.formSubmissions.trim().length > 0,
    );
  }
  // The two placeholders that carry numbers.
  for (const locale of locales) {
    ok(
      `${locale}: countMeta keeps both counts`,
      /\{shown\}/.test(messages[locale].dashboard.formSubmissions.countMeta) &&
        /\{unread\}/.test(messages[locale].dashboard.formSubmissions.countMeta),
    );
    // RENDERED, not matched. This read `/\{count\}/` and went red the day the
    // sentence became an ICU plural so that one submission stops reading
    // "1 submission(s)" — a fact about the spelling, not about the message.
    ok(
      `${locale}: delivery.affected keeps its count`,
      carriesNumber(createTranslator, {
        locale,
        messages: messages[locale],
        namespace: "dashboard.formSubmissions.delivery",
        key: "affected",
        variable: "count",
      }),
    );
    ok(
      `${locale}: consentRecorded keeps its text`,
      /\{text\}/.test(
        messages[locale].dashboard.formSubmissions.consentRecorded,
      ),
    );
  }
}

console.log("\n10. Quote fields, and the prompt that renders them");
{
  const industries = Object.keys(QUOTE_FIELDS_BY_INDUSTRY);
  ok(
    "there are several industries",
    industries.length >= 5,
    String(industries.length),
  );
  for (const [industry, fields] of Object.entries(QUOTE_FIELDS_BY_INDUSTRY)) {
    ok(
      `${industry} lists enough to price a job`,
      fields.length >= 3,
      String(fields.length),
    );
    ok(
      `${industry} is not a contact form`,
      !fields.every((f) => ["name", "email", "phone", "message"].includes(f)),
    );
  }
  // RENDERED FROM THE MAP, not retyped into the prompt.
  ok(
    "the prompt renders the map rather than repeating it",
    /Object\.entries\(QUOTE_FIELDS_BY_INDUSTRY\)/.test(builderSrc),
    "a second copy in the prompt is a copy that goes stale",
  );

  // THE CEILING. This section moved OUT of the cached system prompt on
  // purpose; if it drifts back in, the brief starts competing with it.
  ok(
    "the form spec is not in the cached system prompt",
    !/CONTACT \/ BOOKING FORMS/.test(builderSrc) &&
      builderSrc.indexOf("const FORM_KINDS") >
        builderSrc.indexOf("FUNCTIONAL_ELEMENTS_SECTION"),
  );
  ok(
    "FUNCTIONAL_ELEMENTS_SECTION points at it instead",
    /FORMS: see the FORM INSTRUCTIONS block/.test(builderSrc),
  );
}

console.log("\n11. The migration's own safety");
{
  const code = sql
    .split("\n")
    .map((l) => (l.trim().startsWith("--") ? "" : l))
    .join("\n");
  for (const forbidden of ["drop table", "truncate"]) {
    ok(`no ${forbidden}`, !new RegExp(forbidden, "i").test(code));
  }
  // The orphan cleanup is the one DELETE in the file, and it is the
  // whole point of the section — so it is checked for its predicate
  // rather than banned.
  const deletes = [
    ...code.matchAll(
      /delete from public\.website_form_submissions[\s\S]{0,200}?;/g,
    ),
  ];
  ok(
    "there is exactly one delete",
    deletes.length === 1,
    `found ${deletes.length}`,
  );
  ok(
    "...and it is qualified by a not-exists on user_websites",
    deletes.length === 1 &&
      /not exists[\s\S]*user_websites/.test(deletes[0][0]),
  );
  // THE NOTICE THAT CARRIES THE COUNT, specifically. There is a second
  // one on the nothing-to-do branch, so a bare /raise notice/ stayed
  // green with the reporting one deleted.
  ok(
    "the number of rows removed is announced, not done silently",
    /raise notice '[^']*%[^']*', v_orphans;/.test(code),
    "a migration that deletes personal data must say how much",
  );

  ok(
    "the foreign key cascades",
    /references public\.user_websites\(id\) on delete cascade/.test(code),
  );
  ok(
    "select-own survives",
    /for select using \(auth\.uid\(\) = user_id\)/.test(code),
  );
  ok(
    "update carries BOTH using and with check",
    /for update\s*\n\s*using \(auth\.uid\(\) = user_id\)\s*\n\s*with check \(auth\.uid\(\) = user_id\)/.test(
      code,
    ),
    "without WITH CHECK an owner can reassign a submission to another account",
  );
  ok(
    "delete-own exists",
    /for delete\s*\n\s*using \(auth\.uid\(\) = user_id\)/.test(code),
  );
  ok("there is no insert policy", !/for insert/.test(code));
  ok(
    "authenticated may not insert",
    /revoke insert on public\.website_form_submissions from authenticated/.test(
      code,
    ),
  );
  ok(
    "anon may not do anything",
    /revoke all on public\.website_form_submissions from anon/.test(code),
  );
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
