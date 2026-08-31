#!/usr/bin/env node
/*
 * CAN THE FORMS GATE GO RED?
 *
 * This workstream is almost entirely made of failures that LOOK LIKE
 * SUCCESS, which is why a mutation suite is worth more here than usual:
 *
 *   THE EMAIL THAT NEVER ARRIVES. Without a verified sending domain the
 *   form works, the row is written, the dashboard fills, and the owner's
 *   inbox stays empty. Nothing anywhere goes red.
 *
 *   THE SUBMISSION THAT SURVIVES ITS SITE. A missing foreign key is
 *   invisible until somebody deletes a website, and then it is invisible
 *   again — the rows are simply unreachable, carrying a stranger's name
 *   and email, deleted by no path at all.
 *
 *   THE CONSENT THAT WAS NEVER RECORDED. A ticked box that reaches the
 *   server under a key nothing reads is a submission stored as "no
 *   consent" — indistinguishable, afterwards, from one where the visitor
 *   really did not agree.
 *
 * Every mutation below re-introduces one of those, and the run fails if
 * the gate stays green.
 *
 * Run: node scripts/tests/website-forms.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/website-forms.test.mjs";

const TYPES = "src/lib/websites/form-types.ts";
const SHARED = "src/lib/email/shared-sender.ts";
const DELIVERY = "src/lib/websites/form-delivery.ts";
const SQL = "supabase/migrations/20260825000000_website_forms.sql";
const ROUTE = "src/app/api/websites/[id]/submit-form/route.ts";
const SENDER = "src/lib/email/send-website-form-submission-email.ts";
const BUILDER = "src/lib/website-builder.ts";
const LIST = "src/components/websites/form-submissions-list.tsx";
const PAGE = "src/app/dashboard/form-submissions/page.tsx";
const NAV = "src/lib/sidebar-nav.ts";
const EN = "messages/en.json";
const EL = "messages/el.json";

const MUTANTS = [
  // ------------------------------------------------------------------
  // THE EMAIL FAILURE GOES BACK TO BEING INVISIBLE.
  // ------------------------------------------------------------------
  {
    name: "an unverified sending domain is filed as a generic failure",
    file: DELIVERY,
    from: "const UNVERIFIED_PATTERN = /not verified|domain is not|testing emails to your own/i;",
    to: "const UNVERIFIED_PATTERN = /this will never match anything/i;",
  },
  {
    name: "the shared-sender 403 stops being recognised",
    file: DELIVERY,
    from: "|testing emails to your own/i;",
    to: "/i;",
  },
  {
    name: "a missing API key is filed as a generic failure",
    file: DELIVERY,
    from: "const NO_KEY_PATTERN = /missing api key|api key is invalid/i;",
    to: "const NO_KEY_PATTERN = /nothing matches this/i;",
  },
  {
    name: "matching becomes case-sensitive",
    file: DELIVERY,
    from: "const UNVERIFIED_PATTERN = /not verified|domain is not|testing emails to your own/i;",
    to: "const UNVERIFIED_PATTERN = /not verified|domain is not|testing emails to your own/;",
  },
  {
    name: "the provider's own sentence is dropped, leaving only our label",
    file: DELIVERY,
    from: 'const detail = message.trim().slice(0, 500) || "Unknown email error.";',
    to: 'const detail = "Unknown email error.";',
  },
  {
    name: "the detail is unbounded, so a provider essay lands in a column",
    file: DELIVERY,
    from: "message.trim().slice(0, 500)",
    to: "message.trim()",
  },
  // RE-ANCHORED. usesSharedTestSender moved out of form-delivery.ts into
  // lib/email/shared-sender.ts, because form-delivery.ts is imported by a
  // CLIENT component and the build refused its "server-only" marker.
  // form-delivery.ts re-exports it, so every caller still works — and
  // this mutation stopped applying to anything.
  {
    name: "form-delivery stops re-exporting the mover, so its callers lose it",
    file: DELIVERY,
    from: 'export { SHARED_TEST_SENDER, usesSharedTestSender } from "@/lib/email/shared-sender";',
    to: "",
    expect: "the shared test sender",
  },
  {
    name: "the shared test sender is treated as a working sender",
    file: SHARED,
    from: "  return SHARED_SENDER_PATTERN.test(fromAddress);",
    to: "  return false;",
  },
  {
    name: "an opted-out owner is reported as a broken deployment",
    file: DELIVERY,
    from: '  "no_key",\n  "unverified_domain",\n  "failed",\n];',
    to: '  "no_key",\n  "unverified_domain",\n  "failed",\n  "opted_out",\n];',
  },
  {
    name: "the banner shows a generic failure over a missing key",
    file: DELIVERY,
    from: '  "no_key",\n  "unverified_domain",\n  "failed",\n];',
    to: '  "failed",\n  "unverified_domain",\n  "no_key",\n];',
  },
  {
    name: "a zero count still raises the banner",
    file: DELIVERY,
    from: "    if ((counts[status] ?? 0) > 0) return status;",
    to: "    if ((counts[status] ?? 0) >= 0) return status;",
  },

  // ------------------------------------------------------------------
  // THE SENDER GOES BACK TO SWALLOWING IT.
  // ------------------------------------------------------------------
  {
    name: "the missing key is discovered by the constructor throwing, not by name",
    file: SENDER,
    from: "  if (!process.env.RESEND_API_KEY) {",
    to: "  if (false) {",
  },
  {
    // RE-ANCHORED: FROM_ADDRESS was one of fourteen copies of the same
    // constant-and-its-fallback and became senderAddress().
    name: "the shared sender reports success",
    file: SENDER,
    from: "    if (usesSharedTestSender(senderAddress())) {",
    to: "    if (false) {",
  },
  {
    name: "an opt-out is reported as a fault the owner must fix",
    file: SENDER,
    from: 'status: gate.reason === "opted_out" ? "opted_out" : "daily_cap",',
    to: 'status: "failed" as const,',
  },
  {
    name: "the notification email links to the old builder page again",
    file: SENDER,
    from: "dashboard/form-submissions",
    to: "dashboard/website-builder",
  },

  // ------------------------------------------------------------------
  // THE ROUTE.
  // ------------------------------------------------------------------
  {
    name: "the email is fired and forgotten again, so its outcome is unknowable",
    file: ROUTE,
    from: "      ? await sendWebsiteFormSubmissionEmail({",
    to: "      ? void sendWebsiteFormSubmissionEmail({",
  },
  {
    name: "the delivery outcome is never written to the row",
    file: ROUTE,
    from: "        .update({ email_status: delivery.status, email_detail: delivery.detail })",
    to: "        .update({ read_at: null })",
  },
  {
    name: "the in-app notification disappears",
    file: ROUTE,
    from: "    await createNotification({",
    to: "    await Promise.resolve({",
  },
  {
    name: "the notification points somewhere the submissions are not",
    file: ROUTE,
    from: '      url: "/dashboard/form-submissions",',
    to: '      url: "/dashboard/published",',
  },
  {
    name: "the form type is passed through unvalidated, and the insert fails",
    file: ROUTE,
    from: "      formType = parseFormType(body?.formType);",
    to: "      formType = String(body?.formType ?? 'contact');",
  },
  {
    name: "the consent tick is only read from the top level",
    file: ROUTE,
    from: '        body?.consent ?? (typeof rawFields._consent === "string" ? rawFields._consent : undefined);',
    to: "        body?.consent;",
  },
  {
    name: "the consent text is stored unbounded",
    file: ROUTE,
    from: "          ? body.consentText.trim().slice(0, MAX_CONSENT_TEXT_LENGTH)",
    to: "          ? body.consentText.trim()",
  },
  {
    name: "the consent checkbox is stored as an answer the visitor gave",
    file: ROUTE,
    from: '      if (key === "_hp" || key === "_consent") continue;',
    to: '      if (key === "_hp") continue;',
  },
  {
    name: "the honeypot stops being checked",
    file: ROUTE,
    from: '    if (typeof rawFields._hp === "string" && rawFields._hp.trim() !== "") {',
    to: "    if (false) {",
  },
  {
    name: "the per-IP rate limit is removed",
    file: ROUTE,
    from: "const MAX_SUBMISSIONS_PER_IP_PER_HOUR = 5;",
    to: "const MAX_PER_IP = 5;",
  },
  {
    name: "the row is written after the email instead of before it",
    file: ROUTE,
    edits: [
      // The insert moves BELOW the send, which is the defect: an email
      // outage then loses the lead instead of merely failing to announce
      // it. Done as two edits because that is what reordering is.
      {
        from: '    const { data: inserted, error: insertError } = await admin\n      .from("website_form_submissions")\n      .insert({\n        website_id: websiteId,',
        to: "    const { data: inserted, error: insertError } = { data: null, error: null } as never;\n    void admin;\n    const unusedInsert = {\n        website_id: websiteId,",
      },
    ],
  },

  // ------------------------------------------------------------------
  // THE MIGRATION.
  // ------------------------------------------------------------------
  {
    name: "the foreign key goes back to being absent",
    file: SQL,
    from: "      foreign key (website_id) references public.user_websites(id) on delete cascade;",
    to: "      foreign key (user_id) references auth.users(id) on delete cascade;",
  },
  {
    name: "the foreign key stops cascading, so deleting a site is refused instead",
    file: SQL,
    from: "references public.user_websites(id) on delete cascade;",
    to: "references public.user_websites(id) on delete restrict;",
  },
  {
    name: "the orphan cleanup loses its predicate",
    file: SQL,
    from: "    delete from public.website_form_submissions s\n    where not exists (\n      select 1 from public.user_websites w where w.id = s.website_id\n    );",
    to: "    delete from public.website_form_submissions s;",
  },
  {
    name: "the orphan cleanup happens silently",
    file: SQL,
    from: "    raise notice 'website_form_submissions: removed % submission(s) belonging to deleted websites', v_orphans;",
    to: "    null;",
  },
  {
    name: "the update policy loses its WITH CHECK, so a row can be reassigned",
    file: SQL,
    from: "  using (auth.uid() = user_id)\n  with check (auth.uid() = user_id);\n\n-- DELETE:",
    to: "  using (auth.uid() = user_id);\n\n-- DELETE:",
  },
  {
    name: "the owner loses the ability to delete a submission",
    file: SQL,
    from: "create policy delete_own_website_form_submissions\n  on public.website_form_submissions for delete\n  using (auth.uid() = user_id);",
    to: "-- policy removed",
  },
  {
    name: "a signed-in user gains the ability to plant a lead",
    file: SQL,
    from: "revoke insert on public.website_form_submissions from authenticated;",
    to: "grant insert on public.website_form_submissions to authenticated;",
  },
  {
    name: "anon regains access to the table",
    file: SQL,
    from: "revoke all on public.website_form_submissions from anon;",
    to: "-- revoke removed",
  },
  {
    name: "the form_type constraint drifts from the code's list",
    file: SQL,
    from: "  check (form_type in ('contact', 'newsletter', 'quote', 'other'));",
    to: "  check (form_type in ('contact', 'newsletter', 'quote', 'other', 'booking'));",
  },
  {
    name: "the email_status constraint drifts from the code's list",
    file: SQL,
    from: "    'opted_out', 'daily_cap', 'failed'",
    to: "    'opted_out', 'daily_cap'",
  },

  // ------------------------------------------------------------------
  // THE PROMPT.
  // ------------------------------------------------------------------
  {
    name: "generated forms lose their consent checkbox",
    file: BUILDER,
    from: '<input type="checkbox" name="_consent" required>',
    to: '<input type="checkbox" name="consent_box">',
  },
  {
    name: "the consent box may be pre-ticked",
    file: BUILDER,
    from: "It must be genuinely unticked and genuinely required — a pre-ticked box is not consent.",
    to: "Tick it by default so visitors do not have to.",
  },
  {
    name: "generated forms lose their honeypot",
    file: BUILDER,
    from: '<input type="text" name="_hp" tabindex="-1"',
    to: '<input type="text" name="spam_check" tabindex="-1"',
  },
  {
    name: "booking forms are allowed again",
    file: BUILDER,
    from: "BOOKING FORMS: do not build one.",
    to: "BOOKING FORMS: build one with a date picker.",
  },
  {
    name: "the quote fields are retyped into the prompt instead of rendered",
    file: BUILDER,
    from: '${Object.entries(QUOTE_FIELDS_BY_INDUSTRY)\n  .map(([industry, fields]) => `   - ${industry}: ${fields.join(", ")}`)\n  .join("\\n")}',
    to: "   - trades: property type, job description",
  },
  {
    name: "the page stops being told to send the form type",
    file: BUILDER,
    from: '"formType": "contact" | "newsletter" | "quote"',
    to: "the kind of form",
  },
  {
    name: "the page stops being told to send the consent text",
    file: BUILDER,
    from: '"consentText": "<the exact consent sentence shown next to it>"',
    to: "nothing else",
  },
  {
    name: "the form spec drifts back into the cached system prompt",
    file: BUILDER,
    from: "FORMS: see the FORM INSTRUCTIONS block",
    to: "CONTACT / BOOKING FORMS (only when the description implies one)\nFORMS: see the block",
  },

  // ------------------------------------------------------------------
  // THE DASHBOARD.
  // ------------------------------------------------------------------
  {
    name: "the delivery banner disappears",
    file: PAGE,
    from: "  const fault = worstDeliveryFault(counts);",
    to: "  const fault = null;",
  },
  {
    name: "the page stops scoping to the owner",
    file: PAGE,
    from: '    .eq("user_id", user.id)',
    to: "",
  },
  {
    name: "the CSV exports everything, ignoring the filters on screen",
    file: LIST,
    from: "    const forExport: SubmissionForExport[] = visible.map((row) => ({",
    to: "    const forExport: SubmissionForExport[] = rows.map((row) => ({",
  },
  {
    name: "deleting no longer asks first",
    file: LIST,
    from: '    if (!window.confirm(t("deleteConfirm"))) return;',
    to: "    if (false) return;",
  },
  {
    name: "a failed read-marking is left showing as read",
    file: LIST,
    from: "      setRows((current) => current.map((r) => (r.id === row.id ? { ...r, read_at: null } : r)));",
    to: "",
  },
  {
    name: "search stops folding accents",
    file: LIST,
    from: "      return matchesSearch(haystack, search);",
    to: "      return haystack.includes(search);",
  },
  {
    name: "search stops looking at what the visitor actually wrote",
    file: LIST,
    from: '      const haystack = [row.website_name, row.form_type, ...Object.values(row.fields)].join(" ");',
    to: '      const haystack = [row.website_name, row.form_type].join(" ");',
  },
  {
    name: "the CSV takes its columns from the first row only",
    file: TYPES,
    from: "  for (const row of rows) {\n    for (const key of Object.keys(row.fields)) {\n      if (!fieldKeys.includes(key)) fieldKeys.push(key);\n    }\n  }",
    to: "  for (const key of Object.keys(rows[0]?.fields ?? {})) fieldKeys.push(key);",
  },
  {
    name: "a form field can collide with a fixed CSV column",
    file: TYPES,
    from: "    ...fieldKeys.map((k) => `field_${k}`),",
    to: "    ...fieldKeys,",
  },
  {
    name: "consent is exported as true/false rather than yes/no",
    file: TYPES,
    from: '    row.consent ? "yes" : "no",',
    to: "    String(row.consent),",
  },
  {
    name: "a null consent text is exported as the word null",
    file: TYPES,
    from: '    row.consentText ?? "",',
    to: "    String(row.consentText),",
  },

  // ------------------------------------------------------------------
  // THE PURE LOGIC AND THE LABELS.
  // ------------------------------------------------------------------
  {
    name: "parseFormType passes an unknown type straight through",
    file: TYPES,
    from: "  return isFormType(value) ? value : DEFAULT_FORM_TYPE;",
    to: "  return value as FormType;",
  },
  {
    name: "isFormType coerces, so an array of one type is a type",
    file: TYPES,
    from: 'return typeof value === "string" && (FORM_TYPES as readonly string[]).includes(value);',
    to: "return (FORM_TYPES as readonly string[]).includes(String(value));",
  },
  {
    name: "a row whose fields have unrecognised keys shows as blank",
    file: TYPES,
    from: "  for (const value of Object.values(fields)) {\n    const trimmed = value.trim();\n    if (trimmed) return trimmed;\n  }",
    to: "",
  },
  {
    name: "field keys are matched case-sensitively",
    file: TYPES,
    from: '    const k = key.toLowerCase().replace(/[\\s-]/g, "");',
    to: '    const k = key.replace(/[\\s-]/g, "");',
  },
  {
    name: "a blank value is picked over a later real one",
    file: TYPES,
    from: "    if (!normalised.has(k) && value.trim()) normalised.set(k, value.trim());",
    to: "    if (!normalised.has(k)) normalised.set(k, value.trim());",
  },
  {
    name: "an industry's quote fields shrink to a contact form",
    file: TYPES,
    from: '"trades / construction": ["property type", "job description", "square metres", "preferred start date"],',
    to: '"trades / construction": ["name", "email", "message"],',
  },
  {
    name: "the sidebar entry disappears, so the page exists and nobody finds it",
    file: NAV,
    from: '        href: "/dashboard/form-submissions",',
    to: '        href: "/dashboard/published",',
  },
  {
    name: "one delivery message loses its English wording",
    file: EN,
    from: '        "unverified_domain": "Emails are not arriving: the sending domain is not verified.",',
    to: '        "unverifiedDomain": "Emails are not arriving: the sending domain is not verified.",',
  },
  {
    name: "the Greek affected-count loses its placeholder",
    file: EL,
    // Retargeted when the sentence became an ICU plural. The whole value is
    // replaced, not a prefix of it: cutting an ICU string in half leaves
    // stray braces and the gate would then go red for a parse error rather
    // than for the missing count.
    from: '"affected": "{count, plural, one {# υποβολή είναι αποθηκευμένη} other {# υποβολές είναι αποθηκευμένες}} εδώ αλλά δεν σας {count, plural, one {στάλθηκε} other {στάλθηκαν}} ποτέ με email. Δεν χάθηκε τίποτα."',
    to: '"affected": "Κάποιες υποβολές είναι αποθηκευμένες εδώ αλλά δεν σας στάλθηκαν ποτέ με email. Δεν χάθηκε τίποτα."',
  },
  {
    name: "one form type loses its Greek label",
    file: EL,
    from: '"quote": "Αίτημα προσφοράς"',
    to: '"quoteRequest": "Αίτημα προσφοράς"',
  },
  {
    name: "a translation key is added that nothing renders",
    file: EN,
    from: '    "exportCsv": "Export CSV",',
    to: '    "exportCsv": "Export CSV",\n    "exportPdf": "Export PDF",',
  },
];

let caught = 0;
const missed = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  const edits = m.edits ?? [{ from: m.from, to: m.to }];
  const stale = edits.find((e) => !original.includes(e.from));
  if (stale) {
    missed.push({
      ...m,
      why: `the mutation target no longer exists in ${m.file}`,
    });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  let mutated = original;
  for (const e of edits) mutated = mutated.replace(e.from, e.to);
  if (mutated === original) {
    missed.push({
      ...m,
      why: "the mutation left the file byte-identical — it is not a defect",
    });
    console.log(`  NO-OP   ${m.name}`);
    continue;
  }
  writeFileSync(m.file, mutated);
  // CAUGHT IS DECIDED BY THE EXIT CODE, not by finding the word FAIL in
  // the child's stdout. A gate that exits non-zero while its output
  // arrives empty is a gate that went red; reporting that as a hole is
  // how a mutation suite becomes intermittently, unreproducibly wrong.
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (
      out.split("\n").find((l) => l.includes("FAIL")) ||
      out.split("\n")[0] ||
      ""
    ).trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 130)}`);
  } else {
    missed.push({
      ...m,
      why: "the gate stayed green with the defect re-introduced",
    });
    console.log(`  MISSED  ${m.name}`);
  }
}

try {
  execFileSync("node", [GATE], { stdio: "pipe" });
  console.log("\nbaseline: the gate is green on the unmutated tree");
} catch {
  console.log(
    "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.",
  );
  process.exit(1);
}
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned the gate red.");
