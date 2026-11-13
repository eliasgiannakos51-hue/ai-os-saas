#!/usr/bin/env node
/*
 * CAN business-contacts.test.mjs SEE THE NETWORK GET LOST ON THE WAY?
 *
 * A role word matched only as the whole field, an unrecognised role
 * refused instead of filed as "other", a contact line staying mixed into
 * the ordinary prose, an empty name after cleaning kept as a row, the
 * extraction asking for contacts whatever the switch says, a parsed
 * contact written to chat_memory instead of its own table, and the role
 * check in the migration silently widened.
 *
 * Run: node scripts/tests/business-contacts.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/business-contacts.test.mjs";
const CONTACTS = "src/lib/memory/contacts.ts";
const EXTRACTOR = "src/lib/chat/memory.ts";
const MIGRATION = "supabase/migrations/20261121000000_business_contacts.sql";

const MUTANTS = [
  {
    name: "a role word matches inside any word, not just the whole field",
    file: CONTACTS,
    from: "return ROLE_WORDS[folded] ?? \"other\";",
    to: "return Object.keys(ROLE_WORDS).find((w) => folded.includes(w)) ? ROLE_WORDS[Object.keys(ROLE_WORDS).find((w) => folded.includes(w))] : \"other\";",
    expect: "a role word inside a longer word is not a match",
  },
  {
    name: "an empty name after cleaning is still recorded",
    file: CONTACTS,
    from: "  const name = cleanField(fields[0] ?? \"\");\n  if (!name) return null;",
    to: "  const name = cleanField(fields[0] ?? \"\");",
    expect: "an empty name after cleaning is dropped",
  },
  {
    name: "a contact line is no longer pulled out of the rest",
    file: CONTACTS,
    from: "    if (line.startsWith(CONTACT_PREFIX)) {",
    to: "    if (false) {",
    expect: "two contacts found",
  },
  {
    name: "the extractor asks for contact lines whatever the switch says",
    file: EXTRACTOR,
    from: 'text: `${EXTRACTION_SYSTEM_PROMPT}${brand ? BRAND_EXTRACTION_RULE : ""}${contacts ? CONTACT_EXTRACTION_RULE : ""}` }],',
    to: "text: `${EXTRACTION_SYSTEM_PROMPT}${brand ? BRAND_EXTRACTION_RULE : \"\"}${CONTACT_EXTRACTION_RULE}` }],",
    expect: "the extractor asks for contact lines only with the switch on",
  },
  {
    name: "a parsed contact is written to chat_memory instead of business_contacts",
    file: EXTRACTOR,
    from: 'await supabase.rpc("business_contact_record", {',
    to: 'await supabase.rpc("chat_memory_record", {',
    expect: "each parsed contact is written through business_contact_record, not chat_memory_record",
  },
  {
    name: "the migration's role check is widened to accept anything",
    file: MIGRATION,
    from: "check (role in ('customer', 'supplier', 'partner', 'other'));",
    to: "check (true);",
    expect: "the role is constrained to the four stored values",
  },
  {
    name: "an insert policy is opened to the signed-in role",
    file: MIGRATION,
    from: 'drop policy if exists "delete_own_business_contacts" on public.business_contacts;',
    to: 'create policy "insert_own_business_contacts" on public.business_contacts for insert with check (auth.uid() = user_id);\ndrop policy if exists "delete_own_business_contacts" on public.business_contacts;',
    expect: "RLS is on, with select and delete but no insert/update policy for the signed-in role",
  },
];

runMutations({
  name: "business-contacts",
  gate: GATE,
  targets: [CONTACTS, EXTRACTOR, MIGRATION],
  mutants: MUTANTS,
});
