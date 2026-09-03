#!/usr/bin/env node
/*
 * CAN legal-pages.test.mjs TELL A REACHABLE PAGE FROM AN UNREACHABLE ONE?
 *
 * The gate it checks was written to close a four-week hole: three
 * finished pages that production answered 404 for, with nothing anywhere
 * saying they were missing. A gate for an ABSENCE is the easiest kind to
 * get wrong, because on a healthy tree it passes whether or not any of
 * its assertions are wired to anything.
 *
 * So the mutants are the regressions that actually happened, or nearly
 * did: a link dropped from the footer, the heading rendered as its key
 * (which shipped `privacy_policy` to production and stayed there),
 * `RESEND_FROM_EMAIL || "…"` coming back, a retracted claim pasted back
 * into the transparency page, and a translation quietly replaced by its
 * English source.
 *
 * ------------------------------------------------------------------
 * THE GATE'S OWN CLEVERNESS IS MUTATED TOO, AND ONE MUTANT FOUND A HOLE
 * ------------------------------------------------------------------
 *
 * `const LOCALES = ["en"]` left the gate GREEN and reporting "in all ten
 * (1/1)" for every language check — nine languages silently unchecked,
 * announced in a number that reads like a pass. Section 0 of the gate
 * exists because of that mutant, and the mutant is kept below so it stays
 * closed.
 *
 * ------------------------------------------------------------------
 * WHAT IS NOT MUTATED HERE, AND WHY THAT IS NOT AN OMISSION
 * ------------------------------------------------------------------
 *
 * `missingIn()` and the snake_case detector cannot be usefully defanged
 * on their own: on a healthy tree nothing is missing and no page carries
 * a snake_case title, so a broken version returns the same answer as a
 * working one and survives for a reason that says nothing about it.
 * What proves those two load-bearing is the SOURCE mutants — a deleted
 * zh string, a page reverted to `title="privacy_policy"` — which are
 * below. Pairing a defanged helper with the regression it should catch
 * would produce a green gate and count as a MISS, which is the opposite
 * of what it would be demonstrating. Saying this is better than adding
 * two mutants whose only purpose is to make the tally look complete.
 *
 * Run: node scripts/tests/legal-pages.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/legal-pages.test.mjs";
const LINKS = "src/lib/footer-links.ts";
const LAYOUT = "src/components/legal/legal-layout.tsx";
const PRIVACY = "src/app/privacy/page.tsx";
const TRANSPARENCY = "src/app/ai-transparency/page.tsx";
const ROUTE = "src/app/api/contact/route.ts";
const FORM = "src/components/contact/contact-form.tsx";
const SETTINGS = "src/app/dashboard/settings/page.tsx";
const SENDER = "src/lib/email/resend-config.ts";
const ZH = "messages/zh.json";
const AR = "messages/ar.json";

const TARGETS = [GATE, LINKS, LAYOUT, PRIVACY, TRANSPARENCY, ROUTE, FORM, SETTINGS, SENDER, ZH, AR];

const MUTANTS = [
  // ---- the absence this gate exists for ------------------------------
  {
    name: "a page is dropped from the footer",
    file: LINKS,
    from: '  { href: "/ai-transparency", labelKey: "footer.aiTransparency" },\n',
    to: "",
    expect: "/ai-transparency is in the footer",
  },
  {
    // The other direction: a link that leads nowhere. This is what
    // routeFileFor() is for, and on a healthy tree nothing exercises it.
    name: "a footer link points at a page that does not exist",
    file: LINKS,
    from: '  { href: "/contact", labelKey: "footer.contact" },',
    to: '  { href: "/contact", labelKey: "footer.contact" },\n  { href: "/nope", labelKey: "footer.contact" },',
    expect: "every footer link has a route on disk",
  },
  {
    name: "the settings page stops rendering the in-app links",
    file: SETTINGS,
    from: "{LEGAL_AND_SUPPORT_LINKS.map((link) => (",
    to: "{[].map((link) => (",
    expect: "renders it, rather than importing it unused",
  },

  // ---- the heading bug that was live in production -------------------
  {
    name: "LegalLayout renders the prop instead of translating it",
    file: LAYOUT,
    from: "{t(titleKey)}",
    to: "{titleKey}",
    expect: "renders t(titleKey), not the raw prop",
  },
  {
    // Exactly what /privacy was doing on 2026-09-02.
    name: "a legal page goes back to a snake_case title literal",
    file: PRIVACY,
    from: '<LegalLayout titleKey="landing.footer.privacy"',
    to: '<LegalLayout title="privacy_policy"',
    expect: "passes no snake_case title literal",
  },

  // ---- a retracted claim comes back ----------------------------------
  {
    name: "the transparency page claims the model is shown in Settings",
    file: TRANSPARENCY,
    from: "and does not name the model that ran.",
    to: "and is shown in your usage history in Settings.",
    expect: "retracted:",
  },
  {
    name: "…and that Presentations writes slides with cited sources",
    file: TRANSPARENCY,
    from: "<strong>AI Coding</strong>: five operations over code you paste in.",
    to: "<strong>Presentations</strong>: the model researches and writes slides with cited sources.",
    expect: "retracted:",
  },

  // ---- the mailer state -----------------------------------------------
  {
    // The one line lib/email/resend-config.ts was written to delete.
    name: "the contact route re-implements the FROM fallback",
    file: ROUTE,
    from: "      from: senderAddress(),",
    to: '      from: process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>",',
    expect: "does not re-implement the FROM fallback",
  },
  {
    name: "one response stops carrying the sender state",
    file: ROUTE,
    from: '        { ok: false, senderStatus: status, code: "invalid_request", error: "Invalid request." },',
    to: '        { ok: false, code: "invalid_request", error: "Invalid request." },',
    expect: "every response carries senderStatus",
  },
  {
    // Telling somebody their message was sent when it was not.
    name: "a deployment with no key answers 200 instead of 503",
    file: ROUTE,
    from: "        { status: 503 }",
    to: "        { status: 200 }",
    expect: "no_key is answered 503",
  },
  {
    name: "a blank RESEND_FROM_EMAIL is treated as configured",
    file: SENDER,
    from: '  if (!from) return "test_sender";',
    to: '  if (false) return "test_sender";',
    expect: "key, no FROM",
  },
  {
    name: "the form uses a class this app does not define",
    file: FORM,
    from: 'className="input min-h-[140px]"',
    to: 'className="btn-primary min-h-[140px]"',
    expect: "contact form uses tokens that exist",
  },

  // ---- the translations, zh AND ar ------------------------------------
  {
    name: "a zh label is replaced by its English source",
    file: ZH,
    from: '      "aiTransparency": "AI 透明度",',
    to: '      "aiTransparency": "AI Transparency",',
    expect: "label in zh is not the English string",
  },
  {
    name: "an ar label is replaced by its English source",
    file: AR,
    from: '      "aiTransparency": "شفافية الذكاء الاصطناعي",',
    to: '      "aiTransparency": "AI Transparency",',
    expect: "label in ar is not the English string",
  },
  {
    name: "a zh contact string is emptied",
    file: ZH,
    from: '      "helpInstead": "浏览帮助中心",',
    to: '      "helpInstead": "",',
    expect: "contact.outage.helpInstead in all ten",
  },
  {
    name: "an ar contact string is emptied",
    file: AR,
    from: '      "helpInstead": "تصفّح مركز المساعدة",',
    to: '      "helpInstead": "",',
    expect: "contact.outage.helpInstead in all ten",
  },

  // ---- the gate's own instruments -------------------------------------
  {
    // THE ONE THAT FOUND A REAL HOLE. Every "in all ten" check reports
    // relative to this array, so shortening it produces ten green
    // "(1/1)" lines and nine unchecked languages.
    name: "the sweep quietly shrinks to English only",
    file: GATE,
    from: 'const LOCALES = ["ar", "de", "el", "en", "es", "fr", "it", "ja", "pt", "zh"];',
    to: 'const LOCALES = ["en"];',
    expect: "the sweep covers every locale file on disk",
  },
  {
    // Every locale lookup goes through this. Stop it walking and it
    // returns the whole catalogue, which is not a string.
    name: "the dotted-path reader stops walking",
    file: GATE,
    from: "  return dotted.split(\".\").reduce((node, key) => (node == null ? undefined : node[key]), root);",
    to: "  return dotted.split(\".\").reduce((node) => node, root);",
    expect: "in all ten",
  },
  {
    // The retraction scan reads the page BODY on purpose: the file's
    // header comment quotes every retracted claim so the reasons stay
    // next to the code. Read the whole file and the gate finds its own
    // documentation and reports the claims as present.
    name: "the retraction scan reads the header comment as well as the body",
    file: GATE,
    from: 'const body = transparency === null ? "" : transparency.slice(transparency.indexOf("<LegalLayout"));',
    to: 'const body = transparency === null ? "" : transparency;',
    expect: "retracted:",
  },
  {
    name: "the response scan finds no responses at all",
    file: GATE,
    from: 'const responses = [...(route ?? "").matchAll(/NextResponse\\.json\\(\\s*\\{([\\s\\S]*?)\\}/g)].map((m) => m[1]);',
    to: "const responses = [];",
    expect: "every response carries senderStatus",
  },
];

/**
 * maxBuffer IS NOT A DETAIL HERE. The default is 1MB, and a gate that
 * exceeds it is KILLED — stdout truncated, "Failures:" summary never
 * printed, and this runner concludes "red, but on nothing" and files a
 * working check as a survivor. That is exactly what happened to the
 * at()-defanging mutant below. The gate's own output is bounded now
 * (see DETAIL_MAX there), and this is the second line of defence:
 * a loud gate should be readable, not fatal.
 */
const MAX_BUFFER = 32 * 1024 * 1024;

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", maxBuffer: MAX_BUFFER });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]);
    // A kill leaves no summary. Say so rather than reporting an empty
    // list as "the gate found nothing", which reads as a survivor.
    if (failed.length === 0 && (e.code === "ENOBUFS" || e.killed)) {
      return { green: false, failed: [`<the gate was killed: ${e.code ?? "signal " + e.signal}>`] };
    }
    return { green: false, failed };
  }
}

console.log("legal-pages mutations\n");

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
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    const stale = edits.filter((e) => !originals.get(e.file).includes(e.from));
    if (stale.length > 0) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${stale.map((e) => e.file).join(", ")}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const byFile = new Map();
    for (const e of edits) {
      const current = byFile.get(e.file) ?? originals.get(e.file);
      byFile.set(e.file, current.replace(e.from, e.to));
    }
    if ([...byFile.entries()].every(([file, text]) => text === originals.get(file))) {
      missed.push({ ...m, why: "the mutation left every file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    for (const [file, text] of byFile) writeFileSync(file, text);
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
      missed.push({ ...m, why: `the gate went red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`);
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
    : `\nTHE TREE DID NOT RESTORE — the gate is still red:\n  ${after.failed.join("\n  ")}`
);

console.log(`\n${caught}/${MUTANTS.length} caught`);
if (missed.length) {
  console.log("\nSurvivors:");
  for (const m of missed) console.log(`  - ${m.name}\n      ${m.why}`);
}
process.exit(missed.length === 0 && after.green ? 0 : 1);
