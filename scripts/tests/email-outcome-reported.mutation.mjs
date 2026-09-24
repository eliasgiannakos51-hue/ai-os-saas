#!/usr/bin/env node
/*
 * CAN THE GATE SEE THE LIE COME BACK?
 *
 * The defect it was written for: api/team/invite answered `{ ok: true }`
 * and the screen said "Invite sent to alice@example.com" on a deployment
 * with no email provider at all. Each mutation below restores one piece
 * of that, and the gate must name the clause.
 *
 * Run: node scripts/tests/email-outcome-reported.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/email-outcome-reported.test.mjs";
const ROUTE = "src/app/api/team/invite/route.ts";
const FORM = "src/components/team/invite-form.tsx";
const SENDER = "src/lib/email/send-team-invite-email.ts";
const EN = "messages/en.json";
const EL = "messages/el.json";

const TARGETS = [GATE, ROUTE, FORM, SENDER, EN, EL];

const MUTANTS = [
  {
    // THE ORIGINAL DEFECT, exactly. The send happens and nobody reads it.
    name: "the route stops reading what the send returned",
    file: ROUTE,
    from: "    const emailResult = await sendTeamInviteEmail({",
    to: "    await sendTeamInviteEmail({",
    expect: "team/invite reads what the send returned",
  },
  {
    // WORSE THAN THE ORIGINAL: the response goes back before the send
    // resolves, and a serverless runtime can freeze the function
    // mid-flight so the email never happens at all.
    name: "the email is fired and forgotten",
    file: ROUTE,
    from: "    const emailResult = await sendTeamInviteEmail({",
    to: "    void sendTeamInviteEmail({",
    expect: "never fires an email without awaiting it",
  },
  {
    // The route knows and does not say.
    name: "the response stops carrying whether the email was sent",
    file: ROUTE,
    from: "      emailSent: emailResult.ok,",
    to: "      emailWent: emailResult.ok,",
    expect: "the route reports whether the email was sent",
  },
  {
    // The owner is told it worked and given nothing to do about it.
    name: "the link to pass on by hand is dropped",
    file: ROUTE,
    from: "      signupUrl: emailResult.ok",
    to: "      unusedUrl: emailResult.ok",
    expect: "a link the owner can pass on by hand",
  },
  {
    // The URL built in the browser, where NEXT_PUBLIC_SITE_URL is
    // undefined — rule 48.
    name: "the signup URL stops coming from the server's resolver",
    file: ROUTE,
    from: "`${getSiteUrl()}/signup?plan=free`",
    to: "`/signup?plan=free`",
    expect: "built from the server's own site-url resolver",
  },
  {
    // THE SCREEN GOES BACK TO CLAIMING SUCCESS.
    name: "the form claims success whatever the route said",
    file: FORM,
    from: "      if (data.emailSent === false) {",
    to: "      if (false) {",
    expect: "third state for 'saved but not emailed'",
  },
  {
    // One message for both causes. A missing key is the operator's to
    // fix and names a variable; a refused send is a domain that was
    // never verified. Collapsing them tells the owner to check the
    // wrong thing.
    name: "the two reasons collapse into one message",
    file: FORM,
    from: '              : t("inviteEmailRefused")}',
    to: '              : t("inviteEmailNotConfigured")}',
    expect: "the two reasons are told apart",
  },
  {
    // The sender swallows the outcome again.
    name: "the sender stops telling a missing key from a refused send",
    file: SENDER,
    from: '    return { ok: false, reason: notConfigured ? "not_configured" : "send_failed" };',
    to: '    return { ok: false, reason: "send_failed" };',
    expect: "the two are actually different branches",
  },
  {
    // A LOCALE LEFT IN ENGLISH. The i18n gate catches an untranslated
    // key; this catches two locales carrying the SAME sentence, which is
    // what a copy-paste looks like.
    name: "Greek is left as a copy of English",
    file: EL,
    from: "\"inviteSavedNotEmailed\": \"\u039f/\u0397 {email} \u03c0\u03c1\u03bf\u03c3\u03ba\u03bb\u03ae\u03b8\u03b7\u03ba\u03b5 \u2014 \u03b1\u03bb\u03bb\u03ac \u03b4\u03b5\u03bd \u03c3\u03c4\u03ac\u03bb\u03b8\u03b7\u03ba\u03b5 email.\"",
    to: "\"inviteSavedNotEmailed\": \"{email} is invited \u2014 but no email was sent.\"",
    expect: "no two locales share the same sentence",
  },
  {
    // '{email}' in single quotes is the LITERAL text {email} in ICU, in
    // every language. CLAUDE.md names this as one of the two things that
    // have lied to the owner.
    name: "the placeholder is escaped, so ICU prints it literally",
    file: EN,
    from: '"inviteSavedNotEmailed": "{email} is invited',
    to: '"inviteSavedNotEmailed": "\'{email}\' is invited',
    expect: "unescaped, so ICU substitutes it",
  },
  {
    // THE POPULATION EMPTIED. A derived list that comes back empty
    // reports nothing and reads as clean.
    name: "the route walk finds nothing",
    file: GATE,
    from: 'const API = "src/app/api";',
    to: 'const API = "src/app/api/nowhere";',
    expect: "routes that send an email were found",
  },
  {
    // A BACKGROUND EXCUSE FOR A USER-FACING ROUTE. If team/invite could
    // be declared background, the whole rule is optional.
    name: "team/invite is declared background",
    file: GATE,
    from: '  "billing/cancel":',
    to: '  "team/invite": "because it would be inconvenient",\n  "billing/cancel":',
    expect: "cannot be declared background",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]) };
  }
}

console.log("email-outcome mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — nothing below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const mutated = originals.get(m.file).replace(m.from, () => m.to);
    if (mutated === originals.get(m.file)) {
      missed.push({ ...m, why: "the mutation left the file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, mutated);
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
