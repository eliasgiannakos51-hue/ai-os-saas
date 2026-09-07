#!/usr/bin/env node
/*
 * DOES THE PRODUCT ADDRESS A PERSON THE SAME WAY TWICE?
 *
 * FOUND BY READING, WHICH IS THE POINT. V5 #5 exported the 44 sentences a
 * new Greek user meets before their first result. Two of them sit three
 * lines apart on the signup screen:
 *
 *   auth.signup.failed            "…δοκίμασε ξανά — δεν χρεώθηκες."   (εσύ)
 *   auth.signup.mustAgreeToTerms  "Πρέπει να αποδεχτείτε…"            (εσείς)
 *
 * Both are correct Greek. Both are correct translations of their English.
 * Together they are a product that cannot decide whether it knows you,
 * and a Greek reader hears that immediately — the way an English reader
 * hears a sentence switch from "you" to "one" mid-paragraph.
 *
 * THIS IS THE ONE THING A MACHINE CAN CHECK ABOUT A TRANSLATION. It
 * cannot tell whether a sentence is good. It CAN tell whether the file
 * agrees with itself about who it is talking to, and that is the defect
 * a single reviewer of 2,933 strings would never catch, because the two
 * halves are eight hundred lines apart.
 *
 * MEASURED, on 2026-09-07, over the whole Greek file: 473 strings in the
 * informal singular, 15 in the polite plural, 2 mixing both inside one
 * sentence. All 17 were read by hand and all 17 were real. They are fixed;
 * this holds the count at zero.
 *
 * NOT \b. JavaScript's word boundary is ASCII even under the `u` flag —
 * "\bδοκίμασε\b" matches nothing, silently. The first draft of this scan
 * did exactly that and reported 0 of 44 for BOTH registers, which reads
 * like a clean file. CLAUDE.md carries this trap; it has now broken five
 * things here.
 *
 * Run: node scripts/tests/address-register.test.mjs
 */
import { readFileSync } from "node:fs";

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

const B0 = "(?<![\\p{L}\\p{N}])";
const B1 = "(?![\\p{L}\\p{N}])";

/**
 * GREEK, AND ONLY GREEK IS GATED.
 *
 * The informal set is second-person-singular imperatives plus the -εις /
 * -εσαι / -ηκες endings; the formal set is the -ετε / -εστε / -είτε
 * plural forms and the σας/εσείς pronouns. Both lists are literal Greek
 * with the accents ON, because these are compared against the message
 * text as written rather than against a fold.
 */
const EL_INFORMAL = new RegExp(
  B0 + "(?:δοκίμασε|έλεγξε|φέρε|ξεκίνα|πρόσθεσε|διάλεξε|δες|πάτησε|γράψε|βάλε|κάνε|εσύ)" + B1 +
    "|" + B0 + "\\p{L}+(?:εις|εσαι|ηκες|ήκες)" + B1,
  "u"
);
const EL_FORMAL = new RegExp(
  B0 + "(?:δοκιμάστε|ελέγξτε|φέρτε|ξεκινήστε|προσθέστε|διαλέξτε|δείτε|πατήστε|γράψτε|βάλτε|κάντε|εσείς)" + B1 +
    "|" + B0 + "\\p{L}+(?:ετε|εστε|ήστε|ίστε|είτε)" + B1,
  "u"
);

function leaves(node, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...leaves(v, key));
    else out.push([key, String(v)]);
  }
  return out;
}

const el = leaves(JSON.parse(readFileSync("messages/el.json", "utf8")));

console.log("== 1. the scan can see Greek at all ==");
{
  // THE VACUITY CHECK, and it is not a formality. With `\b` instead of
  // the lookarounds above, both counts are zero and every assertion below
  // passes on an empty set — a clean bill of health for a file nothing
  // read.
  const informal = el.filter(([, t]) => EL_INFORMAL.test(t));
  check(`the informal reader matches (${informal.length} strings)`, informal.length > 200, String(informal.length));
  check(
    "...and it is not matching everything either",
    informal.length < el.length * 0.5,
    `${informal.length} of ${el.length}`
  );
  // A KNOWN SENTENCE, so a reader can check the reader.
  check(
    "a sentence known to be informal is read as informal",
    EL_INFORMAL.test("Σφάλμα δικτύου — δοκίμασε ξανά.")
  );
  check(
    "a sentence known to be formal is read as formal",
    EL_FORMAL.test("Πρέπει να αποδεχτείτε τους Όρους Χρήσης.")
  );
  check(
    "...and the formal reader does NOT fire on the informal one",
    !EL_FORMAL.test("Σφάλμα δικτύου — δοκίμασε ξανά.")
  );
}

console.log("\n== 2. Greek says εσύ, everywhere, without exception ==");
{
  const formal = el.filter(([, t]) => EL_FORMAL.test(t) && !EL_INFORMAL.test(t));
  const both = el.filter(([, t]) => EL_FORMAL.test(t) && EL_INFORMAL.test(t));
  // THE HOUSE VOICE IS MEASURED, NOT DECLARED. 473 to 15 is not a
  // preference anybody wrote down; it is what the file already was, and
  // the fifteen were the exceptions rather than the rule.
  check(
    `no Greek string addresses the reader in the polite plural (${formal.length})`,
    formal.length === 0,
    formal.slice(0, 12).map(([k, t]) => `${k}\n          ${t.slice(0, 90)}`).join("\n        ")
  );
  check(
    `no Greek string mixes the two inside one sentence (${both.length})`,
    both.length === 0,
    both.slice(0, 6).map(([k, t]) => `${k}\n          ${t.slice(0, 110)}`).join("\n        ")
  );
}

console.log("\n== 3. the other five languages, measured and NOT gated ==");
{
  // WHY NOT GATED, per language, because "we did not get to it" would be
  // a worse sentence than any of these:
  //
  //   es  "su/sus/le" is the polite possessive AND the ordinary third
  //       person. "su negocio" is "your business" or "their business"
  //       and no regex can tell which.
  //   de  "Sie" is the polite you, "sie" is she, and "Ihr" is both the
  //       polite possessive and "her". Case is a hint, not a rule, at the
  //       start of a sentence.
  //   it  "Lei" as the polite form collides with the pronoun for "she",
  //       and "vi/voi" is an ordinary plural rather than a register.
  //   pt  "você" is the STANDARD address in Brazilian Portuguese and is
  //       not the formal half of anything.
  //   fr  is the one that might be clean — 541 vouvoiement to 3 tutoiement
  //       looks like a consistent house voice — but "vous" is also the
  //       ordinary plural, so the 3 cannot be trusted as the whole list.
  //
  // The numbers are printed so somebody who reads one of these languages
  // has a starting point. They are not a finding.
  const re = (...w) => new RegExp(`${B0}(?:${w.join("|")})${B1}`, "iu");
  const LANGS = {
    es: [re("tú", "tu", "tus", "te", "ti"), re("usted", "ustedes")],
    fr: [re("tu", "ton", "ta", "tes", "toi"), re("vous", "votre", "vos")],
    de: [re("du", "dein", "deine", "dich", "dir"), re("Sie", "Ihnen")],
    it: [re("tu", "tuo", "tua", "tuoi", "ti"), re("Lei", "Suo", "Sua")],
    pt: [re("tu", "teu", "tua", "teus", "te"), re("você", "vocês")],
  };
  const measured = [];
  for (const [loc, [inf, form]] of Object.entries(LANGS)) {
    const rows = leaves(JSON.parse(readFileSync(`messages/${loc}.json`, "utf8")));
    const i = rows.filter(([, t]) => inf.test(t) && !form.test(t)).length;
    const f = rows.filter(([, t]) => form.test(t) && !inf.test(t)).length;
    const b = rows.filter(([, t]) => form.test(t) && inf.test(t)).length;
    measured.push({ loc, i, f, b, rows: rows.length });
    console.log(`        ${loc}  ${String(i).padStart(4)} informal · ${String(f).padStart(4)} formal · ${String(b).padStart(3)} both — pronouns only, NOT a finding`);
  }
  // A REAL CONDITION, not `true`. The point of printing these is that
  // somebody who reads one of the five has a starting point; a run where
  // the readers matched nothing would print five rows of zeros and look
  // exactly like a run where the languages were clean. That is the same
  // ASCII-boundary failure section 1 exists for, one language over.
  check(
    `each of the five was read and something was recognised (${measured.map((m) => m.loc).join(", ")})`,
    measured.length === 5 && measured.every((m) => m.rows > 2000 && m.i + m.f + m.b > 50),
    JSON.stringify(measured)
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
