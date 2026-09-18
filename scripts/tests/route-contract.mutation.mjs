#!/usr/bin/env node
/*
 * CAN route-contract.test.mjs SEE A ROUTE NOBODY IS ASKING ABOUT?
 *
 * The four narrow gates stay green through most of these: each is sound
 * about its own population, and the defect here is a route that is in
 * none of them — or a register entry that has quietly started deciding
 * something instead of recording it.
 *
 * The two conditions this file was built under are what most of these
 * drive:
 *
 *   THE SCANNER GUARANTEES, NOT THE TABLE — 3, 4, 7. A declaration that
 *   names a mechanism the route no longer has, or that excuses a route a
 *   question really did ask, has to go red.
 *
 *   A REASON IS AN ARGUMENT, NOT AN ASSURANCE — 5, 6, 8. A sentence made
 *   only of reassurance is compatible with every state of the code, which
 *   is what makes it worth nothing. The refused words live in the gate's
 *   ASSURANCE pattern, not here: comment-claims.test.mjs censuses blocks
 *   containing them, and a comment listing them to explain the rule reads
 *   there as a limitation being confessed.
 *
 * Run: node scripts/tests/route-contract.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/route-contract.test.mjs";
const CONTACT = "src/app/api/contact/route.ts";
const SHARE = "src/app/r/[code]/route.ts";
const PUBLISH = "src/app/api/websites/[id]/publish/route.ts";
// The detectors moved to one shared definition on 2026-09-18; three
// mutants below follow them there, which is the point of the move.
const MECH = "scripts/tests/lib/route-mechanisms.mjs";

const MUTANTS = [
  {
    // 1. THE CASE ITSELF, expressed the only way a mutation can: a route
    // that IS outside every population loses the entry saying so. What
    // the gate then sees is exactly what it would see the day somebody
    // adds a route nothing asks about — an undeclared member of that set.
    name: "a route outside every population has no declaration",
    file: GATE,
    from: '  "src/app/api/contact/route.ts": {',
    to: '  "src/app/api/contact/route.ts.disabled": {',
    expect: "outside every population is declared",
  },
  {
    // 2. A DECLARED ROUTE JOINS A POPULATION. The entry becomes a
    // sentence about a route that is now covered — coverage-shaped prose
    // in a register nobody re-reads.
    name: "a declared route gains a session, so its entry is now false",
    file: SHARE,
    from: "export const dynamic",
    to: "const _who = await supabase.auth.getUser();\nexport const dynamic",
    expect: "no declaration outlives",
  },
  {
    // 3. CONDITION ONE. The rate limit comes out of the public contact
    // form and the register goes on saying it is there. This is the
    // mutation the whole design exists to fail on: a table that could
    // decide would stay green.
    name: "a declared route loses the mechanism its entry names",
    file: CONTACT,
    from: '      scope: "contact_form",',
    to: '      scopeX: "contact_form",',
    expect: "mechanisms match what the scanner finds",
  },
  {
    // 4. CONDITION ONE, THE OTHER WAY. The register reaches into a
    // population and excuses a route that WAS asked and answered nothing
    // — which is a gap, and belongs in the narrow gate.
    name: "the register excuses a route a question actually asked",
    file: GATE,
    from: 'const OUTSIDE_EVERY_POPULATION = {',
    to: 'const OUTSIDE_EVERY_POPULATION = {\n  "src/app/api/websites/[id]/publish/route.ts": { has: [], why: "reads published_sites and enforces maxPublishedSitesForPlan, so there is nothing further to check in this file about its ceiling or its ownership." },',
    expect: "excuses a route that a question actually asked",
  },
  {
    // 5. CONDITION TWO. The sentence a register dies of.
    name: "a reason becomes an assurance",
    file: GATE,
    from: '      "the public contact form, reachable with no account because that is what a contact form is for.',
    to: '      "Intentional — safe by design, and it works as expected.',
    expect: "argument rather than an assurance",
  },
  {
    // 6. CONDITION TWO, by length: a reason too short to contain one.
    name: "a reason is shortened until it argues nothing",
    file: GATE,
    from: '      "the robots.txt of a published site — the one file on the internet defined by being fetchable without credentials. It reads the same published_sites row to decide whether the site is live and emits text, behind publicRequestAllowed; it writes nothing.",',
    to: '      "robots.txt is public.",',
    expect: "argument rather than an assurance",
  },
  {
    // 7. CONDITION TWO, by substance: prose of the right length that
    // names nothing a reader could go and check. This is the one a person
    // writes in good faith.
    name: "a reason is long but names nothing checkable",
    file: GATE,
    from: '      "the sitemap of a published site. A sitemap behind a login is a sitemap no crawler can fetch, which is the entire point of having one. It reads the same published_sites row and emits XML derived from its pages list, behind publicRequestAllowed; it writes nothing.",',
    to: '      "there is really no need for any of that here, and there never has been, so we do not do it and we do not plan to start doing it at any point later on either.",',
    expect: "argument rather than an assurance",
  },
  {
    // 8. THE VOCABULARY GOING NARROW AGAIN — the defect this file found
    // in itself on its first run. Take `password` back out and the login
    // route reports as answering nothing about who is asking.
    name: "the identity vocabulary forgets a credential it had learned",
    file: MECH,
    from: '  if (/signInWithPassword\\s*\\(/.test(src)) k.push("password");',
    to: "",
    expect: "outside every population is declared",
  },
  {
    // 9-12. THE POPULATIONS GOING BLIND. An empty population answers
    // every question about itself, and the floors are the only thing that
    // says so.
    name: "the ownership population empties",
    file: GATE,
    from: "  { id: \"ownership\", asks: (s) => AUTHENTICATES.test(s) && !CRON.test(s) && FROM_REQUEST.test(s),",
    to: "  { id: \"ownership\", asks: () => false,",
    expect: "'ownership' population is real",
  },
  {
    name: "the bound population empties",
    file: GATE,
    from: "  { id: \"bound\", asks: (s) => INSERTS.test(s),",
    to: "  { id: \"bound\", asks: () => false,",
    expect: "'bound' population is real",
  },
  {
    name: "the answer detectors stop matching, so a real population answers nothing",
    file: MECH,
    from: "export const matching = (table, src) => Object.entries(table).filter(([, t]) => t(src)).map(([k]) => k);",
    to: "export const matching = () => [];",
    expect: "most of it answers",
  },
  {
    // 13. THE STRIPPER. A route whose COMMENT mentions checkRateLimit
    // would count as bounded — the exact thing three gates in this
    // repository have already done.
    name: "the comment stripper stops running, so prose about a limiter counts as one",
    file: GATE,
    from: 'const strip = (t) => t.replace(/\\/\\*[\\s\\S]*?\\*\\//g, "").replace(/^\\s*\\/\\/.*$/gm, "");',
    to: "const strip = (t) => t;",
    expect: "an ownership claim in a comment does not count",
  },
  {
    // 14. THE LIMITER PREDICATE. A presence check calls a route bounded
    // when its scope line has been deleted — measured once already in
    // route-write-bound.
    name: "a limiter with no scope counts as a bound again",
    file: MECH,
    from: "    /checkRateLimit\\s*\\(/.test(s) &&\n    /scope:\\s*\"[a-z_0-9]+\"/.test(s) &&",
    to: "    /checkRateLimit\\s*\\(/.test(s) &&",
    expect: "control: a limiter with no scope is not a bound",
  },
];

runMutations({
  name: "route-contract",
  gate: GATE,
  targets: [GATE, MECH, CONTACT, SHARE, PUBLISH],
  mutants: MUTANTS,
});
