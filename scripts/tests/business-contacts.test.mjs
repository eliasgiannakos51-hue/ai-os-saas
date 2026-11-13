/*
 * THE BUSINESS'S OWN NETWORK, REMEMBERED (the 2026-11-07 market round,
 * docs/QUEUE.md «ΤΟ MOAT»): «ο Γιώργος απ' τον προμηθευτή» said once in
 * Chat becomes its own row, with a count that grows every time the name
 * comes up again.
 *
 * What this holds, against the code rather than its comments:
 *
 *   1. A role word, in Greek or English, any case, any accent, becomes
 *      one of the four stored roles — and an unrecognised word is "other",
 *      never an error, because the name is the fact worth keeping either
 *      way.
 *   2. The dedup fold: "Γιώργος" and "γιωργος" are the same key.
 *   3. One CONTACT_PREFIX line parses into {name, role, detail}, with
 *      quotes and a trailing full stop stripped from each field, and an
 *      empty name after cleaning drops the line.
 *   4. The extractor's answer is split: every contact line is pulled out,
 *      everything else stays as prose for chat_memory.
 *   5. The wiring, behind the switch "business-contact-memory": the chat
 *      asks for contact lines only with it on, each parsed contact is
 *      recorded through business_contact_record (never chat_memory_record),
 *      and what is left of the answer still goes through the existing
 *      brand/plain recording — with no contact lines at all, nothing
 *      changes from before this feature existed.
 *   6. The migration: the table, its role check, the one-row-per-person
 *      unique index, RLS with no insert/update policy, and the function's
 *      own auth.uid() guard and role fallback.
 *   7. The flag is declared and read with isFeatureOn, the API route and
 *      the page both gate on it, and the ten languages carry the panel's
 *      text with its placeholders intact.
 *
 * Run: node scripts/tests/business-contacts.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
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
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
const code = (p) => stripComments(readFileSync(p, "utf8"));

const contacts = await loadTs("src/lib/memory/contacts.ts");

console.log("business-contacts");

// ---------------------------------------------------------------------
console.log("\n== 1. a role as people say it ==");
// ---------------------------------------------------------------------
const ROLES = [
  ["πελάτης", "customer"],
  ["ΠΕΛΑΤΗΣ", "customer"],
  ["πελατισσα", "customer"],
  ["customer", "customer"],
  ["client", "customer"],
  ["προμηθευτής", "supplier"],
  ["Προμηθεύτρια", "supplier"],
  ["supplier", "supplier"],
  ["vendor", "supplier"],
  ["συνεργάτης", "partner"],
  ["partner", "partner"],
  ["collaborator", "partner"],
  ["γείτονας", "other"],
  ["", "other"],
];
for (const [said, role] of ROLES) {
  check(`"${said}" -> ${role}`, contacts.roleFromWord(said) === role, contacts.roleFromWord(said));
}
check("isContactRole accepts only the four", contacts.isContactRole("customer") && contacts.isContactRole("other") && !contacts.isContactRole("nope") && !contacts.isContactRole(5));
check("a role word inside a longer word is not a match (\"αντιπελάτης\" is not \"πελάτης\")", contacts.roleFromWord("αντιπελάτης") === "other");

// ---------------------------------------------------------------------
console.log("\n== 2. the dedup fold ==");
// ---------------------------------------------------------------------
check("case and accents fold together", contacts.contactNameFold("Γιώργος") === contacts.contactNameFold("γιωργος"));
check("extra whitespace folds together", contacts.contactNameFold("  Γιώργος   Παπά  ") === contacts.contactNameFold("Γιώργος Παπά"));
check("different names do not fold together", contacts.contactNameFold("Γιώργος") !== contacts.contactNameFold("Γιάννης"));

// ---------------------------------------------------------------------
console.log("\n== 3. one line, three fields ==");
// ---------------------------------------------------------------------
const parsed = contacts.parseContactLine(`${contacts.CONTACT_PREFIX} «Γιώργος Παπαδόπουλος» | προμηθευτής | 6971234567.`);
check("the name, cleaned", parsed?.name === "Γιώργος Παπαδόπουλος", JSON.stringify(parsed));
check("the role", parsed?.role === "supplier");
check("the detail, cleaned", parsed?.detail === "6971234567", JSON.stringify(parsed));
const noDetail = contacts.parseContactLine(`${contacts.CONTACT_PREFIX} Μαρία | πελάτης | `);
check("a blank detail field is null, not an empty string", noDetail?.detail === null, JSON.stringify(noDetail));
const noRole = contacts.parseContactLine(`${contacts.CONTACT_PREFIX} Νίκος | | `);
check("a blank role field falls back to \"other\"", noRole?.role === "other", JSON.stringify(noRole));
const blank = contacts.parseContactLine(`${contacts.CONTACT_PREFIX} «» | πελάτης`);
check("an empty name after cleaning is dropped", blank === null);
const long = contacts.parseContactLine(`${contacts.CONTACT_PREFIX} ${"Α".repeat(200)} | πελάτης | ${"9".repeat(300)}`);
check("name and detail are both capped", long?.name.length === 120 && long?.detail?.length === 200, `${long?.name.length} / ${long?.detail?.length}`);

// ---------------------------------------------------------------------
console.log("\n== 4. the extractor's answer, split ==");
// ---------------------------------------------------------------------
const ANSWER = `Του αρέσει ο καφές.\n${contacts.CONTACT_PREFIX} Γιώργος | προμηθευτής | 6971234567\n${contacts.CONTACT_PREFIX} Μαρία | πελάτης | `;
const split = contacts.splitContactLines(ANSWER);
check("two contacts found", split.contacts.length === 2, JSON.stringify(split.contacts));
check("the first contact", split.contacts[0].name === "Γιώργος" && split.contacts[0].role === "supplier" && split.contacts[0].detail === "6971234567");
check("the second, with no detail", split.contacts[1].name === "Μαρία" && split.contacts[1].role === "customer" && split.contacts[1].detail === null);
check("the ordinary sentence is left as rest, contact lines removed", split.rest === "Του αρέσει ο καφές.", JSON.stringify(split.rest));
const noneAtAll = contacts.splitContactLines("Του αρέσει ο καφές.");
check("an answer with no contact line keeps rest unchanged and finds none", noneAtAll.contacts.length === 0 && noneAtAll.rest === "Του αρέσει ο καφές.");
const onlyContacts = contacts.splitContactLines(`${contacts.CONTACT_PREFIX} Γιώργος | πελάτης | `);
check("an answer that is only a contact line leaves an empty rest", onlyContacts.contacts.length === 1 && onlyContacts.rest === "", JSON.stringify(onlyContacts));

// ---------------------------------------------------------------------
console.log("\n== 5. the wiring ==");
// ---------------------------------------------------------------------
const extractor = code("src/lib/chat/memory.ts");
check("contacts is a parameter of extractAndStoreMemory, defaulting to false", /contacts = false,/.test(extractor));
check("the extractor asks for contact lines only with the switch on", /\$\{contacts \? CONTACT_EXTRACTION_RULE : ""\}` \}\],/.test(extractor));
check("...naming the prefix", /CONTACT_EXTRACTION_RULE =[\s\S]{0,400}\$\{CONTACT_PREFIX\}/.test(extractor));
check("contact lines are pulled out before the rest is recorded", /splitContactLines\(extracted\)\s*:\s*\{ contacts: \[\], rest: extracted \}/.test(extractor));
check("each parsed contact is written through business_contact_record, not chat_memory_record", /for \(const c of parsedContacts\) \{[\s\S]{0,300}supabase\.rpc\("business_contact_record",/.test(extractor));
check("...with the four fields the migration's function takes", /p_name: c\.name,[\s\S]{0,120}p_name_fold: contactNameFold\(c\.name\),[\s\S]{0,120}p_role: c\.role,[\s\S]{0,120}p_detail: c\.detail,/.test(extractor));
check("the remaining prose still goes through chat_memory_record, on afterContacts rather than extracted", /brand \? splitBrandLines\(afterContacts\) : \[afterContacts\]/.test(extractor));
const chatRoute = code("src/app/api/chat/route.ts");
check("the chat route computes the switch and passes it through", /const businessContactsOn = await isFeatureOn\("business-contact-memory", user\);/.test(chatRoute) && /contacts: businessContactsOn,/.test(chatRoute));

// ---------------------------------------------------------------------
console.log("\n== 6. the migration ==");
// ---------------------------------------------------------------------
const mig = readFileSync("supabase/migrations/20261121000000_business_contacts.sql", "utf8").replace(/--.*$/gm, "");
check("the table, keyed to the user", /create table if not exists public\.business_contacts/.test(mig) && /references auth\.users\(id\) on delete cascade/.test(mig));
check("the role is constrained to the four stored values", /check \(role in \('customer', 'supplier', 'partner', 'other'\)\)/.test(mig));
check("one row per person: a unique index on the fold", /create unique index if not exists business_contacts_user_name_fold_key\s*on public\.business_contacts \(user_id, name_fold\);/.test(mig));
check("RLS is on, with select and delete but no insert/update policy for the signed-in role", /alter table public\.business_contacts enable row level security;/.test(mig) && /for select using \(auth\.uid\(\) = user_id\)/.test(mig) && /for delete using \(auth\.uid\(\) = user_id\)/.test(mig) && !/for insert/.test(mig) && !/for update/.test(mig));
check("the function requires an authenticated user", /if v_user is null then\s*raise exception 'business_contact_record: no authenticated user'/.test(mig));
check("an unrecognised role falls back to 'other' rather than refusing the write", /if v_role not in \('customer', 'supplier', 'partner', 'other'\) then\s*v_role := 'other';/.test(mig));
check("the migration says how to undo it", /How to undo: drop function if exists public\.business_contact_record/.test(readFileSync("supabase/migrations/20261121000000_business_contacts.sql", "utf8")));

// ---------------------------------------------------------------------
console.log("\n== 7. the flag, the route, the page, the languages ==");
// ---------------------------------------------------------------------
check("the flag is declared", /"business-contact-memory":\s*"/.test(code("src/lib/flags/flags.ts")));
const apiRoute = code("src/app/api/memory/contacts/route.ts");
check("the read route gates on the flag", /isFeatureOn\("business-contact-memory", user\)/.test(apiRoute));
const page = code("src/app/dashboard/ai-memory/page.tsx");
check("the page gates the panel on the same flag", /const businessContactsOn = await isFeatureOn\("business-contact-memory", user\);/.test(page));
check("...and only queries/renders the table when it is on", /if \(businessContactsOn\) \{[\s\S]{0,400}from\("business_contacts"\)/.test(page));
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));
check(`the ten languages (${LOCALES.length})`, LOCALES.length === 10);
for (const file of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${file}`, "utf8")).aiMemory?.contacts ?? {};
  check(
    `${file}: the panel's text, with its placeholders`,
    typeof m.heading === "string" && m.heading.length > 0 &&
      typeof m.description === "string" && m.description.length > 0 &&
      typeof m.empty === "string" && m.empty.length > 0 &&
      /\{count\}/.test(m.mentions ?? "") &&
      /\{date\}/.test(m.knownSince ?? "") &&
      typeof m.roleCustomer === "string" && typeof m.roleSupplier === "string" && typeof m.rolePartner === "string" && typeof m.roleOther === "string" &&
      !/'\{/.test(`${m.mentions}${m.knownSince}`)
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
