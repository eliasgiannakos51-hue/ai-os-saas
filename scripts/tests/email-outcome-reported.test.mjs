// A ROUTE THAT SENDS AN EMAIL FOR A USER SAYS WHETHER IT WENT.
//
// THE DEFECT, measured 2026-09-24 by scripts/measure-silent-features.mjs.
// api/team/invite wrote the invite row, called sendTeamInviteEmail —
// which returned `void` and swallowed everything — and answered
// `{ ok: true }`. The screen then said "Invite sent to alice@example.com"
// on a deployment with no RESEND_API_KEY at all, where nothing had been
// sent and nothing could be. The owner waits for a reply that cannot come.
//
// teamCollaboration was the ONE sold feature in the whole catalog that
// needs a provider key, says nothing when it is missing, AND reports
// success anyway. Every other key-dependent feature already has a "not
// configured" path on its own screen.
//
// THE RULE IS ABOUT A SHAPE, SO THE CHECK RANGES OVER THE POPULATION.
// "api/team/invite reads the send result" would be a check about one
// file, and the tenth route to send an email would be written the old
// way with nothing to stop it. So the population is DERIVED — every
// route under src/app/api that calls a send*Email function — and each
// one must either read the outcome or be declared background, with a
// reason. The declarations are checked BOTH WAYS: a route named here
// that no longer sends an email is a stale entry and fails.
//
// Run: node scripts/tests/email-outcome-reported.test.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
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

/**
 * NOBODY IS WAITING ON THESE, and each says why in its own words rather
 * than sharing one blanket excuse. A background sender may be
 * best-effort: there is no screen to tell, and a failed send is a missed
 * notification rather than a false statement to somebody's face.
 *
 * A route is in this list because of WHO IS WAITING, not because fixing
 * it would be inconvenient.
 */
const BACKGROUND = {
  "cron/scheduled-runs":
    "a cron job. No browser is open; the email IS the delivery, and its failure is logged for the operator.",
  "weekly-digest":
    "a cron job, same as scheduled-runs — there is no response for a user to read.",
  "signup":
    "the welcome email. The account already exists and the person is looking at the app; a missing welcome is a lost pleasantry, not a lost action.",
  "auth/device-check":
    "a security notification about a login that has already succeeded. Telling the user it failed to send would be noise on a screen they did not ask for.",
  "billing/cancel":
    "a confirmation of a cancellation that has already taken effect in Stripe. The cancellation is the outcome; the email restates it.",
};

const API = "src/app/api";
function routes(dir = API, out = []) {
  // A WALK THAT THROWS IS NOT A WALK THAT FAILED. Mutating API to a path
  // that does not exist made readdirSync throw, so the gate crashed —
  // and a crash produces no named failure, which a mutation sidecar
  // cannot tell apart from a gate that has no opinion.
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) routes(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}

const SEND_RE = /\b(send[A-Z][A-Za-z]*Email)\s*\(/;
const senders = [];
for (const file of routes()) {
  const src = stripComments(readFileSync(file, "utf8"));
  if (!SEND_RE.test(src)) continue;
  const id = file.slice(API.length + 1, -"/route.ts".length);
  senders.push({ id, file, src });
}

console.log("== 1. the population is derived, not typed ==");
check(
  `routes that send an email were found (${senders.length})`,
  senders.length >= 6,
  senders.map((s) => s.id).join(", ")
);
check(
  "...and api/team/invite is one of them",
  senders.some((s) => s.id === "team/invite"),
  senders.map((s) => s.id).join(", ")
);

// A ROUTE WHERE SOMEBODY IS WAITING FOR THE ANSWER, and therefore one
// that can never be excused as background. Without this, the rule is
// optional: the next person to find this gate inconvenient adds a line to
// BACKGROUND and it goes green. Both of these show the person a result
// that IS the email — an invitation that has to arrive, a deletion link
// with no other way to reach them.
const NEVER_BACKGROUND = ["team/invite", "delete-account/request"];
for (const id of NEVER_BACKGROUND) {
  check(
    `${id} is user-facing and cannot be declared background`,
    !(id in BACKGROUND),
    `${id} appears in BACKGROUND with: ${BACKGROUND[id]}`
  );
}

console.log("\n== 2. every declared background route still sends an email ==");
// THE EXCEPTION LIST, CHECKED THE OTHER WAY. An entry whose route has
// stopped sending is a stale excuse, and a stale excuse is how an
// allowlist turns into a place to put things.
for (const [id, reason] of Object.entries(BACKGROUND)) {
  check(
    `${id} is still a sender (${reason.slice(0, 40)}…)`,
    senders.some((s) => s.id === id),
    `declared background, but no send*Email call is in ${API}/${id}/route.ts`
  );
}

console.log("\n== 3. every user-facing sender reads the outcome ==");
// READING THE OUTCOME means the return value reaches a name: `const x =
// await sendFoo(...)` or a destructure. A bare `await sendFoo(...)` is
// the shape that was wrong, and `void sendFoo(...)` is worse — the
// response goes back before the send resolves and a serverless runtime
// may freeze the function mid-flight.
const userFacing = senders.filter((s) => !(s.id in BACKGROUND));
check(
  `there are user-facing senders to check (${userFacing.length})`,
  userFacing.length >= 2,
  userFacing.map((s) => s.id).join(", ")
);
for (const s of userFacing) {
  // BOUND TO A NAME, however the statement is spelled. The first version
  // required `const x = await sendFoo(` adjacent, and reported
  // websites/[id]/submit-form as a defect — where the send is inside a
  // ternary that guards on the owner having an email address at all, and
  // the result is written to the submission row as `email_status`. That
  // is a better answer than the one the gate was looking for.
  //
  // So: walk back from the call to the nearest statement boundary and
  // ask whether a binding starts it.
  // THE FLOOR, HOISTED SO IT IS AN ASSERTION AND NOT A RETURN VALUE.
  // boundToAName already answers false on an empty list, which is
  // correct and invisible: gate-vacuity.test.mjs traces the COLLECTION,
  // and a floor buried inside a helper is one a reader cannot see either.
  const sendCalls = [...stripComments(s.src).matchAll(/send[A-Z][A-Za-z]*Email\s*\(/g)];
  check(`${s.id} has a send call to judge (${sendCalls.length})`, sendCalls.length >= 1, s.id);
  const reads = boundToAName(s.src, sendCalls);
  check(`${s.id} reads what the send returned`, reads, extractSend(s.src));
  check(
    `${s.id} never fires an email without awaiting it`,
    !/\bvoid\s+send[A-Z][A-Za-z]*Email\s*\(/.test(s.src),
    extractSend(s.src)
  );
}

console.log("\n== 4. the invite screen has somewhere to put the answer ==");
// READ THROUGH THE SAME CONSTANT the walk uses, and tolerate its
// absence: a gate that throws produces no named failure, and a named
// failure is the only thing a mutation sidecar can act on.
const invitePath = `${API}/team/invite/route.ts`;
const route = existsSync(invitePath) ? readFileSync(invitePath, "utf8") : "";
check(
  "the route reports whether the email was sent",
  /emailSent:\s*emailResult\.ok/.test(stripComments(route)),
  "the response body carries no emailSent"
);
check(
  "...and a link the owner can pass on by hand when it was not",
  /signupUrl:/.test(stripComments(route)),
  "no signupUrl in the response"
);
// THE URL IS BUILT ON THE SERVER. A client component reading
// NEXT_PUBLIC_SITE_URL gets undefined — rule 48 in this repository, and
// it has cost a round before.
check(
  "...built from the server's own site-url resolver, not in the browser",
  /getSiteUrl\(\)/.test(stripComments(route)),
  "the signup URL is not built with getSiteUrl()"
);

const formPath = "src/components/team/invite-form.tsx";
const form = existsSync(formPath) ? readFileSync(formPath, "utf8") : "";
const formCode = stripComments(form);
check(
  "the form has a third state for 'saved but not emailed'",
  /emailSent\s*===\s*false/.test(formCode) && /inviteSavedNotEmailed/.test(formCode),
  "the form still treats ok:true as sent"
);
check(
  "...and it does NOT claim success in that state",
  !/data\.ok[\s\S]{0,200}setSuccess\(t\("inviteSent"/.test(formCode) &&
    /else\s*\{[\s\S]{0,120}setSuccess\(t\("inviteSent"/.test(formCode),
  "inviteSent is still set unconditionally"
);
check(
  "the two reasons are told apart on the screen",
  /inviteEmailNotConfigured/.test(formCode) && /inviteEmailRefused/.test(formCode),
  "only one reason is rendered"
);

console.log("\n== 4b. the sender tells a missing key from a refused send ==");
// THE SCREEN CAN ONLY SAY WHAT THE SENDER KNOWS. If both causes come
// back as "send_failed", the owner is told to check a verified domain
// when the real problem is a variable that was never set — and the two
// repairs are in different places.
const senderSrc = stripComments(readFileSync("src/lib/email/send-team-invite-email.ts", "utf8"));
check(
  "a missing RESEND_API_KEY comes back as not_configured",
  /ResendNotConfiguredError/.test(senderSrc) && /"not_configured"/.test(senderSrc),
  "the sender does not distinguish ResendNotConfiguredError"
);
check(
  "...and a refused send comes back as send_failed",
  /"send_failed"/.test(senderSrc),
  "the sender has no send_failed reason"
);
check(
  "...and the two are actually different branches, not one constant",
  /notConfigured\s*\?\s*"not_configured"\s*:\s*"send_failed"/.test(senderSrc),
  "both causes return the same reason"
);
check(
  "the sender still never throws — the invite row stands on its own",
  /Promise<InviteEmailResult>/.test(senderSrc) && /catch\s*\(/.test(senderSrc),
  "the sender can throw, which would lose an invite that was already saved"
);

console.log("\n== 5. the wording exists in every locale ==");
const locales = readdirSync("messages").filter((f) => f.endsWith(".json"));
const KEYS = [
  "inviteSavedNotEmailed",
  "inviteEmailNotConfigured",
  "inviteEmailRefused",
  "inviteShareLink",
];
const missing = [];
const texts = [];
for (const f of locales) {
  const team = JSON.parse(readFileSync(join("messages", f), "utf8"))?.dashboard?.team ?? {};
  for (const k of KEYS) {
    if (typeof team[k] !== "string" || team[k].trim() === "") missing.push(`${f}:${k}`);
  }
  if (typeof team.inviteSavedNotEmailed === "string") texts.push(team.inviteSavedNotEmailed);
}
// THE FLOOR FIRST. `missing.length === 0` is green when the locale list
// is empty, and so is every `.every()` below — a scan that read nothing
// reports perfection. The same reason ceiling-vs-outcome.test.mjs asserts
// its census before asserting its zero.
check(
  `the locale files were read (${locales.length})`,
  locales.length >= 9,
  locales.join(", ")
);
check(
  `and a sentence came back from each (${texts.length})`,
  texts.length === locales.length,
  `${texts.length} sentences from ${locales.length} files`
);
check(`all ${KEYS.length} strings exist in all ${locales.length} locales`, missing.length === 0, missing.join(", "));
// DISTINCTNESS, NOT LENGTH. A character count is a rule about the Latin
// alphabet: the Chinese sentence for the ten-language voice notice is 29
// characters, and a `length > 30` check failed it while the translation
// was perfect. docs/shapes.md records that.
check(
  "...and no two locales share the same sentence",
  new Set(texts).size === texts.length,
  `${texts.length} sentences, ${new Set(texts).size} distinct`
);
check(
  "every locale keeps the {email} placeholder",
  texts.every((t) => t.includes("{email}")),
  texts.filter((t) => !t.includes("{email}")).join(" | ")
);
// '{email}' in single quotes is the LITERAL text {email} in ICU, in every
// language. CLAUDE.md names this as one of the two things that have lied
// to the owner.
check(
  "...unescaped, so ICU substitutes it",
  texts.every((t) => !t.includes("'{email}'")),
  texts.filter((t) => t.includes("'{email}'")).join(" | ")
);

/**
 * Is every send*Email call's return value bound to a name?
 *
 * Statement boundaries are `;`, `{` and `}` — crude, and enough: a
 * binding that reaches the call without one of those between them is the
 * statement the call belongs to.
 */
function boundToAName(src, calls) {
  // NO CALLS IS NOT "ALL CALLS PASS". `[].every()` is true, so a file this
  // failed to read would report as correct — which is the whole failure
  // this gate exists to stop, one level down. The caller floors the list
  // with its own assertion; this is the second half of the same guard.
  if (calls.length === 0) return false;
  return calls.every((m) => {
    // NOT A STATEMENT SLICE. Cutting at the nearest `{` breaks on a
    // DESTRUCTURING binding — `const { ok: emailOk } = await sendFoo(` —
    // whose own brace is the nearest one, leaving a fragment with no
    // `const` in it. That is how delete-account/request, which has done
    // this correctly since it was written, came back as a defect.
    //
    // Instead: does a binding run unbroken from somewhere behind us into
    // this call? `[^;]*$` is what carries it across a ternary, which is
    // how websites/[id]/submit-form guards on the owner having an
    // address at all.
    const before = src.slice(Math.max(0, m.index - 300), m.index);
    return (
      /(?:const|let|var)\s+(?:\{[^{}]*\}|[A-Za-z_$][\w$]*)\s*=[^;]*$/.test(before) ||
      /\breturn\b[^;]*$/.test(before)
    );
  });
}

function extractSend(src) {
  const m = /[^\n]*send[A-Z][A-Za-z]*Email\s*\([^\n]*/.exec(src);
  return m ? m[0].trim().slice(0, 120) : "(no send call found)";
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
